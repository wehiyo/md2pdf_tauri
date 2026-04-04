import { message, save } from '@tauri-apps/plugin-dialog'
import { PDFDocument, StandardFonts, rgb, PDFName, PDFHexString } from 'pdf-lib'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import fontkit from '@pdf-lib/fontkit'
import type { Metadata } from './useMarkdown'

// 字体缓存
let cachedChineseFont: Uint8Array | null = null

// 导入本地样式文件（Vite ?raw 导入）
// @ts-ignore
import katexStyles from '../assets/katex/katex-inline.css?raw'
// @ts-ignore
import highlightStyles from '../assets/github.min.css?raw'

// 防止重复调用（模块级别）
let isExporting = false

export function usePDF() {
  /**
   * 导出 HTML 为 PDF
   */
  async function exportToPDF(htmlContent: string, metadata: Metadata = {}): Promise<void> {
    if (isExporting) {
      console.log('[诊断] 已有导出任务在进行中，忽略重复调用')
      return
    }
    isExporting = true

    try {
      // 移除内嵌目录、[[toc]] 标记及相关内容
      let contentWithoutToc = htmlContent
        .replace(/<div class="table-of-contents">.*?<\/div>/gs, '')
        .replace(/<p>\s*\[\[toc\]\]\s*<\/p>/gi, '')
        .replace(/\[\[toc\]\]/gi, '')

      // 提取标题数据（h1-h4，用于分页和书签）
      const headings = extractHeadings(contentWithoutToc)

      // 生成 PDF
      await generatePDF(contentWithoutToc, headings, metadata)

    } catch (error) {
      console.error('导出 PDF 失败:', error)
      await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
    } finally {
      isExporting = false
    }
  }

  /**
   * 生成 PDF（使用 WebView2 静默打印）
   */
  async function generatePDF(
    contentWithoutToc: string,
    headings: Array<{ level: number; text: string; id: string }>,
    metadata: Metadata
  ): Promise<void> {
    const title = metadata.title || '文档'

    // Step 1: 获取保存路径
    const savePath = await save({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: `${title}.pdf`,
      title: '保存 PDF 文件'
    })

    if (!savePath) {
      return
    }

    // 创建带封面和页码锚点的 HTML
    const contentWithPageAnchors = addPageAnchors(contentWithoutToc, headings)

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

    // 创建 HTML 文档（使用本地 KaTeX 和 highlight.js 样式，字体已内联为 base64）
    const fullHtml = `<!DOCTYPE html>
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
    pre, blockquote, table, figure, img, svg, .mermaid { page-break-inside: avoid; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  </style>
</head>
<body>
  <div class="cover-page">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">MD2PDF 生成文档</div>
    ${metaHtml}
  </div>

  <div class="main-content markdown-body">
    ${contentWithPageAnchors}
  </div>
</body>
</html>`

    // Step 2: 计算书签页码
    const bookmarkData = await calculateBookmarkPagesInIframe(fullHtml, headings)

    // Step 3: 调用 Rust command 静默生成 PDF
    try {
      const result = await invoke<{ success: boolean; path: string; error?: string }>(
        'print_to_pdf',
        { html: fullHtml, savePath: savePath }
      )

      if (result.success) {
        // Step 4: 添加页码和书签
        try {
          const pdfBytes = await readFile(result.path)
          const pdfWithEnhancements = await enhancePDF(pdfBytes, bookmarkData, metadata)
          await writeFile(result.path, pdfWithEnhancements)

          await message(`PDF 已保存：${result.path}`, { title: '成功', kind: 'info' })
        } catch (enhanceError) {
          console.error('PDF 增强失败:', enhanceError)
          await message(`PDF 已生成，但添加页码和书签失败：${result.path}\n\n错误：${String(enhanceError)}`, { title: '警告', kind: 'warning' })
        }
      } else {
        await message('PDF 生成失败：' + (result.error || '未知错误'), { title: '错误', kind: 'error' })
      }
    } catch (printError) {
      console.error('静默打印失败:', printError)
      await message('导出失败：' + String(printError), { title: '错误', kind: 'error' })
    }
  }

  /**
   * 在 iframe 中计算书签页码
   */
  async function calculateBookmarkPagesInIframe(
    fullHtml: string,
    headings: Array<{ level: number; text: string; id: string }>
  ): Promise<Array<{ level: number; text: string; pageNumber: number }>> {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '210mm'
      iframe.style.height = 'auto'
      iframe.style.minHeight = '100%'
      iframe.style.border = 'none'
      iframe.style.visibility = 'hidden'
      document.body.appendChild(iframe)

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!iframeDoc) {
        document.body.removeChild(iframe)
        resolve([])
        return
      }

      iframeDoc.open()
      iframeDoc.write(fullHtml)
      iframeDoc.close()

      // 等待内容渲染
      setTimeout(() => {
        const result = calculateBookmarkPages(iframeDoc, headings)
        if (iframe.parentNode) {
          document.body.removeChild(iframe)
        }
        resolve(result)
      }, 2000)
    })
  }

  /**
 * 计算标题所在的页码（同时根据文本去重）
 */
  function calculateBookmarkPages(
    iframeDoc: Document,
    headings: Array<{ level: number; text: string; id: string }>
  ): Array<{ level: number; text: string; pageNumber: number }> {
    const result: Array<{ level: number; text: string; pageNumber: number }> = []
    const seenTexts = new Set<string>()
    const pageHeight = 715 // A4 可打印区域高度（像素）
    const mainContent = iframeDoc.querySelector('.main-content')

    if (!mainContent) return result

    const contentRect = mainContent.getBoundingClientRect()
    const contentTop = contentRect.top

    headings.forEach((heading) => {
      // 根据文本去重，只保留第一个出现的标题
      if (seenTexts.has(heading.text)) return
      seenTexts.add(heading.text)

      const element = iframeDoc.getElementById(heading.id)
      if (element) {
        const elementRect = element.getBoundingClientRect()
        const relativeTop = elementRect.top - contentTop
        // 封面页是第 0 页，正文从第 1 页开始（PDF 页码索引）
        const pageNumber = Math.floor(relativeTop / pageHeight) + 1
        result.push({
          level: heading.level,
          text: heading.text,
          pageNumber: pageNumber
        })
      }
    })

    return result
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
 * 使用 pdf-lib 为 PDF 添加页码、页眉和书签
 */
async function enhancePDF(
  pdfBytes: Uint8Array,
  bookmarkData: Array<{ level: number; text: string; pageNumber: number }>,
  metadata: Metadata = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)

  // 注册 fontkit 以支持自定义字体
  pdfDoc.registerFontkit(fontkit)

  const pages = pdfDoc.getPages()
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // 页码位置参数
  const marginBottom = 25
  const fontSize = 8
  const pageMargin = 50 // 页边距

  // 页眉位置参数
  const headerFontSize = 8
  const marginTop = 25
  const headerLineMargin = 8 // 页眉与分割线的间距
  const headerMargin = 50 // 页眉左右边距

  // 提取 metadata 信息
  const headerTitle = metadata.title || ''
  const securityLevel = metadata['security level'] || ''

  // 确定页眉字体：如果有中文则尝试加载中文字体
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

    // 获取页面实际尺寸
    const pageWidth = page.getWidth()
    const pageHeight = page.getHeight()

    // 添加页眉（标题居中，security level 在右侧）
    if (canShowHeader) {
      const headerY = pageHeight - marginTop

      // 绘制标题（居中）
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

      // 绘制 security level（右侧）
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

      // 添加分割线（在页眉下方）
      const lineY = headerY - headerLineMargin
      page.drawLine({
        start: { x: headerMargin, y: lineY },
        end: { x: pageWidth - headerMargin, y: lineY },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8)
      })
    }

    // 添加页码（右侧）
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

    // 添加页脚分割线（在页码上方）
    const footerLineY = marginBottom + 12
    page.drawLine({
      start: { x: pageMargin, y: footerLineY },
      end: { x: pageWidth - pageMargin, y: footerLineY },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    })
  }

  // 添加书签
  if (bookmarkData.length > 0) {
    addPDFOutlines(pdfDoc, bookmarkData, helveticaFont)
  }

  const savedBytes = await pdfDoc.save()
  console.log('[PDF] Saved PDF size:', savedBytes.length)
  return savedBytes
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
 * 使用 pdf-lib 底层 API 添加 PDF 大纲（书签）
 * 支持 h1-h4 多级书签，支持中文
 */
function addPDFOutlines(
  pdfDoc: PDFDocument,
  bookmarkData: Array<{ level: number; text: string; pageNumber: number }>,
  _font?: any // 保留参数以兼容调用，但书签不需要字体
): void {
  const context = pdfDoc.context
  const pages = pdfDoc.getPages()

  if (bookmarkData.length === 0) return

  // 创建根大纲
  const outlinesDict = context.obj({})
  const outlinesRef = context.register(outlinesDict)

  // 定义树节点结构
  interface TreeNode {
    text: string
    level: number
    pageNumber: number
    ref: ReturnType<typeof context.register>
    children: TreeNode[]
  }

  // 构建树形结构
  const rootChildren: TreeNode[] = []
  const path: TreeNode[] = [] // 当前路径上的节点栈

  for (const item of bookmarkData) {
    const page = pages[item.pageNumber]
    if (!page) continue

    // 创建节点
    const destArray = context.obj([
      page.ref,
      PDFName.of('XYZ'),
      null,
      null,
      null
    ])

    const itemDict = context.obj({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemDictAny = itemDict as any
    itemDictAny.set(PDFName.of('Title'), PDFHexString.fromText(item.text))
    itemDictAny.set(PDFName.of('Dest'), destArray)

    const itemRef = context.register(itemDict)

    const node: TreeNode = {
      text: item.text,
      level: item.level,
      pageNumber: item.pageNumber,
      ref: itemRef,
      children: []
    }

    // 弹出路径中 level >= 当前的节点
    while (path.length > 0 && path[path.length - 1].level >= node.level) {
      path.pop()
    }

    // 添加到父节点的 children 或根
    if (path.length === 0) {
      rootChildren.push(node)
    } else {
      path[path.length - 1].children.push(node)
    }

    // 将当前节点加入路径
    path.push(node)
  }

  // 递归设置 PDF 字典的关系
  function processNode(node: TreeNode, parentRef: ReturnType<typeof context.register>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dict = context.lookup(node.ref) as any
    dict.set(PDFName.of('Parent'), parentRef)

    if (node.children.length > 0) {
      // 设置 First 和 Last
      dict.set(PDFName.of('First'), node.children[0].ref)
      dict.set(PDFName.of('Last'), node.children[node.children.length - 1].ref)
      dict.set(PDFName.of('Count'), context.obj(node.children.length))

      // 设置子节点之间的 Prev/Next
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const childDict = context.lookup(child.ref) as any

        if (i > 0) {
          childDict.set(PDFName.of('Prev'), node.children[i - 1].ref)
        }
        if (i < node.children.length - 1) {
          childDict.set(PDFName.of('Next'), node.children[i + 1].ref)
        }

        // 递归处理子节点
        processNode(child, node.ref)
      }
    }
  }

  // 设置根大纲的 First 和 Last
  if (rootChildren.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outlinesAny = outlinesDict as any
    outlinesAny.set(PDFName.of('First'), rootChildren[0].ref)
    outlinesAny.set(PDFName.of('Last'), rootChildren[rootChildren.length - 1].ref)
    outlinesAny.set(PDFName.of('Count'), context.obj(rootChildren.length))

    // 设置一级书签之间的 Prev/Next
    for (let i = 0; i < rootChildren.length; i++) {
      const child = rootChildren[i]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childDict = context.lookup(child.ref) as any

      if (i > 0) {
        childDict.set(PDFName.of('Prev'), rootChildren[i - 1].ref)
      }
      if (i < rootChildren.length - 1) {
        childDict.set(PDFName.of('Next'), rootChildren[i + 1].ref)
      }

      // 处理每个一级书签的子树
      processNode(child, outlinesRef)
    }
  }

  // 设置文档目录的 Outlines
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catalog = pdfDoc.catalog as any
  catalog.set(PDFName.of('Outlines'), outlinesRef)
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

function addPageAnchors(htmlContent: string, headings: Array<{ level: number; text: string; id: string }>): string {
  let result = htmlContent
  headings.forEach((heading, index) => {
    if (heading.level === 1) {
      const h1Regex = new RegExp(`<h1[^>]*id="${heading.id}"[^>]*>`, 'g')
      if (index > 0) {
        result = result.replace(h1Regex, `<div style="page-break-before: always;"></div><h1 id="${heading.id}">`)
      }
    }
  })
  return result
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
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
`
}