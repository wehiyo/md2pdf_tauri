//! PDF 书签注入模块
//!
//! 使用 lopdf 库修改 PDF 对象树，插入书签（Outlines）节点
//! 支持多级嵌套书签（h1-h4）

use lopdf::{Document, Object, Dictionary, StringFormat};
use serde::Deserialize;

/// 书签输入数据（来自前端）
#[derive(Debug, Deserialize)]
pub struct BookmarkInput {
    pub title: String,
    pub page: usize,     // 0-indexed 页码（相对于正文，不包括封面）
    pub y: f32,          // PDF Y 坐标（从顶部开始，单位 pt，由 pdf-extract 提取）
    pub level: u32,      // 标题层级 (h1=1, h2=2, h3=3, h4=4)
    pub page_height: f32, // 页面实际高度（单位 pt）
}

/// 将字符串编码为 UTF-16BE（PDF 书签要求）
/// 以 BOM (U+FEFF) 开头标识编码
fn utf16be_encode(s: &str) -> Vec<u8> {
    let mut bytes = Vec::new();
    // 写入 BOM (Big Endian)
    bytes.push(0xFE);
    bytes.push(0xFF);
    // 编码每个字符为 UTF-16BE
    for c in s.encode_utf16() {
        bytes.push((c >> 8) as u8);
        bytes.push((c & 0xFF) as u8);
    }
    bytes
}

/// 将 pdf-extract 提取的 Y 坐标转换为 PDF 书签 Y 坐标
/// pdf-extract 提取的 Y：从页面顶部开始（翻转后），单位 pt
/// PDF 书签 Y：从页面底部开始，单位 pt
/// 转换：PDF_Y = page_height - extracted_Y + offset（向上偏移以跳转到标题上方）
fn transform_y(extracted_y_pt: f32, page_height: f32) -> f32 {
    // extracted_y_pt 是 pdf-extract 返回的翻转后坐标（从上往下，顶部为 0）
    // PDF 书签需要从底部往上计算的坐标
    // 向上偏移 15pt，让书签跳转到标题上方一点，避免标题被遮挡
    const OFFSET: f32 = 15.0;
    // 转换：从顶部往下 -> 从底部往上
    // y_pdf = page_height - y_from_top + OFFSET
    page_height - extracted_y_pt + OFFSET
}

/// 注入书签到 PDF
#[tauri::command]
pub async fn inject_bookmarks(
    pdf_path: String,
    bookmarks: Vec<BookmarkInput>,
) -> Result<(), String> {
    if bookmarks.is_empty() {
        return Ok(()); // 无书签，直接返回
    }

    // 加载 PDF
    let mut doc = Document::load(&pdf_path)
        .map_err(|e| format!("无法加载 PDF: {}", e))?;

    // 获取页面对象 ID
    let pages = doc.get_pages();
    let page_ids: Vec<Object> = pages.values()
        .map(|id| Object::Reference(*id))
        .collect();

    // 构建书签树结构
    let outlines_ref = build_outline_tree(&mut doc, &bookmarks, &page_ids)?;

    // 将 Outlines 挂载到 Catalog
    // 从 trailer 获取 Root (catalog) 引用
    let catalog_ref = doc.trailer
        .get(b"Root")
        .and_then(Object::as_reference)
        .map_err(|e| format!("无法获取 Catalog 引用: {}", e))?;

    if let Some(catalog_obj) = doc.objects.get_mut(&catalog_ref) {
        if let Object::Dictionary(catalog) = catalog_obj {
            catalog.set("Outlines", outlines_ref);
        }
    }

    // 保存 PDF
    doc.save(&pdf_path)
        .map_err(|e| format!("无法保存 PDF: {}", e))?;

    Ok(())
}

/// 书签树节点（用于构建链表）
#[derive(Clone)]
struct BookmarkNode {
    bookmark_id: (u32, u16),  // Object ID
    level: u32,
    children: Vec<BookmarkNode>,
}

/// 构建书签树并返回 Outlines 根节点引用
fn build_outline_tree(
    doc: &mut Document,
    bookmarks: &[BookmarkInput],
    page_ids: &[Object],
) -> Result<Object, String> {
    // 创建 Outlines 根节点
    let outlines_dict = Dictionary::new();
    let outlines_id = doc.add_object(Object::Dictionary(outlines_dict));

    // 构建树形结构
    let root_children: Vec<BookmarkNode> = build_tree_structure(doc, bookmarks, page_ids, outlines_id)?;

    if root_children.is_empty() {
        return Ok(Object::Reference(outlines_id));
    }

    // 设置 Outlines 根节点的 First 和 Last
    if let Some(outlines_obj) = doc.objects.get_mut(&outlines_id) {
        if let Object::Dictionary(outlines_dict) = outlines_obj {
            outlines_dict.set("First", Object::Reference(root_children[0].bookmark_id));
            outlines_dict.set("Last", Object::Reference(root_children.last().unwrap().bookmark_id));
            outlines_dict.set("Count", Object::Integer(root_children.len() as i64));
        }
    }

    // 设置一级书签之间的 Prev/Next 关系
    for (i, child) in root_children.iter().enumerate() {
        if let Some(child_obj) = doc.objects.get_mut(&child.bookmark_id) {
            if let Object::Dictionary(child_dict) = child_obj {
                if i > 0 {
                    child_dict.set("Prev", Object::Reference(root_children[i - 1].bookmark_id));
                }
                if i < root_children.len() - 1 {
                    child_dict.set("Next", Object::Reference(root_children[i + 1].bookmark_id));
                }
            }
        }
    }

    Ok(Object::Reference(outlines_id))
}

/// 构建树形结构，返回一级节点列表
fn build_tree_structure(
    doc: &mut Document,
    bookmarks: &[BookmarkInput],
    page_ids: &[Object],
    parent_id: (u32, u16),
) -> Result<Vec<BookmarkNode>, String> {
    // 使用栈维护当前路径
    let mut root_children: Vec<BookmarkNode> = Vec::new();
    let mut path: Vec<BookmarkNode> = Vec::new();

    for bm in bookmarks {
        // 计算实际页码索引
        // 前端传来的 page 是正文页码（从 1 开始，已减去封面页）
        // page_ids 数组索引从 0 开始：page_ids[0] = PDF 第 1 页（封面）
        // 所以：如果 bm.page = 1（正文第一页），需要访问 page_ids[1]（PDF 第 2 页）
        // actual_page_index = bm.page（因为 bm.page 已经是 1-indexed 的正文页码）
        let actual_page_index = bm.page as usize; // 直接使用 bm.page 作为索引

        if actual_page_index >= page_ids.len() {
            continue;
        }

        // 获取页面引用
        let page_ref = page_ids[actual_page_index].clone();

        // 转换 Y 坐标（使用页面实际高度）
        let pdf_y = transform_y(bm.y, bm.page_height);

        // 创建书签字典
        let mut bookmark_dict = Dictionary::new();
        // PDF 书签标题需要 UTF-16BE 编码（支持中文）
        // 以 BOM (U+FEFF) 开头标识 UTF-16BE 编码
        let title_utf16 = utf16be_encode(&bm.title);
        bookmark_dict.set("Title", Object::String(title_utf16, StringFormat::Hexadecimal));
        bookmark_dict.set("Parent", Object::Reference(parent_id));

        // 设置跳转目标: [PageRef /XYZ left top zoom]
        // left=null 表示保持当前水平位置
        // top=pdf_y 表示跳转到该 Y 坐标
        // zoom=null 表示保持当前缩放
        let dest = Object::Array(vec![
            page_ref,
            Object::Name("XYZ".into()),
            Object::Null,
            Object::Real(pdf_y),
            Object::Null,
        ]);
        bookmark_dict.set("Dest", dest);

        // 添加书签对象
        let bookmark_id = doc.add_object(Object::Dictionary(bookmark_dict));

        // 创建节点
        let node = BookmarkNode {
            bookmark_id,
            level: bm.level,
            children: Vec::new(),
        };

        // 弹出路径中 level >= 当前的节点
        while !path.is_empty() && path.last().unwrap().level >= node.level {
            let popped = path.pop().unwrap();
            // 设置弹出节点的子节点关系
            if !popped.children.is_empty() {
                set_children_relations(doc, &popped)?;
            }
        }

        // 添加到父节点
        if path.is_empty() {
            root_children.push(node.clone());
        } else {
            path.last_mut().unwrap().children.push(node.clone());
        }

        path.push(node);
    }

    // 处理剩余路径中的节点
    while !path.is_empty() {
        let popped = path.pop().unwrap();
        if !popped.children.is_empty() {
            set_children_relations(doc, &popped)?;
        }
    }

    Ok(root_children)
}

/// 设置子节点之间的 First/Last/Next/Prev 关系
fn set_children_relations(doc: &mut Document, parent: &BookmarkNode) -> Result<(), String> {
    if parent.children.is_empty() {
        return Ok(());
    }

    // 设置父节点的 First 和 Last
    if let Some(parent_obj) = doc.objects.get_mut(&parent.bookmark_id) {
        if let Object::Dictionary(parent_dict) = parent_obj {
            parent_dict.set("First", Object::Reference(parent.children[0].bookmark_id));
            parent_dict.set("Last", Object::Reference(parent.children.last().unwrap().bookmark_id));
            parent_dict.set("Count", Object::Integer(parent.children.len() as i64));
        }
    }

    // 设置子节点之间的 Prev/Next
    for (i, child) in parent.children.iter().enumerate() {
        if let Some(child_obj) = doc.objects.get_mut(&child.bookmark_id) {
            if let Object::Dictionary(child_dict) = child_obj {
                // 设置 Parent
                child_dict.set("Parent", Object::Reference(parent.bookmark_id));

                if i > 0 {
                    child_dict.set("Prev", Object::Reference(parent.children[i - 1].bookmark_id));
                }
                if i < parent.children.len() - 1 {
                    child_dict.set("Next", Object::Reference(parent.children[i + 1].bookmark_id));
                }
            }
        }

        // 递归处理子节点
        if !child.children.is_empty() {
            set_children_relations(doc, child)?;
        }
    }

    Ok(())
}