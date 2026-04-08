import { message, save } from '@tauri-apps/plugin-dialog'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import fontkit from '@pdf-lib/fontkit'
import mermaid from 'mermaid'
import wavedrom from 'wavedrom'
import type { Metadata } from './useMarkdown'
import { useExportProgress } from './useExportProgress'

// 字体缓存
let cachedChineseFont: Uint8Array | null = null

// Mermaid 初始化标志
let mermaidInitialized = false

// 导入本地样式文件（Vite ?raw 导入）
// @ts-ignore
import katexStyles from '../assets/katex/katex-inline.css?raw'
// @ts-ignore
import highlightStyles from '../assets/github.min.css?raw'

// 防止重复调用（模块级别）
let isExporting = false

export function usePDF() {
  const { startExport, updateStep, endExport } = useExportProgress()

  /**
   * 导出 HTML 为 PDF
   */
  async function exportToPDF(htmlContent: string, metadata: Metadata = {}): Promise<void> {
    if (isExporting) {
      console.log('[诊断] 已有导出任务在进行中，忽略重复调用')
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

      // 提取标题数据（h1-h4，用于分页和书签）
      const headings = extractHeadings(contentWithoutToc)

      // 生成 PDF
      await generatePDF(contentWithoutToc, headings, metadata)

    } catch (error) {
      console.error('导出 PDF 失败:', error)
      await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
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
        console.log(`[PDF导出] Mermaid 图表 ${i + 1}/${mermaidMatches.length} 渲染完成`)
      } catch (e) {
        console.warn(`[PDF导出] Mermaid 渲染失败:`, e)
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
        console.log(`[PDF导出] PlantUML 图表 ${i + 1}/${plantumlMatches.length} 渲染完成`)
      } catch (e) {
        console.warn(`[PDF导出] PlantUML 渲染失败:`, e)
      }
    }

    // 预渲染 WaveDrom 时序图
    const wavedromRegex = /<div class="wavedrom">([\s\S]*?)<\/div>/g
    const wavedromMatches: { full: string; code: string }[] = []
    while ((match = wavedromRegex.exec(result)) !== null) {
      wavedromMatches.push({ full: match[0], code: match[1].trim() })
    }

    for (let i = 0; i < wavedromMatches.length; i++) {
      const { full, code } = wavedromMatches[i]
      try {
        // WaveDrom 使用 JavaScript 对象字面量语法，不是标准 JSON
        const data = new Function('return ' + code)()
        // 使用 wavedrom 的内部渲染函数生成 SVG
        const svgContent = wavedrom.renderAny(0, data, wavedrom.waveSkin)
        result = result.replace(full, `<div class="wavedrom" data-processed="true">${svgContent}</div>`)
        console.log(`[PDF导出] WaveDrom 时序图 ${i + 1}/${wavedromMatches.length} 渲染完成`)
      } catch (e) {
        console.warn(`[PDF导出] WaveDrom 渲染失败:`, e)
      }
    }

    console.log(`[PDF导出] 图表预渲染完成: ${mermaidMatches.length} Mermaid, ${plantumlMatches.length} PlantUML, ${wavedromMatches.length} WaveDrom`)
    return result
  }

  /**
   * 生成 PDF（使用标记文本提取实现书签定位）
   */
  async function generatePDF(
    contentWithoutToc: string,
    headings: Array<{ level: number; text: string; id: string }>,
    metadata: Metadata
  ): Promise<void> {
    // 优先使用 metadata.title，否则从 headings 中提取第一个 h1 标题
    const firstH1 = headings.find(h => h.level === 1)
    const title = metadata.title || firstH1?.text || '文档'

    // Step 1: 获取保存路径
    const savePath = await save({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: `${title}.pdf`,
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

    // 构建封面 meta 信息
    const metaItems: string[] = []
    if (metadata.author) {
      metaItems.push(`<div class="meta-item">作者：${escapeHtml(metadata.author)}</div>`)
    }
    if (metadata.date) {
      metaItems.push(`<div class="meta-item">日期：${escapeHtml(metadata.date)}</div>`)
    }
    if (metadata['security level']) {
      metaItems.push(`<div class="meta-item">密级：${escapeHtml(metadata['security level'])}</div>`)
    }
    const metaHtml = metaItems.length > 0 ? `<div class="meta">${metaItems.join('')}</div>` : ''

    // Step 6: 创建 HTML 文档
    const fullHtml = getFullHtml(title, metaHtml, contentWithPageBreaks)

    // Step 7: 调用 Rust command 打印 PDF
    try {
      updateStep('生成 PDF...', 2)
      const printResult = await invoke<{ success: boolean; path: string; error?: string }>('print_to_pdf', {
        html: fullHtml,
        savePath: savePath
      })

      if (!printResult.success) {
        await message('PDF 生成失败：' + (printResult.error || '未知错误'), { title: '错误', kind: 'error' })
        return
      }

      // Step 8: 从 PDF 提取标记位置
      updateStep('提取书签位置...', 3)
      const markerPositions = await invoke<Array<{ marker: string; page: number; y: number }>>('extract_pdf_markers', {
        pdfPath: printResult.path,
        markers: markers
      })

      // Step 9: 构建书签数据
      const bookmarks = headings.map((h, i) => {
        const pos = markerPositions.find(p => p.marker === markers[i])
        return {
          title: h.text,
          level: h.level,
          page: pos ? pos.page - 2 : 0,
          y: pos ? pos.y : 700
        }
      })

      // Step 10: 注入书签
      updateStep('注入书签...', 4)
      if (bookmarks.length > 0) {
        try {
          await invoke<void>('inject_bookmarks', {
            pdfPath: printResult.path,
            bookmarks: bookmarks
          })
        } catch (bookmarkError) {
          console.error('书签注入失败:', bookmarkError)
        }
      }

      // Step 11: 添加页码和页眉
      updateStep('添加页码...', 5)
      try {
        const pdfBytes = await readFile(printResult.path)
        const firstH1 = headings.find(h => h.level === 1)
        const pdfWithPageNumbers = await addPageNumbers(pdfBytes, metadata, firstH1?.text)
        await writeFile(printResult.path, pdfWithPageNumbers)

        await message(`PDF 已保存：${printResult.path}`, { title: '成功', kind: 'info' })
      } catch (pageNumberError) {
        console.error('添加页码失败:', pageNumberError)
        await message(`PDF 已生成：${printResult.path}`, { title: '成功', kind: 'info' })
      }

    } catch (printError) {
      console.error('PDF 导出失败:', printError)
      await message('导出失败：' + String(printError), { title: '错误', kind: 'error' })
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
 * 尝试加载中文字体
 * 返回字体字节数组，如果失败则返回 null
 */
async function loadChineseFont(): Promise<Uint8Array | null> {
  // 使用缓存
  if (cachedChineseFont) {
    return cachedChineseFont
  }

  try {
    // 使用 fetch 从 assets 加载字体
    const fontUrl = new URL('../assets/fonts/SourceHanSansSC-Regular.ttf', import.meta.url)
    const response = await fetch(fontUrl.href)
    if (!response.ok) {
      return null
    }
    const arrayBuffer = await response.arrayBuffer()
    cachedChineseFont = new Uint8Array(arrayBuffer)
    return cachedChineseFont
  } catch (e) {
    console.warn('加载中文字体失败:', e)
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
      const chineseFontBytes = await loadChineseFont()
      if (chineseFontBytes) {
        headerFont = await pdfDoc.embedFont(chineseFontBytes)
      } else {
        canShowHeader = false
      }
    } catch (e) {
      console.warn('无法加载中文字体，跳过页眉:', e)
      canShowHeader = false
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
        const headerTextWidth = headerFont.widthOfTextAtSize(headerTitle, headerFontSize)
        const headerX = (pageWidth - headerTextWidth) / 2

        page.drawText(headerTitle, {
          x: headerX,
          y: headerY,
          size: headerFontSize,
          font: headerFont,
          color: rgb(0.42, 0.45, 0.5)
        })
      }

      if (securityLevel) {
        const securityText = `密级：${securityLevel}`
        const securityTextWidth = headerFont.widthOfTextAtSize(securityText, headerFontSize)
        const securityX = pageWidth - headerMargin - securityTextWidth

        page.drawText(securityText, {
          x: securityX,
          y: headerY,
          size: headerFontSize,
          font: headerFont,
          color: rgb(0.42, 0.45, 0.5)
        })
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
  console.log('[PDF] Saved PDF size:', savedBytes.length)
  return savedBytes
}

/**
 * 提取 h1-h4 标题（根据 id 去重）
 */
function extractHeadings(htmlContent: string): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = []
  const seenIds = new Set<string>()
  const headingRegex = /<h([1-4])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h\1>/g
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
    const headingRegex = new RegExp(`<h${heading.level}([^>]*)id="${heading.id}"([^>]*)>`, 'g')
    result = result.replace(headingRegex, `<h${heading.level}$1id="${heading.id}"$2>${markerHtml}`)
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
      const h1Regex = new RegExp(`<h1[^>]*id="${heading.id}"[^>]*>`, 'g')
      result = result.replace(h1Regex, `<div style="page-break-before: always;"></div><h1 id="${heading.id}">`)
    }
  })

  return result
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function getMarkdownStyles(): string {
  return `
.markdown-body { line-height: 1.6; color: #1f2937; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 { margin-top: 1.5em; margin-bottom: 0.75em; font-weight: 600; line-height: 1.25; color: #111827; }
.markdown-body h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1.1em; }
.markdown-body p { margin-top: 0; margin-bottom: 1em; }
.markdown-body a { color: #3b82f6; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body strong { font-weight: 600; }
.markdown-body em { font-style: italic; }
.markdown-body code { padding: 0.2em 0.4em; margin: 0; font-size: 85%; background-color: #f3f4f6; border-radius: 3px; font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; }
.markdown-body pre { margin-top: 0; margin-bottom: 1em; padding: 1em; overflow: auto; font-size: 85%; line-height: 1.45; background-color: #f3f4f6; border-radius: 6px; }
.markdown-body pre code { padding: 0; background-color: transparent; border-radius: 0; font-size: 100%; white-space: pre; word-break: normal; word-wrap: normal; display: block; }
.markdown-body .code-lines-container { display: table; width: 100%; border-collapse: collapse; }
.markdown-body .code-line { display: table-row; }
.markdown-body .code-line .line-number { display: table-cell; text-align: right; padding-right: 0.75em; border-right: 1px solid #e5e7eb; color: #9ca3af; font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; font-size: 85%; line-height: 1.45; user-select: none; -webkit-user-select: none; white-space: pre; }
.markdown-body .code-line .line-number::before { content: attr(data-num); }
.markdown-body .code-line .code-line-content { display: table-cell; padding-left: 0.75em; white-space: pre; }
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
.markdown-body .heading-number { font-weight: 600; color: #3b82f6; margin-right: 0.25em; }

/* Admonition 提示框 */
.markdown-body .admonition { margin: 1em 0; padding: 0.75em 1em; border-radius: 6px; border-left: 4px solid; background-color: #f9fafb; page-break-inside: avoid; }
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
.markdown-body .wavedrom svg { max-width: 100%; }
.markdown-body figure.figure-span { display: flex; flex-direction: column; align-items: center; margin: 1.5em 0; text-align: center; page-break-inside: avoid; }
.markdown-body figure.figure-span img { max-width: 100%; height: auto; }
.markdown-body figure.figure-span figcaption { margin-top: 0.5em; font-size: 0.9em; color: #6b7280; text-align: center; }
`
}

/**
 * 生成完整的 HTML 文档
 */
function getFullHtml(title: string, metaHtml: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    ${getMarkdownStyles()}
    ${katexStyles}
    ${highlightStyles}

    @page { margin: 2cm 2.5cm; size: A4; }
    @page :first { margin: 0; }

    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; }

    .cover-page {
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      min-height: 100vh; text-align: center; padding: 2cm; box-sizing: border-box;
      page-break-after: always;
    }
    .cover-page h1 { font-size: 2.5em; font-weight: 700; color: #1f2937; margin: 0 0 0.5em 0; border: none; }
    .cover-page .subtitle { font-size: 1.2em; color: #6b7280; }
    .cover-page .meta { margin-top: 3em; font-size: 1em; color: #6b7280; }
    .cover-page .meta-item { margin: 0.5em 0; }

    .main-content { page-break-before: always; padding: 0; }
    .main-content h1:first-child { margin-top: 0; }
    .markdown-body { max-width: none; }

    h1, h2, h3, h4 { page-break-after: avoid; }
    pre, blockquote, table, figure, img, svg, .mermaid, .wavedrom { page-break-inside: avoid; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  </style>
</head>
<body>
  <div class="cover-page">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">MarkRefine 生成文档</div>
    ${metaHtml}
  </div>

  <div class="main-content markdown-body">
    ${content}
  </div>
</body>
</html>`
}

