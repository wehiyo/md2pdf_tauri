import { ref, computed, watch } from 'vue'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { parse as parseYaml } from 'yaml'
import { useErrorHandling } from './useErrorHandling'
import type { Metadata } from './useMarkdown'

// ── Types ──────────────────────────────────────────────

export interface OpenedFile {
  path: string | null
  content: string
  savedContent: string
  dir: string | null
  name: string
}

export interface MdFile {
  name: string
  path?: string
  children?: MdFile[]
  isFolder?: boolean
  hasExplicitTitle?: boolean
}

export type WorkState = 'file' | 'folder' | 'mkdocs'

export interface MkdocsConfig {
  siteName: string
  coverTitle?: string
  coverSubtitle?: string
  author?: string
  copyright?: string
}

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
        console.log('Opened file:', path, 'Encoding:', encoding)
      }
      const lastIndex = openedFiles.value.length - 1
      switchToFile(lastIndex)
      if (pushNav) pushNav(paths[paths.length - 1])
    } catch (error) {
      await handleError(error, '打开文件')
    }
  }

  async function saveFile(): Promise<boolean> {
    if (currentFileIndex.value < 0 || openedFiles.value.length === 0) return false
    try {
      const currentFile = openedFiles.value[currentFileIndex.value]
      if (currentFile.path) {
        await writeTextFile(currentFile.path, content.value)
        openedFiles.value[currentFileIndex.value].savedContent = content.value
        savedContent.value = content.value
        return true
      }
      const filePath = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (filePath) {
        await writeTextFile(filePath, content.value)
        const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
        openedFiles.value[currentFileIndex.value].path = filePath
        openedFiles.value[currentFileIndex.value].savedContent = content.value
        openedFiles.value[currentFileIndex.value].dir = lastSep > 0 ? filePath.substring(0, lastSep) : null
        openedFiles.value[currentFileIndex.value].name = getFileName(filePath)
        savedContent.value = content.value
        currentFilePath.value = filePath
        currentFileDir.value = lastSep > 0 ? filePath.substring(0, lastSep) : null
        return true
      }
      return false
    } catch (error) {
      await handleError(error, '保存文件')
      return false
    }
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
    // File tree
    openFileFromTree,
    openFileFromTreeNoHistory,
    // Folder import
    readFolderRecursive,
    countMdFiles,
    findFirstMdFilePath,
    importFolder,
    // MkDocs import
    extractMdFilesFromNav,
    updateMdFileNamesFromH1,
    importMkdocs,
    // Utils
    getFileName,
  }
}
