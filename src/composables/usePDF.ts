import { message, save } from '@tauri-apps/plugin-dialog'
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, RGB } from 'pdf-lib'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import fontkit from '@pdf-lib/fontkit'
import mermaid from 'mermaid'
import wavedrom from 'wavedrom'
import JSON5 from 'json5'
import type { Metadata } from './useMarkdown'
import type { FontConfig } from './useConfig'
import { BUILTIN_CHINESE_FONTS, BUILTIN_CODE_FONTS, PAGE_SIZE_PRESETS } from './useConfig'
import { escapeHtml } from './markdownParser'
import { useExportProgress } from './useExportProgress'
import { useErrorHandling } from './useErrorHandling'

// Mermaid 初始化标志
let mermaidInitialized = false

// 导入本地样式文件（Vite ?raw 导入）
import katexStyles from '../assets/katex/katex-inline.css?raw'
import highlightStyles from '../assets/github.min.css?raw'

// 防止重复调用（模块级别）
let isExporting = false

// 中文字体名称映射
const CHINESE_FONT_MAP: Record<string, string> = {
  'SourceHanSans': "'SourceHanSans'",
  'SourceHanSerif': "'SourceHanSerif'",
  'MicrosoftYaHei': "'Microsoft YaHei'",
  'DengXian': "'DengXian'",
  'SimSun': "'SimSun'",
  'FangSong': "'FangSong'"
}

// 英文字体名称映射
const ENGLISH_FONT_MAP: Record<string, string> = {
  'Arial': "'Arial'",
  'TimesNewRoman': "'Times New Roman'",
  'Georgia': "'Georgia'",
  'Calibri': "'Calibri'",
  'Verdana': "'Verdana'",
  'Tahoma': "'Tahoma'"
}

// 代码字体名称映射
const CODE_FONT_MAP: Record<string, string> = {
  'SourceCodePro': "'SourceCodePro', 'Consolas', monospace",
  'Consolas': "'Consolas', monospace",
  'CourierNew': "'Courier New', monospace"
}

// 获取字体 CSS 字符串
export function getChineseFontCss(fontId: string): string {
  return CHINESE_FONT_MAP[fontId] || `'${fontId}'`
}

export function getEnglishFontCss(fontId: string): string {
  return ENGLISH_FONT_MAP[fontId] || `'${fontId}'`
}

export function getCodeFontCss(fontId: string): string {
  return CODE_FONT_MAP[fontId] || `'${fontId}', monospace`
}

/**
 * 从 HTML 内容中提取纯文本（用于字体子集化）
 */
function extractTextFromHtml(html: string): string {
  // 移除 HTML 标签，只保留文本内容
  let text = html
    // 移除 script 和 style 标签及其内容
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    // 移除 HTML 标签
    .replace(/<[^>]+>/g, '')
    // 解码常见 HTML 实体
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    // 移除多余空白
    .replace(/\s+/g, ' ')

  // 限制字符数量（避免子集化过大）
  // 取前 5000 个字符通常足够覆盖文档中的大部分字符
  if (text.length > 5000) {
    text = text.substring(0, 5000)
  }

  return text
}

/**
 * 生成字体 @font-face CSS（用于 PDF 渲染）
 * 使用子集化字体 base64 data URL，大幅减小体积
 */
async function getFontFaceStyles(fontConfig?: FontConfig, htmlContent?: string): Promise<string> {
  if (!fontConfig) return ''

  const fontStyles: string[] = []

  // 需要加载的字体列表
  const fontsToLoad: { id: string; filename: string }[] = []

  // 内置字体文件名映射
  const builtinFontFiles: Record<string, string> = {
    'SourceHanSans': 'SourceHanSansSC-Regular.ttf',
    'SourceHanSerif': 'SourceHanSerifSC-Regular.ttf',
    'SourceCodePro': 'SourceCodePro-Regular.ttf'
  }

  // 检查中文字体是否需要加载
  const chineseFontId = fontConfig.chineseFont || 'DengXian'
  const builtinChineseFont = BUILTIN_CHINESE_FONTS.find(f => f.id === chineseFontId)
  if (builtinChineseFont?.needLoad && builtinFontFiles[chineseFontId]) {
    fontsToLoad.push({ id: chineseFontId, filename: builtinFontFiles[chineseFontId] })
  } else if (fontConfig.chineseCustomFonts) {
    const customChineseFont = fontConfig.chineseCustomFonts.find(f => f.id === chineseFontId)
    if (customChineseFont) {
      fontsToLoad.push({ id: chineseFontId, filename: customChineseFont.filename })
    }
  }

  // 检查英文字体是否需要加载（自定义字体才需要）
  const englishFontId = fontConfig.englishFont || 'Arial'
  if (fontConfig.englishCustomFonts) {
    const customEnglishFont = fontConfig.englishCustomFonts.find(f => f.id === englishFontId)
    if (customEnglishFont) {
      fontsToLoad.push({ id: englishFontId, filename: customEnglishFont.filename })
    }
  }

  // 检查代码字体是否需要加载
  const codeFontId = fontConfig.codeFont || 'SourceCodePro'
  const builtinCodeFont = BUILTIN_CODE_FONTS.find(f => f.id === codeFontId)
  if (builtinCodeFont?.needLoad && builtinFontFiles[codeFontId]) {
    fontsToLoad.push({ id: codeFontId, filename: builtinFontFiles[codeFontId] })
  } else if (fontConfig.codeCustomFonts) {
    const customCodeFont = fontConfig.codeCustomFonts.find(f => f.id === codeFontId)
    if (customCodeFont) {
      fontsToLoad.push({ id: codeFontId, filename: customCodeFont.filename })
    }
  }

  // 提取 HTML 中的文本用于子集化
  const textForSubset = htmlContent ? extractTextFromHtml(htmlContent) : ''

  // 加载每个字体，使用子集化后的 base64
  for (const font of fontsToLoad) {
    try {
      let base64: string

      if (textForSubset.length > 0) {
        // 子集化字体（只包含文档中使用的字符）
        base64 = await invoke<string>('subset_font_to_base64', {
          filename: font.filename,
          text: textForSubset
        })
      } else {
        // 无文本内容时，加载完整字体
        base64 = await invoke<string>('get_font_base64', { filename: font.filename })
      }

      const fontUrl = `data:font/truetype;base64,${base64}`

      fontStyles.push(`
    @font-face {
      font-family: '${font.id}';
      src: url('${fontUrl}') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }`)
    } catch (error) {
      console.error('PDF字体加载失败:', font.id, error)
    }
  }

  return fontStyles.join('\n')
}

export function usePDF() {
  const { startExport, updateStep, endExport } = useExportProgress()
  const { handleError, handleWarning } = useErrorHandling()

  /**
 * 导出 HTML 为 PDF
   */
  async function exportToPDF(htmlContent: string, metadata: Metadata = {}, fontConfig?: FontConfig): Promise<void> {
    if (isExporting) {
      return
    }
    isExporting = true
    startExport()

    try {
      // 移除内嵌目录、[[toc]] 标记及相关内容
      let contentWithoutToc = htmlContent
        .replace(/<div class="table-of-contents">.*?<\/div>/gs, '')
        .replace(/<p>\s*\[\[toc\]\]\s*<\/p>/gi, '')
        .replace(/\[\[toc\]\]/gi, '')

      // 预渲染 Mermaid 和 PlantUML 图表
      updateStep('预渲染图表...', 1)
      contentWithoutToc = await preRenderDiagrams(contentWithoutToc)

      // 提取标题数据（h1-h5，用于分页和书签）
      const headings = extractHeadings(contentWithoutToc)

      // 生成 PDF
      await generatePDF(contentWithoutToc, headings, metadata, fontConfig)

    } catch (error) {
      await handleError(error, '导出 PDF')
    } finally {
      endExport()
      isExporting = false
    }
  }

  /**
   * 预渲染 Mermaid 和 PlantUML 图表为 SVG
   */
  async function preRenderDiagrams(html: string): Promise<string> {
    // 初始化 Mermaid
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'inherit'
      })
      mermaidInitialized = true
    }

    // 预渲染 Mermaid 图表
    const mermaidRegex = /<div class="mermaid">([\s\S]*?)<\/div>/g
    let result = html
    let match

    // 收集所有 Mermaid 图表
    const mermaidMatches: { full: string; code: string }[] = []
    while ((match = mermaidRegex.exec(result)) !== null) {
      mermaidMatches.push({ full: match[0], code: match[1].trim() })
    }

    // 渲染每个 Mermaid 图表
    for (let i = 0; i < mermaidMatches.length; i++) {
      const { full, code } = mermaidMatches[i]
      try {
        const id = `mermaid-pdf-${i}`
        const { svg } = await mermaid.render(id, code)
        result = result.replace(full, `<div class="mermaid" data-processed="true">${svg}</div>`)
      } catch (e) {
        handleWarning(e, 'Mermaid 渲染')
      }
    }

    // 预渲染 PlantUML 图表
    const plantumlRegex = /<div class="plantuml" data-plantuml="([^"]*)">[\s\S]*?<\/div>/g
    const plantumlMatches: { full: string; encoded: string }[] = []
    while ((match = plantumlRegex.exec(result)) !== null) {
      plantumlMatches.push({ full: match[0], encoded: match[1] })
    }

    for (let i = 0; i < plantumlMatches.length; i++) {
      const { full, encoded } = plantumlMatches[i]
      try {
        const content = decodeURIComponent(encoded)
        const svg = await invoke<string>('render_plantuml', { content })
        result = result.replace(full, `<div class="plantuml" data-processed="true">${svg}</div>`)
      } catch (e) {
        handleWarning(e, 'PlantUML 渲染')
      }
    }

    // 预渲染 WaveDrom 时序图
    // 同时匹配未处理的 (<div class="wavedrom">) 和已处理的 DOM HTML（含 data-processed 属性）
    const wavedromRegex = /<div class="wavedrom"(?:\s[^>]*)?>([\s\S]*?)<\/div>/g
    const wavedromMatches: { full: string; code: string }[] = []
    while ((match = wavedromRegex.exec(result)) !== null) {
      // 跳过已经含 SVG 的已处理元素（code 以 <svg 开头）
      const code = match[1].trim()
      if (code.startsWith('<svg')) continue
      wavedromMatches.push({ full: match[0], code })
    }

    for (let i = 0; i < wavedromMatches.length; i++) {
      const { full, code } = wavedromMatches[i]
      try {
        // WaveDrom 使用 JavaScript 对象字面量语法，使用 JSON5 安全解析
        const data = JSON5.parse(code)
        // renderAny 返回 ONML 树（嵌套数组），需通过 onml.stringify 转换为 SVG 字符串
        const onmlTree = wavedrom.renderAny(0, data, wavedrom.waveSkin)
        // onml 在 wavedrom 的类型声明中缺失，运行时可用
        let svgContent = (wavedrom as any).onml.stringify(onmlTree)

        // 确保 SVG 有 xmlns 属性，否则在某些渲染引擎中可能不显示
        if (svgContent && !svgContent.includes('xmlns=')) {
          svgContent = svgContent.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
        }

        // 添加内联样式确保正确显示
        if (svgContent) {
          svgContent = svgContent.replace('<svg', '<svg style="display:block;max-width:100%;height:auto;"')
        }

        result = result.replace(full, `<div class="wavedrom" data-processed="true">${svgContent}</div>`)
      } catch (e) {
        handleWarning(e, 'WaveDrom 渲染')
      }
    }

    return result
  }

  /**
   * 将 HTML 中的本地图片转换为 base64 data URL
   * 解决 PDF 打印窗口（NavigateToString 加载，opaque origin）无法加载
   * asset:// 协议或 file:// 路径图片的问题。
   */
  async function embedImagesAsBase64(html: string): Promise<string> {
    const imgRegex = /<img([^>]*)src=["']([^"']+)["']([^>]*)>/g
    const replacements: Array<{ original: string; replacement: string }> = []

    let match: RegExpExecArray | null
    while ((match = imgRegex.exec(html)) !== null) {
      const fullMatch = match[0]
      const before = match[1]
      const src = match[2]
      const after = match[3]

      // 跳过已经是 data URL、外部 http/https 链接、或 asset 协议 URL
      if (src.startsWith('data:') || src.match(/^https?:\/\//i)) continue

      // 确定实际文件路径：优先使用 data-original-src，其次使用 src
      const originalSrcMatch = before.match(/data-original-src="([^"]+)"/)
      const filePath = originalSrcMatch ? originalSrcMatch[1] : src

      try {
        const bytes = await readFile(filePath)
        // 根据扩展名判断 MIME 类型
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
          bmp: 'image/bmp', ico: 'image/x-icon'
        }
        const mime = mimeMap[ext] || 'image/png'
        const base64 = btoa(String.fromCharCode(...bytes))
        const dataUrl = `data:${mime};base64,${base64}`

        // 构建新的 img 标签：用 data URL 替换 src，保留其他属性
        let newAttrs = before
        // 移除 data-original-src（已嵌入为 base64，不再需要）
        newAttrs = newAttrs.replace(/\s*data-original-src="[^"]*"/, '')
        const newTag = `<img${newAttrs}src="${dataUrl}"${after}>`
        replacements.push({ original: fullMatch, replacement: newTag })
      } catch {
        // 文件读取失败，保留原始标签
      }
    }

    let result = html
    for (const { original, replacement } of replacements) {
      result = result.replace(original, replacement)
    }
    return result
  }

  /**
   * 生成 PDF（使用标记文本提取实现书签定位）
   */
  async function generatePDF(
    contentWithoutToc: string,
    headings: Array<{ level: number; text: string; id: string }>,
    metadata: Metadata,
    fontConfig?: FontConfig
  ): Promise<void> {
    // 优先使用 metadata.title，否则从 headings 中提取第一个 h1 标题
    const firstH1 = headings.find(h => h.level === 1)
    // 文件名使用 metadata.title 或第一个 h1
    const fileName = metadata.title || firstH1?.text || '文档'
    // 封面主标题：优先 coverTitle，否则 title，否则第一个 h1
    const coverTitle = metadata.coverTitle || metadata.title || firstH1?.text || '文档'
    // 封面副标题：优先 coverSubtitle
    const coverSubtitle = metadata.coverSubtitle

    // Step 1: 获取保存路径
    const savePath = await save({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: `${fileName}.pdf`,
      title: '保存 PDF 文件'
    })

    if (!savePath) {
      endExport()
      return
    }

    // Step 2: 预渲染图表（已在 exportToPDF 中完成）
    const contentWithDiagrams = contentWithoutToc

    // Step 3: 添加标记文本（用于 PDF 书签定位）
    const contentWithMarkers = addMarkerText(contentWithDiagrams, headings)

    // Step 4: 为 h1 标题添加分页（从第二个开始）
    const contentWithPageBreaks = addH1PageBreaks(contentWithMarkers, headings)

    // Step 5: 生成标记列表
    const markers = headings.map((_, i) => `PDFMARK${i.toString().padStart(3, '0')}`)

    // 构建封面 meta 信息（中心位置，用于其他信息如密级）
    const metaItems: string[] = []
    if (metadata['security level']) {
      metaItems.push(`<div class="meta-item">密级：${escapeHtml(metadata['security level'])}</div>`)
    }
    // date 字段用于封面中心显示（如果有）
    if (metadata.date) {
      metaItems.push(`<div class="meta-item">日期：${escapeHtml(metadata.date)}</div>`)
    }
    const metaHtml = metaItems.length > 0 ? `<div class="meta">${metaItems.join('')}</div>` : ''

    // Step 6: 获取字体 CSS（用于 PDF 渲染环境）
    const fontFaceStyles = await getFontFaceStyles(fontConfig, contentWithPageBreaks)

    // Step 6.5: 本地图片转 base64（打印窗口通过 NavigateToString 加载 HTML，
    // 为 opaque origin，无法访问 asset:// 协议或 file:// 路径的图片）
    const contentWithEmbeddedImages = await embedImagesAsBase64(contentWithPageBreaks)

    // Step 7: 创建 HTML 文档
    // 封面右下角使用 author、copyright 和当前日期
    const fullHtml = getFullHtml(
      fileName, coverTitle, contentWithEmbeddedImages, metaHtml, fontConfig, fontFaceStyles,
      coverSubtitle, metadata.author, metadata.copyright
    )

    // Step 8: 调用 Rust command 打印 PDF 并提取标记位置（使用内存流优化）
    // 进度会通过 Tauri 事件推送，前端监听 export-progress 事件
    // 构建页面设置参数
    const pageSize = fontConfig?.pageSize || 'A4'
    const preset = PAGE_SIZE_PRESETS[pageSize]
    const pageSettings = {
      page_width_mm: preset.width,
      page_height_mm: preset.height,
      margin_top_mm: fontConfig?.marginTop || 20,
      margin_bottom_mm: fontConfig?.marginBottom || 20,
      margin_left_mm: fontConfig?.marginLeft || 25,
      margin_right_mm: fontConfig?.marginRight || 25,
    }

    try {
      const printResult = await invoke<{
        success: boolean
        path: string
        error?: string
        bookmarks: Array<{ title: string; page: number; y: number; level: number }>
      }>('print_to_pdf_stream_with_markers', {
        html: fullHtml,
        savePath: savePath,
        markers: markers,
        pageSettings: pageSettings
      })

      if (!printResult.success) {
        await message('PDF 生成失败：' + (printResult.error || '未知错误'), { title: '错误', kind: 'error' })
        return
      }

      // Step 8: 构建书签数据（使用返回的位置信息）
      // 进度已通过事件推送为"注入书签..."
      const bookmarks = headings.map((h, i) => {
        const pos = printResult.bookmarks.find(b => b.title === markers[i])
        if (!pos) {
          console.warn(`未找到 marker: ${markers[i]} 对应标题: ${h.text}`)
        }
        // pdf-extract 返回的 page 是 1-indexed（包含封面页）
        // 减去封面页（第 1 页），得到正文页码（从 1 开始）
        // 例如：pos.page = 2（PDF 第 2 页，正文第一页） -> page = 1
        const page = pos ? Math.max(1, pos.page - 1) : 1
        return {
          title: h.text,
          level: h.level,
          page,
          y: pos ? pos.y : 700
        }
      })

      if (bookmarks.length > 0) {
        try {
          // 计算页面高度（mm 转 pt: pt = mm × 72 / 25.4）
          const pageHeightPt = pageSettings.page_height_mm * 72 / 25.4
          await invoke<void>('inject_bookmarks', {
            pdfPath: printResult.path,
            bookmarks: bookmarks,
            pageHeightPt: pageHeightPt
          })
        } catch (bookmarkError) {
          handleWarning(bookmarkError, '书签注入')
        }
      }

      // Step 9: 添加页码和页眉
      updateStep('添加页码...', 5)
      try {
        const pdfBytes = await readFile(printResult.path)
        const firstH1 = headings.find(h => h.level === 1)
        const pdfWithPageNumbers = await addPageNumbers(pdfBytes, metadata, firstH1?.text)
        await writeFile(printResult.path, pdfWithPageNumbers)

        // Step 10: 修复链接目标（将命名链接转为显式坐标）
        try {
          // 构建命名目标位置映射: heading.id -> (page, y)
          // 注意：使用 PDF 页码（包含封面页），不是正文页码
          const namedDestPositions: Record<string, [number, number]> = {}
          headings.forEach((h, i) => {
            const pos = printResult.bookmarks.find(b => b.title === markers[i])
            if (pos && h.id) {
              // pos.page 是 PDF 页码（包含封面页），直接使用
              namedDestPositions[h.id] = [pos.page, pos.y]
            }
          })

          await invoke<number>('fix_pdf_link_destinations', {
            pdfPath: printResult.path,
            namedDestPositions
          })
        } catch (fixError) {
          console.warn('修复链接目标失败:', fixError)
        }

        await message(`PDF 已保存：${printResult.path}`, { title: '成功', kind: 'info' })
      } catch (pageNumberError) {
        handleWarning(pageNumberError, '添加页码')
        await message(`PDF 已生成：${printResult.path}`, { title: '成功', kind: 'info' })
      }

    } catch (printError) {
      await handleError(printError, 'PDF 导出')
    }
  }

  return { exportToPDF }
}

/**
 * 检查字符串是否包含非 ASCII 字符
 */
function hasNonAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 255) return true
  }
  return false
}

/**
 * 加载子集化的中文字体
 * 只嵌入实际使用的字符，大幅减小 PDF 文件体积
 * @param text 需要显示的文字内容
 * @returns 子集化后的字体字节数组
 */
async function loadChineseFontSubset(text: string): Promise<Uint8Array | null> {
  try {
    // Tauri 返回 Vec<u8>，需要转换为 Uint8Array
    const result = await invoke<number[]>('subset_chinese_font', { text })
    return new Uint8Array(result)
  } catch (e) {
    console.warn('字体子集化失败:', e)
    return null
  }
}

/**
 * 使用 pdf-lib 为 PDF 添加页码和页眉（书签由 Rust 后端处理）
 */
async function addPageNumbers(
  pdfBytes: Uint8Array,
  metadata: Metadata = {},
  h1Title?: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)

  // 注册 fontkit 以支持自定义字体
  pdfDoc.registerFontkit(fontkit)

  const pages = pdfDoc.getPages()
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // 页码位置参数
  const marginBottom = 25
  const fontSize = 8
  const pageMargin = 50

  // 页眉位置参数
  const headerFontSize = 8
  const marginTop = 25
  const headerLineMargin = 8
  const headerMargin = 50

  // 提取 metadata 信息，优先使用 metadata.title，否则使用 h1 标题
  const headerTitle = metadata.title || h1Title || ''
  const securityLevel = metadata['security level'] || ''

  // 确定页眉字体
  let headerFont = helveticaFont
  let canShowHeader = !!(headerTitle || securityLevel)

  // 检查是否有中文内容
  const hasChinese = (headerTitle && hasNonAscii(headerTitle)) || (securityLevel && hasNonAscii(securityLevel))

  if (hasChinese) {
    try {
      // 收集所有需要显示的中文文字（排除 ASCII 字符：数字和英文字母）
      // ASCII 字符将使用 Helvetica 渲染，避免子集化字体宽度问题
      const chineseChars = (headerTitle + securityLevel + '密级：').replace(/[a-zA-Z0-9]/g, '')
      if (chineseChars.length > 0) {
        const chineseFontBytes = await loadChineseFontSubset(chineseChars)
        if (chineseFontBytes) {
          headerFont = await pdfDoc.embedFont(chineseFontBytes)
        } else {
          canShowHeader = false
        }
      }
    } catch (e) {
      console.warn('无法加载中文字体，跳过页眉:', e)
      canShowHeader = false
    }
  }

  /**
   * 检查字符是否为 ASCII（数字或英文字母）
   */
  function isAsciiChar(char: string): boolean {
    const code = char.charCodeAt(0)
    return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
  }

  /**
   * 计算混合文字的总宽度：ASCII 字符用 Helvetica，中文用中文字体
   */
  function calculateMixedWidth(
    text: string,
    chineseFont: PDFFont,
    helveticaFont: PDFFont,
    fontSize: number
  ): number {
    let totalWidth = 0
    for (const char of text) {
      if (isAsciiChar(char)) {
        totalWidth += helveticaFont.widthOfTextAtSize(char, fontSize)
      } else {
        totalWidth += chineseFont.widthOfTextAtSize(char, fontSize)
      }
    }
    return totalWidth
  }

  /**
   * 混合渲染页眉文字：中文用中文字体，ASCII（数字/英文）用 Helvetica
   */
  function drawMixedHeaderText(
    page: PDFPage,
    text: string,
    startX: number,
    y: number,
    fontSize: number,
    chineseFont: PDFFont,
    helveticaFont: PDFFont,
    color: RGB
  ) {
    let currentX = startX
    for (const char of text) {
      // ASCII 字符（数字和英文字母）使用 Helvetica
      if (isAsciiChar(char)) {
        page.drawText(char, {
          x: currentX,
          y,
          size: fontSize,
          font: helveticaFont,
          color
        })
        currentX += helveticaFont.widthOfTextAtSize(char, fontSize)
      } else {
        // 其他字符（中文等）使用中文字体
        page.drawText(char, {
          x: currentX,
          y,
          size: fontSize,
          font: chineseFont,
          color
        })
        currentX += chineseFont.widthOfTextAtSize(char, fontSize)
      }
    }
  }

  // 添加页眉和页码
  for (let i = 0; i < pages.length; i++) {
    // 封面页（第 0 页）不添加页眉和页码
    if (i === 0) continue

    const page = pages[i]
    const pageNum = i

    const pageWidth = page.getWidth()
    const pageHeight = page.getHeight()

    // 添加页眉
    if (canShowHeader) {
      const headerY = pageHeight - marginTop

      if (headerTitle) {
        // 计算混合文字宽度：中文用 headerFont，数字用 helveticaFont
        const headerTextWidth = calculateMixedWidth(headerTitle, headerFont, helveticaFont, headerFontSize)
        const headerX = (pageWidth - headerTextWidth) / 2

        // 混合渲染：数字用 Helvetica，中文用中文字体
        drawMixedHeaderText(page, headerTitle, headerX, headerY, headerFontSize, headerFont, helveticaFont, rgb(0.42, 0.45, 0.5))
      }

      if (securityLevel) {
        const securityText = `密级：${securityLevel}`
        // 计算混合文字宽度
        const securityTextWidth = calculateMixedWidth(securityText, headerFont, helveticaFont, headerFontSize)
        const securityX = pageWidth - headerMargin - securityTextWidth

        // 混合渲染
        drawMixedHeaderText(page, securityText, securityX, headerY, headerFontSize, headerFont, helveticaFont, rgb(0.42, 0.45, 0.5))
      }

      // 分割线
      const lineY = headerY - headerLineMargin
      page.drawLine({
        start: { x: headerMargin, y: lineY },
        end: { x: pageWidth - headerMargin, y: lineY },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8)
      })
    }

    // 添加页码
    const pageText = `${pageNum}`
    const textWidth = helveticaFont.widthOfTextAtSize(pageText, fontSize)
    const x = pageWidth - pageMargin - textWidth
    const y = marginBottom

    page.drawText(pageText, {
      x,
      y,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0.42, 0.45, 0.5)
    })

    // 页脚分割线
    const footerLineY = marginBottom + 12
    page.drawLine({
      start: { x: pageMargin, y: footerLineY },
      end: { x: pageWidth - pageMargin, y: footerLineY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    })
  }

  const savedBytes = await pdfDoc.save()
  return savedBytes
}

/**
 * 提取 h1-h6 标题（根据 id 去重）
 */
function extractHeadings(htmlContent: string): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = []
  const seenIds = new Set<string>()
  // 匹配 h1-h6 标签：h 后跟数字，然后空格和属性，包含 id 属性
  // 需要提取所有级别的标题用于链接修复
  const headingRegex = /<h([1-6])\s[^>]*?id="([^"]*)"[^>]*>(.*?)<\/h\1>/g
  let match

  while ((match = headingRegex.exec(htmlContent)) !== null) {
    const level = parseInt(match[1])
    const id = match[2]
    const text = stripHtml(match[3])
    // 根据 id 去重，并排除 toc/contents 相关的标题
    if (id && !seenIds.has(id) && !id.includes('toc') && !id.includes('contents')) {
      seenIds.add(id)
      headings.push({ level, text, id })
    }
  }
  return headings
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/**
 * 为标题添加唯一标记文本（用于 PDF 书签定位）
 * 使用标准字体确保 ASCII 字符能被 pdf-extract 正确提取
 */
function addMarkerText(htmlContent: string, headings: Array<{ level: number; text: string; id: string }>): string {
  let result = htmlContent

  headings.forEach((heading, index) => {
    // 生成唯一标记: PDFMARK000, PDFMARK001, ...
    const marker = `PDFMARK${index.toString().padStart(3, '0')}`

    // 标记渲染在与标题同一行，使用相同字体大小但颜色隐藏
    // font-size: 0.01em 比 0 更安全，避免被完全忽略
    // line-height: 1 确保不影响标题行高
    // color 匹配背景色使其不可见
    // z-index: -1 放在背景层
    const markerHtml = `<span style="font-family:'Courier New',Courier,monospace;font-size:0.01em;line-height:1;color:#f9fafb;display:inline-block;vertical-align:baseline;">${marker}</span>`

    // 在标题元素内部开头插入标记
    // 匹配包含指定 id 的 h 标签开标签，id 可能是第一个属性或有其他属性在前
    const headingRegex = new RegExp(`<h${heading.level}[^>]*\\bid="${heading.id}"[^>]*>`, 'g')
    result = result.replace(headingRegex, `<h${heading.level} id="${heading.id}">${markerHtml}`)
  })

  return result
}

/**
 * 为 h1 标题添加分页（从第二个开始）
 */
function addH1PageBreaks(htmlContent: string, headings: Array<{ level: number; text: string; id: string }>): string {
  let result = htmlContent

  headings.forEach((heading, index) => {
    if (heading.level === 1 && index > 0) {
      // 匹配 h1 开标签：h1 后跟空格和属性，包含指定的 id
      // 注意：在 RegExp 构造函数中 \\b 表示单词边界
      const h1Regex = new RegExp(`<h1\\s[^>]*?id="${heading.id}"[^>]*>`, 'g')
      result = result.replace(h1Regex, `<div style="page-break-before: always;"></div><h1 id="${heading.id}">`)
    }
  })

  return result
}

/** 合并的 Markdown 样式，支持 pt（PDF）和 px（HTML）两种输出格式 */
export function getMarkdownStyles(fontConfig?: FontConfig, format: 'pt' | 'px' = 'pt'): string {
  const bodyFontSizePx = fontConfig?.bodyFontSize || 16
  const fontSize = format === 'pt' ? `${bodyFontSizePx * 0.75}pt` : `${bodyFontSizePx}px`
  const chineseFont = fontConfig?.chineseFont || 'DengXian'
  const englishFont = fontConfig?.englishFont || 'Arial'
  const codeFont = fontConfig?.codeFont || 'SourceCodePro'
  const lineHeight = fontConfig?.lineHeight || 1.6
  const paragraphSpacing = fontConfig?.paragraphSpacing || 1

  const chineseFontCss = getChineseFontCss(chineseFont)
  const englishFontCss = getEnglishFontCss(englishFont)
  const bodyFontCss = `${englishFontCss}, ${chineseFontCss}, sans-serif`
  const codeFontCss = getCodeFontCss(codeFont)

  // PDF 模式下的分页控制样式
  const breakRules = format === 'pt' ? `
.markdown-body pre { break-inside: auto; }
.markdown-body .code-lines-container { break-inside: auto; }
.markdown-body .code-line { break-inside: avoid; }
.markdown-body table { break-inside: auto; }
.markdown-body table thead { display: table-header-group; }
.markdown-body table tbody { display: table-row-group; }
.markdown-body table tr { break-inside: avoid; }
.markdown-body .admonition { page-break-inside: avoid; }` : ''

  // HTML 模式下的额外样式
  const htmlExtras = format === 'px' ? `
.markdown-body figure.figure-span { display: flex; flex-direction: column; align-items: center; margin: 1.5em 0; text-align: center; page-break-inside: avoid; }
.markdown-body figure.figure-span img { max-width: 100%; height: auto; }
.markdown-body figure.figure-span figcaption { margin-top: 0.5em; font-size: 0.9em; color: #6b7280; text-align: center; }` : ''

  return `
.markdown-body { line-height: ${lineHeight}; color: #1f2937; font-size: ${fontSize}; font-family: ${bodyFontCss}; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { margin-top: 1.5em; margin-bottom: 0.75em; font-weight: 600; line-height: 1.25; color: #111827; clear: both; }
.markdown-body h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1.2em; }
.markdown-body h5 { font-size: 1.1em; }
.markdown-body h6 { font-size: 1em; }
.markdown-body p { margin-top: 0; margin-bottom: ${paragraphSpacing}em; }
.markdown-body a { color: #3b82f6; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body strong { font-weight: 600; }
.markdown-body em { font-style: italic; }
.markdown-body code { padding: 0.2em 0.4em; margin: 0; font-size: 85%; background-color: #f3f4f6; border-radius: 3px; font-family: ${codeFontCss}; }
.markdown-body pre { margin-top: 0; margin-bottom: ${paragraphSpacing}em; padding: 1em; font-size: 85%; line-height: 1.45; background-color: #f3f4f6; border-radius: 6px; font-family: ${codeFontCss}; }
.markdown-body pre code { padding: 0; background-color: transparent; border-radius: 0; font-size: 100%; white-space: pre-wrap; word-break: break-all; word-wrap: break-word; display: block; }
.markdown-body .code-lines-container { display: table; width: 100%; border-collapse: collapse; }
.markdown-body .code-lines-container.line-num-width-1 .line-number { width: 1.5em; }
.markdown-body .code-lines-container.line-num-width-2 .line-number { width: 2.5em; }
.markdown-body .code-lines-container.line-num-width-3 .line-number { width: 3.5em; }
.markdown-body .code-lines-container.line-num-width-4 .line-number { width: 4.5em; }
.markdown-body .code-lines-container.line-num-width-5 .line-number { width: 5.5em; }
.markdown-body .code-line { display: table-row; }
.markdown-body .code-line .line-number { display: table-cell; text-align: right; padding-right: 0.75em; border-right: 1px solid #e5e7eb; color: #9ca3af; white-space: pre; }
.markdown-body .code-line .line-number::before { content: attr(data-num); }
.markdown-body .code-line .code-line-content { display: table-cell; padding-left: 0.75em; white-space: pre-wrap; word-break: break-all; }
.markdown-body blockquote { margin: 0 0 ${paragraphSpacing}em; padding: 0 1em; color: #6b7280; border-left: 0.25em solid #e5e7eb; }
.markdown-body ul, .markdown-body ol { margin-top: 0; margin-bottom: ${paragraphSpacing}em; padding-left: 2em; }
.markdown-body ul { list-style-type: disc; }
.markdown-body ol { list-style-type: decimal; }
.markdown-body li { margin-bottom: 0.25em; }
.markdown-body table { margin-top: 0; margin-bottom: ${paragraphSpacing}em; width: 100%; border-collapse: collapse; border-spacing: 0; font-size: 0.85em; }
.markdown-body table th { font-weight: 600; background-color: #c2dfff; }
.markdown-body table th, .markdown-body table td { padding: 0.5em 1em; border: 1px solid #d1d5db; }
.markdown-body table tr { background-color: #fff; border-top: 1px solid #e5e7eb; }
.markdown-body table tr:nth-child(2n) { background-color: #f9fafb; }
.markdown-body hr { height: 0.25em; padding: 0; margin: 1.5em 0; background-color: #e5e7eb; border: 0; }
.markdown-body img { max-width: 100%; box-sizing: content-box; border-style: none; display: block; margin-left: auto; margin-right: auto; }
.markdown-body .img-float-left { float: left; margin-right: 1em; margin-bottom: 0.5em; }
.markdown-body .img-float-right { float: right; margin-left: 1em; margin-bottom: 0.5em; }
.markdown-body .katex { font-size: 1.1em; }
.markdown-body .katex-display { margin: 1em 0; overflow-x: hidden; overflow-y: hidden; }
.markdown-body .footnotes { margin-top: 2em; padding-top: 1em; border-top: 1px solid #e5e7eb; }
.markdown-body .table-of-contents { margin-bottom: 1.5em; padding: 1em; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
.markdown-body .task-list-item { list-style-type: none; padding-left: 0; }
.markdown-body .task-list-item input[type="checkbox"] { margin-right: 0.5em; }
.markdown-body .mermaid { margin: 1em 0; text-align: center; }
.markdown-body .heading-number { font-weight: 600; color: #3b82f6; margin-right: 0.25em; }

/* Admonition 提示框 */
.markdown-body .admonition { margin: 1em 0; padding: 0.75em 1em; border-radius: 6px; border-left: 4px solid; background-color: #f9fafb; }
.markdown-body .admonition-title { font-weight: 600; margin-bottom: 0.5em; display: flex; align-items: center; gap: 0.5em; }
.markdown-body .admonition p:last-child { margin-bottom: 0; }
.markdown-body .admonition.note { border-left-color: #3b82f6; background-color: #eff6ff; }
.markdown-body .admonition.note .admonition-title { color: #1d4ed8; }
.markdown-body .admonition.tip { border-left-color: #10b981; background-color: #ecfdf5; }
.markdown-body .admonition.tip .admonition-title { color: #047857; }
.markdown-body .admonition.warning { border-left-color: #f59e0b; background-color: #fffbeb; }
.markdown-body .admonition.warning .admonition-title { color: #b45309; }
.markdown-body .admonition.danger { border-left-color: #ef4444; background-color: #fef2f2; }
.markdown-body .admonition.danger .admonition-title { color: #b91c1c; }
.markdown-body .admonition.info { border-left-color: #6b7280; background-color: #f9fafb; }
.markdown-body .admonition.info .admonition-title { color: #4b5563; }
.markdown-body .admonition.success { border-left-color: #10b981; background-color: #ecfdf5; }
.markdown-body .admonition.success .admonition-title { color: #047857; }
.markdown-body .admonition.failure { border-left-color: #ef4444; background-color: #fef2f2; }
.markdown-body .admonition.failure .admonition-title { color: #b91c1c; }
.markdown-body .admonition.bug { border-left-color: #8b5cf6; background-color: #f5f3ff; }
.markdown-body .admonition.bug .admonition-title { color: #6d28d9; }
.markdown-body .admonition.example { border-left-color: #06b6d4; background-color: #ecfeff; }
.markdown-body .admonition.example .admonition-title { color: #0891b2; }
.markdown-body .admonition.quote { border-left-color: #64748b; background-color: #f1f5f9; }
.markdown-body .admonition.quote .admonition-title { color: #475569; }
.markdown-body .admonition.abstract { border-left-color: #3b82f6; background-color: #eff6ff; }
.markdown-body .admonition.abstract .admonition-title { color: #1d4ed8; }
.markdown-body .admonition.question { border-left-color: #f59e0b; background-color: #fffbeb; }
.markdown-body .admonition.question .admonition-title { color: #b45309; }
.markdown-body .admonition.attention { border-left-color: #f59e0b; background-color: #fffbeb; }
.markdown-body .admonition.attention .admonition-title { color: #b45309; }
.markdown-body .admonition.hint { border-left-color: #10b981; background-color: #ecfdf5; }
.markdown-body .admonition.hint .admonition-title { color: #047857; }
.markdown-body .admonition.caution { border-left-color: #ef4444; background-color: #fef2f2; }
.markdown-body .admonition.caution .admonition-title { color: #b91c1c; }
.markdown-body .admonition.error { border-left-color: #ef4444; background-color: #fef2f2; }
.markdown-body .admonition.error .admonition-title { color: #b91c1c; }
.markdown-body .plantuml { margin: 1em 0; text-align: center; }
.markdown-body .plantuml svg { max-width: 100%; }
.markdown-body .wavedrom { margin: 1em 0; text-align: center; }
.markdown-body .wavedrom svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
${htmlExtras}
${breakRules}
/* Tabbed 标签页 */
.markdown-body .tabbed-set { margin: 1em 0; page-break-inside: avoid; }
.markdown-body .tabbed-labels { display: none; }
.markdown-body .tabbed-content { background-color: transparent; }
.markdown-body .tabbed-block { display: block; margin-bottom: 1em; padding: 0.5em 0; border-bottom: 1px solid #ccc; page-break-inside: avoid; }
.markdown-body .tabbed-block:last-child { border-bottom: none; margin-bottom: 0; }
.markdown-body .tabbed-block-title { display: block; font-weight: bold; font-size: 0.95em; color: #333; margin-bottom: 0.5em; padding-bottom: 0.3em; border-bottom: 1px dashed #999; }
`
}

/** HTML 导出样式（保留名称以保持向后兼容） */
export function getHtmlMarkdownStyles(fontConfig?: FontConfig): string {
  return getMarkdownStyles(fontConfig, 'px')
}

/**
 * 生成 @page CSS 规则（页面尺寸和边距）
 */
function getPageCss(pageSize: 'A4' | 'B5' | 'Letter', marginTop: number, marginBottom: number, marginLeft: number, marginRight: number): string {
  return `
    @page { margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; size: ${pageSize}; }
    @page :first { margin: 0; }
  `
}

/**
 * 生成完整的 HTML 文档
 * @param title 文档标题（用于 HTML title 标签）
 * @param coverTitle 封面主标题
 * @param content 正文内容
 * @param metaHtml 封面 meta 信息 HTML
 * @param fontConfig 字体配置
 * @param fontFaceStyles 字体样式
 * @param coverSubtitle 封面副标题（可选）
 * @param author 作者（封面右下角显示）
 * @param copyright 版权信息（封面右下角显示）
 */
function getFullHtml(
  title: string,
  coverTitle: string,
  content: string,
  metaHtml: string = '',
  fontConfig?: FontConfig,
  fontFaceStyles?: string,
  coverSubtitle?: string,
  author?: string,
  copyright?: string
): string {
  // 封面副标题：优先使用传入值，否则使用默认值
  const subtitleText = coverSubtitle || 'MarkRefine 生成文档'

  // 当前日期
  const currentDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  // 封面右下角信息：作者、版权、日期
  const footerItems: string[] = []
  if (author) {
    footerItems.push(`<div class="cover-footer-item">作者：${escapeHtml(author)}</div>`)
  }
  if (copyright) {
    footerItems.push(`<div class="cover-footer-item">${escapeHtml(copyright)}</div>`)
  }
  footerItems.push(`<div class="cover-footer-item">${currentDate}</div>`)
  const coverFooterHtml = `<div class="cover-footer">${footerItems.join('\n')}</div>`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    /* 字体加载（PDF渲染环境需要） */
    ${fontFaceStyles || ''}
    ${getMarkdownStyles(fontConfig)}
    ${katexStyles}
    ${highlightStyles}

    ${getPageCss(
      fontConfig?.pageSize || 'A4',
      fontConfig?.marginTop || 20,
      fontConfig?.marginBottom || 20,
      fontConfig?.marginLeft || 25,
      fontConfig?.marginRight || 25
    )}

    body { margin: 0; padding: 0; }

    .cover-page {
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      min-height: 100vh; text-align: center; padding: 2cm; box-sizing: border-box;
      page-break-after: always; position: relative;
    }
    .cover-page h1 { font-size: 2.5em; font-weight: 700; color: #1f2937; margin: 0 0 0.5em 0; border: none; }
    .cover-page .subtitle { font-size: 1.2em; color: #6b7280; }
    .cover-page .meta { margin-top: 3em; font-size: 1em; color: #6b7280; }
    .cover-page .meta-item { margin: 0.5em 0; }
    .cover-page .cover-footer {
      position: absolute; bottom: 2cm; right: 2cm;
      text-align: right; font-size: 0.9em; color: #6b7280;
    }
    .cover-page .cover-footer-item { margin: 0.3em 0; }

    .main-content { page-break-before: always; padding: 0; }
    .main-content h1:first-child { margin-top: 0; }
    .markdown-body { max-width: none; }

    h1, h2, h3, h4 { page-break-after: avoid; }
    pre, blockquote, table, figure, img, svg, .mermaid, .wavedrom { page-break-inside: avoid; }

    /* WaveDrom 时序图样式 */
    .wavedrom { margin: 1em 0; text-align: center; }
    .wavedrom svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }

    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  </style>
</head>
<body>
  <div class="cover-page">
    <h1>${escapeHtml(coverTitle)}</h1>
    <div class="subtitle">${escapeHtml(subtitleText)}</div>
    ${metaHtml}
    ${coverFooterHtml}
  </div>

  <div class="main-content markdown-body">
    ${content}
  </div>
</body>
</html>`

  return html
}

