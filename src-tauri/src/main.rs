// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod print;
mod plantuml;
mod bookmark;
mod pdf_extract;
mod font_subset;

use print::{print_to_pdf, print_to_pdf_with_bookmarks, check_print_support, print_to_pdf_stream_with_markers};
use plantuml::render_plantuml;
use bookmark::inject_bookmarks;
use pdf_extract::{extract_pdf_markers, extract_pdf_markers_from_bytes};
use font_subset::subset_chinese_font;
use std::fs;
use encoding_rs::{UTF_8, GB18030};
use tauri::{Emitter, Manager, AppHandle};

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

/// 获取资源目录路径（供前端调用）
#[tauri::command]
fn get_resource_dir(app: AppHandle) -> Result<String, String> {
    app.path().resource_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("获取资源目录失败: {}", e))
}

/// 获取字体文件的绝对路径（供前端调用）
#[tauri::command]
fn get_font_path(app: AppHandle, filename: String) -> Result<String, String> {
    let is_dev = cfg!(debug_assertions);

    let path = if is_dev {
        // 开发模式：当前工作目录是 src-tauri，使用相对路径并转换为绝对路径
        let cwd = std::env::current_dir()
            .map_err(|e| format!("获取当前目录失败: {}", e))?;
        cwd.join("assets/fonts").join(&filename)
    } else {
        // 生产模式：resource_dir/assets/fonts/
        app.path().resource_dir()
            .map_err(|e| format!("获取资源目录失败: {}", e))?
            .join("assets/fonts")
            .join(&filename)
    };

    let absolute_path = path.to_string_lossy().to_string();
    println!("字体路径: {}", absolute_path);
    Ok(absolute_path)
}

/// 获取配置目录路径（供前端调用）
#[tauri::command]
fn get_config_dir(app: AppHandle) -> Result<String, String> {
    app.path().app_config_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("获取配置目录失败: {}", e))
}

/// 扫描字体目录，返回字体文件列表
#[tauri::command]
fn scan_fonts_dir(app: AppHandle) -> Result<Vec<(String, String, String)>, String> {
    // 返回格式: Vec<(id, name, filename)>
    let is_dev = cfg!(debug_assertions);

    let fonts_dir = if is_dev {
        // 开发模式：当前工作目录已经是 src-tauri，直接使用相对路径
        std::path::PathBuf::from("assets/fonts")
    } else {
        // 生产模式：resource_dir
        app.path().resource_dir()
            .map_err(|e| format!("获取资源目录失败: {}", e))?
            .join("assets/fonts")
    };

    println!("扫描字体目录: {}", fonts_dir.to_string_lossy());

    let mut fonts: Vec<(String, String, String)> = Vec::new();

    if !fonts_dir.exists() {
        println!("字体目录不存在: {}", fonts_dir.to_string_lossy());
        return Ok(fonts);
    }

    let entries = std::fs::read_dir(&fonts_dir)
        .map_err(|e| format!("读取字体目录失败: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() {
                let filename = entry.file_name().to_string_lossy().to_string();
                println!("发现文件: {}", filename);

                // 只处理字体文件
                if filename.ends_with(".ttf") || filename.ends_with(".otf")
                   || filename.ends_with(".woff") || filename.ends_with(".woff2") {

                    // 跳过内置字体
                    if filename == "SourceHanSansSC-Regular.ttf"
                       || filename == "SourceCodePro-Regular.ttf" {
                        println!("跳过内置字体: {}", filename);
                        continue;
                    }

                    // 生成ID（文件名去掉扩展名）
                    let id = filename
                        .replace(".ttf", "")
                        .replace(".otf", "")
                        .replace(".woff", "")
                        .replace(".woff2", "");

                    println!("添加字体: id={}, name={}, filename={}", id, id, filename);
                    fonts.push((id.clone(), id, filename));
                }
            }
        }
    }

    println!("扫描结果: {} 个字体", fonts.len());
    Ok(fonts)
}

/// 关闭 splash 窗口并显示主窗口
#[tauri::command]
fn close_splash_window(app: AppHandle) -> Result<(), String> {
    // 关闭 splash 窗口
    if let Some(splash_window) = app.get_webview_window("splash") {
        let _ = splash_window.destroy();
    }

    // 显示主窗口
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }

    Ok(())
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
            read_file_with_encoding,
            get_resource_dir,
            get_config_dir,
            get_font_path,
            scan_fonts_dir,
            subset_chinese_font,
            close_splash_window
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // splash 窗口不允许手动关闭
                if window.label() == "splash" {
                    api.prevent_close();
                    return;
                }

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