import { ref, computed, watch } from 'vue'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { parse as parseYaml } from 'yaml'
import { useErrorHandling } from './useErrorHandling'
import type { Metadata } from './useMarkdown'
import type { OpenedFile, MdFile, WorkState, MkdocsConfig } from '../types'

// ── Defaults ───────────────────────────────────────────

export const DEFAULT_MD_CONTENT = `# MarkRefine - Markdown 编辑器

欢迎使用 MarkRefine！

## 使用说明

- 在左侧编辑器中编写 Markdown 内容
- 右侧预览区会实时显示渲染结果
- 点击工具栏按钮可以：
  - **打开文件**：从文件系统打开 .md 文件
  - **保存文件**：保存当前内容到 .md 文件
  - **导出 HTML**：导出为 HTML 文件
  - **导出 PDF**：导出为 PDF 文件

## 功能支持

- 数学公式（KaTeX）
- 代码高亮
- Mermaid 图表
- 本地图片

---

请点击工具栏的「打开文件」按钮打开一个 Markdown 文件，或直接在此编写内容。
`

// ── Utility ────────────────────────────────────────────

function getFileName(path: string | null): string {
  if (!path) return '未命名'
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return lastSep >= 0 ? path.substring(lastSep + 1) : path
}

export function extractH1Title(mdContent: string): string | null {
  const h1Match = mdContent.match(/^#\s+(.+)$/m)
  return h1Match ? h1Match[1].trim() : null
}

export function findMkdocsYmlPath(docsPath: string): string | null {
  const normalized = docsPath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) return null
  const projectDir = normalized.substring(0, lastSlash)
  return `${projectDir}/mkdocs.yml`
}

import { extractH1TitleFromContent } from './useMkdocsExport'

// ── Composable ─────────────────────────────────────────

// ── Recent items ────────────────────────────────────────

const RECENT_KEY = 'markrefine-recent-items'
const MAX_RECENT = 10

export interface RecentItem {
  type: 'file' | 'folder' | 'mkdocs'
  name: string
  path: string
  timestamp: number
}

export function addRecentItem(item: RecentItem) {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const items: RecentItem[] = raw ? JSON.parse(raw) : []
    // 同名同路径的项移除旧记录，用新的时间戳替换
    const filtered = items.filter(i => !(i.path === item.path && i.type === item.type))
    filtered.unshift(item)
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)))
  } catch { /* ignore */ }
}

export function getRecentItems(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// ── File management ─────────────────────────────────────

export function useFileManagement() {
  const { handleError } = useErrorHandling()

  // ── State ──────────────────────────────────────────

  const content = ref(DEFAULT_MD_CONTENT)
  const savedContent = ref(DEFAULT_MD_CONTENT)
  const currentFileDir = ref<string | null>(null)
  const currentFilePath = ref<string | null>(null)
  const currentMetadata = ref<Metadata>({})
  const openedFiles = ref<OpenedFile[]>([])
  const currentFileIndex = ref<number>(-1)
  const importedFolderPath = ref<string | null>(null)
  const mdFiles = ref<MdFile[]>([])
  const workState = ref<WorkState>('file')
  const mkdocsConfig = ref<MkdocsConfig>({ siteName: 'Documentation' })
  const mkdocsChapters = ref<any[]>([])

  // ── Computed ───────────────────────────────────────

  const hasUnsavedChanges = computed(() => {
    if (currentFileIndex.value < 0 || openedFiles.value.length === 0) return false
    const currentFile = openedFiles.value[currentFileIndex.value]
    return currentFile ? currentFile.content !== currentFile.savedContent : false
  })

  const windowTitle = computed(() => {
    if (currentFileIndex.value < 0 || openedFiles.value.length === 0) {
      return 'MarkRefine'
    }
    const currentFile = openedFiles.value[currentFileIndex.value]
    if (!currentFile) return 'MarkRefine'
    const fileName = currentFile.name
    const unsaved = currentFile.content !== currentFile.savedContent
    return unsaved ? `${fileName}* - MarkRefine` : `${fileName} - MarkRefine`
  })

  async function updateWindowTitle() {
    const win = getCurrentWindow()
    await win.setTitle(windowTitle.value)
  }

  // ── Multi-file helpers ─────────────────────────────

  function findFileIndex(path: string): number {
    return openedFiles.value.findIndex(f => f.path === path)
  }

  function addFileToList(path: string, fileContent: string): number {
    const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    const dir = lastSep > 0 ? path.substring(0, lastSep) : null
    const name = getFileName(path)
    openedFiles.value.push({ path, content: fileContent, savedContent: fileContent, dir, name })
    return openedFiles.value.length - 1
  }

  function switchToFile(index: number) {
    if (index < 0 || index >= openedFiles.value.length) return
    if (index === currentFileIndex.value) return
    currentFileIndex.value = index
    const file = openedFiles.value[index]
    content.value = file.content
    savedContent.value = file.savedContent
    currentFileDir.value = file.dir
    currentFilePath.value = file.path
    workState.value = 'file'
  }

  /**
   * Close a file by index. Accepts optional callbacks for save-confirm
   * and navigation-history push, wired by App.vue.
   */
  async function closeFile(
    index: number,
    checkUnsaved?: () => Promise<'save' | 'discard' | 'cancel' | 'none'>,
    doSaveFile?: () => Promise<boolean>,
    _pushNav?: (filePath: string) => void,
  ): Promise<boolean> {
    if (index < 0 || index >= openedFiles.value.length) return false

    const file = openedFiles.value[index]
    const wasCurrentFile = index === currentFileIndex.value
    const originalCurrentIndex = currentFileIndex.value

    if (file.content !== file.savedContent) {
      if (!wasCurrentFile) switchToFile(index)
      if (checkUnsaved) {
        const result = await checkUnsaved()
        if (result === 'cancel') {
          if (!wasCurrentFile && originalCurrentIndex !== currentFileIndex.value) {
            switchToFile(originalCurrentIndex)
          }
          return false
        }
        if (result === 'save' && doSaveFile) {
          await doSaveFile()
        }
      }
    }

    openedFiles.value.splice(index, 1)

    if (openedFiles.value.length === 0) {
      currentFileIndex.value = -1
      content.value = ''
      savedContent.value = ''
      currentFilePath.value = null
      currentFileDir.value = null
    } else if (wasCurrentFile) {
      if (currentFileIndex.value >= openedFiles.value.length) {
        currentFileIndex.value = openedFiles.value.length - 1
      }
      const newFile = openedFiles.value[currentFileIndex.value]
      content.value = newFile.content
      savedContent.value = newFile.savedContent
      currentFilePath.value = newFile.path
      currentFileDir.value = newFile.dir
    } else {
      if (index < originalCurrentIndex) {
        currentFileIndex.value = originalCurrentIndex - 1
      } else {
        currentFileIndex.value = originalCurrentIndex
      }
      const currentFile = openedFiles.value[currentFileIndex.value]
      content.value = currentFile.content
      savedContent.value = currentFile.savedContent
      currentFilePath.value = currentFile.path
      currentFileDir.value = currentFile.dir
    }

    return true
  }

  // Sync content back to openedFiles
  watch(content, (newContent) => {
    if (currentFileIndex.value >= 0 && currentFileIndex.value < openedFiles.value.length) {
      openedFiles.value[currentFileIndex.value].content = newContent
    }
  })

  // ── File I/O ────────────────────────────────────────

  async function newFile(resetNav?: () => void) {
    const newFileItem: OpenedFile = {
      path: null, content: '', savedContent: '', dir: null, name: '未命名'
    }
    openedFiles.value.push(newFileItem)
    const newIndex = openedFiles.value.length - 1
    currentFileIndex.value = newIndex
    content.value = ''
    savedContent.value = ''
    currentFileDir.value = null
    currentFilePath.value = null
    workState.value = 'file'
    resetNav?.()
  }

  async function openFile(pushNav?: (path: string) => void) {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
      })
      if (!selected) return

      const paths: string[] = Array.isArray(selected) ? selected : [selected]
      for (const path of paths) {
        if (findFileIndex(path) >= 0) continue
        const [text, encoding] = await invoke<[string, string]>('read_file_with_encoding', { path })
        const normalizedText = text.replace(/\r\n/g, '\n')
        addFileToList(path, normalizedText)
        addRecentItem({ type: 'file', name: getFileName(path), path, timestamp: Date.now() })
        console.log('Opened file:', path, 'Encoding:', encoding)
      }
      const lastIndex = openedFiles.value.length - 1
      switchToFile(lastIndex)
      if (pushNav) pushNav(paths[paths.length - 1])
    } catch (error) {
      await handleError(error, '打开文件')
    }
  }

  // 通过绝对路径打开文件（跳过文件对话框，用于最近记录）
  async function openFileFromPath(path: string, pushNav?: (path: string) => void): Promise<void> {
    try {
      const [text, encoding] = await invoke<[string, string]>('read_file_with_encoding', { path })
      const normalizedText = text.replace(/\r\n/g, '\n')
      const existingIndex = findFileIndex(path)
      if (existingIndex >= 0) {
        switchToFile(existingIndex)
      } else {
        addFileToList(path, normalizedText)
        const lastIndex = openedFiles.value.length - 1
        content.value = normalizedText
        savedContent.value = normalizedText
        switchToFile(lastIndex)
      }
      addRecentItem({ type: 'file', name: getFileName(path), path, timestamp: Date.now() })
      if (pushNav) pushNav(path)
      console.log('Opened file from path:', path, 'Encoding:', encoding)
    } catch (error) {
      await handleError(error, '打开文件')
    }
  }

  // 通过绝对路径导入文件夹（跳过对话框，用于最近记录）
  async function importFolderByPath(
    folderPath: string,
    checkAllUnsaved?: () => Promise<boolean>,
    resetNav?: () => void,
    onFirstFile?: (path: string) => Promise<void>,
  ) {
    const canContinue = checkAllUnsaved ? await checkAllUnsaved() : true
    if (!canContinue) return
    try {
      importedFolderPath.value = folderPath
      resetNav?.()
      openedFiles.value = []
      currentFileIndex.value = -1
      content.value = ''
      savedContent.value = ''
      currentFilePath.value = null
      currentFileDir.value = null
      mdFiles.value = await readFolderRecursive(folderPath)
      workState.value = 'folder'
      addRecentItem({ type: 'folder', name: getFileName(folderPath), path: folderPath, timestamp: Date.now() })
      console.log('导入文件夹(路径):', folderPath, '文件数:', countMdFiles(mdFiles.value))
      const firstFilePath = findFirstMdFilePath(mdFiles.value)
      if (firstFilePath && onFirstFile) {
        await onFirstFile(firstFilePath)
      }
    } catch (error) {
      await handleError(error, '导入文件夹')
    }
  }

  // 通过绝对路径导入 MkDocs（跳过对话框，用于最近记录）
  async function importMkdocsByPath(
    mkdocsPath: string,
    checkAllUnsaved?: () => Promise<boolean>,
    resetNav?: () => void,
    onFirstFile?: (path: string) => Promise<void>,
  ) {
    const canContinue = checkAllUnsaved ? await checkAllUnsaved() : true
    if (!canContinue) return
    try {
      // mkdocsPath 是项目根目录，需要拼接 mkdocs.yml
      const ymlPath = mkdocsPath + '/mkdocs.yml'
      // 也尝试 .yaml 扩展名
      let ymlContent: string
      try {
        ymlContent = await readTextFile(ymlPath)
      } catch {
        const yamlPath = mkdocsPath + '/mkdocs.yaml'
        ymlContent = await readTextFile(yamlPath)
      }
      const config = parseYaml(ymlContent) as {
        nav?: any[]; docs_dir?: string; site_name?: string; plugins?: any
      }
      const siteName = config.site_name || getFileName(mkdocsPath)
      const docsDir = config.docs_dir || 'docs'
      const docsPath = mkdocsPath + '/' + docsDir

      let coverTitle: string | undefined
      let coverSubtitle: string | undefined
      let author: string | undefined
      let copyright: string | undefined
      if (config.plugins) {
        const withPdfConfig = Array.isArray(config.plugins)
          ? config.plugins.find((p: any) => typeof p === 'object' && p['with-pdf'])
          : config.plugins['with-pdf']
        if (withPdfConfig) {
          coverTitle = withPdfConfig.cover_title
          coverSubtitle = withPdfConfig.cover_subtitle
          author = withPdfConfig.author
          copyright = withPdfConfig.copyright
        }
      }
      mkdocsConfig.value = { siteName, coverTitle, coverSubtitle, author, copyright }

      resetNav?.()
      importedFolderPath.value = mkdocsPath
      openedFiles.value = []
      currentFileIndex.value = -1
      content.value = ''
      savedContent.value = ''
      currentFilePath.value = null
      currentFileDir.value = null

      if (config.nav && Array.isArray(config.nav) && config.nav.length > 0) {
        mdFiles.value = extractMdFilesFromNav(config.nav, docsPath)
        await updateMdFileNamesFromH1(mdFiles.value)
      } else {
        mdFiles.value = []
      }
      workState.value = 'mkdocs'
      addRecentItem({ type: 'mkdocs', name: siteName, path: mkdocsPath, timestamp: Date.now() })
      console.log('导入 Mkdocs(路径):', mkdocsPath, 'docs_dir:', docsDir, '文件数:', mdFiles.value.length)

      const firstFilePath = findFirstMdFilePath(mdFiles.value)
      if (firstFilePath && onFirstFile) {
        await onFirstFile(firstFilePath)
      }
    } catch (error) {
      await handleError(error, '导入 Mkdocs')
    }
  }

  async function saveFile(): Promise<boolean> {
    // MkDocs 模式下从文件树直接打开的文件也在 openedFiles 中
    const hasOpenedFile = currentFileIndex.value >= 0 && openedFiles.value.length > 0
    const filePath = hasOpenedFile
      ? openedFiles.value[currentFileIndex.value].path
      : currentFilePath.value

    if (!filePath) {
      // 新建未保存文件：弹出保存对话框
      const newPath = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (!newPath) return false
      return saveContentToPath(newPath)
    }

    try {
      await writeTextFile(filePath, content.value)
      if (hasOpenedFile) {
        openedFiles.value[currentFileIndex.value].savedContent = content.value
      }
      savedContent.value = content.value
      return true
    } catch (error) {
      await handleError(error, '保存文件')
      return false
    }
  }

  function saveContentToPath(newPath: string): Promise<boolean> {
    return (async () => {
      try {
        await writeTextFile(newPath, content.value)
        const lastSep = Math.max(newPath.lastIndexOf('/'), newPath.lastIndexOf('\\'))
        currentFilePath.value = newPath
        currentFileDir.value = lastSep > 0 ? newPath.substring(0, lastSep) : null
        savedContent.value = content.value
        const hasOpenedFile = currentFileIndex.value >= 0 && openedFiles.value.length > 0
        if (hasOpenedFile) {
          openedFiles.value[currentFileIndex.value].path = newPath
          openedFiles.value[currentFileIndex.value].savedContent = content.value
          openedFiles.value[currentFileIndex.value].dir = currentFileDir.value
          openedFiles.value[currentFileIndex.value].name = getFileName(newPath)
        }
        return true
      } catch (error) {
        await handleError(error, '保存文件')
        return false
      }
    })()
  }

  async function saveFileAs(): Promise<boolean> {
    const filePath = await save({
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (!filePath) return false
    return saveContentToPath(filePath)
  }

  // ── File tree ───────────────────────────────────────

  async function openFileFromTree(path: string, _pushNav?: (path: string, anchor?: string | null) => void, _pendingAnchor?: string | null) {
    try {
      const [text, encoding] = await invoke<[string, string]>('read_file_with_encoding', { path })
      const normalizedText = text.replace(/\r\n/g, '\n')
      content.value = normalizedText
      savedContent.value = normalizedText
      const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
      currentFileDir.value = lastSep > 0 ? path.substring(0, lastSep) : null
      currentFilePath.value = path
      console.log('从文件树打开:', path, '编码:', encoding)
      return { success: true, encoding }
    } catch (error) {
      await handleError(error, '打开文件')
      return { success: false }
    }
  }

  async function openFileFromTreeNoHistory(path: string, _pendingAnchor?: string | null) {
    try {
      const [text, encoding] = await invoke<[string, string]>('read_file_with_encoding', { path })
      const normalizedText = text.replace(/\r\n/g, '\n')
      content.value = normalizedText
      savedContent.value = normalizedText
      const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
      currentFileDir.value = lastSep > 0 ? path.substring(0, lastSep) : null
      currentFilePath.value = path
      console.log('打开文件（无历史记录）:', path, '编码:', encoding)
      return { success: true, encoding }
    } catch (error) {
      await handleError(error, '打开文件')
      return { success: false }
    }
  }

  // ── Folder import ───────────────────────────────────

  async function readFolderRecursive(folderPath: string): Promise<MdFile[]> {
    const result: MdFile[] = []
    try {
      const entries = await readDir(folderPath)
      const files = entries
        .filter(e => !e.isDirectory && e.name.endsWith('.md'))
        .map(e => ({ name: e.name.replace(/\.md$/i, ''), path: folderPath + '/' + e.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const subFolders = entries
        .filter(e => e.isDirectory && !e.name.startsWith('.') && !e.name.startsWith('_'))
        .sort((a, b) => a.name.localeCompare(b.name))
      result.push(...files)
      for (const folder of subFolders) {
        try {
          const children = await readFolderRecursive(folderPath + '/' + folder.name)
          if (children.length > 0) {
            result.push({ name: folder.name, isFolder: true, children })
          }
        } catch {
          console.warn('跳过无法访问的文件夹:', folderPath + '/' + folder.name)
        }
      }
    } catch {
      console.warn('无法读取文件夹:', folderPath)
    }
    return result
  }

  function countMdFiles(files: MdFile[]): number {
    let count = 0
    for (const file of files) {
      if (file.isFolder && file.children) {
        count += countMdFiles(file.children)
      } else if (file.path) {
        count++
      }
    }
    return count
  }

  function findFirstMdFilePath(files: MdFile[]): string | null {
    for (const file of files) {
      if (file.isFolder && file.children && file.children.length > 0) {
        const found = findFirstMdFilePath(file.children)
        if (found) return found
      } else if (file.path) {
        return file.path
      }
    }
    return null
  }

  async function importFolder(
    checkAllUnsaved?: () => Promise<boolean>,
    resetNav?: () => void,
    onFirstFile?: (path: string) => Promise<void>,
  ) {
    const canContinue = checkAllUnsaved ? await checkAllUnsaved() : true
    if (!canContinue) return

    try {
      const selected = await open({ directory: true, multiple: false })
      if (selected && typeof selected === 'string') {
        importedFolderPath.value = selected
        resetNav?.()
        openedFiles.value = []
        currentFileIndex.value = -1
        content.value = ''
        savedContent.value = ''
        currentFilePath.value = null
        currentFileDir.value = null
        mdFiles.value = await readFolderRecursive(selected)
        workState.value = 'folder'
        addRecentItem({ type: 'folder', name: getFileName(selected), path: selected, timestamp: Date.now() })
        console.log('导入文件夹:', selected, '文件数:', countMdFiles(mdFiles.value))
        const firstFilePath = findFirstMdFilePath(mdFiles.value)
        if (firstFilePath && onFirstFile) {
          await onFirstFile(firstFilePath)
        }
      }
    } catch (error) {
      await handleError(error, '导入文件夹')
    }
  }

  // ── MkDocs import ───────────────────────────────────

  function extractMdFilesFromNav(nav: any[], basePath: string): MdFile[] {
    const files: MdFile[] = []
    for (const item of nav) {
      if (typeof item === 'string' && item.endsWith('.md')) {
        files.push({ name: item.replace(/\.md$/i, ''), path: basePath + '/' + item, hasExplicitTitle: false })
      } else if (typeof item === 'object') {
        for (const [title, value] of Object.entries(item)) {
          if (typeof value === 'string' && value.endsWith('.md')) {
            files.push({ name: title, path: basePath + '/' + value, hasExplicitTitle: true })
          } else if (Array.isArray(value)) {
            files.push({ name: title, isFolder: true, children: extractMdFilesFromNav(value, basePath), hasExplicitTitle: true })
          }
        }
      }
    }
    return files
  }

  async function updateMdFileNamesFromH1(files: MdFile[]): Promise<void> {
    for (const file of files) {
      if (file.isFolder && file.children) {
        await updateMdFileNamesFromH1(file.children)
      } else if (file.path && !file.hasExplicitTitle) {
        try {
          const [text] = await invoke<[string, string]>('read_file_with_encoding', { path: file.path })
          const mdContent = text.replace(/\r\n/g, '\n')
          const h1Title = extractH1TitleFromContent(mdContent)
          if (h1Title && h1Title.trim() !== '') {
            file.name = h1Title
          }
        } catch (error) {
          console.warn(`无法读取文件 ${file.path}:`, error)
        }
      }
    }
  }

  async function importMkdocs(
    checkAllUnsaved?: () => Promise<boolean>,
    resetNav?: () => void,
    onFirstFile?: (path: string) => Promise<void>,
  ) {
    const canContinue = checkAllUnsaved ? await checkAllUnsaved() : true
    if (!canContinue) return

    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
      })
      if (!selected || typeof selected !== 'string') return

      const ymlContent = await readTextFile(selected)
      const config = parseYaml(ymlContent) as {
        nav?: any[]; docs_dir?: string; site_name?: string; plugins?: any
      }

      const siteName = config.site_name || 'Documentation'

      let coverTitle: string | undefined
      let coverSubtitle: string | undefined
      let author: string | undefined
      let copyright: string | undefined
      if (config.plugins) {
        let withPdfConfig: any = null
        if (Array.isArray(config.plugins)) {
          for (const plugin of config.plugins) {
            if (typeof plugin === 'object' && plugin['with-pdf']) {
              withPdfConfig = plugin['with-pdf']
              break
            }
          }
        } else if (typeof config.plugins === 'object') {
          withPdfConfig = config.plugins['with-pdf']
        }
        if (withPdfConfig) {
          coverTitle = withPdfConfig.cover_title
          coverSubtitle = withPdfConfig.cover_subtitle
          author = withPdfConfig.author
          copyright = withPdfConfig.copyright
        }
      }

      mkdocsConfig.value = { siteName, coverTitle, coverSubtitle, author, copyright }

      const mkdocsPath = selected.substring(0, Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\')))
      const docsDir = config.docs_dir || 'docs'
      const docsPath = mkdocsPath + '/' + docsDir

      importedFolderPath.value = docsPath
      resetNav?.()
      openedFiles.value = []
      currentFileIndex.value = -1
      content.value = ''
      savedContent.value = ''
      currentFilePath.value = null
      currentFileDir.value = null

      if (config.nav && Array.isArray(config.nav)) {
        mdFiles.value = extractMdFilesFromNav(config.nav, docsPath)
        await updateMdFileNamesFromH1(mdFiles.value)
      } else {
        mdFiles.value = []
      }

      workState.value = 'mkdocs'
      addRecentItem({ type: 'mkdocs', name: siteName, path: mkdocsPath, timestamp: Date.now() })
      console.log('导入 Mkdocs:', selected, 'docs_dir:', docsPath, '文件数:', mdFiles.value.length)

      const firstFilePath = findFirstMdFilePath(mdFiles.value)
      if (firstFilePath && onFirstFile) {
        await onFirstFile(firstFilePath)
      }
    } catch (error) {
      await handleError(error, '导入 Mkdocs')
    }
  }

  // ── Public API ──────────────────────────────────────

  return {
    // State
    content,
    savedContent,
    currentFileDir,
    currentFilePath,
    currentMetadata,
    openedFiles,
    currentFileIndex,
    importedFolderPath,
    mdFiles,
    workState,
    mkdocsConfig,
    mkdocsChapters,
    // Computed
    hasUnsavedChanges,
    windowTitle,
    updateWindowTitle,
    // Multi-file
    findFileIndex,
    addFileToList,
    switchToFile,
    closeFile,
    // File I/O
    newFile,
    openFile,
    saveFile,
    saveFileAs,
    // File tree
    openFileFromTree,
    openFileFromTreeNoHistory,
    // Folder import
    readFolderRecursive,
    countMdFiles,
    findFirstMdFilePath,
    importFolder,
    importFolderByPath,
    importMkdocsByPath,
    openFileFromPath,
    // MkDocs import
    extractMdFilesFromNav,
    updateMdFileNamesFromH1,
    importMkdocs,
    // Utils
    getFileName,
  }
}
