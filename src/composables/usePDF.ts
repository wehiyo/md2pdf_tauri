import { save, message } from '@tauri-apps/plugin-dialog'

export function usePDF() {
  /**
   * 导出 HTML 为 PDF
   */
  async function exportToPDF(htmlContent: string, title: string = '文档'): Promise<void> {
    try {
      // 创建隐藏的 iframe 用于打印
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '210mm'
      iframe.style.height = '297mm'
      document.body.appendChild(iframe)

      // 提取正文内容（移除内嵌目录）
      const contentWithoutToc = htmlContent.replace(/<div class="table-of-contents">.*?<\/div>/s, '')

      // 生成目录 HTML
      const tocHtml = generateTOC(htmlContent)

      // 创建完整的 HTML 文档
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css">
  <style>
    ${getMarkdownStyles()}

    @page {
      margin: 2cm 2.5cm;
      size: A4;
    }

    @page :first {
      margin: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1f2937;
      margin: 0;
      padding: 0;
    }

    /* 封面页 */
    .cover-page {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100vh;
      text-align: center;
      padding: 2cm;
    }

    .cover-page h1 {
      font-size: 2.5em;
      font-weight: 700;
      color: #1f2937;
      margin: 0;
      line-height: 1.3;
      border: none;
    }

    .cover-page .subtitle {
      font-size: 1.2em;
      color: #6b7280;
      margin-top: 1em;
    }

    /* 目录页 */
    .toc-page {
      page-break-after: always;
      padding: 2cm;
    }

    .toc-page h2 {
      font-size: 1.8em;
      text-align: center;
      margin-bottom: 2em;
      border-bottom: 2px solid #1f2937;
      padding-bottom: 0.5em;
    }

    .toc-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .toc-item {
      display: flex;
      align-items: baseline;
      margin-bottom: 0.8em;
      line-height: 1.4;
    }

    .toc-item.level-1 {
      font-weight: 600;
      font-size: 1.1em;
    }

    .toc-item.level-2 {
      padding-left: 1.5em;
      font-size: 1em;
    }

    .toc-item.level-3 {
      padding-left: 3em;
      font-size: 0.95em;
      color: #4b5563;
    }

    .toc-link {
      flex: 1;
      text-decoration: none;
      color: #1f2937;
      border-bottom: 1px dotted #d1d5db;
    }

    .toc-link:hover {
      color: #3b82f6;
    }

    .toc-page-number {
      margin-left: 0.5em;
      color: #6b7280;
      min-width: 2em;
      text-align: right;
    }

    /* 正文 */
    .main-content {
      padding: 0;
    }

    .main-content h1:first-child {
      margin-top: 0;
    }

    .markdown-body {
      max-width: none;
    }

    h1, h2, h3 {
      page-break-after: avoid;
    }

    pre, blockquote, table, figure, img, svg, .mermaid {
      page-break-inside: avoid;
    }

    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  </style>
</head>
<body>
  <!-- 封面 -->
  <div class="cover-page">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">MD2PDF 生成文档</div>
  </div>

  <!-- 目录 -->
  <div class="toc-page">
    <h2>目 录</h2>
    ${tocHtml}
  </div>

  <!-- 正文 -->
  <div class="main-content markdown-body">
    ${contentWithoutToc}
  </div>
</body>
</html>`

      // 写入 iframe
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (iframeDoc) {
        iframeDoc.open()
        iframeDoc.write(fullHtml)
        iframeDoc.close()

        // 等待资源加载
        await new Promise(resolve => setTimeout(resolve, 1500))

        // 调用 iframe 的打印
        const iframeWindow = iframe.contentWindow
        if (iframeWindow) {
          iframeWindow.focus()
          iframeWindow.print()

          await message('请在打印对话框中选择"Microsoft Print to PDF"或类似虚拟打印机保存为 PDF 文件', {
            title: '打印提示',
            kind: 'info'
          })
        }

        // 延迟删除 iframe
        setTimeout(() => {
          document.body.removeChild(iframe)
        }, 2000)
      }

    } catch (error) {
      console.error('导出 PDF 失败:', error)
      await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
    }
  }

  return {
    exportToPDF
  }
}

/**
 * 从 HTML 内容生成目录
 */
function generateTOC(htmlContent: string): string {
  const headings: Array<{ level: number; text: string; id: string }> = []

  // 匹配 h1, h2, h3 标签
  const h1Regex = /<h1[^>]*id="([^"]*)"[^>]*>(.*?)<\/h1>/g
  const h2Regex = /<h2[^>]*id="([^"]*)"[^>]*>(.*?)<\/h2>/g
  const h3Regex = /<h3[^>]*id="([^"]*)"[^>]*>(.*?)<\/h3>/g

  // 提取 h1
  let match
  while ((match = h1Regex.exec(htmlContent)) !== null) {
    headings.push({ level: 1, text: stripHtml(match[2]), id: match[1] })
  }

  // 提取 h2
  while ((match = h2Regex.exec(htmlContent)) !== null) {
    headings.push({ level: 2, text: stripHtml(match[2]), id: match[1] })
  }

  // 提取 h3
  while ((match = h3Regex.exec(htmlContent)) !== null) {
    headings.push({ level: 3, text: stripHtml(match[2]), id: match[1] })
  }

  if (headings.length === 0) {
    return '<p style="text-align: center; color: #9ca3af;">无目录</p>'
  }

  // 按出现顺序排序（保持原有顺序）
  // 生成目录 HTML
  let tocHtml = '<ul class="toc-list">'

  headings.forEach((heading, index) => {
    // 页码从正文开始（第3页是正文第一页，所以加3）
    const pageNumber = estimatePageNumber(headings, index)
    tocHtml += `
      <li class="toc-item level-${heading.level}">
        <a class="toc-link" href="#${heading.id}">${escapeHtml(heading.text)}</a>
        <span class="toc-page-number">${pageNumber}</span>
      </li>
    `
  })

  tocHtml += '</ul>'

  return tocHtml
}

/**
 * 估算页码（简化算法）
 */
function estimatePageNumber(headings: Array<{ level: number; text: string; id: string }>, index: number): number {
  // 封面占1页，目录占1页，正文从第3页开始
  // 每个一级标题估算1页，二级三级标题在同页
  let pageCount = 3 // 从第3页开始

  for (let i = 0; i < index; i++) {
    if (headings[i].level === 1) {
      pageCount++
    }
  }

  return pageCount
}

/**
 * 去除 HTML 标签
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 获取 Markdown 样式
 */
function getMarkdownStyles(): string {
  return `
.markdown-body { line-height: 1.6; color: #1f2937; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { margin-top: 1.5em; margin-bottom: 0.75em; font-weight: 600; line-height: 1.25; color: #111827; }
.markdown-body h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: 0.875em; }
.markdown-body h6 { font-size: 0.85em; color: #6b7280; }
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
