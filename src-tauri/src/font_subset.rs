//! 字体子集化模块
//!
//! 使用 fontcull 库对字体进行子集化，只保留需要的字符

use std::collections::HashSet;
use fontcull::{subset_font_data, FontFormat};
use tauri::{AppHandle, Manager};

/// 对中文字体进行子集化
///
/// # Arguments
/// * `app` - Tauri AppHandle
/// * `text` - 需要保留的字符文本
///
/// # Returns
/// 子集化后的字体数据（TTF 格式）
#[tauri::command]
pub async fn subset_chinese_font(
    app: AppHandle,
    text: String,
) -> Result<Vec<u8>, String> {
    // 获取字体文件路径
    let font_path = get_font_path(&app)?;

    // 读取字体文件
    let font_bytes = std::fs::read(&font_path)
        .map_err(|e| format!("读取字体失败: {}", e))?;

    // 检查字体格式
    let format = FontFormat::detect(&font_bytes);
    println!("字体格式: {:?}", format);

    // 构建需要保留的字符集合
    let chars: HashSet<char> = text.chars().collect();
    println!("子集化字符: {} 个", chars.len());

    // 执行子集化（空数组表示使用默认 OpenType 特性）
    let subset_bytes = subset_font_data(&font_bytes, &chars, &[])
        .map_err(|e| format!("子集化失败: {}", e))?;

    println!("子集化成功: {} bytes (原始: {} bytes)", subset_bytes.len(), font_bytes.len());

    Ok(subset_bytes)
}

/// 获取中文字体文件路径
fn get_font_path(app: &AppHandle) -> Result<String, String> {
    // 尝试开发模式的路径
    let dev_paths = [
        "src-tauri/assets/fonts/NotoSansSC-Regular.ttf",
        "./assets/fonts/NotoSansSC-Regular.ttf",
    ];

    for path in dev_paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    // 生产模式：使用 resource_dir
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    let font_path = resource_dir.join("assets/fonts/NotoSansSC-Regular.ttf");
    if font_path.exists() {
        return Ok(font_path.to_string_lossy().to_string());
    }

    Err("未找到中文字体文件 NotoSansSC-Regular.ttf".to_string())
}