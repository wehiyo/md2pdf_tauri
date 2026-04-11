import { invoke } from '@tauri-apps/api/core'
import { useMarkdown } from './useMarkdown'

// 导出给其他模块使用
export interface NavChapter {
  title: string          // 章节标题（来自 nav）
  navLevel: number       // nav 层级深度 (0, 1, 2, 3...)
  filePath: string       // md 文件路径
  content?: string       // 读取后的内容
  headings?: Heading[]   // 提取的标题列表
  numberPrefix: string   // 编号前缀（如 "1.2."）
  chapterNumber: string  // 章节编号（如 "1"、"1.1"、"1.1.1"）
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
 * @param level 当前 nav 层级深度（0 = 第 1 层）
 * @param parentPrefix 父级编号前缀
 */
export function collectNavChapters(
  nav: MdFile[],
  basePath: string,
  level: number = 0,
  parentPrefix: string = ''
): NavChapter[] {
  const chapters: NavChapter[] = []

  for (const item of nav) {
    if (item.isFolder && item.children) {
      // 嵌套导航：递归处理子节点
      const chapterTitle = item.name

      // 计算章节编号和编号前缀
      let chapterNumber = ''
      let currentPrefix = ''

      if (level === 0) {
        // nav 第 1 层
        chapterCounter++
        chapterNumber = `${chapterCounter}`
        currentPrefix = `${chapterCounter}.`
        subChapterCounter = 0
        subSubChapterCounter = 0
      } else if (level === 1) {
        // nav 第 2 层
        subChapterCounter++
        chapterNumber = `${parentPrefix}${subChapterCounter}`
        currentPrefix = `${chapterNumber}.`
        subSubChapterCounter = 0
      } else if (level === 2) {
        // nav 第 3 层
        subSubChapterCounter++
        chapterNumber = `${parentPrefix}.${subSubChapterCounter}`
        currentPrefix = `${chapterNumber}.`
      } else {
        // nav 第 4 层及以上
        subSubSubCounter++
        chapterNumber = `${parentPrefix}.${subSubSubCounter}`
        currentPrefix = `${chapterNumber}.`
      }

      chapters.push({
        title: chapterTitle,
        navLevel: level,
        filePath: '', // 嵌套导航本身不是文件
        numberPrefix: currentPrefix,
        chapterNumber,
        headings: []
      })

      // 递归处理子节点
      const childChapters = collectNavChapters(item.children, basePath, level + 1, chapterNumber)
      chapters.push(...childChapters)

    } else if (item.path) {
      // 文件条目
      const chapterTitle = item.name

      // 计算章节编号和编号前缀（与文件夹逻辑相同）
      let chapterNumber = ''
      let currentPrefix = ''

      if (level === 0) {
        chapterCounter++
        chapterNumber = `${chapterCounter}`
        currentPrefix = `${chapterNumber}.`
        subChapterCounter = 0
        subSubChapterCounter = 0
      } else if (level === 1) {
        subChapterCounter++
        chapterNumber = `${parentPrefix}${subChapterCounter}`
        currentPrefix = `${chapterNumber}.`
        subSubChapterCounter = 0
      } else if (level === 2) {
        subSubChapterCounter++
        chapterNumber = `${parentPrefix}.${subSubChapterCounter}`
        currentPrefix = `${chapterNumber}.`
      } else {
        subSubSubCounter++
        chapterNumber = `${parentPrefix}.${subSubSubCounter}`
        currentPrefix = `${chapterNumber}.`
      }

      chapters.push({
        title: chapterTitle,
        navLevel: level,
        filePath: item.path,
        numberPrefix: currentPrefix,
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
 * 从 Markdown 内容提取标题（不渲染）
 */
function extractHeadingsFromMd(content: string): { text: string; level: number }[] {
  const headings: { text: string; level: number }[] = []
  const headingRegex = /^#{1,6}\s+(.+)$/gm
  let match

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[0].match(/^#+/)![0].length
    const text = match[1].trim()
    headings.push({ text, level })
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
 * 同时生成书签树节点
 */
export function renumberHeadings(chapters: NavChapter[]): BookmarkTreeNode[] {
  const bookmarkTree: BookmarkTreeNode[] = []

  // 全局标题计数器（用于生成唯一 ID）
  let globalHeadingIndex = 0

  // 当前章节计数器（用于跨章节编号）
  const counters = { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }

  // 当前 nav 第 1 层章节索引
  let currentH1Index = 0
  let currentH2Index = 0
  let currentH3Index = 0

  for (const chapter of chapters) {
    if (!chapter.filePath || !chapter.content) {
      // 嵌套导航本身（无文件）：仅添加书签节点，显示编号
      bookmarkTree.push({
        id: `nav-${chapter.navLevel}-${globalHeadingIndex}`,
        title: `${chapter.chapterNumber}. ${chapter.title}`,
        level: chapter.navLevel,
        navLevel: chapter.navLevel,
        children: []
      })
      globalHeadingIndex++
      continue
    }

    // 解析 frontmatter 提取 body
    const { parse } = useMarkdown()
    const { body } = parse(chapter.content)

    // 提取 md 内标题
    const rawHeadings = extractHeadingsFromMd(body)

    // 根据章节层级调整标题
    const adjustedHeadings: Heading[] = []
    const chapterBookmarkChildren: BookmarkTreeNode[] = []

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

    for (const rawHeading of rawHeadings) {
      // 调整层级
      const adjustedLevel = adjustHeadingLevel(rawHeading.level, chapter.navLevel)

      // 计算编号
      let adjustedNumber = ''

      // 只有 h2-h4 显示编号，且不超过 4 级
      if (adjustedLevel >= 2 && adjustedLevel <= 4) {
        // 更新章节内计数器
        if (adjustedLevel === 2) {
          chapterCounters.h2++
          chapterCounters.h3 = 0
          chapterCounters.h4 = 0
        } else if (adjustedLevel === 3) {
          chapterCounters.h3++
          chapterCounters.h4 = 0
        } else if (adjustedLevel === 4) {
          chapterCounters.h4++
        }

        // 计算编号前缀长度（来自 nav 层级）
        const prefixDepth = chapter.numberPrefix.split('.').filter(s => s).length

        // 总编号深度不超过 4
        const totalDepth = prefixDepth + (adjustedLevel - 1)

        if (totalDepth <= 4) {
          // 组合编号：nav 前缀 + 章节内编号
          if (adjustedLevel === 2) {
            adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}. `
          } else if (adjustedLevel === 3) {
            adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}.${chapterCounters.h3}. `
          } else if (adjustedLevel === 4) {
            adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}.${chapterCounters.h3}.${chapterCounters.h4}. `
          }
        }
      }

      // 生成调整后的 ID
      const baseSlug = slugify(rawHeading.text)
      const numberPart = chapter.numberPrefix.replace(/\./g, '-')
      const adjustedId = numberPart ? `${numberPart}-${chapterCounters.h2}-${baseSlug}` : `${chapterCounters.h2}-${baseSlug}`

      const heading: Heading = {
        level: rawHeading.level,
        text: rawHeading.text,
        id: baseSlug,
        adjustedLevel,
        adjustedNumber,
        adjustedId: `heading-${globalHeadingIndex}-${adjustedId}`
      }

      adjustedHeadings.push(heading)

      // 添加书签子节点（仅显示 h1-h6，但 h5/h6 不显示编号）
      if (adjustedLevel <= 6) {
        chapterBookmarkChildren.push({
          id: heading.adjustedId,
          title: adjustedNumber ? `${adjustedNumber}${rawHeading.text}` : rawHeading.text,
          level: chapter.navLevel + adjustedLevel,
          navLevel: chapter.navLevel,
          filePath: chapter.filePath,
          originalHeadingLevel: rawHeading.level
        })
      }

      globalHeadingIndex++
    }

    chapter.headings = adjustedHeadings

    // 添加章节书签节点，显示编号
    bookmarkTree.push({
      id: `chapter-${chapter.chapterNumber}`,
      title: `${chapter.chapterNumber}. ${chapter.title}`,
      level: chapter.navLevel,
      navLevel: chapter.navLevel,
      filePath: chapter.filePath,
      children: chapterBookmarkChildren
    })
  }

  return bookmarkTree
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
 */
export function combineChaptersToHtml(chapters: NavChapter[]): string {
  console.log('[combineChaptersToHtml] 开始合并，章节数:', chapters.length)
  const htmlParts: string[] = []

  const { parse, renderWithNumberPrefix } = useMarkdown()

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]
    console.log(`[combineChaptersToHtml] 处理章节 ${i}:`, chapter.title, 'filePath:', chapter.filePath, 'chapterNumber:', chapter.chapterNumber)

    if (!chapter.filePath || !chapter.content) {
      console.log(`[combineChaptersToHtml] 跳过章节 ${i}: 无文件路径或内容`)
      continue
    }

    // nav 第 1 层章节（从第二个开始）添加分页
    if (chapter.navLevel === 0 && i > 0) {
      htmlParts.push('<div style="page-break-before: always;"></div>')
    }

    // 添加章节标题（带编号）
    // nav level 决定标题层级：level 0 → h1, level 1 → h2, level 2 → h3, level 3+ → h4
    const headingLevel = Math.min(chapter.navLevel + 1, 4)
    const chapterTitleHtml = `<h${headingLevel} id="chapter-${chapter.chapterNumber}"><span class="heading-number">${chapter.chapterNumber}. </span>${chapter.title}</h${headingLevel}>`
    htmlParts.push(chapterTitleHtml)

    // 解析 frontmatter 提取 body
    const { body } = parse(chapter.content)
    console.log(`[combineChaptersToHtml] 章节 ${i} body 长度:`, body.length)

    // 渲染内容（使用调整后的编号）
    const renderedHtml = renderWithNumberPrefix(body, chapter.numberPrefix, chapter.navLevel)
    console.log(`[combineChaptersToHtml] 章节 ${i} renderedHtml 长度:`, renderedHtml.length)

    htmlParts.push(renderedHtml)
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

  // 收集章节
  const chapters = collectNavChapters(nav, basePath, 0, '')
  console.log('[MkDocs导出] 收集到章节:', chapters.length)
  console.log('[MkDocs导出] 章节详情:', chapters)

  // 加载文件内容
  await loadAllMdFiles(chapters)
  console.log('[MkDocs导出] 加载文件后章节:', chapters.filter(c => c.content))

  // 重新编号标题，生成书签树
  const bookmarkTree = renumberHeadings(chapters)
  console.log('[MkDocs导出] 书签树:', bookmarkTree)

  // 合并 HTML
  const combinedHtml = combineChaptersToHtml(chapters)
  console.log('[MkDocs导出] combinedHtml 长度:', combinedHtml.length)
  console.log('[MkDocs导出] combinedHtml 前200字符:', combinedHtml.substring(0, 200))

  // 提取 PDF 书签
  const pdfBookmarks = extractPdfBookmarks(chapters)

  return { chapters, bookmarkTree, combinedHtml, pdfBookmarks }
}