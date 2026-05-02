//! PDF 内容提取模块
//!
//! 使用 pdf-extract 库从 PDF 中提取文本，支持 ToUnicode CMap 解析
//! 通过自定义 OutputDev 实现获取文本精确位置
//!
//! 性能优化：使用 lopdf Reader 和 filter_func 跳过图片流

use pdf_extract::{Document, OutputDev, MediaBox, Transform, OutputError, ColorSpace, Path, Object, ObjectId, Reader};
use std::collections::HashMap;

/// 标记位置结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct MarkerPosition {
    pub marker: String,
    pub page: u32,      // 1-indexed 页码
    pub y: f32,         // PDF 坐标系 Y 位置（从底部计算）
}

/// 自定义 OutputDev，用于捕获文本及其位置
struct MarkerFinder {
    /// 当前页码
    current_page: u32,
    /// 翻转变换矩阵（将 PDF 坐标转为从上往下的坐标系）
    flip_ctm: Transform,
    /// 当前累积的文本
    current_text: String,
    /// 字符位置记录（字节索引 -> Y 坐标），保持排序以便二分查找
    char_positions: Vec<(usize, f64)>,
    /// 当前文本的 Y 坐标
    current_y: f64,
    /// 找到的标记位置
    found_markers: HashMap<String, (u32, f64)>,
    /// 标记列表（保持顺序）
    marker_list: Vec<String>,
    /// 是否已找到所有标记（用于提前终止）
    all_found: bool,
    /// 总标记数
    total_markers: usize,
}

impl MarkerFinder {
    fn new(markers: &[String]) -> Self {
        Self {
            current_page: 0,
            flip_ctm: Transform::identity(),
            current_text: String::new(),
            char_positions: Vec::new(),
            current_y: 0.0,
            found_markers: HashMap::new(),
            marker_list: markers.to_vec(),
            all_found: false,
            total_markers: markers.len(),
        }
    }

    /// 检查是否已找到所有标记
    fn check_all_found(&mut self) {
        if self.found_markers.len() == self.total_markers {
            self.all_found = true;
        }
    }

    /// 在累积的文本中搜索标记（利用有序性优化：一次扫描找到所有标记）
    fn search_markers_in_text(&mut self) {
        if self.all_found {
            return;
        }

        // 移除空格和换行符，因为标记是连续的 ASCII 字符
        let clean_text: String = self.current_text.chars()
            .filter(|c| !c.is_whitespace())
            .collect();

        // 利用标记有序性：一次扫描找到所有标记
        // 标记格式固定（PDFMARK000-999），按顺序出现
        // 找到上一个标记后，下一个标记必定在当前位置之后

        // 获取上一个找到的标记的位置（作为搜索起点）
        let mut search_start = 0;

        // 找到已找到的最后一个标记在 marker_list 中的索引
        let mut last_found_idx = 0;
        for (idx, marker) in self.marker_list.iter().enumerate() {
            if self.found_markers.contains_key(marker) {
                last_found_idx = idx + 1;  // 从下一个开始搜索
                // 获取该标记在 clean_text 中的位置作为起点
                if let Some(pos) = clean_text.find(marker) {
                    search_start = pos + marker.len();  // 从标记末尾之后开始
                }
            } else {
                break;  // 遇到未找到的标记，停止
            }
        }

        // 从 last_found_idx 开始，依次搜索剩余标记
        for idx in last_found_idx..self.marker_list.len() {
            let marker = &self.marker_list[idx];

            // 从 search_start 之后搜索（利用有序性）
            if search_start >= clean_text.len() {
                break;  // 已超出文本范围，剩余标记不在本页
            }

            // 在剩余文本中搜索
            let remaining_text = &clean_text[search_start..];
            if let Some(relative_pos) = remaining_text.find(marker) {
                let byte_pos = search_start + relative_pos;
                // 将字节位置转换为字符位置
                let char_pos = clean_text[..byte_pos].chars().count();
                let y = self.find_y_for_clean_position(char_pos);
                self.found_markers.insert(marker.clone(), (self.current_page, y));

                // 更新搜索起点为当前标记末尾之后
                search_start = byte_pos + marker.len();
            } else {
                // 当前标记未找到，后续标记也不会在本页
                break;
            }
        }

        // 检查是否已找到所有标记
        self.check_all_found();
    }

    /// 根据清理后文本的位置查找 Y 坐标
    fn find_y_for_clean_position(&self, clean_pos: usize) -> f64 {
        // 重建清理后的字符索引到原始字节索引的映射
        let mut clean_idx = 0;
        let mut prev_y = if !self.char_positions.is_empty() {
            self.char_positions[0].1
        } else {
            self.current_y
        };

        for (byte_idx, c) in self.current_text.char_indices() {
            if !c.is_whitespace() {
                if clean_idx == clean_pos {
                    // 精确匹配
                    return self.find_y_for_byte_index(byte_idx);
                }
                // 记录前一个非空白字符的位置
                prev_y = self.find_y_for_byte_index(byte_idx);
                clean_idx += 1;
            }
        }

        // 如果 clean_pos 超出范围，使用最后一个已知位置
        prev_y
    }

    /// 根据字节索引查找 Y 坐标（使用二分查找优化）
    fn find_y_for_byte_index(&self, target_byte_idx: usize) -> f64 {
        if self.char_positions.is_empty() {
            return self.current_y;
        }

        // 使用二分查找找到目标位置
        // char_positions 保持按 byte_idx 排序
        match self.char_positions.binary_search_by(|(byte_idx, _)| {
            byte_idx.cmp(&target_byte_idx)
        }) {
            Ok(idx) => self.char_positions[idx].1,
            Err(idx) => {
                // 如果没找到精确匹配，返回前一个位置
                if idx == 0 {
                    self.char_positions[0].1
                } else if idx >= self.char_positions.len() {
                    self.char_positions[self.char_positions.len() - 1].1
                } else {
                    self.char_positions[idx - 1].1
                }
            }
        }
    }
}

impl OutputDev for MarkerFinder {
    fn begin_page(&mut self, page_num: u32, media_box: &MediaBox, _art_box: Option<(f64, f64, f64, f64)>) -> Result<(), OutputError> {
        // 如果已找到所有标记，跳过处理
        if self.all_found {
            return Ok(());
        }

        // 在开始新页前，搜索上一页的标记
        if self.current_page > 0 {
            self.search_markers_in_text();
        }

        self.current_page = page_num;
        // 创建翻转变换：将 PDF 坐标系（Y 从下往上）转为从上往下的坐标系
        self.flip_ctm = Transform::row_major(1.0, 0.0, 0.0, -1.0, 0.0, media_box.ury - media_box.lly);
        self.current_text.clear();
        self.char_positions.clear();

        Ok(())
    }

    fn end_page(&mut self) -> Result<(), OutputError> {
        // 如果已找到所有标记，跳过处理
        if self.all_found {
            return Ok(());
        }

        // 在页结束时搜索标记
        self.search_markers_in_text();

        Ok(())
    }

    fn output_character(&mut self, trm: &Transform, _width: f64, _spacing: f64, _font_size: f64, char: &str) -> Result<(), OutputError> {
        // 如果已找到所有标记，跳过字符处理（提前终止优化）
        if self.all_found {
            return Ok(());
        }

        // 应用翻转变换获取正确的坐标
        let position = trm.post_transform(&self.flip_ctm);
        let y = position.m32;

        // 使用字节索引记录位置
        let byte_idx = self.current_text.len();
        self.char_positions.push((byte_idx, y));
        self.current_y = y;

        // 累积文本
        self.current_text.push_str(char);

        Ok(())
    }

    fn begin_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }

    fn end_word(&mut self) -> Result<(), OutputError> {
        // 如果已找到所有标记，跳过处理
        if self.all_found {
            return Ok(());
        }

        // 单词之间添加空格，不记录位置
        self.current_text.push(' ');
        Ok(())
    }

    fn end_line(&mut self) -> Result<(), OutputError> {
        // 如果已找到所有标记，跳过处理
        if self.all_found {
            return Ok(());
        }

        // 行末添加换行，不记录位置
        self.current_text.push('\n');
        Ok(())
    }

    fn stroke(&mut self, _ctm: &Transform, _colorspace: &ColorSpace, _color: &[f64], _path: &Path) -> Result<(), OutputError> {
        Ok(())
    }

    fn fill(&mut self, _ctm: &Transform, _colorspace: &ColorSpace, _color: &[f64], _path: &Path) -> Result<(), OutputError> {
        Ok(())
    }
}

/// 从 PDF 中提取标记位置
pub fn extract_marker_positions(
    pdf_path: &str,
    markers: &[String],
) -> Result<Vec<MarkerPosition>, String> {
    // 加载 PDF
    let doc = Document::load(pdf_path)
        .map_err(|e| format!("无法加载 PDF: {}", e))?;

    // 创建自定义 OutputDev
    let mut finder = MarkerFinder::new(markers);

    // 处理整个文档
    pdf_extract::output_doc(&doc, &mut finder)
        .map_err(|e| format!("PDF 处理失败: {:?}", e))?;

    // 构建结果（保持原始顺序）
    let result: Vec<MarkerPosition> = markers.iter()
        .map(|m| {
            finder.found_markers.get(m)
                .map(|(page, y)| MarkerPosition {
                    marker: m.clone(),
                    page: *page,
                    y: *y as f32,
                })
                .unwrap_or_else(|| {
                    MarkerPosition {
                        marker: m.clone(),
                        page: 1,
                        y: 750.0,
                    }
                })
        })
        .collect();

    Ok(result)
}

/// Tauri Command: 从 PDF 提取标记位置
#[tauri::command]
pub async fn extract_pdf_markers(
    pdf_path: String,
    markers: Vec<String>,
) -> Result<Vec<MarkerPosition>, String> {
    extract_marker_positions(&pdf_path, &markers)
}

/// 过滤函数：跳过图片流的内容
/// 返回 None 会完全跳过对象，返回 Some 会保留对象
/// 我们跳过所有图片流，因为不需要图片数据来提取文本位置
fn filter_image_streams(object_id: ObjectId, object: &mut Object) -> Option<(ObjectId, Object)> {
    // 检查是否是图片流
    if let Object::Stream(stream) = object {
        if stream.dict.has_type(b"Image") {
            // 跳过图片流对象，不解压缩其内容
            return None;
        }
    }
    Some((object_id, object.clone()))
}

/// 从内存中的 PDF bytes 提取标记位置（优化版：跳过图片流）
pub fn extract_marker_positions_from_bytes(
    pdf_bytes: &[u8],
    markers: &[String],
) -> Result<Vec<MarkerPosition>, String> {
    // 使用 lopdf Reader 加载 PDF，跳过图片流
    let doc = Reader {
        buffer: pdf_bytes,
        document: Document::new(),
        encryption_state: None,
        raw_objects: std::collections::BTreeMap::new(),
    }
    .read(Some(filter_image_streams))
    .map_err(|e| format!("无法从内存加载 PDF: {}", e))?;

    // 创建自定义 OutputDev
    let mut finder = MarkerFinder::new(markers);

    // 处理整个文档
    pdf_extract::output_doc(&doc, &mut finder)
        .map_err(|e| format!("PDF 处理失败: {:?}", e))?;

    // 构建结果（保持原始顺序）
    let result: Vec<MarkerPosition> = markers.iter()
        .map(|m| {
            finder.found_markers.get(m)
                .map(|(page, y)| MarkerPosition {
                    marker: m.clone(),
                    page: *page,
                    y: *y as f32,
                })
                .unwrap_or_else(|| {
                    MarkerPosition {
                        marker: m.clone(),
                        page: 1,
                        y: 750.0,
                    }
                })
        })
        .collect();

    Ok(result)
}

/// Tauri Command: 从内存中的 PDF bytes 提取标记位置
#[tauri::command]
pub async fn extract_pdf_markers_from_bytes(
    pdf_bytes: Vec<u8>,
    markers: Vec<String>,
) -> Result<Vec<MarkerPosition>, String> {
    extract_marker_positions_from_bytes(&pdf_bytes, &markers)
}

// ── Tests ──────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_marker_finder_new() {
        let markers = vec!["PDFMARK000".to_string(), "PDFMARK001".to_string()];
        let finder = MarkerFinder::new(&markers);
        assert_eq!(finder.current_page, 0);
        assert_eq!(finder.all_found, false);
        assert_eq!(finder.total_markers, 2);
        assert_eq!(finder.marker_list.len(), 2);
        assert!(finder.found_markers.is_empty());
    }

    #[test]
    fn test_find_y_for_byte_index_exact() {
        let mut finder = MarkerFinder::new(&[]);
        finder.char_positions = vec![(0, 100.0), (5, 200.0), (10, 300.0)];
        assert!((finder.find_y_for_byte_index(0) - 100.0).abs() < 0.01);
        assert!((finder.find_y_for_byte_index(5) - 200.0).abs() < 0.01);
        assert!((finder.find_y_for_byte_index(10) - 300.0).abs() < 0.01);
    }

    #[test]
    fn test_find_y_for_byte_index_between() {
        let mut finder = MarkerFinder::new(&[]);
        finder.char_positions = vec![(0, 100.0), (10, 200.0)];
        // Before first → returns first
        assert!((finder.find_y_for_byte_index(0) - 100.0).abs() < 0.01);
        // Between 0 and 10 → returns previous (100.0)
        assert!((finder.find_y_for_byte_index(3) - 100.0).abs() < 0.01);
        assert!((finder.find_y_for_byte_index(7) - 100.0).abs() < 0.01);
    }

    #[test]
    fn test_find_y_for_byte_index_after_last() {
        let mut finder = MarkerFinder::new(&[]);
        finder.char_positions = vec![(0, 100.0), (10, 200.0)];
        // After last → returns last
        assert!((finder.find_y_for_byte_index(20) - 200.0).abs() < 0.01);
    }

    #[test]
    fn test_find_y_for_byte_index_empty() {
        let mut finder = MarkerFinder::new(&[]);
        finder.current_y = 50.0;
        assert!((finder.find_y_for_byte_index(5) - 50.0).abs() < 0.01);
    }

    #[test]
    fn test_search_markers_single_page() {
        let markers = vec!["PDFMARK000".to_string(), "PDFMARK001".to_string()];
        let mut finder = MarkerFinder::new(&markers);
        finder.current_page = 1;

        // Simulate text with markers separated by whitespace
        finder.current_text = "Some text PDFMARK000 more text PDFMARK001 end".to_string();
        // Add char_positions: each char at y=500
        for (i, _) in finder.current_text.char_indices() {
            finder.char_positions.push((i, 500.0));
        }

        finder.search_markers_in_text();

        assert!(finder.found_markers.contains_key("PDFMARK000"));
        assert!(finder.found_markers.contains_key("PDFMARK001"));
        assert_eq!(finder.found_markers.len(), 2);
        let (page, _) = finder.found_markers["PDFMARK000"];
        assert_eq!(page, 1);
    }

    #[test]
    fn test_search_markers_out_of_order_skipped() {
        // If markers are in order and the first isn't found, subsequent shouldn't be searched
        let markers = vec!["PDFMARK001".to_string(), "PDFMARK002".to_string()];
        let mut finder = MarkerFinder::new(&markers);
        finder.current_page = 1;

        // Only contains PDFMARK002, not PDFMARK001
        finder.current_text = "text PDFMARK002 end".to_string();
        for (i, _) in finder.current_text.char_indices() {
            finder.char_positions.push((i, 500.0));
        }

        finder.search_markers_in_text();

        // PDFMARK001 not found, so PDFMARK002 shouldn't be searched either
        assert!(!finder.found_markers.contains_key("PDFMARK001"));
        assert!(!finder.found_markers.contains_key("PDFMARK002"));
    }

    #[test]
    fn test_search_markers_sequential_found() {
        let markers = vec![
            "PDFMARK000".to_string(),
            "PDFMARK001".to_string(),
            "PDFMARK002".to_string(),
        ];
        let mut finder = MarkerFinder::new(&markers);
        finder.current_page = 1;

        finder.current_text = "PDFMARK000 some PDFMARK001 more PDFMARK002".to_string();
        for (i, _) in finder.current_text.char_indices() {
            finder.char_positions.push((i, 500.0));
        }

        finder.search_markers_in_text();

        assert!(finder.found_markers.contains_key("PDFMARK000"));
        assert!(finder.found_markers.contains_key("PDFMARK001"));
        assert!(finder.found_markers.contains_key("PDFMARK002"));
        assert!(finder.all_found);
    }

    #[test]
    fn test_search_markers_no_duplicate_search() {
        // Once a marker is found, calling search again should skip
        let markers = vec!["PDFMARK000".to_string()];
        let mut finder = MarkerFinder::new(&markers);
        finder.current_page = 1;

        finder.current_text = "PDFMARK000".to_string();
        for (i, _) in finder.current_text.char_indices() {
            finder.char_positions.push((i, 500.0));
        }

        finder.search_markers_in_text();
        assert!(finder.found_markers.contains_key("PDFMARK000"));

        // Clear and re-search — should skip because all_found is true
        finder.current_text.clear();
        finder.char_positions.clear();
        finder.search_markers_in_text();
        // Still found (from previous search)
        assert!(finder.found_markers.contains_key("PDFMARK000"));
    }

    #[test]
    fn test_filter_image_streams_skips_images() {
        use lopdf::{Stream, Dictionary, Object as LopdfObject};
        let object_id: pdf_extract::ObjectId = (1, 0);

        // Non-image stream → should keep
        let plain_stream = Stream::new(Dictionary::new(), vec![1, 2, 3]);
        let mut plain_lopdf = LopdfObject::Stream(plain_stream);
        let result = filter_image_streams(object_id, &mut plain_lopdf);
        assert!(result.is_some());

        // Image stream → should skip
        let mut image_dict = Dictionary::new();
        image_dict.set(b"Type", LopdfObject::Name(b"Image".to_vec()));
        let image_stream = Stream::new(image_dict, vec![4, 5, 6]);
        let mut image_lopdf = LopdfObject::Stream(image_stream);
        let result2 = filter_image_streams(object_id, &mut image_lopdf);
        assert!(result2.is_none());
    }
}