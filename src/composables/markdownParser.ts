/**
 * markdown-it 实例配置与自定义解析器
 *
 * 纯解析逻辑，无标题编号状态依赖。所有自定义 parser/renderer
 * 在此注册。useMarkdown.ts 在此基础上叠加标题编号和 composable API。
 */
import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import sup from 'markdown-it-sup'
import sub from 'markdown-it-sub'
import abbr from 'markdown-it-abbr'
import deflist from 'markdown-it-deflist'
import anchor from 'markdown-it-anchor'
import { full as emoji } from 'markdown-it-emoji'
import hljs from 'highlight.js'
import katex from 'katex'

// ── KaTeX macros ─────────────────────────────────────

export const KATEX_MACROS: Record<string, string> = {
  '\\f': '#1f(#2)',
  '\\relax': '',
}

// ── Admonition types ─────────────────────────────────

export const ADMONITION_TYPES = [
  'note', 'tip', 'warning', 'danger', 'info', 'success', 'failure',
  'bug', 'example', 'quote', 'abstract', 'question', 'attention',
  'hint', 'caution', 'error'
]

// ── highlight.js ─────────────────────────────────────

const highlight = (str: string, lang?: string): string => {
  if (lang && hljs.getLanguage(lang)) {
    try { return hljs.highlight(str, { language: lang }).value } catch { /* ignore */ }
  }
  return ''
}

// ── escapeHtml ───────────────────────────────────────

export function escapeHtml(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ── MarkdownIt instance ──────────────────────────────

const md = new MarkdownIt({ html: true, linkify: true, typographer: true, highlight })
md.block.ruler.disable('code')

// ── Typographer fix (exclude trademark symbols) ─────

md.core.ruler.at('replacements', function replacements(state) {
  const typographerReplacements: [string, string][] = [
    ['+-', '±'], ['...', '…'], ['--', '–'], ['---', '—']
  ]
  for (let i = 0; i < state.tokens.length; i++) {
    const block = state.tokens[i]
    if (block.type !== 'inline' || !block.children) continue
    for (let j = 0; j < block.children.length; j++) {
      const token = block.children[j]
      if (token.type !== 'text') continue
      let content = token.content
      for (const [pattern, replacement] of typographerReplacements) {
        content = content.replace(pattern, replacement)
      }
      token.content = content
    }
  }
})

// ── Standard plugins ─────────────────────────────────

md.use(footnote)
md.use(sup)
md.use(sub)
md.use(abbr)
md.use(deflist)
md.use(emoji)
md.use(anchor, { permalink: false, level: [1, 2, 3, 4], slugify: (s: string) => s })

// ── Inline math: \(...\) ─────────────────────────────

md.inline.ruler.before('escape', 'math_inline_bracket', function math_inline_bracket(state, silent) {
  const pos = state.pos
  const max = state.posMax
  if (pos + 2 > max || state.src.substring(pos, pos + 2) !== '\\(') return false
  let endPos = -1
  for (let i = pos + 2; i < max - 1; i++) {
    if (state.src.substring(i, i + 2) === '\\)') { endPos = i; break }
  }
  if (endPos < 0) return false
  if (!silent) {
    const token = state.push('math_inline_bracket', 'span', 0)
    token.content = state.src.substring(pos + 2, endPos)
    state.pos = endPos + 2
    return true
  }
  state.pos = endPos + 2
  return true
})

md.renderer.rules.math_inline_bracket = (tokens, idx) => {
  const content = tokens[idx].content
  try {
    return katex.renderToString(content, { displayMode: false, throwOnError: false, macros: KATEX_MACROS })
  } catch { return `(${content})` }
}

// ── Admonition block parser ─────────────────────────

function parseAdmonitionParams(params: string): { type: string; title: string; showTitle: boolean } {
  const typeMatch = params.match(/^(\w+)/)
  if (!typeMatch) return { type: '', title: '', showTitle: true }
  const admonitionType = typeMatch[1].toLowerCase()
  if (!ADMONITION_TYPES.includes(admonitionType)) return { type: '', title: '', showTitle: true }

  const remaining = params.substring(typeMatch[0].length).trim()
  let title = ''
  let showTitle = true

  if (remaining) {
    const quotedTitleMatch = remaining.match(/^"([^"]*)"|^'([^']*)'/)
    if (quotedTitleMatch) {
      const quotedTitle = quotedTitleMatch[1] !== undefined ? quotedTitleMatch[1] : quotedTitleMatch[2]
      if (quotedTitle === '') { showTitle = false } else { title = quotedTitle }
    } else {
      title = remaining
    }
  } else {
    title = admonitionType
  }
  return { type: admonitionType, title, showTitle }
}

function admonition_block(state: any, startLine: number, endLine: number, silent: boolean): boolean {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  if (pos + 3 > max || state.src.substring(pos, pos + 3) !== '!!!') return false

  const params = state.src.substring(pos + 3, max).trim()
  if (!params) return false

  const { type: admonitionType, title: admonitionTitle, showTitle } = parseAdmonitionParams(params)
  if (!admonitionType) return false

  let nextLine = startLine + 1
  const contentLines: string[] = []
  const minIndent = 4
  let hasIndentedContent = false
  let autoClosed = false

  while (nextLine < endLine) {
    const linePos = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineMax = state.eMarks[nextLine]
    const lineIndent = state.sCount[nextLine]
    const lineText = state.src.substring(linePos, lineMax).trim()

    if (lineText === '!!!') { autoClosed = true; nextLine++; break }
    if (linePos >= lineMax) {
      if (hasIndentedContent) contentLines.push('')
      nextLine++; continue
    }
    if (lineIndent >= minIndent) {
      hasIndentedContent = true
      contentLines.push(state.src.substring(linePos, lineMax))
      nextLine++
    } else if (!hasIndentedContent) {
      contentLines.push(lineText)
      nextLine++
    } else {
      break
    }
  }

  if (contentLines.length === 0 && !autoClosed) return false
  if (silent) return true

  const openToken = state.push('admonition_open', 'div', 1)
  openToken.attrPush(['class', `admonition ${admonitionType}`])
  openToken.map = [startLine, nextLine]

  if (showTitle) {
    const titleOpenToken = state.push('admonition_title_open', 'p', 1)
    titleOpenToken.attrPush(['class', 'admonition-title'])
    titleOpenToken.map = [startLine, startLine]
    const titleContentToken = state.push('inline', '', 0)
    titleContentToken.content = admonitionTitle
    titleContentToken.children = []
    state.push('admonition_title_close', 'p', -1)
  }

  const content = contentLines.join('\n')
  if (content.trim()) {
    const contentToken = state.push('admonition_content', 'div', 0)
    contentToken.content = content
  }

  const closeToken = state.push('admonition_close', 'div', -1)
  closeToken.map = [startLine, nextLine]
  state.line = nextLine
  return true
}

/** 在任何 markdown-it 实例上注册 admonition block parser */
export function registerAdmonitionParser(mdInstance: MarkdownIt): void {
  mdInstance.block.ruler.before('fence', 'admonition_block', admonition_block)
  mdInstance.renderer.rules.admonition_content = (tokens, idx) => {
    return mdInstance.render(tokens[idx].content)
  }
}

// Register on main instance
registerAdmonitionParser(md)

// ── Tabbed block parser ─────────────────────────────

function tabbed_block(state: any, startLine: number, endLine: number, silent: boolean): boolean {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  if (pos + 3 > max || state.src.substring(pos, pos + 3) !== '===') return false

  const params = state.src.substring(pos + 3, max).trim()
  const titleMatch = params.match(/^"([^"]*)"|'([^']*)'/)
  if (!titleMatch) return false

  const tabTitle = titleMatch[1] || titleMatch[2]
  const tabs: { title: string; content: string[] }[] = []
  let currentTab = { title: tabTitle, content: [] as string[] }
  let nextLine = startLine + 1
  const minIndent = 4

  while (nextLine < endLine) {
    const linePos = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineMax = state.eMarks[nextLine]
    const lineIndent = state.sCount[nextLine]
    const lineText = state.src.substring(linePos, lineMax)

    if (lineText.startsWith('===')) {
      const newParams = lineText.substring(3).trim()
      const newTitleMatch = newParams.match(/^"([^"]*)"|'([^']*)'/)
      if (newTitleMatch) {
        tabs.push(currentTab)
        currentTab = { title: newTitleMatch[1] || newTitleMatch[2], content: [] }
        nextLine++; continue
      }
    }
    if (linePos >= lineMax) {
      if (currentTab.content.length > 0) currentTab.content.push('')
      nextLine++; continue
    }
    if (lineIndent >= minIndent) {
      const rawLineStart = state.bMarks[nextLine]
      let contentStart = rawLineStart
      let spacesToSkip = minIndent
      while (spacesToSkip > 0 && contentStart < lineMax) {
        if (state.src[contentStart] === ' ') { contentStart++; spacesToSkip-- }
        else if (state.src[contentStart] === '\t') { contentStart++; spacesToSkip -= 4 }
        else break
      }
      currentTab.content.push(state.src.substring(contentStart, lineMax))
      nextLine++
    } else {
      break
    }
  }

  if (currentTab.content.length > 0 || tabs.length > 0) tabs.push(currentTab)
  if (tabs.length < 2) return false
  if (silent) return true

  const openToken = state.push('tabbed_set_open', 'div', 1)
  openToken.attrPush(['class', 'tabbed-set'])
  ;(openToken as any).tabsData = tabs.map((t, i) => ({ title: t.title, index: i }))
  openToken.map = [startLine, nextLine]

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i]
    const contentToken = state.push('tabbed_content', 'div', 0)
    contentToken.content = tab.content.join('\n')
    ;(contentToken as any).tabTitle = tab.title
    ;(contentToken as any).tabIndex = i
  }

  const closeToken = state.push('tabbed_set_close', 'div', -1)
  closeToken.map = [startLine, nextLine]
  state.line = nextLine
  return true
}

export function registerTabbedParser(mdInstance: MarkdownIt): void {
  mdInstance.block.ruler.before('fence', 'tabbed_block', tabbed_block)
  mdInstance.renderer.rules.tabbed_content = (tokens, idx) => {
    const token = tokens[idx] as any
    const content = token.content
    const isActive = (token.tabIndex || 0) === 0 ? ' active' : ''
    const titleHtml = `<div class="tabbed-block-title">${token.tabTitle || ''}</div>`
    return `<div class="tabbed-block${isActive}" data-tab-index="${token.tabIndex}">${titleHtml}${mdInstance.render(content)}</div>`
  }
  mdInstance.renderer.rules.tabbed_set_open = (tokens, idx) => {
    const tabsData = ((tokens[idx] as any).tabsData || []) as { title: string; index: number }[]
    let labelsHtml = '<div class="tabbed-labels">'
    for (const tab of tabsData) {
      labelsHtml += `<button class="tabbed-label${tab.index === 0 ? ' active' : ''}" data-tab-index="${tab.index}">${tab.title}</button>`
    }
    labelsHtml += '</div>'
    return `<div class="tabbed-set">${labelsHtml}<div class="tabbed-content">`
  }
  mdInstance.renderer.rules.tabbed_set_close = () => '</div></div>'
}

registerTabbedParser(md)

// ── Math block parser ($$...$$  or \[...\]) ──────────

md.block.ruler.before('fence', 'math_block', function math_block(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  let marker = ''
  let endMarker = ''

  if (pos + 2 <= max && state.src.substring(pos, pos + 2) === '$$') {
    marker = '$$'; endMarker = '$$'
  } else if (pos + 2 <= max && state.src.substring(pos, pos + 2) === '\\[') {
    marker = '\\['; endMarker = '\\]'
  } else {
    return false
  }

  let nextLine = startLine + 1
  let contentEnd = -1
  while (nextLine < endLine) {
    const linePos = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineMax = state.eMarks[nextLine]
    if (linePos < lineMax && state.src.substring(linePos, linePos + endMarker.length) === endMarker) {
      contentEnd = nextLine; break
    }
    nextLine++
  }
  if (contentEnd < 0) return false
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

md.renderer.rules.math_block = (tokens, idx) => {
  const content = tokens[idx].content
  try {
    return katex.renderToString(content, { displayMode: true, throwOnError: false, macros: KATEX_MACROS })
  } catch { return `<pre class="error">${content}</pre>` }
}

// ── Fence renderer (mermaid, plantuml, wavedrom, math, code) ─

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const info = token.info ? token.info.trim() : ''
  const lang = info.split(/\s+/g)[0]

  if (lang === 'mermaid') {
    return `<div class="mermaid">${token.content}</div>`
  }
  if (lang === 'plantuml') {
    const encoded = encodeURIComponent(token.content)
    return `<div class="plantuml" data-plantuml="${encoded}">Loading PlantUML...</div>`
  }
  if (lang === 'wavedrom') {
    return `<div class="wavedrom">${token.content}</div>`
  }
  if (lang === 'math' || lang === 'latex') {
    try {
      const rendered = katex.renderToString(token.content, { displayMode: true, throwOnError: false, macros: KATEX_MACROS })
      return `<div class="katex-display">${rendered}</div>`
    } catch { return `<pre class="error">${token.content}</pre>` }
  }

  // Code block with line numbers
  const codeContent = token.content
  const lines = codeContent.split('\n')
  let startLineNum = 1
  let showLineNumbers = true
  const lineNumMatch = info.match(/(?:linenum|linenums)=(?:"(\d+)"|(\d+))/i)
  if (lineNumMatch) {
    startLineNum = parseInt(lineNumMatch[1] || lineNumMatch[2], 10)
    if (startLineNum === 0) showLineNumbers = false
  }
  const maxLineNum = startLineNum + lines.length - 1
  const digitCount = String(maxLineNum).length
  const widthClass = showLineNumbers ? `line-num-width-${Math.min(digitCount, 5)}` : ''

  let linesHtml = ''
  if (lang && hljs.getLanguage(lang)) {
    try {
      const highlighted = hljs.highlight(codeContent, { language: lang }).value
      const lineNodes = highlighted.split('\n')
      for (let i = 0; i < lineNodes.length; i++) {
        const lineNum = startLineNum + i
        const lineNumberHtml = showLineNumbers ? `<span class="line-number" data-num="${lineNum}"></span>` : ''
        linesHtml += `<div class="code-line">${lineNumberHtml}<span class="code-line-content">${lineNodes[i] || ''}</span></div>\n`
      }
    } catch {
      lines.forEach((line, i) => {
        const lineNum = startLineNum + i
        const lineNumberHtml = showLineNumbers ? `<span class="line-number" data-num="${lineNum}"></span>` : ''
        linesHtml += `<div class="code-line">${lineNumberHtml}<span class="code-line-content">${escapeHtml(line)}</span></div>\n`
      })
    }
  } else {
    lines.forEach((line, i) => {
      const lineNum = startLineNum + i
      const lineNumberHtml = showLineNumbers ? `<span class="line-number" data-num="${lineNum}"></span>` : ''
      linesHtml += `<div class="code-line">${lineNumberHtml}<span class="code-line-content">${escapeHtml(line)}</span></div>\n`
    })
  }

  const langClass = lang ? ` class="language-${lang}"` : ''
  return `<pre${langClass}><code${langClass}><div class="code-lines-container ${widthClass}">${linesHtml}</div></code></pre>`
}

// ── Text renderer: inline math $...$ ────────────────

md.renderer.rules.text = (tokens, idx) => {
  let content = tokens[idx].content
  content = content.replace(/\$([^$]+)\$/g, (_match, formula) => {
    try {
      return katex.renderToString(formula, { displayMode: false, throwOnError: false, macros: KATEX_MACROS })
    } catch { return _match }
  })
  return content
}

// ── Exports ────────────────────────────────────────

export { md }
export { highlight }
