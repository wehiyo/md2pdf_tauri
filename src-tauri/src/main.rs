// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod print;
mod plantuml;
mod bookmark;
mod pdf_extract;

use print::{print_to_pdf, print_to_pdf_with_bookmarks, check_print_support, print_to_pdf_stream_with_markers};
use plantuml::render_plantuml;
use bookmark::inject_bookmarks;
use pdf_extract::{extract_pdf_markers, extract_pdf_markers_from_bytes};
use std::fs;
use encoding_rs::{UTF_8, GB18030};
use tauri::{Emitter, Manager};

/// 读取文件，自动检测编码（支持 UTF-8 和 GB18030）
/// 返回 (解码后的文本, 检测到的编码名称)
#[tauri::command]
fn read_file_with_encoding(path: String) -> Result<(String, String), String> {
    let bytes = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 先尝试 UTF-8 解码
    let (text, _encoding_used, had_errors) = UTF_8.decode(&bytes);

    if had_errors {
        // UTF-8 解码失败，尝试 GB18030
        let (text, _, _) = GB18030.decode(&bytes);
        Ok((text.into_owned(), "GB18030".to_string()))
    } else {
        // 检查是否包含 UTF-8 BOM，如果有则移除
        let text_str = text.into_owned();
        if text_str.starts_with('\u{FEFF}') {
            Ok((text_str[1..].to_string(), "UTF-8".to_string()))
        } else {
            Ok((text_str, "UTF-8".to_string()))
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            print_to_pdf,
            print_to_pdf_with_bookmarks,
            check_print_support,
            render_plantuml,
            inject_bookmarks,
            extract_pdf_markers,
            extract_pdf_markers_from_bytes,
            print_to_pdf_stream_with_markers,
            read_file_with_encoding
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 检查是否是主窗口
                if window.label() == "main" {
                    // 清理隐藏的打印窗口（如果存在）
                    if let Some(print_window) = window.app_handle().get_webview_window("print-window") {
                        // 使用 destroy 直接销毁，不触发关闭事件
                        let _ = print_window.destroy();
                    }

                    // 阻止默认关闭行为，让前端处理
                    api.prevent_close();
                    // 发送事件到前端
                    let _ = window.emit("close-requested", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}