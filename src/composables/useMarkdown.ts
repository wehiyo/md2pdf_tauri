import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import sup from 'markdown-it-sup'
import sub from 'markdown-it-sub'
import abbr from 'markdown-it-abbr'
import deflist from 'markdown-it-deflist'
import anchor from 'markdown-it-anchor'
import toc from 'markdown-it-table-of-contents'
import hljs from 'highlight.js'
import katex from 'katex'

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
  permalink: true,
  level: [1, 2, 3]
})
md.use(toc, {
  includeLevel: [1, 2, 3],
  containerClass: 'table-of-contents'
})

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

// 自定义 fence 渲染器处理 Mermaid 和代码块
const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules)
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info ? token.info.trim() : ''
  const lang = info.split(/\s+/g)[0]

  if (lang === 'mermaid') {
    return `<div class="mermaid">${token.content}</div>`
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

  return defaultFence?.(tokens, idx, options, env, self) || ''
}

// 处理行内数学公式
md.renderer.rules.text = (tokens, idx, options, env, self) => {
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

export function useMarkdown() {
  /**
   * 渲染 Markdown 为 HTML
   */
  function render(content: string): string {
    if (!content.trim()) {
      return '<div class="empty-preview">开始输入 Markdown...</div>'
    }

    try {
      return md.render(content)
    } catch (error) {
      console.error('Markdown render error:', error)
      return `<div class="render-error">渲染错误: ${String(error)}</div>`
    }
  }

  return {
    render
  }
}
