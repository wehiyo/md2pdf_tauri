import { message, open } from '@tauri-apps/plugin-dialog'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'

export function usePDF() {
  /**
   * 导出 HTML 为 PDF
   */
  async function exportToPDF(htmlContent: string, title: string = '文档'): Promise<void> {
    try {
      // 移除内嵌目录和 [[toc]] 标记
      let contentWithoutToc = htmlContent
        .replace(/<div class="table-of-contents">.*?<\/div>/gs, '')
        .replace(/\[\[toc\]\]/gi, '')

      // 生成目录数据（用于分页锚点）
      const tocData = extractTOC(contentWithoutToc)

      // 生成 PDF
      await generatePDF(contentWithoutToc, tocData, title)

    } catch (error) {
      console.error('导出 PDF 失败:', error)
      await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
    }
  }

  /**
   * 生成 PDF
   */
  async function generatePDF(
    contentWithoutToc: string,
    tocData: Array<{ level: number; text: string; id: string }>,
    title: string
  ): Promise<void> {
    const contentWithPageAnchors = addPageAnchors(contentWithoutToc, tocData)

    // 创建 HTML 文档（封面 + 正文，无目录页）
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

    h1, h2, h3 { page-break-after: avoid; }
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

    // 提示用户并打开打印对话框
    await message('即将打开打印对话框。\n\n请在打印对话框中选择"Microsoft Print to PDF"保存 PDF 文件。\n保存完成后，请选择刚才保存的 PDF 文件，程序将为其添加页码。', {
      title: '导出 PDF',
      kind: 'info'
    })

    // 创建 iframe 并打印
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.left = '-9999px'
    iframe.style.top = '0'
    iframe.style.width = '210mm'
    iframe.style.height = 'auto'
    iframe.style.minHeight = '100%'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      document.body.removeChild(iframe)
      await message('无法创建打印文档', { title: '错误', kind: 'error' })
      return
    }

    iframeDoc.open()
    iframeDoc.write(fullHtml)
    iframeDoc.close()

    // 等待内容渲染
    await new Promise(resolve => setTimeout(resolve, 2000))

    // 打开打印对话框
    const iframeWindow = iframe.contentWindow
    if (iframeWindow) {
      iframeWindow.focus()
      iframeWindow.print()
    }

    // 清理 iframe
    setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe)
      }
    }, 3000)

    // 让用户选择刚才保存的 PDF
    const selectedPdf = await open({
      multiple: false,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      title: '选择刚才保存的 PDF 文件'
    })

    if (!selectedPdf || typeof selectedPdf !== 'string') {
      await message('未选择 PDF 文件，无法添加页码。', { title: '取消', kind: 'warning' })
      return
    }

    // 添加页码并覆盖原文件
    try {
      const pdfBytes = await readFile(selectedPdf)
      const pdfWithNumbers = await addPageNumbersToPDF(pdfBytes)
      await writeFile(selectedPdf, pdfWithNumbers)
      await message(`PDF 已保存并添加页码：${selectedPdf}`, { title: '成功', kind: 'info' })
    } catch (error) {
      console.error('添加页码失败:', error)
      await message('添加页码失败：' + String(error), { title: '错误', kind: 'error' })
    }
  }

  return { exportToPDF }
}

/**
 * 使用 pdf-lib 为 PDF 添加页码
 * 封面页无页码，正文页从第1页开始
 */
async function addPageNumbersToPDF(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pages = pdfDoc.getPages()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // A4 页面宽度 (points)
  const pageWidth = 595.28

  // 页码位置参数
  const marginRight = 70 // 右边距 (约 2.5cm)
  const marginBottom = 57 // 下边距 (约 2cm)
  const fontSize = 10

  for (let i = 0; i < pages.length; i++) {
    // 封面页（第 0 页）不添加页码
    if (i === 0) continue

    const page = pages[i]

    // 正文页码从 1 开始
    const pageNum = i // i=1 对应第1页，i=2 对应第2页...
    const text = `- ${pageNum} -`
    const textWidth = font.widthOfTextAtSize(text, fontSize)
    const x = pageWidth - marginRight - textWidth
    const y = marginBottom

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.42, 0.45, 0.5) // #6b7280
    })
  }

  return pdfDoc.save()
}

function extractTOC(htmlContent: string): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = []
  const headingRegex = /<h([123])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h\1>/g
  let match

  while ((match = headingRegex.exec(htmlContent)) !== null) {
    const level = parseInt(match[1])
    const id = match[2]
    const text = stripHtml(match[3])
    if (id && !id.includes('toc') && !id.includes('contents')) {
      headings.push({ level, text, id })
    }
  }
  return headings
}

function addPageAnchors(htmlContent: string, tocData: Array<{ level: number; text: string; id: string }>): string {
  let result = htmlContent
  tocData.forEach((heading, index) => {
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
.markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 1.5em; margin-bottom: 0.75em; font-weight: 600; line-height: 1.25; color: #111827; }
.markdown-body h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h3 { font-size: 1.25em; }
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
`
}