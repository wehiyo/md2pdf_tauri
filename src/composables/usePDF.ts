import { message, open } from '@tauri-apps/plugin-dialog'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'

export function usePDF() {
  /**
   * 导出 HTML 为 PDF
   */
  async function exportToPDF(htmlContent: string, title: string = '文档'): Promise<void> {
    try {
      // 提取正文内容（移除内嵌目录）
      const contentWithoutToc = htmlContent.replace(/<div class="table-of-contents">.*?<\/div>/s, '')

      // 生成目录数据
      const tocData = extractTOC(htmlContent)

      // 第一步：创建 iframe 并计算真实页码
      const { pageNumbers, tocPages } = await calculatePageNumbers(contentWithoutToc, tocData, title)

      // 第二步：生成带真实页码的目录
      const tocHtml = generateTOCHtmlWithRealPageNumbers(tocData, pageNumbers)

      // 第三步：生成 PDF
      await generatePDF(contentWithoutToc, tocHtml, tocData, title, tocPages)

    } catch (error) {
      console.error('导出 PDF 失败:', error)
      await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
    }
  }

  /**
   * 计算真实页码
   */
  async function calculatePageNumbers(
    contentWithoutToc: string,
    tocData: Array<{ level: number; text: string; id: string }>,
    title: string
  ): Promise<{ pageNumbers: Map<string, number>, totalPages: number, tocPages: number, contentPages: number }> {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '210mm'
      iframe.style.height = '297mm'
      document.body.appendChild(iframe)

      const measureHtml = generateMeasureHtml(contentWithoutToc, title)

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!iframeDoc) {
        document.body.removeChild(iframe)
        resolve({ pageNumbers: new Map(), totalPages: 0, tocPages: 0, contentPages: 0 })
        return
      }

      iframeDoc.open()
      iframeDoc.write(measureHtml)
      iframeDoc.close()

      const calculate = () => {
        const pageNumbers = new Map<string, number>()
        const pageHeight = 715 // A4 可打印区域高度（像素）

        const tocElement = iframeDoc.querySelector('.toc-page')
        let tocPages = 1
        if (tocElement) {
          const tocHeight = tocElement.getBoundingClientRect().height
          tocPages = Math.ceil(tocHeight / pageHeight)
          if (tocPages < 1) tocPages = 1
        }

        const mainContent = iframeDoc.querySelector('.main-content')
        if (mainContent) {
          const contentRect = mainContent.getBoundingClientRect()
          const contentTop = contentRect.top

          tocData.forEach((heading) => {
            const element = iframeDoc.getElementById(heading.id)
            if (element) {
              const elementRect = element.getBoundingClientRect()
              const relativeTop = elementRect.top - contentTop
              const pageNumber = Math.floor(relativeTop / pageHeight) + 1
              pageNumbers.set(heading.id, pageNumber)
            }
          })
        }

        const mainContentHeight = mainContent?.getBoundingClientRect().height || 0
        const contentPages = Math.ceil(mainContentHeight / pageHeight)
        const totalPages = 1 + tocPages + contentPages

        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe)
          }
        }, 100)

        resolve({ pageNumbers, totalPages, tocPages, contentPages })
      }

      setTimeout(calculate, 2000)
    })
  }

  /**
   * 生成测量 HTML
   */
  function generateMeasureHtml(contentWithoutToc: string, title: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    ${getMarkdownStyles()}
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; }
    .cover-page { display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; text-align: center; padding: 2cm; box-sizing: border-box; }
    .cover-page h1 { font-size: 2.5em; font-weight: 700; margin: 0 0 0.5em 0; border: none; }
    .toc-page { padding: 2cm 2.5cm 2.5cm 2.5cm; }
    .toc-page h2 { font-size: 1.8em; text-align: center; margin: 0 0 2em 0; border-bottom: 2px solid #1f2937; padding-bottom: 0.5em; }
    .toc-list { list-style: none; padding: 0; margin: 0; }
    .toc-item { display: flex; align-items: baseline; margin-bottom: 0.6em; }
    .toc-text { flex-shrink: 0; }
    .toc-dots { flex: 1; border-bottom: 1px dotted #d1d5db; margin: 0 0.5em; min-width: 1em; height: 0.8em; }
    .toc-page-number { color: #6b7280; min-width: 2em; text-align: right; }
    .main-content { padding: 2cm 2.5cm 2.5cm 2.5cm; }
  </style>
</head>
<body>
  <div class="cover-page">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">MD2PDF 生成文档</div>
    <div class="meta">${new Date().toLocaleDateString('zh-CN')}</div>
  </div>
  <div class="toc-page">
    <h2>目 录</h2>
    <ul class="toc-list"><li class="toc-item"><span class="toc-text">占位</span><span class="toc-dots"></span><span class="toc-page-number">1</span></li></ul>
  </div>
  <div class="main-content markdown-body">${contentWithoutToc}</div>
</body>
</html>`
  }

  /**
   * 生成目录 HTML
   */
  function generateTOCHtmlWithRealPageNumbers(
    headings: Array<{ level: number; text: string; id: string }>,
    pageNumbers: Map<string, number>
  ): string {
    if (headings.length === 0) {
      return '<p style="text-align: center; color: #9ca3af;">无目录</p>'
    }

    let html = '<ul class="toc-list">'
    headings.forEach((heading) => {
      const displayText = escapeHtml(heading.text)
      const pageNum = pageNumbers.get(heading.id) || 1
      html += `<li class="toc-item level-${heading.level}"><a href="#${heading.id}" class="toc-link"><span class="toc-text">${displayText}</span><span class="toc-dots"></span><span class="toc-page-number">${pageNum}</span></a></li>`
    })
    html += '</ul>'
    return html
  }

  /**
   * 生成 PDF（简化流程：打印 -> 选择文件 -> 添加页码 -> 保存）
   */
  async function generatePDF(
    contentWithoutToc: string,
    tocHtml: string,
    tocData: Array<{ level: number; text: string; id: string }>,
    title: string,
    tocPages: number
  ): Promise<void> {
    const contentWithPageAnchors = addPageAnchors(contentWithoutToc, tocData)

    // 创建 HTML 文档
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

    .toc-page { page-break-before: always; page-break-after: always; padding: 0; }
    .toc-page h2 { font-size: 1.8em; text-align: center; margin: 0 0 2em 0; border-bottom: 2px solid #1f2937; padding-bottom: 0.5em; }
    .toc-list { list-style: none; padding: 0; margin: 0; }
    .toc-item { display: flex; align-items: baseline; margin-bottom: 0.6em; line-height: 1.4; }
    .toc-link { display: flex; align-items: baseline; flex: 1; text-decoration: none; color: inherit; }
    .toc-item.level-1 { font-weight: 600; font-size: 1.1em; margin-top: 0.8em; }
    .toc-item.level-2 { padding-left: 1.5em; font-size: 1em; }
    .toc-item.level-3 { padding-left: 3em; font-size: 0.95em; color: #4b5563; }
    .toc-text { flex-shrink: 0; }
    .toc-dots { flex: 1; border-bottom: 1px dotted #d1d5db; margin: 0 0.5em; min-width: 1em; height: 0.8em; }
    .toc-page-number { color: #6b7280; min-width: 2em; text-align: right; font-variant-numeric: tabular-nums; }

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

  <div class="toc-page">
    <h2>目 录</h2>
    ${tocHtml}
  </div>

  <div class="main-content markdown-body">
    ${contentWithPageAnchors}
  </div>
</body>
</html>`

    // 第一步：提示用户并打开打印对话框
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

    // 第二步：让用户选择刚才保存的 PDF
    const selectedPdf = await open({
      multiple: false,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      title: '选择刚才保存的 PDF 文件'
    })

    if (!selectedPdf || typeof selectedPdf !== 'string') {
      await message('未选择 PDF 文件，无法添加页码。', { title: '取消', kind: 'warning' })
      return
    }

    // 第三步：添加页码并覆盖原文件
    try {
      const pdfBytes = await readFile(selectedPdf)
      const pdfWithNumbers = await addPageNumbersToPDF(pdfBytes, tocPages)
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
 */
async function addPageNumbersToPDF(pdfBytes: Uint8Array, tocPages: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pages = pdfDoc.getPages()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // A4 页面宽度 (points)
  const pageWidth = 595.28

  // 页码位置参数
  const marginRight = 70 // 右边距 (约 2.5cm)
  const marginBottom = 57 // 下边距 (约 2cm)
  const fontSize = 10

  // 正文起始页索引（封面页0 + 目录页）
  const contentStartPage = 1 + tocPages

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]

    // 封面页（第 0 页）不添加页码
    if (i === 0) continue

    let pageText: string

    if (i < contentStartPage) {
      // 目录页：使用罗马数字
      pageText = toRoman(i)
    } else {
      // 正文页：使用阿拉伯数字，从 1 开始
      const contentPage = i - contentStartPage + 1
      pageText = String(contentPage)
    }

    // 显示页码
    const text = `- ${pageText} -`
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

/**
 * 转换为罗马数字（小写）
 */
function toRoman(num: number): string {
  if (num < 1) return ''

  const romanNumerals: [string, number][] = [
    ['m', 1000], ['cm', 900], ['d', 500], ['cd', 400],
    ['c', 100], ['xc', 90], ['l', 50], ['xl', 40],
    ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]
  ]

  let result = ''
  let remaining = num

  for (const [symbol, value] of romanNumerals) {
    while (remaining >= value) {
      result += symbol
      remaining -= value
    }
  }

  return result
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