// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
struct PdfOptions {
    html: String,
    path: String,
}

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn export_pdf(app: tauri::AppHandle, options: PdfOptions) -> Result<(), String> {
    // 创建临时 HTML 文件
    let temp_html = std::env::temp_dir().join(format!("md2pdf_{}.html", std::process::id()));

    let html_content = format!(
        r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Print</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    {}
    @page {{ margin: 2cm 2.5cm; size: A4; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; }}
    .markdown-body {{ max-width: none; }}
    h1, h2, h3 {{ page-break-after: avoid; }}
    pre, blockquote, table, figure, img, svg, .mermaid {{ page-break-inside: avoid; }}
    * {{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
  </style>
</head>
<body>
  <div class="markdown-body">{}</div>
</body>
</html>"#,
        get_markdown_styles(),
        options.html
    );

    std::fs::write(&temp_html, html_content).map_err(|e| e.to_string())?;

    // 创建隐藏的 webview 窗口用于打印
    let window = tauri::window::WindowBuilder::new(
        &app,
        "print_window",
        tauri::WebviewUrl::External(
            format!("file://{}", temp_html.to_str().unwrap_or("")).parse().unwrap()
        )
    )
    .inner_size(800.0, 600.0)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    // 等待页面加载完成
    std::thread::sleep(std::time::Duration::from_millis(1000));

    // 使用系统打印对话框
    window.eval(r#"
        window.print();
        setTimeout(() => window.close(), 1000);
    "#).map_err(|e| e.to_string())?;

    // 等待打印完成
    std::thread::sleep(std::time::Duration::from_millis(2000));

    // 关闭窗口
    let _ = window.close();

    // 清理临时文件
    let _ = std::fs::remove_file(&temp_html);

    Ok(())
}

fn get_markdown_styles() -> &'static str {
    r#"
.markdown-body { line-height: 1.6; color: #1f2937; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { margin-top: 1.5em; margin-bottom: 0.75em; font-weight: 600; line-height: 1.25; color: #111827; }
.markdown-body h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: 0.875em; }
.markdown-body h6 { font-size: 0.85em; color: #6b7280; }
.markdown-body p { margin-top: 0; margin-bottom: 1em; }
.markdown-body a { color: #3b82f6; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body strong { font-weight: 600; }
.markdown-body em { font-style: italic; }
.markdown-body code { padding: 0.2em 0.4em; margin: 0; font-size: 85%; background-color: #f3f4f6; border-radius: 3px; font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; }
.markdown-body pre { margin-top: 0; margin-bottom: 1em; padding: 1em; overflow: auto; font-size: 85%; line-height: 1.45; background-color: #f3f4f6; border-radius: 6px; }
.markdown-body pre code { padding: 0; background-color: transparent; border-radius: 0; font-size: 100%; white-space: pre; word-break: normal; word-wrap: normal; }
.markdown-body blockquote { margin: 0 0 1em; padding: 0 1em; color: #6b7280; border-left: 0.25em solid #e5e7eb; }
.markdown-body ul, .markdown-body ol { margin-top: 0; margin-bottom: 1em; padding-left: 2em; }
.markdown-body ul { list-style-type: disc; }
.markdown-body ol { list-style-type: decimal; }
.markdown-body li { margin-bottom: 0.25em; }
.markdown-body table { margin-top: 0; margin-bottom: 1em; width: 100%; border-collapse: collapse; border-spacing: 0; }
.markdown-body table th { font-weight: 600; }
.markdown-body table th, .markdown-body table td { padding: 0.5em 1em; border: 1px solid #d1d5db; }
.markdown-body table tr { background-color: #fff; border-top: 1px solid #e5e7eb; }
.markdown-body table tr:nth-child(2n) { background-color: #f9fafb; }
.markdown-body hr { height: 0.25em; padding: 0; margin: 1.5em 0; background-color: #e5e7eb; border: 0; }
.markdown-body img { max-width: 100%; box-sizing: content-box; border-style: none; }
.markdown-body .katex { font-size: 1.1em; }
.markdown-body .katex-display { margin: 1em 0; overflow-x: auto; overflow-y: hidden; }
.markdown-body .footnotes { margin-top: 2em; padding-top: 1em; border-top: 1px solid #e5e7eb; }
.markdown-body .table-of-contents { margin-bottom: 1.5em; padding: 1em; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
.markdown-body .task-list-item { list-style-type: none; padding-left: 0; }
.markdown-body .task-list-item input[type="checkbox"] { margin-right: 0.5em; }
.markdown-body .mermaid { margin: 1em 0; text-align: center; }
"#
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, export_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
