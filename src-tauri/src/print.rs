//! PDF 打印功能模块
//!
//! 使用 WebView2 的 PrintToPdf API 实现静默 PDF 生成
//! 通过创建隐藏窗口来避免破坏主窗口的 JavaScript 环境

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{WebviewWindow, AppHandle, WebviewUrl, Manager, Emitter};
use url::Url;

/// 打印结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintResult {
    pub success: bool,
    pub path: String,
    pub error: Option<String>,
}

/// 书签位置数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookmarkPosition {
    pub title: String,
    pub page: u32,
    pub y: f32,
    pub level: u32,
}

/// 页面打印设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintPageSettings {
    pub page_width_mm: f64,   // 页面宽度 mm
    pub page_height_mm: f64,  // 页面高度 mm
    pub margin_top_mm: f64,
    pub margin_bottom_mm: f64,
    pub margin_left_mm: f64,
    pub margin_right_mm: f64,
}

/// 默认 A4 页面设置
impl Default for PrintPageSettings {
    fn default() -> Self {
        PrintPageSettings {
            page_width_mm: 210.0,
            page_height_mm: 297.0,
            margin_top_mm: 20.0,
            margin_bottom_mm: 20.0,
            margin_left_mm: 25.0,
            margin_right_mm: 25.0,
        }
    }
}
/// 带书签位置的打印结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintResultWithBookmarks {
    pub success: bool,
    pub path: String,
    pub error: Option<String>,
    pub bookmarks: Vec<BookmarkPosition>,
}

/// 静默打印 HTML 内容到 PDF，并提取书签位置
#[tauri::command]
pub async fn print_to_pdf(
    app: AppHandle,
    _window: WebviewWindow,
    html: String,
    save_path: String,
) -> Result<PrintResult, String> {
    #[cfg(windows)]
    {
        if html.is_empty() {
            return Err("HTML 内容为空".to_string());
        }
        if save_path.is_empty() {
            return Err("保存路径为空".to_string());
        }

        // 创建隐藏的打印窗口
        let print_window = create_print_window(&app)?;

        // 在隐藏窗口中导航并打印
        let result = print_in_hidden_window(&print_window, &html, &save_path).await;

        // 不关闭窗口，避免中断 IPC 通信
        // 窗口会在应用退出时自动清理

        result
    }

    #[cfg(not(windows))]
    {
        let _ = (app, window, html, save_path);
        Err("PDF silent print is only supported on Windows".to_string())
    }
}

/// 静默打印 HTML 内容到 PDF，并从打印窗口提取书签位置
#[tauri::command]
pub async fn print_to_pdf_with_bookmarks(
    app: AppHandle,
    _window: WebviewWindow,
    html: String,
    save_path: String,
    heading_ids: Vec<String>,  // 标题 ID 列表
) -> Result<PrintResultWithBookmarks, String> {
    #[cfg(windows)]
    {
        if html.is_empty() {
            return Err("HTML 内容为空".to_string());
        }
        if save_path.is_empty() {
            return Err("保存路径为空".to_string());
        }

        // 创建隐藏的打印窗口
        let print_window = create_print_window(&app)?;

        // 在隐藏窗口中导航、提取位置并打印
        let result = print_and_extract_bookmarks(&print_window, &html, &save_path, &heading_ids).await;

        // 不关闭窗口，避免中断 IPC 通信
        // 窗口会在应用退出时自动清理

        result
    }

    #[cfg(not(windows))]
    {
        let _ = (app, window, html, save_path, heading_ids);
        Err("PDF silent print is only supported on Windows".to_string())
    }
}

/// 创建隐藏的打印窗口（复用已存在的窗口）
#[cfg(windows)]
fn create_print_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    // 使用默认 A4 设置创建窗口
    create_print_window_with_settings(app, &PrintPageSettings::default())
}

#[cfg(windows)]
fn create_print_window_with_settings(app: &AppHandle, settings: &PrintPageSettings) -> Result<WebviewWindow, String> {
    // 检查是否已存在打印窗口，复用它并调整大小
    if let Some(existing_window) = app.get_webview_window("print-window") {
        println!("复用已存在的打印窗口");
        // 调整窗口大小以匹配新的页面尺寸
        let width_px = settings.page_width_mm * 96.0 / 25.4;
        let height_px = settings.page_height_mm * 96.0 / 25.4;
        if let Err(e) = existing_window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: width_px as u32,
            height: height_px as u32,
        })) {
            println!("调整窗口大小失败: {:?}", e);
        }
        return Ok(existing_window);
    }

    let blank_url = Url::parse("about:blank").expect("URL should be valid");

    // 动态计算窗口尺寸 @ 96 DPI: mm × 96 / 25.4 = px
    let width_px = settings.page_width_mm * 96.0 / 25.4;
    let height_px = settings.page_height_mm * 96.0 / 25.4;

    let print_window = tauri::WebviewWindowBuilder::new(
        app,
        "print-window",
        WebviewUrl::External(blank_url)
    )
    .visible(false)
    .inner_size(width_px as f64, height_px as f64)
    .build()
    .map_err(|e| format!("创建打印窗口失败: {}", e))?;

    println!("创建新的打印窗口，尺寸: {:.0}px × {:.0}px", width_px, height_px);
    Ok(print_window)
}

/// 在隐藏窗口中打印
#[cfg(windows)]
async fn print_in_hidden_window(
    print_window: &WebviewWindow,
    html: &str,
    save_path: &str,
) -> Result<PrintResult, String> {
    use tauri::webview::PlatformWebview;
    use windows_core::HSTRING;

    let nav_completed = Arc::new(AtomicBool::new(false));
    let nav_completed_clone = nav_completed.clone();
    let html_owned = html.to_string();
    let error = Arc::new(Mutex::new(None::<String>));
    let error_clone = error.clone();
    let error_for_check = error.clone();

    // 在隐藏窗口中加载 HTML
    print_window
        .with_webview(move |webview: PlatformWebview| {
            unsafe {
                let controller = webview.controller();
                let core_webview = match controller.CoreWebView2() {
                    Ok(w) => w,
                    Err(e) => {
                        *error_clone.lock().unwrap() = Some(format!("无法获取 CoreWebView2: {}", e));
                        return;
                    }
                };

                // 注册 NavigationCompleted 回调
                let nav_completed_for_callback = nav_completed_clone.clone();
                let handler = webview2_com::NavigationCompletedEventHandler::create(Box::new(
                    move |_sender, _args| {
                        nav_completed_for_callback.store(true, Ordering::SeqCst);
                        Ok(())
                    },
                ));

                let mut token: i64 = 0;
                if let Err(e) = core_webview.add_NavigationCompleted(&handler, &mut token as *mut i64) {
                    *error.lock().unwrap() = Some(format!("无法注册导航事件: {}", e));
                    return;
                }

                let html_hstring = HSTRING::from(html_owned.as_str());
                if let Err(e) = core_webview.NavigateToString(&html_hstring) {
                    *error.lock().unwrap() = Some(format!("NavigateToString 失败: {}", e));
                    return;
                }
            }
        })
        .map_err(|e| format!("with_webview 错误: {}", e))?;

    // 检查导航错误
    if let Some(err) = error_for_check.lock().unwrap().take() {
        return Err(err);
    }

    // 等待导航完成（大文档需要更长时间）
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(120);

    while !nav_completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(100));
    }

    if !nav_completed.load(Ordering::SeqCst) {
        return Err("等待打印窗口渲染超时".to_string());
    }

    // 执行打印
    print_content(print_window, save_path).await
}

/// 在隐藏窗口中打印并提取书签位置
#[cfg(windows)]
async fn print_and_extract_bookmarks(
    print_window: &WebviewWindow,
    html: &str,
    save_path: &str,
    heading_ids: &[String],
) -> Result<PrintResultWithBookmarks, String> {
    use tauri::webview::PlatformWebview;
    use windows_core::HSTRING;

    let nav_completed = Arc::new(AtomicBool::new(false));
    let nav_completed_clone = nav_completed.clone();
    let html_owned = html.to_string();
    let error = Arc::new(Mutex::new(None::<String>));
    let error_clone = error.clone();
    let error_for_check = error.clone();

    // Step 1: 在隐藏窗口中加载 HTML
    print_window
        .with_webview(move |webview: PlatformWebview| {
            unsafe {
                let controller = webview.controller();
                let core_webview = match controller.CoreWebView2() {
                    Ok(w) => w,
                    Err(e) => {
                        *error_clone.lock().unwrap() = Some(format!("无法获取 CoreWebView2: {}", e));
                        return;
                    }
                };

                // 注册 NavigationCompleted 回调
                let nav_completed_for_callback = nav_completed_clone.clone();
                let handler = webview2_com::NavigationCompletedEventHandler::create(Box::new(
                    move |_sender, _args| {
                        nav_completed_for_callback.store(true, Ordering::SeqCst);
                        Ok(())
                    },
                ));

                let mut token: i64 = 0;
                if let Err(e) = core_webview.add_NavigationCompleted(&handler, &mut token as *mut i64) {
                    *error.lock().unwrap() = Some(format!("无法注册导航事件: {}", e));
                    return;
                }

                let html_hstring = HSTRING::from(html_owned.as_str());
                if let Err(e) = core_webview.NavigateToString(&html_hstring) {
                    *error.lock().unwrap() = Some(format!("NavigateToString 失败: {}", e));
                    return;
                }
            }
        })
        .map_err(|e| format!("with_webview 错误: {}", e))?;

    // 检查导航错误
    if let Some(err) = error_for_check.lock().unwrap().take() {
        return Err(err);
    }

    // Step 2: 等待导航完成（MkDocs 大文档需要更长时间）
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(120);

    while !nav_completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(100));
    }

    if !nav_completed.load(Ordering::SeqCst) {
        return Err("等待打印窗口渲染超时".to_string());
    }

    // Step 3: 等待文档渲染就绪（字体+布局，事件驱动，替代固定等待）
    wait_for_document_ready(print_window).await?;

    // Step 4: 执行 JavaScript 获取标题位置
    let bookmarks = extract_bookmark_positions(print_window, heading_ids).await?;

    // Step 5: 执行打印
    let print_result = print_content(print_window, save_path).await?;

    Ok(PrintResultWithBookmarks {
        success: print_result.success,
        path: print_result.path,
        error: print_result.error,
        bookmarks,
    })
}

/// 从打印窗口提取书签位置
#[cfg(windows)]
async fn extract_bookmark_positions(
    print_window: &WebviewWindow,
    heading_ids: &[String],
) -> Result<Vec<BookmarkPosition>, String> {
    use tauri::webview::PlatformWebview;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::Interface;

    // 构建 JavaScript 代码
    let heading_ids_json = serde_json::to_string(heading_ids)
        .map_err(|e| format!("序列化标题 ID 失败: {}", e))?;

    let js_code = format!(r#"
        (function() {{
            const headingIds = {};
            const bookmarks = [];

            // A4 页面参数 (基于 CSS @page 设置)
            // @page {{ margin: 2cm 2.5cm; size: A4; }}
            // A4: 210mm × 297mm = 794px × 1123px @ 96 DPI
            // 内容区: 上下边距 2cm = 76px, 左右边距 2.5cm = 94px
            // 内容区高度: 1123 - 76*2 = 971px
            const contentHeight = 971;

            // 获取正文容器
            const mainContent = document.querySelector('.main-content');
            if (!mainContent) {{
                return JSON.stringify(bookmarks);
            }}

            // 获取正文容器的顶部位置（相对于视口）
            const mainContentRect = mainContent.getBoundingClientRect();
            const mainContentTop = mainContentRect.top;

            // 遍历每个标题
            headingIds.forEach(function(id) {{
                const element = document.getElementById(id);
                if (!element) return;

                // 获取标题层级
                const tagName = element.tagName.toLowerCase();
                const level = parseInt(tagName.substring(1)); // h1 -> 1, h2 -> 2

                // 获取标题文本
                const title = element.textContent || '';

                // 获取元素位置（使用 getBoundingClientRect 更准确）
                const rect = element.getBoundingClientRect();

                // 相对于正文内容区顶部的位置
                // 注意：scrollY 为 0 因为是隐藏窗口
                const relativeY = rect.top - mainContentTop;

                // 计算页码（0-indexed）
                const page = Math.max(0, Math.floor(relativeY / contentHeight));

                // 页内 Y 坐标
                const yInPage = relativeY % contentHeight;

                bookmarks.push({{
                    title: title.trim(),
                    page: page,
                    y: yInPage,
                    level: level
                }});
            }});

            return JSON.stringify(bookmarks);
        }})();
    "#, heading_ids_json);

    let result = Arc::new(Mutex::new(None::<String>));
    let result_clone = result.clone();
    let js_code_clone = js_code.clone();
    let completed = Arc::new(AtomicBool::new(false));
    let completed_clone = completed.clone();

    print_window
        .with_webview(move |webview: PlatformWebview| {
            unsafe {
                let controller = webview.controller();
                let core_webview = match controller.CoreWebView2() {
                    Ok(w) => w,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(format!("错误: 无法获取 CoreWebView2: {}", e));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                let webview_15: ICoreWebView2_15 = match core_webview.cast() {
                    Ok(w) => w,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(format!("错误: WebView2 版本不支持 ExecuteScript: {}", e));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                let result_for_handler = result_clone.clone();
                let completed_for_handler = completed_clone.clone();
                let handler = webview2_com::ExecuteScriptCompletedHandler::create(
                    Box::new(move |result: windows::core::Result<()>, result_json: String| {
                        if result.is_ok() {
                            *result_for_handler.lock().unwrap() = Some(result_json);
                        } else {
                            *result_for_handler.lock().unwrap() = Some(format!("错误: ExecuteScript 返回错误"));
                        }
                        completed_for_handler.store(true, Ordering::SeqCst);
                        Ok(())
                    }),
                );

                use windows_core::HSTRING;
                let js_hstring = HSTRING::from(js_code_clone.as_str());

                if let Err(e) = webview_15.ExecuteScript(&js_hstring, &handler) {
                    *result_clone.lock().unwrap() = Some(format!("错误: ExecuteScript 失败: {}", e));
                    completed_clone.store(true, Ordering::SeqCst);
                }
            }
        })
        .map_err(|e| format!("with_webview 错误: {}", e))?;

    // 等待 JavaScript 执行完成
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(10);

    while !completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(50));
    }

    let js_result = result.lock().unwrap().take()
        .ok_or_else(|| "JavaScript 执行超时".to_string())?;

    // ExecuteScript 返回的是 JSON 字符串（带引号），需要先解析
    let json_str: String = serde_json::from_str(&js_result)
        .map_err(|e| format!("解析 JavaScript 结果失败: {} - 原始: {}", e, js_result))?;

    let bookmarks: Vec<BookmarkPosition> = serde_json::from_str(&json_str)
        .map_err(|e| format!("解析书签数据失败: {} - 数据: {}", e, json_str))?;

    Ok(bookmarks)
}

/// 等待页面渲染完成（字体加载 + 布局绘制），替代盲等 3 秒
/// 使用 document.fonts.ready + requestAnimationFrame 事件驱动
#[cfg(windows)]
async fn wait_for_document_ready(print_window: &WebviewWindow) -> Result<(), String> {
    use tauri::webview::PlatformWebview;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::{Interface, HSTRING};

    // 注入初始化脚本：字体加载完成后，等待两个 rAF 确保布局和绘制完成
    let setup_js = r#"
        (function() {
            if (window.__pdfDocReady !== undefined) return;
            window.__pdfDocReady = false;
            function signalReady() {
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        window.__pdfDocReady = true;
                    });
                });
            }
            if (document.fonts && document.fonts.status === 'loading') {
                document.fonts.ready.then(signalReady);
            } else {
                signalReady();
            }
        })()
    "#;

    // 执行初始化脚本（write-only，不关心返回值）
    {
        let completed = Arc::new(AtomicBool::new(false));
        let completed_clone = completed.clone();
        let error = Arc::new(Mutex::new(None::<String>));
        let error_clone = error.clone();
        let js_owned = setup_js.to_string();

        print_window
            .with_webview(move |webview: PlatformWebview| {
                unsafe {
                    let controller = webview.controller();
                    let core_webview = match controller.CoreWebView2() {
                        Ok(w) => w,
                        Err(e) => {
                            *error_clone.lock().unwrap() = Some(format!("{}", e));
                            completed_clone.store(true, Ordering::SeqCst);
                            return;
                        }
                    };
                    let webview_15: ICoreWebView2_15 = match core_webview.cast() {
                        Ok(w) => w,
                        Err(e) => {
                            *error_clone.lock().unwrap() = Some(format!("{}", e));
                            completed_clone.store(true, Ordering::SeqCst);
                            return;
                        }
                    };
                    let completed_for_handler = completed_clone.clone();
                    let handler = webview2_com::ExecuteScriptCompletedHandler::create(
                        Box::new(move |_result, _result_json| {
                            completed_for_handler.store(true, Ordering::SeqCst);
                            Ok(())
                        }),
                    );
                    let js_hstring = HSTRING::from(js_owned.as_str());
                    if let Err(e) = webview_15.ExecuteScript(&js_hstring, &handler) {
                        *error_clone.lock().unwrap() = Some(format!("{}", e));
                        completed_clone.store(true, Ordering::SeqCst);
                    }
                }
            })
            .map_err(|e| format!("with_webview 错误: {}", e))?;

        let start = std::time::Instant::now();
        let timeout = Duration::from_secs(5);
        while !completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    // 轮询检查 ready 标志，使用较短的检查间隔
    let poll_start = std::time::Instant::now();
    let poll_timeout = Duration::from_secs(5);

    while poll_start.elapsed() < poll_timeout {
        let completed = Arc::new(AtomicBool::new(false));
        let completed_clone = completed.clone();

        // 简单的 JS 查询：检查标志位
        let check_js = "String(window.__pdfDocReady === true)";
        let result: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let result_clone = result.clone();
        let js_owned = check_js.to_string();

        print_window
            .with_webview(move |webview: PlatformWebview| {
                unsafe {
                    let controller = webview.controller();
                    let core_webview = match controller.CoreWebView2() {
                        Ok(w) => w,
                        Err(_) => {
                            completed_clone.store(true, Ordering::SeqCst);
                            return;
                        }
                    };
                    let webview_15: ICoreWebView2_15 = match core_webview.cast() {
                        Ok(w) => w,
                        Err(_) => {
                            completed_clone.store(true, Ordering::SeqCst);
                            return;
                        }
                    };
                    let result_for_handler = result_clone.clone();
                    let completed_for_handler = completed_clone.clone();
                    let handler = webview2_com::ExecuteScriptCompletedHandler::create(
                        Box::new(move |_exec_result, result_json: String| {
                            *result_for_handler.lock().unwrap() = Some(result_json);
                            completed_for_handler.store(true, Ordering::SeqCst);
                            Ok(())
                        }),
                    );
                    let js_hstring = HSTRING::from(js_owned.as_str());
                    if let Err(_) = webview_15.ExecuteScript(&js_hstring, &handler) {
                        completed_clone.store(true, Ordering::SeqCst);
                    }
                }
            })
            .map_err(|e| format!("with_webview 错误: {}", e))?;

        let op_start = std::time::Instant::now();
        let op_timeout = Duration::from_secs(3);
        while !completed.load(Ordering::SeqCst) && op_start.elapsed() < op_timeout {
            std::thread::sleep(Duration::from_millis(50));
        }

        if let Some(val) = result.lock().unwrap().take() {
            if val == "true" || val == "\"true\"" {
                return Ok(());
            }
        }

        std::thread::sleep(Duration::from_millis(100));
    }

    // 超时也允许继续（比永久阻塞好），只记录日志
    println!("文档就绪等待超时，继续导出流程");
    Ok(())
}

/// 执行打印
#[cfg(windows)]
async fn print_content(
    print_window: &WebviewWindow,
    save_path: &str,
) -> Result<PrintResult, String> {
    use tauri::webview::PlatformWebview;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::{Interface, HSTRING};

    let result = Arc::new(Mutex::new(None::<Result<PrintResult, String>>));
    let result_clone = result.clone();
    let save_path_owned = save_path.to_string();
    let completed = Arc::new(AtomicBool::new(false));
    let completed_clone = completed.clone();

    print_window
        .with_webview(move |webview: PlatformWebview| {
            unsafe {
                let controller = webview.controller();
                let core_webview = match controller.CoreWebView2() {
                    Ok(w) => w,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(Err(format!("无法获取 CoreWebView2: {}", e)));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                let webview_7: ICoreWebView2_7 = match core_webview.cast() {
                    Ok(w) => w,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(Err(format!("WebView2 版本不支持: {}", e)));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                let environment = webview.environment();
                let environment_6: ICoreWebView2Environment6 = match environment.cast() {
                    Ok(e) => e,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(Err(format!("Environment 版本不支持: {}", e)));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                let settings: ICoreWebView2PrintSettings = match environment_6.CreatePrintSettings() {
                    Ok(s) => s,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(Err(format!("无法创建打印设置: {}", e)));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                // A4 页面设置（硬编码，用于旧版打印命令）
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION(0)).ok();
                settings.SetPageWidth(8.27).ok();
                settings.SetPageHeight(11.69).ok();
                settings.SetMarginTop(0.79).ok();
                settings.SetMarginBottom(0.79).ok();
                settings.SetMarginLeft(0.98).ok();
                settings.SetMarginRight(0.98).ok();

                let path_hstring = HSTRING::from(save_path_owned.as_str());

                let result_for_closure = result_clone.clone();
                let save_path_for_closure = save_path_owned.clone();
                let completed_for_closure = completed_clone.clone();
                let completed_closure = Box::new(
                    move |error_result: core::result::Result<(), windows_core::Error>, success: bool| {
                        let print_result = if success {
                            Ok(PrintResult { success: true, path: save_path_for_closure.clone(), error: None })
                        } else {
                            // 当 success=false 时，error_result 可能是 Ok(())（API 正常返回但打印失败）
                            // 需要提供更有意义的错误信息
                            let error_msg = if error_result.is_ok() {
                                // HRESULT 正常但 success=false，通常是文件路径或权限问题
                                format!("PrintToPdf 失败：PDF 创建不成功（可能原因：路径无效、权限不足或磁盘空间不足）\n保存路径: {}", save_path_for_closure)
                            } else {
                                // HRESULT 异常，获取具体错误
                                format!("PrintToPdf 失败: {:?}", error_result.unwrap_err())
                            };
                            Err(error_msg)
                        };
                        *result_for_closure.lock().unwrap() = Some(print_result);
                        completed_for_closure.store(true, Ordering::SeqCst);
                        Ok(())
                    },
                );

                let operation_closure = Box::new(move |handler: ICoreWebView2PrintToPdfCompletedHandler| {
                    webview_7.PrintToPdf(&path_hstring, &settings, &handler)
                        .map_err(|e| webview2_com::Error::WindowsError(e))
                });

                if let Err(e) = webview2_com::PrintToPdfCompletedHandler::wait_for_async_operation(
                    operation_closure,
                    completed_closure,
                ) {
                    *result_clone.lock().unwrap() = Some(Err(format!("PrintToPdf 执行失败: {}", e)));
                    completed_clone.store(true, Ordering::SeqCst);
                }
            }
        })
        .map_err(|e| format!("打印 with_webview 错误: {}", e))?;

    // 等待打印完成
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(60);
    while !completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    let guard = result.lock().unwrap();
    guard.clone().unwrap_or_else(|| Err("未获取到打印结果".to_string()))
}

/// 检查是否支持静默打印
#[tauri::command]
pub async fn check_print_support(window: WebviewWindow) -> Result<bool, String> {
    #[cfg(windows)]
    {
        use tauri::webview::PlatformWebview;
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows_core::Interface;

        let result = Arc::new(Mutex::new(None::<bool>));
        let result_clone = result.clone();

        window
            .with_webview(move |webview: PlatformWebview| {
                unsafe {
                    let controller = webview.controller();
                    if let Ok(core_webview) = controller.CoreWebView2() {
                        *result_clone.lock().unwrap() = Some(core_webview.cast::<ICoreWebView2_7>().is_ok());
                    } else {
                        *result_clone.lock().unwrap() = Some(false);
                    }
                }
            })
            .map_err(|e| format!("检查失败: {}", e))?;

        let supported = result.lock().unwrap().unwrap_or(false);
        Ok(supported)
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(false)
    }
}

/// 使用 PrintToPdfStream API 将 PDF 打印到内存流
#[cfg(windows)]
async fn print_to_pdf_stream_internal(
    print_window: &WebviewWindow,
    page_settings: &PrintPageSettings,
) -> Result<Vec<u8>, String> {
    use tauri::webview::PlatformWebview;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::Interface;
    use windows::Win32::System::Com::{IStream, STATSTG, STATFLAG_DEFAULT, STREAM_SEEK_SET};

    let result = Arc::new(Mutex::new(None::<Result<Vec<u8>, String>>));
    let result_clone = result.clone();
    let completed = Arc::new(AtomicBool::new(false));
    let completed_clone = completed.clone();

    // 计算打印参数（mm 转 inch）
    let page_width_inch = page_settings.page_width_mm / 25.4;
    let page_height_inch = page_settings.page_height_mm / 25.4;
    let margin_top_inch = page_settings.margin_top_mm / 25.4;
    let margin_bottom_inch = page_settings.margin_bottom_mm / 25.4;
    let margin_left_inch = page_settings.margin_left_mm / 25.4;
    let margin_right_inch = page_settings.margin_right_mm / 25.4;

    print_window
        .with_webview(move |webview: PlatformWebview| {
            unsafe {
                let controller = webview.controller();
                let core_webview = match controller.CoreWebView2() {
                    Ok(w) => w,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(Err(format!("无法获取 CoreWebView2: {}", e)));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                // 使用 ICoreWebView2_16 接口（支持 PrintToPdfStream）
                let webview_16: ICoreWebView2_16 = match core_webview.cast() {
                    Ok(w) => w,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(Err(format!("WebView2 版本不支持 PrintToPdfStream: {}", e)));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                let environment = webview.environment();
                let environment_6: ICoreWebView2Environment6 = match environment.cast() {
                    Ok(e) => e,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(Err(format!("Environment 版本不支持: {}", e)));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                let settings: ICoreWebView2PrintSettings = match environment_6.CreatePrintSettings() {
                    Ok(s) => s,
                    Err(e) => {
                        *result_clone.lock().unwrap() = Some(Err(format!("无法创建打印设置: {}", e)));
                        completed_clone.store(true, Ordering::SeqCst);
                        return;
                    }
                };

                // 动态页面设置（mm 转 inch）
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION(0)).ok();
                settings.SetPageWidth(page_width_inch).ok();
                settings.SetPageHeight(page_height_inch).ok();
                settings.SetMarginTop(margin_top_inch).ok();
                settings.SetMarginBottom(margin_bottom_inch).ok();
                settings.SetMarginLeft(margin_left_inch).ok();
                settings.SetMarginRight(margin_right_inch).ok();

                let result_for_closure = result_clone.clone();
                let completed_for_closure = completed_clone.clone();
                let handler = webview2_com::PrintToPdfStreamCompletedHandler::create(
                    Box::new(move |error_result: windows::core::Result<()>, pdf_stream: Option<IStream>| {
                        if error_result.is_err() {
                            *result_for_closure.lock().unwrap() = Some(Err(format!("PrintToPdfStream 失败: {:?}", error_result)));
                            completed_for_closure.store(true, Ordering::SeqCst);
                            return Ok(());
                        }

                        let stream = match pdf_stream {
                            Some(s) => s,
                            None => {
                                *result_for_closure.lock().unwrap() = Some(Err("PrintToPdfStream 返回空流".to_string()));
                                completed_for_closure.store(true, Ordering::SeqCst);
                                return Ok(());
                            }
                        };

                        // 获取流大小
                        let mut statstg = STATSTG::default();
                        if let Err(e) = stream.Stat(&mut statstg, STATFLAG_DEFAULT) {
                            *result_for_closure.lock().unwrap() = Some(Err(format!("获取 PDF 流大小失败: {}", e)));
                            completed_for_closure.store(true, Ordering::SeqCst);
                            return Ok(());
                        }
                        let size = statstg.cbSize as usize;

                        // 回到流的起始位置
                        if let Err(e) = stream.Seek(0, STREAM_SEEK_SET, None) {
                            *result_for_closure.lock().unwrap() = Some(Err(format!("Seek 失败: {}", e)));
                            completed_for_closure.store(true, Ordering::SeqCst);
                            return Ok(());
                        }

                        // 读取所有数据
                        let mut buffer = Vec::with_capacity(size);
                        let chunk_size = 4096u32;
                        let mut total_read = 0usize;

                        while total_read < size {
                            let remaining = size - total_read;
                            let to_read = chunk_size.min(remaining as u32);
                            let mut chunk = vec![0u8; to_read as usize];
                            let mut bytes_read = 0u32;

                            let hr = stream.Read(
                                chunk.as_mut_ptr() as *mut core::ffi::c_void,
                                to_read,
                                Some(&mut bytes_read),
                            );

                            if hr.is_err() || bytes_read == 0 {
                                break;
                            }

                            buffer.extend_from_slice(&chunk[..bytes_read as usize]);
                            total_read += bytes_read as usize;
                        }

                        *result_for_closure.lock().unwrap() = Some(Ok(buffer));
                        completed_for_closure.store(true, Ordering::SeqCst);
                        Ok(())
                    }),
                );

                if let Err(e) = webview_16.PrintToPdfStream(&settings, &handler) {
                    *result_clone.lock().unwrap() = Some(Err(format!("PrintToPdfStream 调用失败: {}", e)));
                    completed_clone.store(true, Ordering::SeqCst);
                }
            }
        })
        .map_err(|e| format!("PrintToPdfStream with_webview 错误: {}", e))?;

    // 等待打印完成
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(60);
    while !completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    let guard = result.lock().unwrap();
    guard.clone().unwrap_or_else(|| Err("未获取到 PDF 数据".to_string()))
}

/// 静默打印 HTML 内容到 PDF 内存流，并提取标记位置
#[tauri::command]
pub async fn print_to_pdf_stream_with_markers(
    app: AppHandle,
    _window: WebviewWindow,
    html: String,
    save_path: String,
    markers: Vec<String>,
    page_settings: Option<PrintPageSettings>,
) -> Result<PrintResultWithBookmarks, String> {
    #[cfg(windows)]
    {
        if html.is_empty() {
            return Err("HTML 内容为空".to_string());
        }
        if save_path.is_empty() {
            return Err("保存路径为空".to_string());
        }

        // 使用传入的页面设置或默认 A4
        let settings = page_settings.unwrap_or_default();

        // 创建隐藏的打印窗口（使用动态尺寸）
        let print_window = create_print_window_with_settings(&app, &settings)?;

        // 加载 HTML 并打印（传入页面设置）
        let result = load_html_and_print_stream(&print_window, &html, &save_path, &markers, &settings).await;

        // 不关闭窗口，避免中断 IPC 通信或 WebView2 内部回调
        // 隐藏窗口在应用退出时会自动清理
        // 如果需要清理，可以在下次导出时复用或延迟销毁

        result
    }

    #[cfg(not(windows))]
    {
        let _ = (app, window, html, save_path, markers, page_settings);
        Err("PDF silent print is only supported on Windows".to_string())
    }
}

/// 加载 HTML 并打印到 PDF 流，同时提取标记位置
#[cfg(windows)]
async fn load_html_and_print_stream(
    print_window: &WebviewWindow,
    html: &str,
    save_path: &str,
    markers: &[String],
    page_settings: &PrintPageSettings,
) -> Result<PrintResultWithBookmarks, String> {
    use tauri::webview::PlatformWebview;
    use windows_core::HSTRING;

    // 获取窗口的 app handle 用于发送事件
    let app = print_window.app_handle();

    let nav_completed = Arc::new(AtomicBool::new(false));
    let nav_completed_clone = nav_completed.clone();
    let html_owned = html.to_string();
    let error = Arc::new(Mutex::new(None::<String>));
    let error_clone = error.clone();
    let error_for_check = error.clone();

    // Step 1: 在隐藏窗口中加载 HTML
    // 发送进度事件
    let _ = app.emit("export-progress", "生成 PDF...");

    print_window
        .with_webview(move |webview: PlatformWebview| {
            unsafe {
                let controller = webview.controller();
                let core_webview = match controller.CoreWebView2() {
                    Ok(w) => w,
                    Err(e) => {
                        *error_clone.lock().unwrap() = Some(format!("无法获取 CoreWebView2: {}", e));
                        return;
                    }
                };

                // 注册 NavigationCompleted 回调
                let nav_completed_for_callback = nav_completed_clone.clone();
                let handler = webview2_com::NavigationCompletedEventHandler::create(Box::new(
                    move |_sender, _args| {
                        nav_completed_for_callback.store(true, Ordering::SeqCst);
                        Ok(())
                    },
                ));

                let mut token: i64 = 0;
                if let Err(e) = core_webview.add_NavigationCompleted(&handler, &mut token as *mut i64) {
                    *error.lock().unwrap() = Some(format!("无法注册导航事件: {}", e));
                    return;
                }

                let html_hstring = HSTRING::from(html_owned.as_str());
                if let Err(e) = core_webview.NavigateToString(&html_hstring) {
                    *error.lock().unwrap() = Some(format!("NavigateToString 失败: {}", e));
                    return;
                }
            }
        })
        .map_err(|e| format!("with_webview 错误: {}", e))?;

    // 检查导航错误
    if let Some(err) = error_for_check.lock().unwrap().take() {
        return Err(err);
    }

    // Step 2: 等待导航完成（MkDocs 大文档需要更长时间）
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(120);

    while !nav_completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(100));
    }

    if !nav_completed.load(Ordering::SeqCst) {
        return Err("等待打印窗口渲染超时".to_string());
    }

    // Step 3: 等待文档渲染就绪（字体+布局，事件驱动，替代固定等待）
    wait_for_document_ready(print_window).await?;

    // Step 4: 使用 PrintToPdfStream 获取 PDF bytes
    // 发送进度事件：提取书签位置
    let _ = app.emit("export-progress", "提取书签位置...");

    let pdf_bytes = print_to_pdf_stream_internal(print_window, page_settings).await?;

    // Step 5: 从内存中的 PDF bytes 提取标记位置
    let bookmark_positions = crate::pdf_extract::extract_marker_positions_from_bytes(&pdf_bytes, markers)?;

    // Step 6: 将 PDF bytes 写入磁盘文件
    // 发送进度事件：注入书签
    let _ = app.emit("export-progress", "注入书签...");

    std::fs::write(save_path, &pdf_bytes)
        .map_err(|e| format!("写入 PDF 文件失败: {}", e))?;

    // 转换为 BookmarkPosition 格式
    let bookmarks: Vec<BookmarkPosition> = bookmark_positions.iter()
        .map(|mp| BookmarkPosition {
            title: mp.marker.clone(),
            page: mp.page,
            y: mp.y,
            level: 0, // 标记文本不包含层级信息，需要从标题 ID 推断
        })
        .collect();

    Ok(PrintResultWithBookmarks {
        success: true,
        path: save_path.to_string(),
        error: None,
        bookmarks,
    })
}

/// 链接 annotation 信息（用于调试）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkAnnotationInfo {
    pub page: u32,           // 链接所在页码
    pub link_rect: String,   // 链接矩形区域
    pub dest_page: u32,      // 目标页码
    pub dest_y: f32,         // 目标 Y 坐标（从底部计算）
    pub dest_type: String,   // 目标类型（XYZ, Fit, FitH 等）
}

/// 提取 PDF 中的链接 annotation 信息（用于调试跳转偏移问题）
#[tauri::command]
pub async fn debug_pdf_links(pdf_path: String) -> Result<Vec<LinkAnnotationInfo>, String> {
    use lopdf::Document;
    use lopdf::Object;

    let doc = Document::load(&pdf_path)
        .map_err(|e| format!("无法加载 PDF: {}", e))?;

    let pages = doc.get_pages();
    let mut links: Vec<LinkAnnotationInfo> = Vec::new();

    for (page_num, page_id) in pages.iter() {
        // 获取页面对象
        let page_obj = doc.get_object(*page_id)
            .map_err(|e| format!("无法获取页面对象: {}", e))?;

        if let Object::Dictionary(page_dict) = page_obj {
            // 获取页面的 Annots 数组
            let annots_result = page_dict.get(b"Annots");
            if annots_result.is_err() {
                continue;
            }

            let annots = match annots_result.unwrap() {
                Object::Array(arr) => arr.clone(),
                Object::Reference(ref_id) => {
                    // 如果是引用，获取引用的对象
                    match doc.get_object(*ref_id) {
                        Ok(Object::Array(arr)) => arr.clone(),
                        _ => continue,
                    }
                },
                _ => continue,
            };

            for annot_ref in annots.iter() {
                let annot_id = match annot_ref {
                    Object::Reference(id) => *id,
                    _ => continue,
                };

                let annot_obj = doc.get_object(annot_id);
                if annot_obj.is_err() {
                    continue;
                }

                if let Object::Dictionary(annot_dict) = annot_obj.unwrap() {
                    // 检查是否是 Link 类型
                    let subtype_result = annot_dict.get(b"Subtype");
                    if subtype_result.is_err() {
                        continue;
                    }

                    if *subtype_result.unwrap() != Object::Name(b"Link".to_vec()) {
                        continue;
                    }

                    // 获取链接矩形区域
                    let rect_str = match annot_dict.get(b"Rect") {
                        Ok(Object::Array(rect_arr)) => {
                            let x1 = get_object_float(rect_arr.get(0).unwrap_or(&Object::Integer(0)));
                            let y1 = get_object_float(rect_arr.get(1).unwrap_or(&Object::Integer(0)));
                            let x2 = get_object_float(rect_arr.get(2).unwrap_or(&Object::Integer(0)));
                            let y2 = get_object_float(rect_arr.get(3).unwrap_or(&Object::Integer(0)));
                            format!("{:.2}, {:.2}, {:.2}, {:.2}", x1, y1, x2, y2)
                        },
                        _ => "N/A".to_string()
                    };

                    // 获取目标 Dest
                    let (dest_page, dest_y, dest_type) = match annot_dict.get(b"Dest") {
                        Ok(Object::Array(dest_arr)) => {
                            // Dest 格式: [page_ref, type, ...params]
                            // 对于 XYZ 类型: [page_ref, /XYZ, left, top, zoom]
                            let dest_page_num = match dest_arr.get(0) {
                                Some(Object::Reference(ref_id)) => {
                                    // 查找引用对应的页码
                                    pages.iter()
                                        .find(|(_, id)| *id == ref_id)
                                        .map(|(num, _)| *num)
                                        .unwrap_or(0)
                                },
                                _ => 0
                            };

                            let dest_type_str = match dest_arr.get(1) {
                                Some(Object::Name(name)) => String::from_utf8_lossy(name).to_string(),
                                _ => "Unknown".to_string()
                            };

                            // 对于 XYZ 类型，top 参数是 Y 坐标（从顶部计算）
                            // 对于 FitH 类型，top 参数是 Y 坐标（从顶部计算）
                            let dest_y = if dest_type_str == "XYZ" || dest_type_str == "FitH" {
                                match dest_arr.get(2) {
                                    Some(obj) => get_object_float(obj),
                                    _ => 0.0
                                }
                            } else {
                                0.0
                            };

                            (dest_page_num, dest_y, dest_type_str)
                        },
                        Ok(Object::Name(name)) => {
                            // 简单命名目标
                            (0, 0.0, String::from_utf8_lossy(name).to_string())
                        },
                        Ok(Object::String(s, _)) => {
                            // 字符串命名目标
                            (0, 0.0, String::from_utf8_lossy(s).to_string())
                        },
                        _ => (0, 0.0, "NoDest".to_string())
                    };

                    links.push(LinkAnnotationInfo {
                        page: *page_num,
                        link_rect: rect_str,
                        dest_page,
                        dest_y,
                        dest_type,
                    });
                }
            }
        }
    }

    Ok(links)
}

/// 从 lopdf Object 获取浮点数值
fn get_object_float(obj: &lopdf::Object) -> f32 {
    match obj {
        lopdf::Object::Integer(i) => *i as f32,
        lopdf::Object::Real(r) => *r as f32,
        _ => 0.0
    }
}

/// URL 解码（将 %XX 格式转为对应字符，支持 UTF-8 多字节）
fn url_decode(s: &str) -> String {
    let mut bytes: Vec<u8> = Vec::new();
    let s_bytes = s.as_bytes();
    let mut i = 0;

    while i < s_bytes.len() {
        if s_bytes[i] == b'%' && i + 2 < s_bytes.len() {
            // 尝试解析 %XX 格式
            let hex = &s_bytes[i+1..i+3];
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(hex).unwrap_or("00"), 16) {
                bytes.push(byte);
                i += 3;
            } else {
                bytes.push(s_bytes[i]);
                i += 1;
            }
        } else {
            bytes.push(s_bytes[i]);
            i += 1;
        }
    }

    String::from_utf8_lossy(&bytes).into_owned()
}

/// 修复 PDF 中命名链接的目标坐标
/// WebView2 生成的链接使用命名目标（如 "chapter-3.3.2"），需要转换为显式坐标
///
/// # Arguments
/// * `pdf_path` - PDF 文件路径
/// * `named_dest_positions` - 命名目标位置映射 (name -> (page_num, y_pt))
#[tauri::command]
pub async fn fix_pdf_link_destinations(
    pdf_path: String,
    named_dest_positions: std::collections::HashMap<String, (u32, f32)>,
) -> Result<usize, String> {
    use lopdf::Document;
    use lopdf::Object;

    let mut doc = Document::load(&pdf_path)
        .map_err(|e| format!("无法加载 PDF: {}", e))?;

    let pages = doc.get_pages();
    let mut fixed_count = 0;

    // 创建页面高度映射（用于坐标转换）
    let page_heights: std::collections::HashMap<u32, f32> = pages.iter()
        .map(|(page_num, page_id)| {
            let page_obj = doc.get_object(*page_id);
            let height = if let Ok(Object::Dictionary(page_dict)) = page_obj {
                // 从 MediaBox 获取页面高度
                if let Ok(Object::Array(media_box)) = page_dict.get(b"MediaBox") {
                    // MediaBox: [x1, y1, x2, y2]，高度 = y2 - y1
                    let y2 = media_box.get(3)
                        .map(|obj| get_object_float(obj))
                        .unwrap_or(842.0);
                    y2
                } else {
                    842.0 // A4 默认高度
                }
            } else {
                842.0
            };
            (*page_num, height)
        })
        .collect();

    for (_page_num, page_id) in pages.iter() {
        let page_obj = doc.get_object(*page_id)
            .map_err(|e| format!("无法获取页面对象: {}", e))?;

        if let Object::Dictionary(page_dict) = page_obj {
            let annots_result = page_dict.get(b"Annots");
            if annots_result.is_err() {
                continue;
            }

            // 需要获取 Annots 数组的引用或直接数组
            let annots_ref = annots_result.unwrap();
            let annots_arr_id = match annots_ref {
                Object::Array(arr) => arr.clone(),
                Object::Reference(ref_id) => {
                    // 引用，获取数组对象
                    match doc.get_object(*ref_id) {
                        Ok(Object::Array(arr)) => arr.clone(),
                        _ => continue,
                    }
                },
                _ => continue,
            };

            for annot_ref in annots_arr_id.iter() {
                let annot_id = match annot_ref {
                    Object::Reference(id) => *id,
                    _ => continue,
                };

                let annot_obj = doc.get_object_mut(annot_id)
                    .map_err(|e| format!("无法获取 annotation 对象: {}", e))?;

                if let Object::Dictionary(annot_dict) = annot_obj {
                    // 检查是否是 Link 类型
                    let subtype = annot_dict.get(b"Subtype");
                    if subtype.is_err() {
                        continue;
                    }
                    if *subtype.unwrap() != Object::Name(b"Link".to_vec()) {
                        continue;
                    }

                    // 获取 Dest
                    let dest = annot_dict.get(b"Dest");
                    if dest.is_err() {
                        continue;
                    }

                    let dest_obj = dest.unwrap();
                    let dest_name_raw = match dest_obj {
                        Object::Name(name) => String::from_utf8_lossy(name).to_string(),
                        Object::String(s, _) => String::from_utf8_lossy(s).to_string(),
                        _ => continue,
                    };

                    // URL 解码目标名称（WebView2 会将中文等字符 URL 编码）
                    let dest_name = url_decode(&dest_name_raw);

                    // 查找命名目标的位置
                    if let Some((target_page, target_y)) = named_dest_positions.get(&dest_name) {
                        // 获取目标页面的引用
                        let target_page_id = pages.get(target_page)
                            .or_else(|| pages.values().nth((*target_page as usize).saturating_sub(1)));

                        if let Some(target_page_obj_id) = target_page_id {
                            // 创建新的显式坐标 Dest: [page_ref, /XYZ, left, top, zoom]
                            // top 是从顶部计算的 Y 坐标（PDF 内部坐标，从底部往上）
                            // 需要将 target_y（从顶部往下）转换为 PDF 坐标（从底部往上）
                            let page_height = page_heights.get(target_page).unwrap_or(&842.0);
                            let pdf_y = *page_height - *target_y + 15.0; // 添加15pt偏移，避免标题被遮挡

                            let new_dest = Object::Array(vec![
                                Object::Reference(*target_page_obj_id),
                                Object::Name(b"XYZ".to_vec()),
                                Object::Integer(0), // left
                                Object::Real(pdf_y), // top
                                Object::Integer(0), // zoom (0 = 保持当前)
                            ]);

                            // 替换 Dest
                            annot_dict.set("Dest", new_dest);
                            fixed_count += 1;
                        }
                    }
                    // 未找到链接目标，保留原有命名链接（不做修改）
                }
            }
        }
    }

    // 保存 PDF
    doc.save(&pdf_path)
        .map_err(|e| format!("无法保存 PDF: {}", e))?;

    Ok(fixed_count)
}