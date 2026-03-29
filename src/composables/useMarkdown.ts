import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import sup from 'markdown-it-sup'
import sub from 'markdown-it-sub'
import abbr from 'markdown-it-abbr'
import deflist from 'markdown-it-deflist'
import emoji from 'markdown-it-emoji'
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
md.use(taskLists, { enabled: true })
md.use(sup)
md.use(sub)
md.use(abbr)
md.use(deflist)
md.use(emoji)
md.use(anchor, {
  permalink: anchor.permalink.headerAnchor(),
  level: [1, 2, 3]
})
md.use(toc, {
  includeLevel: [1, 2, 3],
  containerClass: 'table-of-contents'
})

// 自定义 Mermaid 代码块渲染
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
const defaultTextRenderer = md.renderer.rules.text?.bind(md.renderer.rules)
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

  // 匹配 $$...$$ 格式的块级公式
  content = content.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, {
        displayMode: true,
        throwOnError: false
      })
    } catch (error) {
      return match
    }
  })

  tokens[idx].content = content
  return defaultTextRenderer?.(tokens, idx, options, env, self) || content
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
