/**
 * Markdown 渲染 composable
 *
 * 在 markdownParser.ts 的 md 实例上叠加标题编号、图片属性后处理、
 * frontmatter 解析和面向消费者的 API（render, renderBody 等）。
 */
import { parse as parseYaml } from 'yaml'
import MarkdownIt from 'markdown-it'
import { md, registerAdmonitionParser, registerTabbedParser } from './markdownParser'

// ── Types ──────────────────────────────────────────

export interface Metadata {
  title?: string
  author?: string
  date?: string
  coverTitle?: string
  coverSubtitle?: string
  copyright?: string
  [key: string]: any
}

export interface ParseResult {
  metadata: Metadata
  body: string
}

// ── Frontmatter parsing ─────────────────────────────

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

function parseFrontmatterWithLineCount(content: string): ParseResult & { frontmatterLineCount: number } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = content.match(frontmatterRegex)
  if (match) {
    const yamlContent = match[1]
    const body = content.slice(match[0].length)
    const frontmatterLineCount = match[0].split('\n').length - 1
    try {
      const metadata = parseYaml(yamlContent) as Metadata
      return { metadata: metadata || {}, body, frontmatterLineCount }
    } catch (error) {
      console.error('YAML parse error:', error)
      return { metadata: {}, body: content, frontmatterLineCount: 0 }
    }
  }
  return { metadata: {}, body: content, frontmatterLineCount: 0 }
}

// ── Image attributes ───────────────────────────────

interface ImageAttributes {
  width?: string
  align?: 'left' | 'center' | 'right'
}

function parseImageAttributes(attrString: string): ImageAttributes {
  const attrs: ImageAttributes = {}
  const widthMatchQuoted = attrString.match(/width\s*=\s*["“”]([^"“”]*)["“”]/i)
  if (widthMatchQuoted) {
    attrs.width = widthMatchQuoted[1]
  } else {
    const widthMatchUnquoted = attrString.match(/width\s*=\s*(\d+[a-z%]*)/i)
    if (widthMatchUnquoted) attrs.width = widthMatchUnquoted[1]
  }
  const alignMatchQuoted = attrString.match(/align\s*=\s*["“”]([^"“”]*)["“”]/i)
  if (alignMatchQuoted) {
    const v = alignMatchQuoted[1].toLowerCase()
    if (v === 'left' || v === 'center' || v === 'right') attrs.align = v
  } else {
    const alignMatchUnquoted = attrString.match(/align\s*=\s*(\w+)/i)
    if (alignMatchUnquoted) {
      const v = alignMatchUnquoted[1].toLowerCase()
      if (v === 'left' || v === 'center' || v === 'right') attrs.align = v
    }
  }
  return attrs
}

function buildImageStyle(attrs: ImageAttributes): string {
  if (!attrs.width) return ''
  const w = /^\d+$/.test(attrs.width) ? `${attrs.width}px` : attrs.width
  return `width: ${w};`
}

function wrapImageByAlign(imgTag: string, align?: 'left' | 'center' | 'right'): string {
  if (!align) return imgTag
  if (align === 'center') return `<div style="display: block; text-align: center;">${imgTag}</div>`
  if (align === 'left')  return `<div class="img-float-left">${imgTag}</div>`
  if (align === 'right') return `<div class="img-float-right">${imgTag}</div>`
  return imgTag
}

// ── Slugify ────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w一-龥-]/g, '')
}

export function slugifyForMkdocs(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w一-龥-]/g, '')
}

// ── Heading state (module-level) ───────────────────

const headingCounters = { h2: 0, h3: 0, h4: 0 }
const headingIdMap = new Map<string, string>()
const headingLineMap = new Map<string, number>()
let frontmatterLineOffset = 0

let externalNumberPrefix = ''
let externalNavLevel = 0
let isMkdocsExportMode = false
let globalHeadingIndex = 0
const chapterCounters = { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }
let lastAdjustedLevel = 0
let showHeadingNumbers = true

// ── Global heading index (for MkDocs export) ───────

export function resetGlobalHeadingIndex(): void { globalHeadingIndex = 0 }
export function getGlobalHeadingIndex(): number { return globalHeadingIndex }
export function incrementGlobalHeadingIndex(): void { globalHeadingIndex++ }
export function setShowHeadingNumbers(val: boolean): void { showHeadingNumbers = val }

// ── Post-processing helpers ────────────────────────

/** Figure + image-attribute post-processing, shared by renderBody and renderWithNumberPrefix */
function applyImagePostProcessing(html: string): string {
  html = html.replace(/<figure\s+markdown="span">([\s\S]*?)<\/figure>/g, (_match, content) => {
    let figcaption = ''
    let imgMarkdown = content
    const figcaptionMatch = content.match(/<figcaption>([\s\S]*?)<\/figcaption>/)
    if (figcaptionMatch) {
      figcaption = figcaptionMatch[1]
      imgMarkdown = content.replace(/<figcaption>[\s\S]*?<\/figcaption>/, '').trim()
    }
    imgMarkdown = imgMarkdown.split('\n').map((l: string) => l.trim()).join('\n').trim()
    imgMarkdown = imgMarkdown.replace(/!\[([^\]]*)\]\(([^)]+)\)\s*\{([^}]*)\}/g,
      (_m: string, alt: string, src: string, attrStr: string) => {
        const attrs = parseImageAttributes(attrStr)
        const style = buildImageStyle(attrs)
        return wrapImageByAlign(`<img src="${src}" alt="${alt}"${style ? ` style="${style}"` : ''}>`, attrs.align)
      }
    )
    let imgContent = md.render(imgMarkdown)
    imgContent = imgContent.replace(/<p>(<img[^>]*>)<\/p>/g, '$1')
    imgContent = imgContent.replace(/<p>(<div[^>]*><img[^>]*><\/div>)<\/p>/g, '$1')
    return `<figure class="figure-span">${imgContent}${figcaption ? `<figcaption>${figcaption}</figcaption>` : ''}</figure>`
  })

  html = html.replace(/<p><img([^>]*)>\s*\{([^}]*)\}<\/p>/g, (_m, imgAttrs: string, attrStr: string) => {
    const attrs = parseImageAttributes(attrStr)
    const style = buildImageStyle(attrs)
    return wrapImageByAlign(`<img${imgAttrs}${style ? ` style="${style}"` : ''}>`, attrs.align)
  })
  html = html.replace(/<img([^>]*)>\s*\{([^}]*)\}/g, (_m, imgAttrs: string, attrStr: string) => {
    const attrs = parseImageAttributes(attrStr)
    const style = buildImageStyle(attrs)
    return wrapImageByAlign(`<img${imgAttrs}${style ? ` style="${style}"` : ''}>`, attrs.align)
  })

  // Replace anchor links with numbered IDs
  html = html.replace(/href="#([^"]+)"/g, (_match, slug) => {
    const decodedSlug = decodeURIComponent(slug)
    const numberedId = headingIdMap.get(decodedSlug)
    return numberedId ? `href="#${numberedId}"` : _match
  })

  return html
}

// ── Heading deflist parser ─────────────────────────
// Uses registerAdmonitionParser from markdownParser to avoid code duplication

md.block.ruler.before('heading', 'heading_deflist', function heading_deflist(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  if (pos >= max || state.src.charCodeAt(pos) !== 0x23) return false

  let level = 0
  let p = pos
  while (p < max && state.src.charCodeAt(p) === 0x23) { level++; p++ }
  if (level < 1 || level > 6) return false
  while (p < max && state.src.charCodeAt(p) === 0x20) { p++ }

  const titleText = state.src.substring(p, max).trim()
  if (!titleText) return false

  const nextLine = startLine + 1
  if (nextLine >= endLine) return false
  const nextPos = state.bMarks[nextLine] + state.tShift[nextLine]
  const nextMax = state.eMarks[nextLine]
  if (nextPos >= nextMax || state.src.charCodeAt(nextPos) !== 0x3A) return false
  let defPos = nextPos + 1
  if (defPos < nextMax) {
    const c = state.src.charCodeAt(defPos)
    if (c !== 0x20 && c !== 0x09) return false
  }
  if (silent) return true

  let defIndent = 0
  let indentPos = defPos
  while (indentPos < nextMax && state.src.charCodeAt(indentPos) === 0x20) { defIndent++; indentPos++ }
  if (defIndent === 0 && indentPos < nextMax && state.src.charCodeAt(indentPos) !== 0x0A) defIndent = 1

  const defLines: string[] = []
  let firstLineStart = defPos
  while (firstLineStart < nextMax && state.src.charCodeAt(firstLineStart) === 0x20) firstLineStart++
  defLines.push(state.src.substring(firstLineStart, nextMax))

  let currentLine = nextLine + 1
  while (currentLine < endLine) {
    const lineOrigStart = state.bMarks[currentLine]
    const lineStart = lineOrigStart + state.tShift[currentLine]
    const lineEnd = state.eMarks[currentLine]
    if (lineStart >= lineEnd) { defLines.push(''); currentLine++; continue }
    const lineIndent = state.tShift[currentLine]
    if (lineIndent >= defIndent) {
      const contentStart = lineOrigStart + defIndent
      defLines.push(state.src.substring(contentStart, lineEnd))
      currentLine++
    } else {
      break
    }
  }

  const defText = defLines.join('\n')

  // Use a sub-md instance (reuses admonition parser from markdownParser)
  const defMd = new MarkdownIt({ html: true, linkify: true, typographer: true, highlight: (_s: string, _l?: string) => '' })
  defMd.block.ruler.disable('code')
  registerAdmonitionParser(defMd)
  registerTabbedParser(defMd)

  const defHtml = defMd.render(defText)

  const token = state.push('heading_deflist_block', '', 0)
  token.content = JSON.stringify({ level, titleText, defHtml })
  token.map = [startLine, currentLine]
  state.line = currentLine
  return true
})

// ── Heading deflist renderer ───────────────────────

md.renderer.rules.heading_deflist_block = (tokens, idx) => {
  const token = tokens[idx]
  const data = JSON.parse(token.content)
  const originalLevel = data.level as number
  const titleText = data.titleText as string
  const defHtml = data.defHtml as string

  if (isMkdocsExportMode) {
    let adjustedLevel = originalLevel
    if (originalLevel >= 2) adjustedLevel = Math.min(externalNavLevel + originalLevel, 6)
    let number = ''
    let numberPrefixForId = ''

    if (originalLevel >= 2 && originalLevel <= 6) {
      if (originalLevel === 2) { chapterCounters.h2++; chapterCounters.h3 = 0; chapterCounters.h4 = 0; chapterCounters.h5 = 0; chapterCounters.h6 = 0 }
      else if (originalLevel === 3) { chapterCounters.h3++; chapterCounters.h4 = 0; chapterCounters.h5 = 0; chapterCounters.h6 = 0 }
      else if (originalLevel === 4) { chapterCounters.h4++; chapterCounters.h5 = 0; chapterCounters.h6 = 0 }
      else if (originalLevel === 5) { chapterCounters.h5++; chapterCounters.h6 = 0 }
      else if (originalLevel === 6) { chapterCounters.h6++ }

      const prefixParts = externalNumberPrefix.replace(/\.$/, '').split('.')
      if (originalLevel === 2) { if (adjustedLevel <= 4) number = `${externalNumberPrefix}${chapterCounters.h2}. `; numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' }
      else if (originalLevel === 3) { if (adjustedLevel <= 4) number = `${externalNumberPrefix}${chapterCounters.h2}.${chapterCounters.h3}. `; numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' + chapterCounters.h3 + '-' }
      else if (originalLevel === 4) { if (adjustedLevel <= 4) number = `${externalNumberPrefix}${chapterCounters.h2}.${chapterCounters.h3}.${chapterCounters.h4}. `; numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' + chapterCounters.h3 + '-' + chapterCounters.h4 + '-' }
      else if (originalLevel === 5) numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' + chapterCounters.h3 + '-' + chapterCounters.h4 + '-' + chapterCounters.h5 + '-'
      else if (originalLevel === 6) numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' + chapterCounters.h3 + '-' + chapterCounters.h4 + '-' + chapterCounters.h5 + '-' + chapterCounters.h6 + '-'
    }

    const baseSlug = slugifyForMkdocs(titleText)
    const headingId = numberPrefixForId ? `${numberPrefixForId}${baseSlug}` : baseSlug
    const headingContent = titleText
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
    const numberSpan = (number && showHeadingNumbers) ? `<span class="heading-number">${number}</span>` : ''
    return `<h${adjustedLevel} id="${headingId}">${numberSpan}${headingContent}</h${adjustedLevel}><dd>${defHtml}</dd>`
  } else {
    const level = originalLevel
    let number = ''
    let numberPrefix = ''
    if (level === 2) { headingCounters.h2++; headingCounters.h3 = 0; headingCounters.h4 = 0; number = `${headingCounters.h2}. `; numberPrefix = `${headingCounters.h2}-` }
    else if (level === 3) { headingCounters.h3++; headingCounters.h4 = 0; number = `${headingCounters.h2}.${headingCounters.h3}. `; numberPrefix = `${headingCounters.h2}-${headingCounters.h3}-` }
    else if (level === 4) { headingCounters.h4++; number = `${headingCounters.h2}.${headingCounters.h3}.${headingCounters.h4}. `; numberPrefix = `${headingCounters.h2}-${headingCounters.h3}-${headingCounters.h4}-` }

    const baseSlug = slugify(titleText)
    const headingId = numberPrefix ? `${numberPrefix}${baseSlug}` : baseSlug
    if (baseSlug) headingIdMap.set(baseSlug, headingId)

    const headingContent = titleText
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
    const numberSpan = (number && showHeadingNumbers) ? `<span class="heading-number">${number}</span>` : ''
    return `<h${level} id="${headingId}">${numberSpan}${headingContent}</h${level}><dd>${defHtml}</dd>`
  }
}

// ── Heading open/close renderers ───────────────────

md.renderer.rules.heading_open = (tokens, idx) => {
  const token = tokens[idx]
  const originalLevel = parseInt(token.tag.substring(1))
  let titleText = ''
  if (tokens[idx + 1]?.type === 'inline') titleText = tokens[idx + 1].content || ''

  if (isMkdocsExportMode) {
    let adjustedLevel = originalLevel
    if (originalLevel >= 2) adjustedLevel = Math.min(externalNavLevel + originalLevel, 6)
    let number = ''
    let numberPrefixForId = ''

    if (originalLevel >= 2 && originalLevel <= 6) {
      if (originalLevel === 2) { chapterCounters.h2++; chapterCounters.h3 = 0; chapterCounters.h4 = 0; chapterCounters.h5 = 0; chapterCounters.h6 = 0 }
      else if (originalLevel === 3) { chapterCounters.h3++; chapterCounters.h4 = 0; chapterCounters.h5 = 0; chapterCounters.h6 = 0 }
      else if (originalLevel === 4) { chapterCounters.h4++; chapterCounters.h5 = 0; chapterCounters.h6 = 0 }
      else if (originalLevel === 5) { chapterCounters.h5++; chapterCounters.h6 = 0 }
      else if (originalLevel === 6) { chapterCounters.h6++ }

      const prefixParts = externalNumberPrefix.replace(/\.$/, '').split('.')
      if (originalLevel === 2) { if (adjustedLevel <= 4) number = `${externalNumberPrefix}${chapterCounters.h2}. `; numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' }
      else if (originalLevel === 3) { if (adjustedLevel <= 4) number = `${externalNumberPrefix}${chapterCounters.h2}.${chapterCounters.h3}. `; numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' + chapterCounters.h3 + '-' }
      else if (originalLevel === 4) { if (adjustedLevel <= 4) number = `${externalNumberPrefix}${chapterCounters.h2}.${chapterCounters.h3}.${chapterCounters.h4}. `; numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' + chapterCounters.h3 + '-' + chapterCounters.h4 + '-' }
      else if (originalLevel === 5) numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' + chapterCounters.h3 + '-' + chapterCounters.h4 + '-' + chapterCounters.h5 + '-'
      else if (originalLevel === 6) numberPrefixForId = prefixParts.join('-') + '-' + chapterCounters.h2 + '-' + chapterCounters.h3 + '-' + chapterCounters.h4 + '-' + chapterCounters.h5 + '-' + chapterCounters.h6 + '-'
    }

    const baseSlug = slugifyForMkdocs(titleText)
    const adjustedId = numberPrefixForId ? `${numberPrefixForId}${baseSlug}` : baseSlug
    const adjustedTag = `h${adjustedLevel}`
    lastAdjustedLevel = adjustedLevel
    const numberSpan = (number && showHeadingNumbers) ? `<span class="heading-number">${number}</span>` : ''
    return `<${adjustedTag} id="${adjustedId}">${numberSpan}`
  } else {
    const level = token.tag as 'h1' | 'h2' | 'h3' | 'h4'
    lastAdjustedLevel = parseInt(level.substring(1))
    if (level === 'h2') { headingCounters.h2++; headingCounters.h3 = 0; headingCounters.h4 = 0 }
    else if (level === 'h3') { headingCounters.h3++; headingCounters.h4 = 0 }
    else if (level === 'h4') { headingCounters.h4++ }

    let number = ''
    let numberPrefix = ''
    if (level === 'h2') { number = `${headingCounters.h2}. `; numberPrefix = `${headingCounters.h2}-` }
    else if (level === 'h3') { number = `${headingCounters.h2}.${headingCounters.h3}. `; numberPrefix = `${headingCounters.h2}-${headingCounters.h3}-` }
    else if (level === 'h4') { number = `${headingCounters.h2}.${headingCounters.h3}.${headingCounters.h4}. `; numberPrefix = `${headingCounters.h2}-${headingCounters.h3}-${headingCounters.h4}-` }

    const baseSlug = slugify(titleText)
    const numberedId = numberPrefix ? `${numberPrefix}${baseSlug}` : baseSlug
    if (baseSlug) headingIdMap.set(baseSlug, numberedId)

    const line = token.map ? token.map[0] + frontmatterLineOffset : frontmatterLineOffset
    headingLineMap.set(numberedId, line)

    const numberSpan = (number && showHeadingNumbers) ? `<span class="heading-number">${number}</span>` : ''
    return `<${level} id="${numberedId}">${numberSpan}`
  }
}

md.renderer.rules.heading_close = (tokens, idx) => {
  if (externalNumberPrefix !== '' && lastAdjustedLevel > 0) return `</h${lastAdjustedLevel}>`
  return `</${tokens[idx].tag}>`
}

// ── Composable ─────────────────────────────────────

export function useMarkdown() {
  function parse(content: string): ParseResult {
    return parseFrontmatter(content)
  }

  function renderBody(body: string): string {
    if (!body.trim()) return '<div class="empty-preview">开始输入 Markdown...</div>'
    headingCounters.h2 = 0; headingCounters.h3 = 0; headingCounters.h4 = 0
    headingIdMap.clear()
    headingLineMap.clear()
    try {
      return applyImagePostProcessing(md.render(body))
    } catch (error) {
      console.error('Markdown render error:', error)
      return `<div class="render-error">渲染错误: ${String(error)}</div>`
    }
  }

  function render(content: string): { html: string; metadata: Metadata } {
    const { metadata, body, frontmatterLineCount } = parseFrontmatterWithLineCount(content)
    frontmatterLineOffset = frontmatterLineCount
    const html = renderBody(body)
    frontmatterLineOffset = 0
    return { html, metadata }
  }

  function renderWithNumberPrefix(body: string, numberPrefix: string, navLevel: number): string {
    if (!body.trim()) return ''
    externalNumberPrefix = numberPrefix
    externalNavLevel = navLevel
    isMkdocsExportMode = true
    chapterCounters.h2 = 0; chapterCounters.h3 = 0; chapterCounters.h4 = 0
    chapterCounters.h5 = 0; chapterCounters.h6 = 0; lastAdjustedLevel = 0
    try {
      return applyImagePostProcessing(md.render(body))
    } catch (error) {
      console.error('Markdown render error:', error)
      return `<div class="render-error">渲染错误: ${String(error)}</div>`
    } finally {
      externalNumberPrefix = ''
      externalNavLevel = 0
      isMkdocsExportMode = false
      lastAdjustedLevel = 0
    }
  }

  function renderContentSkipH1(body: string, numberPrefix: string, navLevel: number): string {
    if (!body.trim()) return ''
    const bodyWithoutH1 = body.replace(/^#\s+.+$\n?/gm, '').trim()
    return renderWithNumberPrefix(bodyWithoutH1, numberPrefix, navLevel)
  }

  function getHeadingLine(id: string): number | undefined {
    return headingLineMap.get(id)
  }

  return { parse, renderBody, render, renderWithNumberPrefix, renderContentSkipH1, getHeadingLine, md }
}
