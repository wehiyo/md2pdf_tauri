/** 打开的文件（多文件标签页管理） */
export interface OpenedFile {
  path: string | null
  content: string
  savedContent: string
  dir: string | null
  name: string
}

/** 文件树节点（文件夹或 .md 文件） */
export interface MdFile {
  name: string
  path?: string
  children?: MdFile[]
  isFolder?: boolean
  hasExplicitTitle?: boolean
}

/** 工作状态 */
export type WorkState = 'file' | 'folder' | 'mkdocs'

/** MkDocs 配置（从 mkdocs.yml 解析） */
export interface MkdocsConfig {
  siteName: string
  coverTitle?: string
  coverSubtitle?: string
  author?: string
  copyright?: string
}

/** MkDocs nav 章节（来自 useMkdocsExport） */
export interface NavChapter {
  title: string
  navLevel: number
  filePath: string
  content?: string
  headings?: Heading[]
  numberPrefix: string
  chapterNumber: string
  htmlId?: string
  mdH1Title?: string
  displayTitle?: string
  fallbackTitle?: string
}

/** 文档标题信息 */
export interface Heading {
  level: number
  text: string
  id: string
  adjustedLevel: number
  adjustedNumber: string
  adjustedId: string
}

/** PDF 书签树节点 */
export interface BookmarkTreeNode {
  id: string
  title: string
  level: number
  navLevel: number
  filePath?: string
  originalHeadingLevel?: number
  children?: BookmarkTreeNode[]
}
