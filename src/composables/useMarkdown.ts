import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
// taskLists 插件暂时禁用
// import taskLists from 'markdown-it-task-lists'
import sup from 'markdown-it-sup'
import sub from 'markdown-it-sub'
import abbr from 'markdown-it-abbr'
import deflist from 'markdown-it-deflist'
import anchor from 'markdown-it-anchor'
// toc 插件已禁用，不再生成内嵌目录
// import toc from 'markdown-it-table-of-contents'
import hljs from 'highlight.js'
import katex from 'katex'
import { parse as parseYaml } from 'yaml'

// Metadata 类型定义
export interface Metadata {
  title?: string
  author?: string
  date?: string
  [key: string]: any
}

// 解析结果类型
export interface ParseResult {
  metadata: Metadata
  body: string
}

// 解析 YAML frontmatter
function parseFrontmatter(content: string): ParseResult {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = content.match(frontmatterRegex)

  if (match) {
    const yamlContent = match[1]
    const body = content.slice(match[0].length)

    try {
      const metadata = parseYaml(yamlContent) as Metadata
      return { metadata: metadata || {}, body }
    } catch (error) {
      console.error('YAML parse error:', error)
      return { metadata: {}, body: content }
    }
  }

  return { metadata: {}, body: content }
}

// 配置 highlight.js
const highlight = (str: string, lang?: string): string => {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(str, { language: lang }).value
    } catch (__) {}
  }
  return ''
}

// 创建 markdown-it 实例
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight
})

// 使用插件
md.use(footnote)
// 暂时禁用 task-lists 插件
// md.use(taskLists, { enabled: true })
md.use(sup)
md.use(sub)
md.use(abbr)
md.use(deflist)
// 暂时禁用 emoji 插件以避免导入问题
// md.use(emoji)
md.use(anchor, {
  permalink: false,
  level: [1, 2, 3, 4]
})
// toc 插件已禁用
// md.use(toc, {
//   includeLevel: [1, 2, 3],
//   containerClass: 'table-of-contents'
// })

// 添加 $$ 块级公式解析规则
md.block.ruler.before('fence', 'math_block', function math_block(state, startLine, endLine, silent) {
  const marker = '$$'
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]

  // 检查当前行是否以 $$ 开头
  if (pos + marker.length > max || state.src.substring(pos, pos + marker.length) !== marker) {
    return false
  }

  // 查找结束标记 $$
  let nextLine = startLine + 1
  let contentEnd = -1

  while (nextLine < endLine) {
    const linePos = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineMax = state.eMarks[nextLine]

    if (linePos < lineMax && state.src.substring(linePos, linePos + marker.length) === marker) {
      contentEnd = nextLine
      break
    }
    nextLine++
  }

  if (contentEnd < 0) {
    return false
  }

  if (!silent) {
    const token = state.push('math_block', 'div', 0)
    token.content = state.src.substring(
      state.bMarks[startLine] + state.tShift[startLine] + marker.length,
      state.bMarks[contentEnd] + state.tShift[contentEnd]
    ).trim()
    token.map = [startLine, contentEnd + 1]
  }

  state.line = contentEnd + 1
  return true
})

// 渲染 math_block
md.renderer.rules.math_block = (tokens, idx) => {
  const content = tokens[idx].content
  try {
    return katex.renderToString(content, {
      displayMode: true,
      throwOnError: false
    })
  } catch (error) {
    return `<pre class="error">${content}</pre>`
  }
}

// 自定义 fence 渲染器处理 Mermaid、PlantUML 和代码块
const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules)
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info ? token.info.trim() : ''
  const lang = info.split(/\s+/g)[0]

  if (lang === 'mermaid') {
    return `<div class="mermaid">${token.content}</div>`
  }

  // PlantUML 图表
  if (lang === 'plantuml') {
    // 编码内容避免 HTML 转义问题
    const encoded = encodeURIComponent(token.content)
    return `<div class="plantuml" data-plantuml="${encoded}">Loading PlantUML...</div>`
  }

  // 数学公式代码块
  if (lang === 'math' || lang === 'latex') {
    try {
      const rendered = katex.renderToString(token.content, {
        displayMode: true,
        throwOnError: false
      })
      return `<div class="katex-display">${rendered}</div>`
    } catch (error) {
      return `<pre class="error">${token.content}</pre>`
    }
  }

  // 代码块带行号
  const codeContent = token.content
  const lines = codeContent.split('\n')

  // 解析行号起始值，支持 linenum=100 或 linenum="100" 语法
  let startLineNum = 1
  const lineNumMatch = info.match(/linenum=(?:"(\d+)"|(\d+))/)
  if (lineNumMatch) {
    startLineNum = parseInt(lineNumMatch[1] || lineNumMatch[2], 10)
  }

  const maxLineNum = lines.length + startLineNum - 1
  const lineNumWidth = String(maxLineNum).length

  let linesHtml = ''

  if (lang && hljs.getLanguage(lang)) {
    try {
      const highlighted = hljs.highlight(codeContent, { language: lang }).value
      const lineNodes = highlighted.split('\n')

      for (let i = 0; i < lineNodes.length; i++) {
        const lineNum = startLineNum + i
        linesHtml += `<div class="code-line"><span class="line-number" data-num="${lineNum}"></span><span class="code-line-content">${lineNodes[i] || ''}</span></div>\n`
      }
    } catch (__) {
      // 高亮失败，使用普通文本
      lines.forEach((line, i) => {
        const lineNum = startLineNum + i
        linesHtml += `<div class="code-line"><span class="line-number" data-num="${lineNum}"></span><span class="code-line-content">${escapeHtml(line)}</span></div>\n`
      })
    }
  } else {
    // 无语言或语言不支持
    lines.forEach((line, i) => {
      const lineNum = startLineNum + i
      linesHtml += `<div class="code-line"><span class="line-number" data-num="${lineNum}"></span><span class="code-line-content">${escapeHtml(line)}</span></div>\n`
    })
  }

  const langClass = lang ? ` class="language-${lang}"` : ''
  return `<pre${langClass}><code${langClass}><div class="code-lines-container">${linesHtml}</div></code></pre>`
}

// 处理行内数学公式
md.renderer.rules.text = (tokens, idx, _options, _env, _self) => {
  let content = tokens[idx].content

  // 匹配 $...$ 格式的行内公式
  content = content.replace(/\$([^$]+)\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, {
        displayMode: false,
        throwOnError: false
      })
    } catch (error) {
      return match
    }
  })

  return content
}

// HTML 转义辅助函数
function escapeHtml(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 标题编号计数器（模块级别）
const headingCounters = { h2: 0, h3: 0, h4: 0 }

// 重写 heading_open 渲染规则，为 h2-h4 添加编号
md.renderer.rules.heading_open = (tokens, idx) => {
  const token = tokens[idx]
  const level = token.tag as 'h1' | 'h2' | 'h3' | 'h4'

  // 获取 id 属性
  let id = ''
  if (token.attrs) {
    for (const attr of token.attrs) {
      if (attr[0] === 'id') {
        id = attr[1]
        break
      }
    }
  }

  if (level === 'h2') {
    headingCounters.h2++
    headingCounters.h3 = 0
    headingCounters.h4 = 0
  } else if (level === 'h3') {
    headingCounters.h3++
    headingCounters.h4 = 0
  } else if (level === 'h4') {
    headingCounters.h4++
  }

  // 生成编号（仅 h2-h4）
  let number = ''
  if (level === 'h2') {
    number = `${headingCounters.h2}. `
  } else if (level === 'h3') {
    number = `${headingCounters.h2}.${headingCounters.h3}. `
  } else if (level === 'h4') {
    number = `${headingCounters.h2}.${headingCounters.h3}.${headingCounters.h4}. `
  }

  // 渲染开标签
  const idAttr = id ? ` id="${id}"` : ''
  const numberSpan = number ? `<span class="heading-number">${number}</span>` : ''
  return `<${level}${idAttr}>${numberSpan}`
}

// 重写 heading_close 渲染规则
md.renderer.rules.heading_close = (tokens, idx) => {
  return `</${tokens[idx].tag}>`
}

export function useMarkdown() {
  /**
   * 解析 Markdown 内容，提取 metadata 和 body
   */
  function parse(content: string): ParseResult {
    return parseFrontmatter(content)
  }

  /**
   * 渲染 Markdown body 为 HTML
   */
  function renderBody(body: string): string {
    if (!body.trim()) {
      return '<div class="empty-preview">开始输入 Markdown...</div>'
    }

    // 重置计数器
    headingCounters.h2 = 0
    headingCounters.h3 = 0
    headingCounters.h4 = 0

    try {
      return md.render(body)
    } catch (error) {
      console.error('Markdown render error:', error)
      return `<div class="render-error">渲染错误: ${String(error)}</div>`
    }
  }

  /**
   * 解析并渲染 Markdown，返回 metadata 和 HTML
   */
  function render(content: string): { html: string; metadata: Metadata } {
    const { metadata, body } = parseFrontmatter(content)
    const html = renderBody(body)
    return { html, metadata }
  }

  return {
    parse,
    renderBody,
    render
  }
}
