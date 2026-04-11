import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useMarkdown, resetGlobalHeadingIndex, getGlobalHeadingIndex, incrementGlobalHeadingIndex } from './useMarkdown'
import type MarkdownIt from 'markdown-it'

// 导出给其他模块使用
export interface NavChapter {
  title: string          // 章节标题（来自 nav）
  navLevel: number       // nav 层级深度 (0, 1, 2, 3...)
  filePath: string       // md 文件路径
  content?: string       // 读取后的内容
  headings?: Heading[]   // 提取的标题列表
  numberPrefix: string   // 编号前缀（如 "1.2."）
  chapterNumber: string  // 章节编号（如 "1"、"1.1"、"1.1.1"）
  htmlId?: string        // HTML 标题元素的 id（用于书签跳转）
}

export interface Heading {
  level: number          // 原始级别 (1-6)
  text: string
  id: string
  adjustedLevel: number  // 调整后的级别
  adjustedNumber: string // 调整后的编号
  adjustedId: string     // 调整后的 ID（带编号前缀）
}

export interface BookmarkTreeNode {
  id: string
  title: string           // nav 标题或 md 内标题
  level: number           // 显示层级（用于树缩进）
  navLevel: number        // nav 层级（用于分页判断）
  filePath?: string       // 来源文件路径
  originalHeadingLevel?: number  // md 内原始标题级别
  children?: BookmarkTreeNode[]  // 子标题（md 内 h2-h6）
}

// MdFile 类型（与 App.vue 一致）
interface MdFile {
  name: string
  path?: string
  children?: MdFile[]
  isFolder?: boolean
}

// 编号计数器（模块级别，用于跨章节编号）
let chapterCounter = 0
let subChapterCounter = 0
let subSubChapterCounter = 0
let subSubSubCounter = 0

/**
 * 重置编号计数器
 */
export function resetChapterCounters() {
  chapterCounter = 0
  subChapterCounter = 0
  subSubChapterCounter = 0
  subSubSubCounter = 0
}

/**
 * 递归遍历 nav 结构，生成章节列表
 * @param nav MdFile 数组（来自 extractMdFilesFromNav）
 * @param basePath docs 目录路径
 * @param level 当前 nav 层级深度（0 = 第 1 层，不编号；1 = 第 2 层，开始编号）
 * @param parentNumber 父级编号（如 "1"、"1.1"，不含结尾点）
 */
export function collectNavChapters(
  nav: MdFile[],
  basePath: string,
  level: number = 0,
  parentNumber: string = ''
): NavChapter[] {
  const chapters: NavChapter[] = []

  for (const item of nav) {
    // 计算当前章节编号
    // level 0 不编号，level 1 开始编号
    let chapterNumber = ''
    let numberPrefix = ''  // 用于 md 内标题编号（结尾带点）

    if (level === 0) {
      // nav 第 1 层：不显示编号
      chapterNumber = ''
      numberPrefix = ''  // md 内标题也不带前缀
      // 但仍然计数，为下一层准备
      chapterCounter++
      // 重置子层计数器
      subChapterCounter = 0
      subSubChapterCounter = 0
      subSubSubCounter = 0
    } else if (level === 1) {
      // nav 第 2 层：编号 1, 2, 3...（基于 level 0 的计数）
      subChapterCounter++
      chapterNumber = `${subChapterCounter}`
      numberPrefix = `${chapterNumber}.`
      subSubChapterCounter = 0
      subSubSubCounter = 0
    } else if (level === 2) {
      // nav 第 3 层：编号 1.1, 1.2...
      subSubChapterCounter++
      chapterNumber = `${parentNumber}.${subSubChapterCounter}`
      numberPrefix = `${chapterNumber}.`
      subSubSubCounter = 0
    } else {
      // nav 第 4 层及以上
      subSubSubCounter++
      chapterNumber = `${parentNumber}.${subSubSubCounter}`
      numberPrefix = `${chapterNumber}.`
    }

    if (item.isFolder && item.children) {
      // 嵌套导航：文件夹节点本身作为章节
      chapters.push({
        title: item.name,
        navLevel: level,
        filePath: '',
        numberPrefix,
        chapterNumber,
        headings: []
      })

      // 递归处理子节点
      // 对于 level 0，父编号使用 chapterCounter（即使不显示编号）
      const nextParentNumber = level === 0 ? `${chapterCounter}` : chapterNumber
      const childChapters = collectNavChapters(item.children, basePath, level + 1, nextParentNumber)
      chapters.push(...childChapters)

    } else if (item.path) {
      // 文件条目
      chapters.push({
        title: item.name,
        navLevel: level,
        filePath: item.path,
        numberPrefix,
        chapterNumber,
        headings: []
      })
    }
  }

  return chapters
}

/**
 * 异步读取所有 md 文件内容
 */
export async function loadAllMdFiles(chapters: NavChapter[]): Promise<void> {
  for (const chapter of chapters) {
    if (chapter.filePath) {
      try {
        const [text, _encoding] = await invoke<[string, string]>('read_file_with_encoding', {
          path: chapter.filePath
        })
        // 规范化换行符
        chapter.content = text.replace(/\r\n/g, '\n')
      } catch (error) {
        console.warn(`无法读取文件 ${chapter.filePath}:`, error)
        chapter.content = ''
      }
    }
  }
}

/**
 * 调整标题层级
 * h1 保持不变，h2+ 下降 navLevel 层
 */
function adjustHeadingLevel(originalLevel: number, navLevel: number): number {
  if (originalLevel === 1) return 1
  // 下降 navLevel 层，但不超过 6
  return Math.min(originalLevel + navLevel, 6)
}

/**
 * 从 Markdown 内容提取标题（使用与渲染相同的 md 实例解析）
 * @param content Markdown 内容
 * @param md markdown-it 实例（与渲染时使用的相同）
 */
function extractHeadingsFromMd(content: string, md: MarkdownIt): { text: string; level: number }[] {
  const headings: { text: string; level: number }[] = []

  // 使用传入的 md 实例解析，确保与渲染时使用相同的配置和规则
  const tokens = md.parse(content, {})

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') {
      const level = parseInt(tokens[i].tag.substring(1))
      // 下一个 inline token 包含标题的纯文本内容
      if (tokens[i + 1] && tokens[i + 1].type === 'inline') {
        const text = tokens[i + 1].content || ''
        headings.push({ text, level })
      }
    }
  }

  return headings
}

/**
 * 生成 slug（与 markdown-it-anchor 一致的逻辑）
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
}

/**
 * 根据章节层级重新计算标题编号和层级
 * 同时生成书签树节点（按 nav 层级嵌套）
 */
export function renumberHeadings(chapters: NavChapter[]): BookmarkTreeNode[] {
  const bookmarkTree: BookmarkTreeNode[] = []

  // 重置全局标题索引计数器
  resetGlobalHeadingIndex()

  // 当前章节计数器（用于跨章节编号）
  const counters = { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }

  // 当前 nav 第 1 层章节索引
  let currentH1Index = 0
  let currentH2Index = 0
  let currentH3Index = 0

  // 层级栈：用于构建嵌套的书签树
  // 栈顶是当前层级的父节点数组（用于添加子节点）
  const levelStack: { level: number; children: BookmarkTreeNode[] }[] = [
    { level: -1, children: bookmarkTree }  // 根节点，level -1 表示最顶层
  ]

  for (const chapter of chapters) {
    // 解析 frontmatter 提取 body（如果有文件）
    let rawHeadings: { text: string; level: number }[] = []
    if (chapter.filePath && chapter.content) {
      const { parse, md } = useMarkdown()
      const { body } = parse(chapter.content)
      rawHeadings = extractHeadingsFromMd(body, md)
    }

    // 更新 nav 层级计数器
    if (chapter.navLevel === 0) {
      currentH1Index++
      currentH2Index = 0
      currentH3Index = 0
      counters.h2 = 0
      counters.h3 = 0
      counters.h4 = 0
      counters.h5 = 0
      counters.h6 = 0
    } else if (chapter.navLevel === 1) {
      currentH2Index++
      currentH3Index = 0
      counters.h3 = 0
      counters.h4 = 0
      counters.h5 = 0
      counters.h6 = 0
    } else if (chapter.navLevel === 2) {
      currentH3Index++
      counters.h4 = 0
      counters.h5 = 0
      counters.h6 = 0
    }

    // 重置章节内计数器（h2-h6）
    const chapterCounters = { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }

    // 处理 md 内标题，生成子书签节点
    const chapterBookmarkChildren: BookmarkTreeNode[] = []
    const adjustedHeadings: Heading[] = []

    for (const rawHeading of rawHeadings) {
      // 跳过 h1 标题（章节标题已由 nav 条目提供）
      if (rawHeading.level === 1) {
        continue
      }

      // 调整层级：h2+ 下降 navLevel 层
      const adjustedLevel = adjustHeadingLevel(rawHeading.level, chapter.navLevel)

      // 计算编号 - 基于原始层级（rawHeading.level）
      let adjustedNumber = ''

      // 只有 h2-h4 显示编号，且总深度不超过 4 级
      if (rawHeading.level >= 2 && rawHeading.level <= 4) {
        // 更新章节内计数器 - 基于原始层级
        if (rawHeading.level === 2) {
          chapterCounters.h2++
          chapterCounters.h3 = 0
          chapterCounters.h4 = 0
        } else if (rawHeading.level === 3) {
          chapterCounters.h3++
          chapterCounters.h4 = 0
        } else if (rawHeading.level === 4) {
          chapterCounters.h4++
        }

        // 计算编号前缀长度（来自 nav 层级）
        const prefixDepth = chapter.numberPrefix.split('.').filter(s => s).length

        // 总编号深度：nav 前缀深度 + 原始层级深度 - 1
        const totalDepth = prefixDepth + (rawHeading.level - 1)

        if (totalDepth <= 4) {
          // 组合编号：nav 前缀 + 章节内编号
          if (rawHeading.level === 2) {
            adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}. `
          } else if (rawHeading.level === 3) {
            adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}.${chapterCounters.h3}. `
          } else if (rawHeading.level === 4) {
            adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}.${chapterCounters.h3}.${chapterCounters.h4}. `
          }
        }
      }

      // 生成调整后的 ID - 与 useMarkdown.ts 保持一致
      const baseSlug = slugify(rawHeading.text)
      const currentIndex = getGlobalHeadingIndex()
      const adjustedId = `heading-${currentIndex}-${baseSlug}`

      const heading: Heading = {
        level: rawHeading.level,
        text: rawHeading.text,
        id: baseSlug,
        adjustedLevel,
        adjustedNumber,
        adjustedId
      }

      adjustedHeadings.push(heading)

      // 添加书签子节点（仅显示 h1-h6，但 h5/h6 不显示编号）
      if (adjustedLevel <= 6) {
        chapterBookmarkChildren.push({
          id: adjustedId,  // 使用与HTML一致的ID
          title: adjustedNumber ? `${adjustedNumber}${rawHeading.text}` : rawHeading.text,
          level: chapter.navLevel + adjustedLevel,
          navLevel: chapter.navLevel,
          filePath: chapter.filePath,
          originalHeadingLevel: rawHeading.level
        })
      }

      incrementGlobalHeadingIndex()
    }

    chapter.headings = adjustedHeadings

    // 创建章节书签节点
    // level 0 不显示编号
    const displayTitle = chapter.chapterNumber ? `${chapter.chapterNumber}. ${chapter.title}` : chapter.title
    // 章节ID使用与combineChaptersToHtml相同的逻辑
    const chapterId = chapter.chapterNumber ? `chapter-${chapter.chapterNumber}` : `chapter-${getGlobalHeadingIndex()}`
    chapter.htmlId = chapterId  // 预先设置，供后续使用
    const bookmarkNode: BookmarkTreeNode = {
      id: chapterId,
      title: displayTitle,
      level: chapter.navLevel,
      navLevel: chapter.navLevel,
      filePath: chapter.filePath,
      children: chapterBookmarkChildren
    }
    incrementGlobalHeadingIndex()

    // 根据 navLevel 确定添加到哪个层级
    // 找到合适的父节点栈层级
    while (levelStack.length > 1 && levelStack[levelStack.length - 1].level >= chapter.navLevel) {
      levelStack.pop()  // 回溯到正确的层级
    }

    // 将当前节点添加到当前层级的父节点
    levelStack[levelStack.length - 1].children.push(bookmarkNode)

    // 如果当前节点可能成为后续子节点的父节点，入栈
    // 后续章节 navLevel 更大时，会添加到此节点的 children
    levelStack.push({
      level: chapter.navLevel,
      children: bookmarkNode.children || []
    })
  }

  return bookmarkTree
}

/**
 * 从文件路径提取目录路径（使用字符串操作）
 */
function getFileDir(filePath: string): string {
  // 统一使用正斜杠
  const normalized = filePath.replace(/\\/g, '/')
  // 提取最后一个斜杠之前的部分
  const lastSlashIndex = normalized.lastIndexOf('/')
  if (lastSlashIndex === -1) return ''
  return normalized.substring(0, lastSlashIndex)
}

/**
 * 规范化路径（移除多余的 ./ 和 ../）
 */
function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  const result: string[] = []

  for (const part of parts) {
    if (part === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') {
        result.pop()
      } else {
        result.push(part)
      }
    } else if (part !== '.' && part !== '') {
      result.push(part)
    }
  }

  // Windows 路径保留驱动器字母（如 D:）
  let joinedPath = result.join('/')
  if (path.match(/^[A-Za-z]:/)) {
    // Windows 驱动器路径，确保有驱动器前缀
    const driveMatch = path.match(/^([A-Za-z]:)/)
    if (driveMatch && !joinedPath.startsWith(driveMatch[1])) {
      joinedPath = driveMatch[1] + '/' + joinedPath
    }
  }

  return joinedPath
}

/**
 * 处理 HTML 中的图片路径，将相对路径转换为 asset URL
 * @param html HTML 内容
 * @param fileDir 文件所在目录
 */
function fixImagePathsInHtml(html: string, fileDir: string): string {
  // 匹配 img 标签中的 src 属性（支持双引号和单引号）
  return html.replace(/<img([^>]*)src=["']([^"']+)["']([^>]*)>/g, (match, before, src, after) => {
    // 跳过已经是绝对路径、http/https、data URL 或 asset URL 的图片
    if (src.match(/^https?:\/\//) || src.startsWith('data:') || src.startsWith('asset:') || src.includes('asset.localhost')) {
      return match
    }

    // 将相对路径转换为绝对路径
    const fileDirNormalized = fileDir.replace(/\\/g, '/')
    const absolutePath = fileDirNormalized + '/' + src
    const normalizedPath = normalizePath(absolutePath)

    // 使用 convertFileSrc 转换为 asset 协议 URL
    const assetUrl = convertFileSrc(normalizedPath)

    // 保存原始路径用于导出
    return `<img${before}src="${assetUrl}" data-original-src="${normalizedPath}"${after}>`
  })
}

/**
 * 使用调整后的编号渲染单个章节内容
 */
export function renderChapterContent(
  body: string,
  numberPrefix: string,
  navLevel: number
): string {
  const { renderWithNumberPrefix } = useMarkdown()
  return renderWithNumberPrefix(body, numberPrefix, navLevel)
}

/**
 * 合并所有章节为单一 HTML，添加分页标记和章节标题
 * 同时为每个章节设置 htmlId（用于书签跳转）
 */
export function combineChaptersToHtml(chapters: NavChapter[]): string {
  console.log('[combineChaptersToHtml] 开始合并，章节数:', chapters.length)
  const htmlParts: string[] = []

  const { parse, renderContentSkipH1 } = useMarkdown()

  // 用于生成唯一的章节 id
  let chapterIndex = 0

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]
    console.log(`[combineChaptersToHtml] 处理章节 ${i}:`, chapter.title, 'filePath:', chapter.filePath, 'chapterNumber:', chapter.chapterNumber)

    // nav 第 1 层章节（从第二个开始）添加分页
    if (chapter.navLevel === 0 && i > 0) {
      htmlParts.push('<div style="page-break-before: always;"></div>')
    }

    // 使用预先设置的 htmlId（由 renumberHeadings 设置），或基于 chapterNumber/索引生成
    const chapterId = chapter.htmlId || (chapter.chapterNumber ? `chapter-${chapter.chapterNumber}` : `chapter-${chapterIndex}`)
    chapter.htmlId = chapterId  // 存储 id 供书签跳转使用
    chapterIndex++

    // 添加章节标题
    // nav level 决定标题层级：level 0 → h1, level 1 → h2, level 2 → h3, level 3+ → h4
    const headingLevel = Math.min(chapter.navLevel + 1, 4)
    // level 0 不显示编号
    const numberSpan = chapter.chapterNumber ? `<span class="heading-number">${chapter.chapterNumber}. </span>` : ''
    const chapterTitleHtml = `<h${headingLevel} id="${chapterId}">${numberSpan}${chapter.title}</h${headingLevel}>`
    htmlParts.push(chapterTitleHtml)

    // 如果有文件路径和内容，渲染内容
    if (!chapter.filePath || !chapter.content) {
      console.log(`[combineChaptersToHtml] 章节 ${i}: 无文件路径或内容，仅显示标题`)
      continue
    }

    // 解析 frontmatter 提取 body
    const { body } = parse(chapter.content)
    console.log(`[combineChaptersToHtml] 章节 ${i} body 长度:`, body.length)

    // 渲染内容（跳过 h1，使用调整后的编号）
    const renderedHtml = renderContentSkipH1(body, chapter.numberPrefix, chapter.navLevel)
    console.log(`[combineChaptersToHtml] 章节 ${i} renderedHtml 长度:`, renderedHtml.length)

    // 处理图片路径（转换为 asset URL）
    const fileDir = getFileDir(chapter.filePath)
    const fixedHtml = fixImagePathsInHtml(renderedHtml, fileDir)

    htmlParts.push(fixedHtml)
  }

  const result = htmlParts.join('\n')
  console.log('[combineChaptersToHtml] 最终 HTML 长度:', result.length)
  return result
}

/**
 * 从调整后的标题列表提取 PDF 书签数据
 * PDF 书签只支持 h1-h4
 */
export function extractPdfBookmarks(
  chapters: NavChapter[]
): Array<{ title: string; level: number; id: string }> {
  const bookmarks: Array<{ title: string; level: number; id: string }> = []

  for (const chapter of chapters) {
    if (!chapter.filePath) {
      // 嵌套导航本身作为书签
      bookmarks.push({
        title: chapter.title,
        level: Math.min(chapter.navLevel + 1, 4), // PDF 书签最多 4 级
        id: `nav-${chapter.navLevel}`
      })
    }

    if (chapter.headings) {
      for (const heading of chapter.headings) {
        // 只添加 h1-h4 到 PDF 书签
        if (heading.adjustedLevel <= 4) {
          bookmarks.push({
            title: heading.adjustedNumber ?
              `${heading.adjustedNumber}${heading.text}` : heading.text,
            level: heading.adjustedLevel,
            id: heading.adjustedId
          })
        }
      }
    }
  }

  return bookmarks
}

/**
 * 组合导出的完整入口函数
 */
export async function prepareMkdocsExport(
  nav: MdFile[],
  basePath: string
): Promise<{
  chapters: NavChapter[]
  bookmarkTree: BookmarkTreeNode[]
  combinedHtml: string
  pdfBookmarks: Array<{ title: string; level: number; id: string }>
}> {
  console.log('[MkDocs导出] prepareMkdocsExport 开始')
  console.log('[MkDocs导出] nav:', nav)
  console.log('[MkDocs导出] basePath:', basePath)

  // 重置计数器
  resetChapterCounters()
  resetGlobalHeadingIndex()  // 重置 useMarkdown.ts 的计数器

  // 收集章节
  const chapters = collectNavChapters(nav, basePath, 0, '')
  console.log('[MkDocs导出] 收集到章节:', chapters.length)
  console.log('[MkDocs导出] 章节详情:', chapters)

  // 加载文件内容
  await loadAllMdFiles(chapters)
  console.log('[MkDocs导出] 加载文件后章节:', chapters.filter(c => c.content))

  // 先重新编号标题，生成书签树（从 globalHeadingIndex=0 开始）
  const bookmarkTree = renumberHeadings(chapters)
  console.log('[MkDocs导出] 书签树:', bookmarkTree)

  // 重置 useMarkdown.ts 的计数器，然后渲染 HTML（从相同的 globalHeadingIndex=0 开始）
  resetGlobalHeadingIndex()
  const combinedHtml = combineChaptersToHtml(chapters)
  console.log('[MkDocs导出] combinedHtml 长度:', combinedHtml.length)
  console.log('[MkDocs导出] combinedHtml 前200字符:', combinedHtml.substring(0, 200))

  // 提取 PDF 书签
  const pdfBookmarks = extractPdfBookmarks(chapters)

  return { chapters, bookmarkTree, combinedHtml, pdfBookmarks }
}