//! PDF 内容提取模块
//!
//! 使用 pdf-extract 库从 PDF 中提取文本，支持 ToUnicode CMap 解析
//! 通过自定义 OutputDev 实现获取文本精确位置

use pdf_extract::{Document, OutputDev, MediaBox, Transform, OutputError, ColorSpace, Path};
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
    /// 字符位置记录（字节索引 -> Y 坐标）
    char_positions: Vec<(usize, f64)>,
    /// 当前文本的 Y 坐标
    current_y: f64,
    /// 找到的标记位置
    found_markers: HashMap<String, (u32, f64)>,
    /// 要搜索的标记列表
    markers: Vec<String>,
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
            markers: markers.to_vec(),
        }
    }

    /// 在累积的文本中搜索标记
    fn search_markers_in_text(&mut self) {
        // 移除空格和换行符，因为标记是连续的 ASCII 字符
        let clean_text: String = self.current_text.chars()
            .filter(|c| !c.is_whitespace())
            .collect();

        for marker in &self.markers {
            if self.found_markers.contains_key(marker) {
                continue;
            }

            // 注意：find() 返回的是字节位置，对于 ASCII 标记这是正确的
            // 但我们需要转换为字符位置来匹配 char_indices() 的遍历
            if let Some(byte_pos) = clean_text.find(marker) {
                // 将字节位置转换为字符位置
                let char_pos = clean_text[..byte_pos].chars().count();
                let y = self.find_y_for_clean_position(char_pos);
                println!("[PDF提取] 在第 {} 页找到标记: {}, Y={:.2}", self.current_page, marker, y);
                self.found_markers.insert(marker.clone(), (self.current_page, y));
            }
        }
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

    /// 根据字节索引查找 Y 坐标
    fn find_y_for_byte_index(&self, target_byte_idx: usize) -> f64 {
        // 使用二分查找最近的字符位置
        // char_positions 存储的是 (byte_idx, y)，需要找到 target_byte_idx 对应或最近的 Y
        if self.char_positions.is_empty() {
            return self.current_y;
        }

        // 找到第一个 byte_idx <= target_byte_idx 的位置（向后查找）
        // 因为某些索引（空格、换行）可能没有直接记录
        let mut best_y = self.char_positions[0].1;
        for (byte_idx, y) in &self.char_positions {
            if *byte_idx <= target_byte_idx {
                best_y = *y;
            } else {
                break; // 已超过目标索引，停止
            }
        }

        best_y
    }
}

impl OutputDev for MarkerFinder {
    fn begin_page(&mut self, page_num: u32, media_box: &MediaBox, _art_box: Option<(f64, f64, f64, f64)>) -> Result<(), OutputError> {
        // 在开始新页前，搜索上一页的标记
        if self.current_page > 0 {
            self.search_markers_in_text();
        }

        self.current_page = page_num;
        // 创建翻转变换：将 PDF 坐标系（Y 从下往上）转为从上往下的坐标系
        // flip_ctm: [1, 0, 0, -1, 0, page_height]
        // 这样 Y=0 变成 Y=page_height，Y=page_height 变成 Y=0
        self.flip_ctm = Transform::row_major(1.0, 0.0, 0.0, -1.0, 0.0, media_box.ury - media_box.lly);
        self.current_text.clear();
        self.char_positions.clear();

        println!("[PDF提取] 开始处理第 {} 页, 页面高度: {:.2}", page_num, media_box.ury - media_box.lly);

        Ok(())
    }

    fn end_page(&mut self) -> Result<(), OutputError> {
        // 在页结束时搜索标记
        self.search_markers_in_text();

        // 输出页面文本预览
        let preview: String = self.current_text.chars().take(100).collect();
        println!("[PDF提取] 第 {} 页文本预览: {}...", self.current_page, preview);

        Ok(())
    }

    fn output_character(&mut self, trm: &Transform, _width: f64, _spacing: f64, _font_size: f64, char: &str) -> Result<(), OutputError> {
        // 应用翻转变换获取正确的坐标
        let position = trm.post_transform(&self.flip_ctm);
        // position.m31 是 X 坐标，position.m32 是 Y 坐标（已翻转为从上往下）
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
        // 单词之间添加空格，不记录位置
        self.current_text.push(' ');
        Ok(())
    }

    fn end_line(&mut self) -> Result<(), OutputError> {
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
    println!("[PDF提取] 开始从 {} 提取 {} 个标记", pdf_path, markers.len());

    // 加载 PDF
    let doc = Document::load(pdf_path)
        .map_err(|e| format!("无法加载 PDF: {}", e))?;

    // 创建自定义 OutputDev
    let mut finder = MarkerFinder::new(markers);

    // 处理整个文档
    pdf_extract::output_doc(&doc, &mut finder)
        .map_err(|e| format!("PDF 处理失败: {:?}", e))?;

    // 构建结果
    let result: Vec<MarkerPosition> = markers.iter()
        .map(|m| {
            finder.found_markers.get(m)
                .map(|(page, y)| MarkerPosition {
                    marker: m.clone(),
                    page: *page,
                    y: *y as f32,
                })
                .unwrap_or_else(|| {
                    println!("[PDF提取] 警告: 未找到标记 {}", m);
                    MarkerPosition {
                        marker: m.clone(),
                        page: 1,
                        y: 750.0,
                    }
                })
        })
        .collect();

    println!("[PDF提取] 共找到 {} 个标记", result.len());

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