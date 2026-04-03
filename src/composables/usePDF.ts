import { message, save } from '@tauri-apps/plugin-dialog'
import { PDFDocument, StandardFonts, rgb, PDFName, PDFHexString } from 'pdf-lib'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'

// 防止重复调用（模块级别）
let isExporting = false

export function usePDF() {
  /**
   * 导出 HTML 为 PDF
   */
  async function exportToPDF(htmlContent: string, title: string = '文档'): Promise<void> {
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
      await generatePDF(contentWithoutToc, headings, title)

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
    title: string
  ): Promise<void> {
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

    // 创建 HTML 文档（使用 CDN 加载 KaTeX 和 highlight.js 样式）
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css">
  <style>
    ${getMarkdownStyles()}

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
    .cover-page .meta { margin-top: 3em; font-size: 1em; color: #9ca3af; }

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
    <div class="meta">${new Date().toLocaleDateString('zh-CN')}</div>
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
          const pdfWithEnhancements = await enhancePDF(pdfBytes, bookmarkData)
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
 * 使用 pdf-lib 为 PDF 添加页码和书签
 */
async function enhancePDF(
  pdfBytes: Uint8Array,
  bookmarkData: Array<{ level: number; text: string; pageNumber: number }>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pages = pdfDoc.getPages()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // A4 页面宽度 (points)
  const pageWidth = 595.28

  // 页码位置参数
  const marginRight = 70
  const marginBottom = 57
  const fontSize = 10

  // 添加页码
  for (let i = 0; i < pages.length; i++) {
    // 封面页（第 0 页）不添加页码
    if (i === 0) continue

    const page = pages[i]
    const pageNum = i
    const text = `- ${pageNum} -`
    const textWidth = font.widthOfTextAtSize(text, fontSize)
    const x = pageWidth - marginRight - textWidth
    const y = marginBottom

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.42, 0.45, 0.5)
    })
  }

  // 添加书签
  if (bookmarkData.length > 0) {
    addPDFOutlines(pdfDoc, bookmarkData)
  }

  return pdfDoc.save()
}

/**
 * 使用 pdf-lib 底层 API 添加 PDF 大纲（书签）
 * 支持 h1-h4 多级书签
 */
function addPDFOutlines(
  pdfDoc: PDFDocument,
  bookmarkData: Array<{ level: number; text: string; pageNumber: number }>
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
.markdown-body pre code { padding: 0; background-color: transparent; border-radius: 0; font-size: 100%; white-space: pre; word-break: normal; word-wrap: normal; }
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