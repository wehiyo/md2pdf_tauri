//! PDF 链接注入模块
//!
//! 使用 lopdf 库修改 PDF 对象树，插入 Link Annotation
//! 实现内部链接点击跳转功能

use lopdf::{Document, Object, Dictionary};
use serde::Deserialize;

/// 链接输入数据（来自前端）
#[derive(Debug, Deserialize)]
pub struct LinkInput {
    #[allow(dead_code)]
    pub href_id: String,     // 目标标题 ID（用于调试）
    pub link_page: usize,    // 链接所在页码（1-indexed）
    pub link_y: f32,         // 链接顶部 Y 坐标（从顶部开始，单位 pt）
    pub target_page: usize,  // 目标页码（1-indexed）
    pub target_y: f32,       // 目标 Y 坐标（从顶部开始，单位 pt）
}

/// A4 页面高度 (72 DPI)
const A4_HEIGHT_PT: f32 = 842.0;

/// 页面宽度 (72 DPI)
const A4_WIDTH_PT: f32 = 595.0;

/// 链接文本行高（假设值）
const LINE_HEIGHT_PT: f32 = 14.0;

/// 将 pdf-extract 提取的 Y 坐标转换为 PDF Y 坐标
/// 与 bookmark.rs 保持完全一致
/// pdf-extract 返回的 Y：从顶部开始（翻转后），单位 pt
/// PDF Dest XYZ top：从底部开始，单位 pt
fn transform_y(extracted_y_pt: f32) -> f32 {
    // 与 bookmark.rs 使用相同的偏移值
    const OFFSET: f32 = 15.0;
    // pdf-extract 返回的 Y 是从页面顶部往下
    // PDF Dest 需要从底部往上
    let pdf_y = A4_HEIGHT_PT - extracted_y_pt + OFFSET;
    println!("[link] transform_y: extracted_y={} -> pdf_y={} (A4_HEIGHT={}, OFFSET={})",
             extracted_y_pt, pdf_y, A4_HEIGHT_PT, OFFSET);
    pdf_y
}

/// 注入链接到 PDF
#[tauri::command]
pub async fn inject_links(
    pdf_path: String,
    links: Vec<LinkInput>,
) -> Result<(), String> {
    println!("[link] ========== 开始注入链接 ========== ");
    println!("[link] PDF路径: {}", pdf_path);
    println!("[link] 链接数量: {}", links.len());

    if links.is_empty() {
        println!("[link] 无链接，直接返回");
        return Ok(()); // 无链接，直接返回
    }

    // 加载 PDF
    let mut doc = Document::load(&pdf_path)
        .map_err(|e| format!("无法加载 PDF: {}", e))?;

    println!("[link] PDF加载成功");

    // 获取页面对象 ID
    let pages = doc.get_pages();
    let page_ids: Vec<Object> = pages.values()
        .map(|id| Object::Reference(*id))
        .collect();
    println!("[link] PDF总页数: {}", page_ids.len());

    // 为每个链接创建 Link Annotation
    for (i, link) in links.iter().enumerate() {
        println!("[link] --- 链接 #{} ---", i + 1);
        println!("[link] href_id: {}", link.href_id);
        println!("[link] link_page: {}, link_y: {}", link.link_page, link.link_y);
        println!("[link] target_page: {}, target_y: {}", link.target_page, link.target_y);

        // 计算 PDF 页面索引：page_ids 数组索引从 0 开始
        // link_page/target_page 是 PDF 页码（1-indexed），需要减 1 转成索引
        let link_page_index = (link.link_page - 1) as usize;
        if link_page_index >= page_ids.len() {
            println!("[link] WARN: 链接页索引 {} 超出范围 (总页数 {}), 跳过", link_page_index, page_ids.len());
            continue;
        }

        let target_page_index = (link.target_page - 1) as usize;
        if target_page_index >= page_ids.len() {
            println!("[link] WARN: 目标页索引 {} 超出范围 (总页数 {}), 跳过", target_page_index, page_ids.len());
            continue;
        }

        // 获取页面引用
        let _link_page_ref = page_ids[link_page_index].clone();  // 保留用于调试
        let target_page_ref = page_ids[target_page_index].clone();

        println!("[link] 链接页索引: {} (PDF页{}), 目标页索引: {} (PDF页{})",
                 link_page_index, link.link_page, target_page_index, link.target_page);

        // 转换 Y 坐标
        println!("[link] 转换坐标...");
        let link_top_y = transform_y(link.link_y);
        let link_bottom_y = transform_y(link.link_y + LINE_HEIGHT_PT);
        let target_y = transform_y(link.target_y);
        println!("[link] link_top_y: {}, link_bottom_y: {}, target_y: {}", link_top_y, link_bottom_y, target_y);

        // 创建 Link Annotation 字典
        let mut link_dict = Dictionary::new();

        // 设置类型和子类型
        link_dict.set("Type", Object::Name("Annot".into()));
        link_dict.set("Subtype", Object::Name("Link".into()));

        // 设置点击区域 Rect: [left, bottom, right, top]
        // 假设链接从页面左边开始，宽度为页面宽度
        println!("[link] 设置 Rect: left=0, bottom={}, right={}, top={}", link_bottom_y, A4_WIDTH_PT, link_top_y);
        link_dict.set("Rect", Object::Array(vec![
            Object::Real(0.0),              // left
            Object::Real(link_bottom_y),    // bottom
            Object::Real(A4_WIDTH_PT),      // right
            Object::Real(link_top_y),       // top
        ]));

        // 设置目标 Dest: [page_ref /XYZ left top zoom]
        println!("[link] 设置 Dest: page_ref, XYZ, null, target_y={}, null", target_y);
        link_dict.set("Dest", Object::Array(vec![
            target_page_ref,
            Object::Name("XYZ".into()),
            Object::Null,                   // left: 保持当前水平位置
            Object::Real(target_y),         // top: 目标 Y 坐标
            Object::Null,                   // zoom: 保持当前缩放
        ]));

        // 设置无边框
        link_dict.set("Border", Object::Array(vec![
            Object::Integer(0),
            Object::Integer(0),
            Object::Integer(0),
        ]));

        // 添加 Link Annotation 对象
        let link_id = doc.add_object(Object::Dictionary(link_dict));
        println!("[link] 创建 Link Annotation 对象: {:?}", link_id);

        // 将 Link Annotation 添加到页面的 Annots 数组
        // 需要获取页面对象并添加 Annots
        if let Some(page_obj) = doc.objects.get_mut(&page_ids[link_page_index].as_reference().unwrap()) {
            if let Object::Dictionary(page_dict) = page_obj {
                // 获取或创建 Annots 数组
                let annot_count_before = match page_dict.get(b"Annots") {
                    Ok(Object::Array(arr)) => arr.len(),
                    _ => 0
                };
                let mut annots_vec: Vec<Object> = match page_dict.get(b"Annots") {
                    Ok(Object::Array(arr)) => arr.clone(),
                    _ => vec![]
                };

                // 添加新的 Link Annotation 引用
                annots_vec.push(Object::Reference(link_id));
                let annot_count_after = annots_vec.len();
                page_dict.set("Annots", Object::Array(annots_vec));
                println!("[link] 添加到页面 {} Annots: {} -> {} 个注解", link_page_index, annot_count_before, annot_count_after);
            }
        }
    }

    // 保存 PDF
    println!("[link] 保存 PDF...");
    doc.save(&pdf_path)
        .map_err(|e| format!("无法保存 PDF: {}", e))?;

    println!("[link] ========== 链接注入完成 ========== ");
    Ok(())
}