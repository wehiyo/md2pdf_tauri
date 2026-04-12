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

/// 创建隐藏的打印窗口
#[cfg(windows)]
fn create_print_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let blank_url = Url::parse("about:blank").expect("URL should be valid");

    // A4 尺寸 @ 96 DPI: 210mm × 297mm ≈ 794px × 1123px
    let print_window = tauri::WebviewWindowBuilder::new(
        app,
        "print-window",
        WebviewUrl::External(blank_url)
    )
    .visible(false)
    .inner_size(794.0, 1123.0)  // A4 @ 96 DPI
    .build()
    .map_err(|e| format!("创建打印窗口失败: {}", e))?;

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

    // 等待导航完成
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(30);

    while !nav_completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(50));
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

    // Step 2: 等待导航完成
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(30);

    while !nav_completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(50));
    }

    if !nav_completed.load(Ordering::SeqCst) {
        return Err("等待打印窗口渲染超时".to_string());
    }

    // Step 3: 等待图表渲染（Mermaid 和 PlantUML 需要时间）
    std::thread::sleep(Duration::from_millis(1500));

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

                // A4 页面设置
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
) -> Result<Vec<u8>, String> {
    use tauri::webview::PlatformWebview;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::Interface;
    use windows::Win32::System::Com::{IStream, STATSTG, STATFLAG_DEFAULT, STREAM_SEEK_SET};

    let result = Arc::new(Mutex::new(None::<Result<Vec<u8>, String>>));
    let result_clone = result.clone();
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

                // A4 页面设置
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION(0)).ok();
                settings.SetPageWidth(8.27).ok();
                settings.SetPageHeight(11.69).ok();
                settings.SetMarginTop(0.79).ok();
                settings.SetMarginBottom(0.79).ok();
                settings.SetMarginLeft(0.98).ok();
                settings.SetMarginRight(0.98).ok();

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

        // 加载 HTML 并打印
        let result = load_html_and_print_stream(&print_window, &html, &save_path, &markers).await;

        // 不关闭窗口，避免中断 IPC 通信或 WebView2 内部回调
        // 隐藏窗口在应用退出时会自动清理
        // 如果需要清理，可以在下次导出时复用或延迟销毁

        result
    }

    #[cfg(not(windows))]
    {
        let _ = (app, window, html, save_path, markers);
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

    // Step 2: 等待导航完成
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(30);

    while !nav_completed.load(Ordering::SeqCst) && start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(50));
    }

    if !nav_completed.load(Ordering::SeqCst) {
        return Err("等待打印窗口渲染超时".to_string());
    }

    // Step 3: 等待图表渲染（Mermaid 和 PlantUML 需要时间）
    std::thread::sleep(Duration::from_millis(1500));

    // Step 4: 使用 PrintToPdfStream 获取 PDF bytes
    // 发送进度事件：提取书签位置
    let _ = app.emit("export-progress", "提取书签位置...");

    let pdf_bytes = print_to_pdf_stream_internal(print_window).await?;

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