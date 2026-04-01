//! PDF 打印功能模块
//!
//! 使用 WebView2 的 PrintToPdf API 实现静默 PDF 生成
//! 通过创建隐藏窗口来避免破坏主窗口的 JavaScript 环境

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{WebviewWindow, AppHandle, WebviewUrl};
use url::Url;

/// 打印结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintResult {
    pub success: bool,
    pub path: String,
    pub error: Option<String>,
}

/// 静默打印 HTML 内容到 PDF
#[tauri::command]
pub async fn print_to_pdf(
    app: AppHandle,
    window: WebviewWindow,
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

        // 关闭隐藏窗口
        let _ = print_window.close();

        result
    }

    #[cfg(not(windows))]
    {
        let _ = (app, window, html, save_path);
        Err("PDF silent print is only supported on Windows".to_string())
    }
}

/// 创建隐藏的打印窗口
#[cfg(windows)]
fn create_print_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let blank_url = Url::parse("about:blank").expect("URL should be valid");

    let print_window = tauri::WebviewWindowBuilder::new(
        app,
        "print-window",
        WebviewUrl::External(blank_url)
    )
    .visible(false)
    .inner_size(800.0, 600.0)
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
                            Err(format!("PrintToPdf 失败: {:?}", error_result))
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