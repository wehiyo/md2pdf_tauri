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
import { parse as parseYaml } from 'yaml'

// KaTeX 宏定义，支持常见的 LaTeX 命令扩展
// 参考 KaTeX 官网：% \f is defined as #1f(#2) using the macro
const KATEX_MACROS: Record<string, string> = {
  '\\f': '#1f(#2)',   // \f{#1}{#2} -> #1f(#2)
  '\\relax': '',      // \relax 不做任何事情
}

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

// 支持的 admonition 类型
const ADMONITION_TYPES = ['note', 'tip', 'warning', 'danger', 'info', 'success', 'failure', 'bug', 'example', 'quote', 'abstract', 'question', 'attention', 'hint', 'caution', 'error']

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

// 禁用 typographer 的注册商标转换，避免公式中 (r) 被错误渲染
// 保留其他排版功能（智能引号、破折号等），同时跳过公式内部
md.core.ruler.at('replacements', function replacements(state) {
  const typographerReplacements = [
    ['+-', '±'],
    ['...', '…'],
    ['--', '–'],
    ['---', '—'],
    ['(c)', '©'],
    ['(r)', '®'],
    ['(tm)', '™'],
    ['(C)', '©'],
    ['(R)', '®'],
    ['(TM)', '™']
  ]

  for (let i = 0; i < state.tokens.length; i++) {
    const block = state.tokens[i]
    if (block.type !== 'inline' || !block.children) continue

    for (let j = 0; j < block.children.length; j++) {
      const token = block.children[j]
      if (token.type !== 'text') continue

      // 跳过公式内部的内容：检查是否在 $...$ 或 \(...\) 范围内
      // 方法：临时保护公式内容，执行替换后恢复
      let content = token.content

      // 先提取并保护 $...$ 格式的公式
      const dollarFormulaRanges: { start: number; end: number; content: string }[] = []
      content = content.replace(/\$([^$]+)\$/g, (match, _formula, offset) => {
        dollarFormulaRanges.push({ start: offset, end: offset + match.length, content: match })
        return `\x00DOLLAR${dollarFormulaRanges.length - 1}\x00`
      })

      // 提取并保护 \(...\) 格式的公式
      const bracketFormulaRanges: { start: number; end: number; content: string }[] = []
      content = content.replace(/\\\([^)]+\\\)/g, (match, offset) => {
        bracketFormulaRanges.push({ start: offset, end: offset + match.length, content: match })
        return `\x00BRACKET${bracketFormulaRanges.length - 1}\x00`
      })

      // 执行 typographer 替换
      for (const [pattern, replacement] of typographerReplacements) {
        content = content.replace(pattern, replacement)
      }

      // 恢复 $...$ 公式
      content = content.replace(/\x00DOLLAR(\d+)\x00/g, (_, idx) => {
        return dollarFormulaRanges[parseInt(idx)].content
      })

      // 恢复 \(...\) 公式
      content = content.replace(/\x00BRACKET(\d+)\x00/g, (_, idx) => {
        return bracketFormulaRanges[parseInt(idx)].content
      })

      token.content = content
    }
  }
})

// 使用插件
md.use(footnote)
// 暂时禁用 task-lists 插件
// md.use(taskLists, { enabled: true })
md.use(sup)
md.use(sub)
md.use(abbr)
md.use(deflist)
md.use(emoji)
md.use(anchor, {
  permalink: false,
  level: [1, 2, 3, 4]
})
// toc 插件已禁用
// md.use(toc, {
//   includeLevel: [1, 2, 3],
//   containerClass: 'table-of-contents'
// })

// 添加 inline 规则处理 \(...\) 格式的行内公式（在 escape 规则之前）
md.inline.ruler.before('escape', 'math_inline_bracket', function math_inline_bracket(state, silent) {
  const pos = state.pos
  const max = state.posMax

  // 检查是否以 \( 开头
  if (pos + 2 > max || state.src.substring(pos, pos + 2) !== '\\(') {
    return false
  }

  // 查找结束标记 \)
  let endPos = -1
  for (let i = pos + 2; i < max - 1; i++) {
    if (state.src.substring(i, i + 2) === '\\)') {
      endPos = i
      break
    }
  }

  if (endPos < 0) {
    return false
  }

  if (!silent) {
    const content = state.src.substring(pos + 2, endPos)
    const token = state.push('math_inline_bracket', 'span', 0)
    token.content = content
    state.pos = endPos + 2
    return true
  }

  state.pos = endPos + 2
  return true
})

// 渲染 math_inline_bracket
md.renderer.rules.math_inline_bracket = (tokens, idx) => {
  const content = tokens[idx].content
  try {
    return katex.renderToString(content, {
      displayMode: false,
      throwOnError: false,
      macros: KATEX_MACROS
    })
  } catch (error) {
    return `(${content})`
  }
}

// 自定义 Admonition 解析器（支持缩进语法和结束标记语法）
md.block.ruler.before('fence', 'admonition_block', function admonition_block(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]

  // 检查是否以 !!! 开头
  if (pos + 3 > max || state.src.substring(pos, pos + 3) !== '!!!') {
    return false
  }

  // 解析类型和标题
  const params = state.src.substring(pos + 3, max).trim()
  if (!params) {
    return false
  }

  const parts = params.split(' ', 2)
  const admonitionType = parts[0].toLowerCase()

  // 检查类型是否有效
  if (!ADMONITION_TYPES.includes(admonitionType)) {
    return false
  }

  const admonitionTitle = parts.length > 1 ? parts[1] : admonitionType

  // 收集内容，同时支持两种语法
  let nextLine = startLine + 1
  const contentLines: string[] = []
  const minIndent = 4  // 最小缩进空格数
  let hasIndentedContent = false  // 是否有缩进内容（用于判断语法类型）
  let autoClosed = false  // 是否通过 !!! 结束

  while (nextLine < endLine) {
    const linePos = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineMax = state.eMarks[nextLine]
    const lineIndent = state.sCount[nextLine]

    // 检查是否为结束标记 !!!（整行只有 !!!）
    const lineText = state.src.substring(linePos, lineMax).trim()
    if (lineText === '!!!') {
      autoClosed = true
      nextLine++
      break
    }

    // 空行处理
    if (linePos >= lineMax) {
      // 如果已经有缩进内容，空行也加入
      if (hasIndentedContent) {
        contentLines.push('')
      }
      nextLine++
      continue
    }

    // 检查缩进
    if (lineIndent >= minIndent) {
      // 缩进语法：提取内容（保留相对缩进）
      hasIndentedContent = true
      const lineContent = state.src.substring(linePos, lineMax)
      contentLines.push(lineContent)
      nextLine++
    } else if (!hasIndentedContent) {
      // 非缩进语法：如果还没有缩进内容，直接加入内容行
      contentLines.push(lineText)
      nextLine++
    } else {
      // 缩进语法遇到非缩进行，结束
      break
    }
  }

  // 至少需要一行内容（或结束标记存在）
  if (contentLines.length === 0 && !autoClosed) {
    return false
  }

  if (!silent) {
    // 创建 admonition_open token
    const openToken = state.push('admonition_open', 'div', 1)
    openToken.attrPush(['class', `admonition ${admonitionType}`])
    openToken.map = [startLine, nextLine]

    // 创建标题 token
    const titleOpenToken = state.push('admonition_title_open', 'p', 1)
    titleOpenToken.attrPush(['class', 'admonition-title'])
    titleOpenToken.map = [startLine, startLine]

    const titleContentToken = state.push('inline', '', 0)
    titleContentToken.content = admonitionTitle
    titleContentToken.children = []

    state.push('admonition_title_close', 'p', -1)

    // 解析内容（递归解析 Markdown）
    const content = contentLines.join('\n')
    if (content.trim()) {
      // 创建内容容器
      const contentToken = state.push('admonition_content', 'div', 0)
      contentToken.content = content
    }

    // 创建 admonition_close token
    const closeToken = state.push('admonition_close', 'div', -1)
    closeToken.map = [startLine, nextLine]
  }

  state.line = nextLine
  return true
})

// 渲染 admonition 内容
md.renderer.rules.admonition_content = (tokens, idx) => {
  const content = tokens[idx].content
  // 递归渲染内容为 Markdown
  return md.render(content)
}

// 添加 $$ 块级公式解析规则
md.block.ruler.before('fence', 'math_block', function math_block(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]

  // 检查当前行是否以 $$ 或 \[ 开头
  const dollarMarker = '$$'
  const bracketMarker = '\\['

  let marker = ''
  let endMarker = ''

  if (pos + dollarMarker.length <= max && state.src.substring(pos, pos + dollarMarker.length) === dollarMarker) {
    marker = dollarMarker
    endMarker = dollarMarker
  } else if (pos + bracketMarker.length <= max && state.src.substring(pos, pos + bracketMarker.length) === bracketMarker) {
    marker = bracketMarker
    endMarker = '\\]'
  } else {
    return false
  }

  // 查找结束标记
  let nextLine = startLine + 1
  let contentEnd = -1

  while (nextLine < endLine) {
    const linePos = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineMax = state.eMarks[nextLine]

    if (linePos < lineMax && state.src.substring(linePos, linePos + endMarker.length) === endMarker) {
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
      throwOnError: false,
      macros: KATEX_MACROS
    })
  } catch (error) {
    return `<pre class="error">${content}</pre>`
  }
}

// 自定义 fence 渲染器处理 Mermaid、PlantUML 和代码块
md.renderer.rules.fence = (tokens, idx, _options, _env, _self) => {
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

  // WaveDrom 时序图
  if (lang === 'wavedrom') {
    return `<div class="wavedrom">${token.content}</div>`
  }

  // 数学公式代码块
  if (lang === 'math' || lang === 'latex') {
    try {
      const rendered = katex.renderToString(token.content, {
        displayMode: true,
        throwOnError: false,
        macros: KATEX_MACROS
      })
      return `<div class="katex-display">${rendered}</div>`
    } catch (error) {
      return `<pre class="error">${token.content}</pre>`
    }
  }

  // 代码块带行号
  const codeContent = token.content
  const lines = codeContent.split('\n')

  // 解析行号起始值，支持 linenum=xx 或 linenums=xx，带引号或不带引号
  // 当值为 0 时，不显示行号
  let startLineNum = 1
  let showLineNumbers = true
  const lineNumMatch = info.match(/(?:linenum|linenums)=(?:"(\d+)"|(\d+))/i)
  if (lineNumMatch) {
    startLineNum = parseInt(lineNumMatch[1] || lineNumMatch[2], 10)
    if (startLineNum === 0) {
      showLineNumbers = false
    }
  }

  // 计算最大行号并确定行号列宽度类
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
    } catch (__) {
      // 高亮失败，使用普通文本
      lines.forEach((line, i) => {
        const lineNum = startLineNum + i
        const lineNumberHtml = showLineNumbers ? `<span class="line-number" data-num="${lineNum}"></span>` : ''
        linesHtml += `<div class="code-line">${lineNumberHtml}<span class="code-line-content">${escapeHtml(line)}</span></div>\n`
      })
    }
  } else {
    // 无语言或语言不支持
    lines.forEach((line, i) => {
      const lineNum = startLineNum + i
      const lineNumberHtml = showLineNumbers ? `<span class="line-number" data-num="${lineNum}"></span>` : ''
      linesHtml += `<div class="code-line">${lineNumberHtml}<span class="code-line-content">${escapeHtml(line)}</span></div>\n`
    })
  }

  const langClass = lang ? ` class="language-${lang}"` : ''
  return `<pre${langClass}><code${langClass}><div class="code-lines-container ${widthClass}">${linesHtml}</div></code></pre>`
}

// 处理行内数学公式（支持 $...$ 格式）
md.renderer.rules.text = (tokens, idx, _options, _env, _self) => {
  let content = tokens[idx].content

  // 匹配 $...$ 格式的行内公式
  content = content.replace(/\$([^$]+)\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, {
        displayMode: false,
        throwOnError: false,
        macros: KATEX_MACROS
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

/**
 * 解析图片属性标注 {width=... align=...}
 * 支持格式：
 * - {width=300}
 * - {width="300"}
 * - {align=center/left/right}
 * - {width=300 align=center}
 * - {align=center width=300}
 */
interface ImageAttributes {
  width?: string
  align?: 'left' | 'center' | 'right'
}

function parseImageAttributes(attrString: string): ImageAttributes {
  const attrs: ImageAttributes = {}

  // 匹配 width=值（支持多种引号格式）
  // ASCII 双引号: " (\x22)
  // Unicode 左双引号: " (\u201C)
  // Unicode 右双引号: " (\u201D)
  // 先匹配带引号的格式 width="300" 或 width="300"
  // 注意：必须使用 Unicode 转义序列，不能直接使用 Unicode 字符
  const widthMatchQuoted = attrString.match(/width\s*=\s*["\u201C\u201D]([^"\u201C\u201D]*)["\u201C\u201D]/i)
  if (widthMatchQuoted) {
    attrs.width = widthMatchQuoted[1]
  } else {
    // 再匹配不带引号的格式 width=300 或 width=50%
    const widthMatchUnquoted = attrString.match(/width\s*=\s*(\d+[a-z%]*)/i)
    if (widthMatchUnquoted) {
      attrs.width = widthMatchUnquoted[1]
    }
  }

  // 匹配 align=值（支持多种引号格式）
  const alignMatchQuoted = attrString.match(/align\s*=\s*["\u201C\u201D]([^"\u201C\u201D]*)["\u201C\u201D]/i)
  if (alignMatchQuoted) {
    const alignValue = alignMatchQuoted[1].toLowerCase()
    if (alignValue === 'left' || alignValue === 'center' || alignValue === 'right') {
      attrs.align = alignValue
    }
  } else {
    const alignMatchUnquoted = attrString.match(/align\s*=\s*(\w+)/i)
    if (alignMatchUnquoted) {
      const alignValue = alignMatchUnquoted[1].toLowerCase()
      if (alignValue === 'left' || alignValue === 'center' || alignValue === 'right') {
        attrs.align = alignValue
      }
    }
  }

  return attrs
}

/**
 * 根据属性生成 img 标签的 style
 */
function buildImageStyle(attrs: ImageAttributes): string {
  const styles: string[] = []

  if (attrs.width) {
    // 如果 width 是纯数字，自动添加 px 单位
    const widthValue = /^\d+$/.test(attrs.width) ? `${attrs.width}px` : attrs.width
    styles.push(`width: ${widthValue};`)
  }

  return styles.join(' ')
}

/**
 * 根据 align 属性生成包裹标签
 * 使用 margin 实现对齐，确保在各种容器中都能正确生效
 */
function wrapImageByAlign(imgTag: string, align?: 'left' | 'center' | 'right'): string {
  if (!align) return imgTag

  // 使用 div 包裹，但通过 margin 控制对齐（比 text-align 更可靠）
  if (align === 'center') {
    return `<div style="display: flex; justify-content: center;">${imgTag}</div>`
  } else if (align === 'left') {
    return `<div style="display: flex; justify-content: flex-start;">${imgTag}</div>`
  } else if (align === 'right') {
    return `<div style="display: flex; justify-content: flex-end;">${imgTag}</div>`
  }

  return imgTag
}

// 标题编号计数器（模块级别）
const headingCounters = { h2: 0, h3: 0, h4: 0 }

// 标题 ID 映射：原始 slug -> 带编号的 ID（用于链接跳转）
const headingIdMap = new Map<string, string>()

// 将标题文本转为 slug（与 markdown-it-anchor 一致的逻辑）
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')  // 保留中文、字母、数字、连字符
}

// 重写 heading_open 渲染规则，为 h2-h4 添加编号，并将编号加入ID
md.renderer.rules.heading_open = (tokens, idx) => {
  const token = tokens[idx]
  const level = token.tag as 'h1' | 'h2' | 'h3' | 'h4'

  // 获取标题文本（下一个 inline token 的内容）
  let titleText = ''
  if (tokens[idx + 1] && tokens[idx + 1].type === 'inline') {
    titleText = tokens[idx + 1].content || ''
  }

  // 更新计数器
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
  let numberPrefix = ''
  if (level === 'h2') {
    number = `${headingCounters.h2}. `
    numberPrefix = `${headingCounters.h2}-`
  } else if (level === 'h3') {
    number = `${headingCounters.h2}.${headingCounters.h3}. `
    numberPrefix = `${headingCounters.h2}-${headingCounters.h3}-`
  } else if (level === 'h4') {
    number = `${headingCounters.h2}.${headingCounters.h3}.${headingCounters.h4}. `
    numberPrefix = `${headingCounters.h2}-${headingCounters.h3}-${headingCounters.h4}-`
  }

  // 生成带编号前缀的 ID
  const baseSlug = slugify(titleText)
  const numberedId = numberPrefix ? `${numberPrefix}${baseSlug}` : baseSlug

  // 存储映射：原始 slug -> 带编号的 ID
  if (baseSlug) {
    headingIdMap.set(baseSlug, numberedId)
  }

  // 渲染开标签
  const numberSpan = number ? `<span class="heading-number">${number}</span>` : ''
  return `<${level} id="${numberedId}">${numberSpan}`
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

    // 重置计数器和映射
    headingCounters.h2 = 0
    headingCounters.h3 = 0
    headingCounters.h4 = 0
    headingIdMap.clear()

    try {
      let html = md.render(body)

      // 后处理：处理 figure 标签（必须在图片属性处理之前）
      // 匹配 <figure markdown="span">...</figure> 并添加居中样式
      html = html.replace(/<figure\s+markdown="span">([\s\S]*?)<\/figure>/g, (_match, content) => {
        // 提取 figcaption
        let figcaption = ''
        let imgMarkdown = content

        // 检查是否有 figcaption 标签
        const figcaptionMatch = content.match(/<figcaption>([\s\S]*?)<\/figcaption>/)
        if (figcaptionMatch) {
          figcaption = figcaptionMatch[1]
          // 从原始内容中移除 figcaption
          imgMarkdown = content.replace(/<figcaption>[\s\S]*?<\/figcaption>/, '').trim()
        }

        // 移除每行前导空白，避免被解析为代码块
        imgMarkdown = imgMarkdown.split('\n').map((line: string) => line.trim()).join('\n').trim()

        // 先处理图片属性语法 {width=... align=...}，在 Markdown 源码层面替换
        imgMarkdown = imgMarkdown.replace(/!\[([^\]]*)\]\(([^)]+)\)\s*\{([^}]*)\}/g,
          (_m: string, alt: string, src: string, attrStr: string) => {
            const attrs = parseImageAttributes(attrStr)
            const style = buildImageStyle(attrs)
            const imgTag = `<img src="${src}" alt="${alt}"${style ? ` style="${style}"` : ''}>`
            return wrapImageByAlign(imgTag, attrs.align)
          }
        )

        // 渲染剩余的 Markdown
        let imgContent = md.render(imgMarkdown)

        // 移除图片周围的 <p> 标签
        imgContent = imgContent.replace(/<p>(<img[^>]*>)<\/p>/g, '$1')
        imgContent = imgContent.replace(/<p>(<div[^>]*><img[^>]*><\/div>)<\/p>/g, '$1')

        return `<figure class="figure-span">${imgContent}${figcaption ? `<figcaption>${figcaption}</figcaption>` : ''}</figure>`
      })

      // 后处理：处理普通图片属性语法 ![alt](src){width=... align=...}
      // 在 Markdown 源码渲染后的 HTML 中处理
      // 处理被 <p> 包裹的情况
      html = html.replace(/<p><img([^>]*)>\s*\{([^}]*)\}<\/p>/g,
        (_match, imgAttrs, attrStr: string) => {
          const attrs = parseImageAttributes(attrStr)
          const style = buildImageStyle(attrs)
          const imgTag = `<img${imgAttrs}${style ? ` style="${style}"` : ''}>`
          return wrapImageByAlign(imgTag, attrs.align)
        }
      )
      // 处理未被 <p> 包裹的情况
      html = html.replace(/<img([^>]*)>\s*\{([^}]*)\}/g,
        (_match, imgAttrs, attrStr: string) => {
          const attrs = parseImageAttributes(attrStr)
          const style = buildImageStyle(attrs)
          const imgTag = `<img${imgAttrs}${style ? ` style="${style}"` : ''}>`
          return wrapImageByAlign(imgTag, attrs.align)
        }
      )

      // 后处理：将锚点链接中的原始 slug 替换为带编号的 ID
      html = html.replace(/href="#([^"]+)"/g, (_match, slug) => {
        // URL 解码 slug（markdown-it-anchor 会对中文进行编码）
        const decodedSlug = decodeURIComponent(slug)
        const numberedId = headingIdMap.get(decodedSlug)
        if (numberedId) {
          return `href="#${numberedId}"`
        }
        return _match
      })

      return html
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
