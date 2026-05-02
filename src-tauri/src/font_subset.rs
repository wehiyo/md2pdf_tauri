//! 字体子集化模块
//!
//! 使用 fontcull 库对字体进行子集化，只保留需要的字符

use std::collections::HashSet;
use fontcull::subset_font_data;
use tauri::AppHandle;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use anyhow::Context;

/// 对指定字体进行子集化并返回 base64 编码
///
/// # Arguments
/// * `app` - Tauri AppHandle
/// * `filename` - 字体文件名（如 "LXGWWenKaiGB-Regular.ttf"）
/// * `text` - 需要保留的字符文本
///
/// # Returns
/// 子集化后的字体数据（base64 编码）
#[tauri::command]
pub async fn subset_font_to_base64(
    app: AppHandle,
    filename: String,
    text: String,
) -> Result<String, String> {
    let font_path = get_custom_font_path(&app, &filename).map_err(|e| e.to_string())?;
    let font_bytes = std::fs::read(&font_path)
        .context("读取字体失败").map_err(|e| e.to_string())?;
    let chars: HashSet<char> = text.chars().collect();
    let subset_bytes = subset_font_data(&font_bytes, &chars, &[])
        .context("子集化失败").map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&subset_bytes))
}

/// 获取自定义字体文件路径
fn get_custom_font_path(app: &AppHandle, filename: &str) -> anyhow::Result<String> {
    let path = crate::resolve_asset_path(app, &format!("assets/fonts/{}", filename))?;
    if !path.exists() {
        anyhow::bail!("字体文件不存在: {}", path.to_string_lossy());
    }
    Ok(path.to_string_lossy().to_string())
}

/// 对中文字体进行子集化
#[tauri::command]
pub async fn subset_chinese_font(
    app: AppHandle,
    text: String,
) -> Result<Vec<u8>, String> {
    let font_path = get_font_path(&app).map_err(|e| e.to_string())?;
    let font_bytes = std::fs::read(&font_path)
        .context("读取字体失败").map_err(|e| e.to_string())?;
    let chars: HashSet<char> = text.chars().collect();
    let subset_bytes = subset_font_data(&font_bytes, &chars, &[])
        .context("子集化失败").map_err(|e| e.to_string())?;
    Ok(subset_bytes)
}

/// 获取中文字体文件路径（子集化专用）
fn get_font_path(app: &AppHandle) -> anyhow::Result<String> {
    const FONT_FILE: &str = "assets/fonts/SourceHanSansSC-Regular.ttf";
    if cfg!(debug_assertions) {
        for dev_path in &[FONT_FILE, &format!("src-tauri/{}", FONT_FILE)] {
            if std::path::Path::new(dev_path).exists() {
                return Ok(dev_path.to_string());
            }
        }
    }
    let path = crate::resolve_asset_path(app, FONT_FILE)?;
    if path.exists() {
        return Ok(path.to_string_lossy().to_string());
    }
    anyhow::bail!("未找到中文字体文件 SourceHanSansSC-Regular.ttf")
}