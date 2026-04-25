import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useMarkdown, resetGlobalHeadingIndex, incrementGlobalHeadingIndex, slugifyForMkdocs } from './useMarkdown'
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
  mdH1Title?: string     // md 文件的 h1 标题（如果有）
  displayTitle?: string  // 实际显示的标题
}

export interface Heading {
  level: number          // 原始级别 (1-6)
  text: string
  id: string
  adjustedLevel: number  // 调整后的级别
  adjustedNumber: string // 调整后的编号
  adjustedId: string     // 调整后的 ID
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
  hasExplicitTitle?: boolean  // 是否有显式标题（nav 中指定）
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
    // level 0 编号为 1, 2, 3...，level 1 编号为 1.1, 1.2...
    let chapterNumber = ''
    let numberPrefix = ''  // 用于 md 内标题编号（结尾带点）

    if (level === 0) {
      // nav 第 1 层：编号 1, 2, 3...
      chapterCounter++
      chapterNumber = `${chapterCounter}`
      numberPrefix = `${chapterNumber}.`
      // 重置子层计数器
      subChapterCounter = 0
      subSubChapterCounter = 0
      subSubSubCounter = 0
    } else if (level === 1) {
      // nav 第 2 层：编号 1.1, 1.2...
      subChapterCounter++
      chapterNumber = `${parentNumber}.${subChapterCounter}`
      numberPrefix = `${chapterNumber}.`
      subSubChapterCounter = 0
      subSubSubCounter = 0
    } else if (level === 2) {
      // nav 第 3 层：编号 1.1.1, 1.1.2...
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
      // 文件夹总是有显式标题（nav 中指定的）
      chapters.push({
        title: item.name,
        navLevel: level,
        filePath: '',
        numberPrefix,
        chapterNumber,
        headings: []
      })

      // 递归处理子节点
      const nextParentNumber = chapterNumber
      const childChapters = collectNavChapters(item.children, basePath, level + 1, nextParentNumber)
      chapters.push(...childChapters)

    } else if (item.path) {
      // 文件条目
      // 如果有显式标题，使用 nav 标题；否则设置为空，后续使用 md h1
      const navTitle = item.hasExplicitTitle ? item.name : ''
      chapters.push({
        title: navTitle,
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
 * 从 Markdown 内容提取 h1 标题
 */
function extractH1Title(content: string): string | undefined {
  // 跳过 frontmatter
  const lines = content.split('\n')
  let startIndex = 0

  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        startIndex = i + 1
        break
      }
    }
  }

  // 查找 h1 标题
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]
    // # 开头的 h1
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      return line.substring(2).trim()
    }
    // === 下划线风格的 h1（上一行是标题）
    if (line.match(/^={3,}$/) && i > startIndex && lines[i - 1].trim()) {
      return lines[i - 1].trim()
    }
  }

  return undefined
}

/**
 * 异步读取所有 md 文件内容，并提取 h1 标题
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
        // 提取 h1 标题
        chapter.mdH1Title = extractH1Title(chapter.content)
      } catch (error) {
        console.warn(`无法读取文件 ${chapter.filePath}:`, error)
        chapter.content = ''
      }
    }
  }
}

/**
 * 调整标题层级
 * h1 隐藏（跳过），h2+ 相对于 nav 标题降低 1 级显示
 * nav level 0 → h1 (level 1)，文件 h2 → h2 (level 2)
 * nav level 1 → h2 (level 2)，文件 h2 → h3 (level 3)
 *
 * 层级计算：
 * nav 标题层级 = navLevel + 1
 * 文件标题相对于 nav 标题保持原有层级差（h2 比 h1 低 1 级）
 * 所以 adjustedLevel = navLevel + originalLevel
 */
function adjustHeadingLevel(originalLevel: number, navLevel: number): number {
  if (originalLevel === 1) return 1  // h1 不调整，但会被跳过
  // adjustedLevel = navLevel + originalLevel
  // nav level 0, h2 → level 2; nav level 1, h2 → level 3
  return Math.min(navLevel + originalLevel, 6)
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
    } else if (tokens[i].type === 'heading_deflist_block') {
      // heading_deflist 标题（如 `#### JAVA : 定义内容`）
      const data = JSON.parse(tokens[i].content)
      const level = data.level as number
      const text = data.titleText as string
      headings.push({ text, level })
    }
  }

  return headings
}

/**
 * 根据章节层级重新计算标题编号和层级
 * 同时生成书签树节点（按 nav 层级嵌套）
 */
export function renumberHeadings(chapters: NavChapter[]): BookmarkTreeNode[] {
  const bookmarkTree: BookmarkTreeNode[] = []

  // 重置全局标题索引计数器
  resetGlobalHeadingIndex()

  // 章节索引计数器（用于无编号章节的ID）
  let chapterIndex = 0

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

    // 处理 md 内标题，生成嵌套的子书签节点
    const chapterBookmarkChildren: BookmarkTreeNode[] = []
    const adjustedHeadings: Heading[] = []

    // md 内标题的层级栈：用于构建嵌套书签树
    // 栈顶是当前层级的父节点数组
    // 章节的书签层级 = navLevel + 1，作为根节点
    const headingStack: { level: number; children: BookmarkTreeNode[] }[] = [
      { level: chapter.navLevel + 1, children: chapterBookmarkChildren }
    ]

    for (const rawHeading of rawHeadings) {
      // 跳过 h1 标题（章节标题已由 nav 条目提供）
      if (rawHeading.level === 1) {
        continue
      }

      // 调整层级：h2+ 相对于 nav 标题降低 1 级显示
      const adjustedLevel = adjustHeadingLevel(rawHeading.level, chapter.navLevel)

      // 计算编号 - 只有调整后层级 h1~h4 显示编号（adjustedLevel <= 4）
      let adjustedNumber = ''

      // 原始层级 h2-h4 才计数和生成编号
      if (rawHeading.level >= 2 && rawHeading.level <= 4 && adjustedLevel <= 4) {
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

        // 组合编号：nav 前缀 + 章节内编号
        if (rawHeading.level === 2) {
          adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}. `
        } else if (rawHeading.level === 3) {
          adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}.${chapterCounters.h3}. `
        } else if (rawHeading.level === 4) {
          adjustedNumber = `${chapter.numberPrefix}${chapterCounters.h2}.${chapterCounters.h3}.${chapterCounters.h4}. `
        }
      }

      // 生成调整后的 ID（带编号前缀，格式如 "1-1-数据库"）
      // 从 adjustedNumber 提取编号（去掉空格，点号改为连字符）
      // adjustedNumber 格式如 "1.1.1 "，转换为 "1-1-1-slug"
      const numberPrefix = adjustedNumber.trim().replace(/\./g, '-')
      const baseSlug = slugifyForMkdocs(rawHeading.text)
      const adjustedId = numberPrefix ? `${numberPrefix}-${baseSlug}` : baseSlug

      const heading: Heading = {
        level: rawHeading.level,
        text: rawHeading.text,
        id: adjustedId,
        adjustedLevel,
        adjustedNumber,
        adjustedId
      }

      adjustedHeadings.push(heading)

      // 添加书签子节点（PDF 书签显示 h1~h5，层级 1~5）
      if (adjustedLevel <= 5) {
        const bookmarkChild: BookmarkTreeNode = {
          id: adjustedId,  // 使用与HTML一致的ID
          title: adjustedNumber ? `${adjustedNumber}${rawHeading.text}` : rawHeading.text,
          level: adjustedLevel,  // 书签层级使用调整后的层级
          navLevel: chapter.navLevel,
          filePath: chapter.filePath,
          originalHeadingLevel: rawHeading.level,
          children: []  // 初始化空 children，用于嵌套子标题
        }

        // 根据层级找到正确的父节点
        // 回溯栈，直到找到层级小于当前标题的节点
        while (headingStack.length > 1 && headingStack[headingStack.length - 1].level >= adjustedLevel) {
          headingStack.pop()
        }

        // 添加到当前父节点的 children
        headingStack[headingStack.length - 1].children.push(bookmarkChild)

        // 当前节点入栈，作为后续子标题的潜在父节点
        headingStack.push({
          level: adjustedLevel,
          children: bookmarkChild.children!
        })
      }

      incrementGlobalHeadingIndex()
    }

    chapter.headings = adjustedHeadings

    // 创建章节书签节点
    // nav level 决定书签层级：level 0 → h1 (层级 1), level 1 → h2 (层级 2), ...
    // 确定显示标题：nav 有标题用 nav，nav 无标题用 md h1
    let displayTitle = chapter.title
    if (!chapter.title || chapter.title.trim() === '') {
      displayTitle = chapter.mdH1Title || ''
    }
    chapter.displayTitle = displayTitle

    const bookmarkDisplayTitle = `${chapter.chapterNumber}. ${displayTitle}`
    // 章节ID使用与combineChaptersToHtml相同的逻辑
    const chapterId = `chapter-${chapter.chapterNumber}`
    chapter.htmlId = chapterId  // 预先设置，供后续使用
    chapterIndex++  // 使用局部计数器，不影响 globalHeadingIndex
    const bookmarkNode: BookmarkTreeNode = {
      id: chapterId,
      title: bookmarkDisplayTitle,
      level: chapter.navLevel + 1,  // 书签层级：navLevel + 1
      navLevel: chapter.navLevel,
      filePath: chapter.filePath,
      children: chapterBookmarkChildren
    }
    // 注意：章节本身不增加 globalHeadingIndex，因为 combineChaptersToHtml 中章节标题不经过 md.render

    // 根据 navLevel 确定添加到哪个层级
    // 找到合适的父节点栈层级（书签层级 = navLevel + 1）
    const bookmarkLevel = chapter.navLevel + 1
    while (levelStack.length > 1 && levelStack[levelStack.length - 1].level >= bookmarkLevel) {
      levelStack.pop()  // 回溯到正确的层级
    }

    // 将当前节点添加到当前层级的父节点
    levelStack[levelStack.length - 1].children.push(bookmarkNode)

    // 如果当前节点可能成为后续子节点的父节点，入栈
    // 后续章节 navLevel 更大时，会添加到此节点的 children
    levelStack.push({
      level: bookmarkLevel,
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
  const htmlParts: string[] = []

  const { parse, renderContentSkipH1 } = useMarkdown()

  // 用于生成唯一的章节 id
  let chapterIndex = 0

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]

    // 注意：分页由 usePDF.ts 的 addH1PageBreaks 统一处理
    // nav level 0 的章节标题是 h1，会被 addH1PageBreaks 添加分页
    // 这里不再手动添加分页标记，避免重复产生空白页

    // 使用预先设置的 htmlId（由 renumberHeadings 设置）
    const chapterId = chapter.htmlId || `chapter-${chapter.chapterNumber}`
    chapter.htmlId = chapterId  // 存储 id 供书签跳转使用
    chapterIndex++

    // 确定显示标题
    // 规则：nav 有标题时用 nav 标题；nav 无标题时用 md h1 标题
    // 如果 nav 标题与 md h1 相同，显示 nav 标题（内容相同）
    let displayTitle = chapter.title  // 默认使用 nav 标题
    if (!chapter.title || chapter.title.trim() === '') {
      // nav 无标题，使用 md h1
      displayTitle = chapter.mdH1Title || ''
    }
    chapter.displayTitle = displayTitle

    // 添加章节标题
    // nav level 决定标题层级：level 0 → h1, level 1 → h2, level 2 → h3, level 3 → h4, level 4+ → h4（HTML 最多 h4）
    const headingLevel = Math.min(chapter.navLevel + 1, 4)
    // 所有层级都显示编号
    const numberSpan = `<span class="heading-number">${chapter.chapterNumber}. </span>`
    const chapterTitleHtml = `<h${headingLevel} id="${chapterId}">${numberSpan}${displayTitle}</h${headingLevel}>`
    htmlParts.push(chapterTitleHtml)

    // 如果有文件路径和内容，渲染内容
    if (!chapter.filePath || !chapter.content) {
      continue
    }

    // 解析 frontmatter 提取 body
    const { body } = parse(chapter.content)

    // 渲染内容（跳过 h1，使用调整后的编号）
    const renderedHtml = renderContentSkipH1(body, chapter.numberPrefix, chapter.navLevel)

    // 处理图片路径（转换为 asset URL）
    const fileDir = getFileDir(chapter.filePath)
    const fixedHtml = fixImagePathsInHtml(renderedHtml, fileDir)

    htmlParts.push(fixedHtml)
  }

  const result = htmlParts.join('\n')
  return result
}

/**
 * 从调整后的标题列表提取 PDF 书签数据
 * PDF 书签显示 h1~h5（层级 1~5）
 */
export function extractPdfBookmarks(
  chapters: NavChapter[]
): Array<{ title: string; level: number; id: string }> {
  const bookmarks: Array<{ title: string; level: number; id: string }> = []

  for (const chapter of chapters) {
    // 使用 displayTitle（已由 renumberHeadings 或 combineChaptersToHtml 设置）
    const displayTitle = chapter.displayTitle || chapter.title
    if (!chapter.filePath) {
      // 嵌套导航本身作为书签
      bookmarks.push({
        title: `${chapter.chapterNumber}. ${displayTitle}`,
        level: Math.min(chapter.navLevel + 1, 5), // PDF 书签最多 5 级
        id: `chapter-${chapter.chapterNumber}`
      })
    } else {
      // 文件条目：章节标题作为书签
      bookmarks.push({
        title: `${chapter.chapterNumber}. ${displayTitle}`,
        level: Math.min(chapter.navLevel + 1, 5),
        id: `chapter-${chapter.chapterNumber}`
      })
    }

    if (chapter.headings) {
      for (const heading of chapter.headings) {
        // 添加 h1~h5 到 PDF 书签（层级 1~5）
        if (heading.adjustedLevel <= 5) {
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
  // 重置计数器
  resetChapterCounters()
  resetGlobalHeadingIndex()  // 重置 useMarkdown.ts 的计数器

  // 收集章节
  const chapters = collectNavChapters(nav, basePath, 0, '')

  // 加载文件内容
  await loadAllMdFiles(chapters)

  // 先重新编号标题，生成书签树（从 globalHeadingIndex=0 开始）
  const bookmarkTree = renumberHeadings(chapters)

  // 重置 useMarkdown.ts 的计数器，然后渲染 HTML（从相同的 globalHeadingIndex=0 开始）
  resetGlobalHeadingIndex()
  let combinedHtml = combineChaptersToHtml(chapters)

  // 后处理：统一处理所有锚点链接，使用收集的标题 ID
  // 创建全局标题文本 -> ID 的映射（支持多章节同名标题）
  const headingTextToIds: Map<string, string[]> = new Map()
  // 创建文件路径 -> 章节 ID 的映射（用于跨文件链接到章节开头）
  const filePathToChapterId: Map<string, string> = new Map()
  // 创建文件路径 -> 该文件内标题映射（用于跨文件锚点链接）
  const filePathToHeadings: Map<string, Map<string, string>> = new Map()

  for (const chapter of chapters) {
    // 章节标题
    const chapterTitleId = chapter.htmlId || `chapter-${chapter.chapterNumber}`
    const displayTitle = chapter.displayTitle || chapter.title || chapter.mdH1Title || ''
    if (displayTitle) {
      const key = slugifyForMkdocs(displayTitle)
      const existing = headingTextToIds.get(key) || []
      existing.push(chapterTitleId)
      headingTextToIds.set(key, existing)
    }
    // 章节内标题
    if (chapter.headings) {
      for (const heading of chapter.headings) {
        const key = slugifyForMkdocs(heading.text)
        const existing = headingTextToIds.get(key) || []
        existing.push(heading.adjustedId)
        headingTextToIds.set(key, existing)
      }
    }
    // 文件路径映射
    if (chapter.filePath) {
      // 提取文件名（如 "data.md"）
      const fileName = chapter.filePath.split(/[/\\]/).pop() || ''
      filePathToChapterId.set(fileName, chapterTitleId)
      // 也存储不带扩展名的文件名
      const fileNameNoExt = fileName.replace(/\.md$/i, '')
      filePathToChapterId.set(fileNameNoExt, chapterTitleId)

      // 为该文件建立标题文本 -> ID 的映射
      const fileHeadings: Map<string, string> = new Map()
      if (chapter.headings) {
        for (const heading of chapter.headings) {
          fileHeadings.set(slugifyForMkdocs(heading.text), heading.adjustedId)
        }
      }
      // 也包含章节标题
      if (displayTitle) {
        fileHeadings.set(slugifyForMkdocs(displayTitle), chapterTitleId)
      }
      filePathToHeadings.set(fileName, fileHeadings)
      filePathToHeadings.set(fileNameNoExt, fileHeadings)
    }
  }

  // 收集所有标题 ID
  const allHeadingIds = new Set<string>()
  for (const chapter of chapters) {
    allHeadingIds.add(chapter.htmlId || `chapter-${chapter.chapterNumber}`)
    if (chapter.headings) {
      for (const heading of chapter.headings) {
        allHeadingIds.add(heading.adjustedId)
      }
    }
  }

  // 提取自定义锚点（空 <a id="xxx"> 元素）并添加到映射
  // 这样跨文件链接如 ./file.md#anchor 能正确跳转到自定义锚点
  for (const chapter of chapters) {
    if (chapter.filePath) {
      const fileName = chapter.filePath.split(/[/\\]/).pop() || ''
      const fileNameNoExt = fileName.replace(/\.md$/i, '')

      // 从章节内容中提取自定义锚点 ID
      if (chapter.content) {
        const { parse, renderWithNumberPrefix } = useMarkdown()
        const { body } = parse(chapter.content)
        const chapterHtml = renderWithNumberPrefix(body, chapter.numberPrefix, chapter.navLevel)

        // 提取空锚点 <a id="xxx"></a>
        const emptyAnchorRegex = /<a\s[^>]*\bid="([^"]+)"[^>]*>\s*<\/a>/g
        let match
        while ((match = emptyAnchorRegex.exec(chapterHtml)) !== null) {
          const anchorId = match[1]
          // 添加到全局映射
          const key = slugifyForMkdocs(anchorId)
          const existing = headingTextToIds.get(key) || []
          if (!existing.includes(anchorId)) {
            existing.push(anchorId)
            headingTextToIds.set(key, existing)
          }
          // 添加到文件映射
          const fileHeadings = filePathToHeadings.get(fileName) || filePathToHeadings.get(fileNameNoExt)
          if (fileHeadings && !fileHeadings.has(key)) {
            fileHeadings.set(key, anchorId)
          }
          // 添加到 allHeadingIds（用于 PDF 链接目标分类）
          allHeadingIds.add(anchorId)
        }
      }
    }
  }

  // 替换所有 href，包括跨文件链接
  // 格式1: href="#xxx" - 内部锚点
  // 格式2: href="file.md#xxx" - 跨文件锚点链接
  // 格式3: href="file.md" - 跨文件链接（跳到章节开头）
  combinedHtml = combinedHtml.replace(/href="([^"]+)"/g, (_match, href) => {
    // 解析 href
    let newHref = href

    // 检查是否是外部链接（http/https）
    if (href.match(/^https?:\/\//i)) {
      return _match  // 不处理外部链接
    }

    // 检查是否是跨文件链接（带 .md 扩展名）
    const mdLinkMatch = href.match(/^([^#]+\.md)(#(.+))?$/i)
    if (mdLinkMatch) {
      const rawFileName = mdLinkMatch[1]
      const anchor = mdLinkMatch[3]  // 可能为 undefined

      // 提取纯文件名（去掉路径前缀）
      // 例如：./fun2/alg/flow.md -> flow.md
      // 例如：fun2/alg/flow.md -> flow.md
      const fileName = rawFileName.split(/[/\\]/).pop() || rawFileName
      const fileNameNoExt = fileName.replace(/\.md$/i, '')

      if (anchor) {
        // 跨文件锚点链接：必须限定在目标文件内查找
        const decodedAnchor = decodeURIComponent(anchor)
        const slugifiedAnchor = slugifyForMkdocs(decodedAnchor)

        // 只从目标文件的标题映射中查找，不允许 fallback 到全局
        const fileHeadings = filePathToHeadings.get(fileName) || filePathToHeadings.get(fileNameNoExt)
        if (fileHeadings) {
          const targetId = fileHeadings.get(slugifiedAnchor)
          if (targetId) {
            newHref = `#${targetId}`
          } else {
            // 目标文件中没有该标题，跳转到文件章节开头
            const chapterId = filePathToChapterId.get(fileName) || filePathToChapterId.get(fileNameNoExt)
            if (chapterId) {
              newHref = `#${chapterId}`
            }
          }
        } else {
          // 目标文件不存在于映射中（可能是外部链接或未加载的文件）
          // 跳转到章节开头作为 fallback
          const chapterId = filePathToChapterId.get(fileName) || filePathToChapterId.get(fileNameNoExt)
          if (chapterId) {
            newHref = `#${chapterId}`
          }
        }
      } else {
        // 只有文件链接：data.md -> #chapter-x
        const chapterId = filePathToChapterId.get(fileName) || filePathToChapterId.get(fileNameNoExt)
        if (chapterId) {
          newHref = `#${chapterId}`
        }
      }
    } else if (href.startsWith('#')) {
      // 纯内部锚点链接：#xxx
      const anchor = href.substring(1)
      const decodedAnchor = decodeURIComponent(anchor)
      const slugifiedAnchor = slugifyForMkdocs(decodedAnchor)

      if (allHeadingIds.has(slugifiedAnchor)) {
        newHref = `#${slugifiedAnchor}`
      } else {
        const targetIds = headingTextToIds.get(slugifiedAnchor)
        if (targetIds && targetIds.length > 0) {
          newHref = `#${targetIds[0]}`
        }
      }
    }

    // 返回处理后的 href，移除 target 属性（PDF 内部链接不需要）
    return `href="${newHref}"`
  })

  // 提取 PDF 书签
  const pdfBookmarks = extractPdfBookmarks(chapters)

  return { chapters, bookmarkTree, combinedHtml, pdfBookmarks }
}