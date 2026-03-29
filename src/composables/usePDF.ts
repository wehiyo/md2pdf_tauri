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

      // 生成目录数据
      const tocData = extractTOC(htmlContent)

      // 生成带页码锚点的正文
      const contentWithPageAnchors = addPageAnchors(contentWithoutToc, tocData)

      // 生成目录 HTML
      const tocHtml = generateTOCHtml(tocData)

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

    /* 基础页面设置 */
    @page {
      margin: 2cm 2.5cm 2.5cm 2.5cm;
      size: A4;
      @bottom-right {
        content: counter(page);
        font-size: 10pt;
        color: #6b7280;
      }
    }

    /* 封面页无页码 */
    @page cover {
      margin: 0;
      @bottom-right {
        content: none;
      }
    }

    /* 目录页无页码 */
    @page toc {
      margin: 2cm 2.5cm 2.5cm 2.5cm;
      @bottom-right {
        content: none;
      }
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
      page: cover;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      text-align: center;
      padding: 2cm;
      box-sizing: border-box;
    }

    .cover-page h1 {
      font-size: 2.5em;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 0.5em 0;
      line-height: 1.3;
      border: none;
    }

    .cover-page .subtitle {
      font-size: 1.2em;
      color: #6b7280;
    }

    .cover-page .meta {
      margin-top: 3em;
      font-size: 1em;
      color: #9ca3af;
    }

    /* 目录页 */
    .toc-page {
      page: toc;
      page-break-before: always;
      page-break-after: always;
      padding: 0;
    }

    .toc-page h2 {
      font-size: 1.8em;
      text-align: center;
      margin: 0 0 2em 0;
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
      margin-bottom: 0.6em;
      line-height: 1.4;
    }

    .toc-link {
      display: flex;
      align-items: baseline;
      flex: 1;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .toc-link:hover {
      color: inherit;
    }

    .toc-link:hover .toc-text {
      color: #3b82f6;
    }

    .toc-link:hover .toc-dots {
      border-bottom-color: #3b82f6;
    }

    .toc-link:active {
      color: inherit;
    }

    .toc-item.level-1 {
      font-weight: 600;
      font-size: 1.1em;
      margin-top: 0.8em;
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

    .toc-text {
      flex: 1;
    }

    .toc-dots {
      flex: 1;
      border-bottom: 1px dotted #d1d5db;
      margin: 0 0.3em;
      min-width: 1em;
    }

    .toc-page-number {
      color: #6b7280;
      min-width: 2em;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* 正文 */
    .main-content {
      page-break-before: always;
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
    <div class="meta">${new Date().toLocaleDateString('zh-CN')}</div>
  </div>

  <!-- 目录 -->
  <div class="toc-page">
    <h2>目 录</h2>
    ${tocHtml}
  </div>

  <!-- 正文 -->
  <div class="main-content markdown-body">
    ${contentWithPageAnchors}
  </div>

  <script>
    // 打印前计算目录页码
    function updateTOCPageNumbers() {
      const tocLinks = document.querySelectorAll('.toc-link');
      const mainContent = document.querySelector('.main-content');

      if (!mainContent) return;

      // A4 页面可打印区域高度（约 257mm = 970px at 96dpi，减去边距）
      const pageHeight = 970;
      const contentTop = mainContent.getBoundingClientRect().top + window.scrollY;

      tocLinks.forEach((link) => {
        const href = link.getAttribute('href');
        if (!href) return;

        const targetId = href.substring(1);
        const target = document.getElementById(targetId);
        const pageNumEl = link.querySelector('.toc-page-number');

        if (target && pageNumEl) {
          const targetTop = target.getBoundingClientRect().top + window.scrollY;
          // 计算相对于正文开始位置的距离
          const relativeTop = targetTop - contentTop;
          // 计算页码（从第 1 页开始）
          const pageNumber = Math.floor(relativeTop / pageHeight) + 1;
          pageNumEl.textContent = Math.max(1, pageNumber);
        }
      });
    }

    // 页面加载完成后更新页码
    window.addEventListener('load', () => {
      // 等待 Mermaid 和 KaTeX 渲染完成
      setTimeout(updateTOCPageNumbers, 2000);
    });
    // 额外延迟确保布局稳定
    setTimeout(updateTOCPageNumbers, 3000);
  <\/script>
</body>
</html>`

      // 写入 iframe
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (iframeDoc) {
        iframeDoc.open()
        iframeDoc.write(fullHtml)
        iframeDoc.close()

        // 等待资源加载和 JavaScript 计算页码
        await new Promise(resolve => setTimeout(resolve, 3500))

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
        }, 3000)
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
 * 提取目录数据
 */
function extractTOC(htmlContent: string): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = []

  // 按顺序匹配所有标题标签
  const headingRegex = /<h([123])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h\1>/g
  let match

  while ((match = headingRegex.exec(htmlContent)) !== null) {
    const level = parseInt(match[1])
    const id = match[2]
    const text = stripHtml(match[3])

    // 跳过目录本身的标题
    if (id && !id.includes('toc') && !id.includes('contents')) {
      headings.push({ level, text, id })
    }
  }

  return headings
}

/**
 * 为内容添加分页锚点
 */
function addPageAnchors(htmlContent: string, tocData: Array<{ level: number; text: string; id: string }>): string {
  let result = htmlContent

  // 为每个 h1 标题添加分页标记
  tocData.forEach((heading, index) => {
    if (heading.level === 1) {
      const h1Regex = new RegExp(`<h1[^>]*id="${heading.id}"[^>]*>`, 'g')
      // 除了第一个 h1（它已经在目录页之后），其他 h1 前添加分页
      if (index > 0) {
        result = result.replace(h1Regex, `<div style="page-break-before: always;"></div><h1 id="${heading.id}">`)
      }
    }
  })

  return result
}

/**
 * 生成目录 HTML
 */
function generateTOCHtml(headings: Array<{ level: number; text: string; id: string }>): string {
  if (headings.length === 0) {
    return '<p style="text-align: center; color: #9ca3af;">无目录</p>'
  }

  let html = '<ul class="toc-list">'

  headings.forEach((heading) => {
    const displayText = escapeHtml(heading.text)
    const anchorRef = `#${heading.id}`

    html += `
      <li class="toc-item level-${heading.level}">
        <a href="${anchorRef}" class="toc-link">
          <span class="toc-text">${displayText}</span>
          <span class="toc-dots"></span>
          <span class="toc-page-number"></span>
        </a>
      </li>
    `
  })

  html += '</ul>'

  return html
}

/**
 * 去除 HTML 标签
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
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
