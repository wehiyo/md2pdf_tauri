<template>
  <div class="app-container">
    <div class="main-content" :style="{ zoom: zoomLevel + '%' }">
      <FileTree
        v-if="showFileTree"
        :folder-path="importedFolderPath || ''"
        :files="mdFiles"
        :current-file="currentFilePath"
        :style="{ width: fileTreeWidth + 'px' }"
        @select="openFileFromTree"
        @close="showFileTree = false"
      />
      <div
        v-if="showFileTree"
        class="splitter file-tree-splitter"
        @mousedown="startFileTreeResize"
      />
      <Editor
        ref="editorRef"
        v-show="!previewOnlyMode"
        v-model="content"
        :theme="theme"
        class="editor-pane"
        :style="editorPaneStyle"
        @new-file="newFile"
        @open-file="openFile"
        @save-file="saveFile"
        @toggle-preview="togglePreview"
      />
      <div
        v-show="showPreview && !previewOnlyMode"
        class="splitter"
        @mousedown="startResize"
      />
      <Preview
        v-show="showPreview || previewOnlyMode"
        ref="previewRef"
        :html="renderedHtml"
        :file-dir="currentFileDir"
        :preview-only-mode="previewOnlyMode"
        :can-navigate-back="canNavigateBack"
        :can-navigate-forward="canNavigateForward"
        class="preview-pane"
        :style="previewPaneStyle"
        @preview-only="togglePreviewOnly"
        @import-folder="importFolder"
        @import-mkdocs="importMkdocs"
        @export-html="exportHTML"
        @export-pdf="exportPDF"
        @navigate-to-file="navigateToFile"
        @navigate-to-anchor="navigateToAnchor"
        @navigate-back="navigateBack"
        @navigate-forward="navigateForward"
      />
    </div>
    <ExportProgress />
    <MkdocsPreviewDialog
      :visible="showMkdocsPreview"
      :bookmark-tree="mkdocsBookmarkTree"
      :combined-html="mkdocsCombinedHtml"
      @confirm="confirmMkdocsExport"
      @cancel="cancelMkdocsExport"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import FileTree from './components/FileTree.vue'
import ExportProgress from './components/ExportProgress.vue'
import MkdocsPreviewDialog from './components/MkdocsPreviewDialog.vue'
import { useMarkdown } from './composables/useMarkdown'
import type { Metadata } from './composables/useMarkdown'
import { usePDF } from './composables/usePDF'
import { useTheme } from './composables/useTheme'
import { useScrollSync } from './composables/useScrollSync'
import { useErrorHandling } from './composables/useErrorHandling'
import {
  prepareMkdocsExport,
  type BookmarkTreeNode
} from './composables/useMkdocsExport'
import { save, open, message, ask } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { parse as parseYaml } from 'yaml'
import katexStyles from './assets/katex/katex-inline.css?raw'
import highlightStyles from './assets/github.min.css?raw'

// 默认提示内容
const defaultContent = `# MarkRefine - Markdown 编辑器

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

const content = ref(defaultContent)
const currentFileDir = ref<string | null>(null)
const currentFilePath = ref<string | null>(null)
const savedContent = ref(defaultContent) // 记录已保存的内容
const currentMetadata = ref<Metadata>({})
const { render } = useMarkdown()
const { exportToPDF } = usePDF()
const { theme } = useTheme()
const { handleError } = useErrorHandling()
const editorRef = ref<InstanceType<typeof Editor>>()
const previewRef = ref<InstanceType<typeof Preview>>()

// 文件树相关状态
const showFileTree = ref(false)
const importedFolderPath = ref<string | null>(null)
interface MdFile {
  name: string
  path?: string  // 文件节点才有路径
  children?: MdFile[]  // 目录节点才有子节点
  isFolder?: boolean  // 是否为目录节点
}
const mdFiles = ref<MdFile[]>([])
const fileTreeWidth = ref(200) // 文件树宽度（像素）
const MIN_FILE_TREE_WIDTH = 150
const MAX_FILE_TREE_WIDTH = 400

// 工作状态：'file' = 通过按钮打开文件, 'folder' = 导入文件夹, 'mkdocs' = 导入 Mkdocs
type WorkState = 'file' | 'folder' | 'mkdocs'
const workState = ref<WorkState>('file')

// MkDocs 组合导出预览对话框状态
const showMkdocsPreview = ref(false)
const mkdocsBookmarkTree = ref<BookmarkTreeNode[]>([])
const mkdocsCombinedHtml = ref('')
const mkdocsChapters = ref<any[]>([])

// 检测是否有未保存的改动
const hasUnsavedChanges = computed(() => content.value !== savedContent.value)

// 滚动容器引用
const editorScrollContainer = ref<HTMLElement | null>(null)
const previewScrollContainer = ref<HTMLElement | null>(null)

// 滚动同步
const { startSync } = useScrollSync(editorScrollContainer, previewScrollContainer)

// 预览区显示状态
const showPreview = ref(true)

// 仅预览模式（隐藏编辑器）
const previewOnlyMode = ref(false)

// 页面缩放级别
const zoomLevel = ref(100)
const MIN_ZOOM = 50
const MAX_ZOOM = 200

// 分割器相关
const editorWidth = ref(50) // 编辑器宽度百分比
const isResizing = ref(false)

// 计算编辑器和预览区样式
const editorPaneStyle = computed(() => {
  if (previewOnlyMode.value) {
    return { display: 'none' }
  }
  if (!showPreview.value) {
    return { flex: '1', width: '0' }
  }
  return { flex: `${editorWidth.value} 1 0` }
})

const previewPaneStyle = computed(() => {
  if (previewOnlyMode.value) {
    return { flex: '1', width: '100%' }
  }
  if (!showPreview.value) {
    return { display: 'none' }
  }
  return { flex: `${100 - editorWidth.value} 1 0` }
})

// 开始拖动分割器
function startResize(event: MouseEvent) {
  event.preventDefault()
  isResizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// 处理拖动
function handleResize(event: MouseEvent) {
  if (!isResizing.value) return

  const mainContent = document.querySelector('.main-content') as HTMLElement
  if (!mainContent) return

  const rect = mainContent.getBoundingClientRect()
  const newWidth = ((event.clientX - rect.left) / rect.width) * 100

  // 限制最小和最大宽度
  editorWidth.value = Math.min(80, Math.max(20, newWidth))
}

// 停止拖动
function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// 文件树分割器拖动
let isFileTreeResizing = false

function startFileTreeResize(event: MouseEvent) {
  event.preventDefault()
  isFileTreeResizing = true
  document.addEventListener('mousemove', handleFileTreeResize)
  document.addEventListener('mouseup', stopFileTreeResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleFileTreeResize(event: MouseEvent) {
  if (!isFileTreeResizing) return

  const mainContent = document.querySelector('.main-content') as HTMLElement
  if (!mainContent) return

  const rect = mainContent.getBoundingClientRect()
  const zoom = zoomLevel.value / 100
  const newWidth = (event.clientX - rect.left) / zoom

  fileTreeWidth.value = Math.min(MAX_FILE_TREE_WIDTH, Math.max(MIN_FILE_TREE_WIDTH, newWidth))
}

function stopFileTreeResize() {
  isFileTreeResizing = false
  document.removeEventListener('mousemove', handleFileTreeResize)
  document.removeEventListener('mouseup', stopFileTreeResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// 处理 Ctrl + 鼠标滚轮缩放
function handleWheel(event: WheelEvent) {
  if (event.ctrlKey) {
    event.preventDefault()

    const delta = event.deltaY > 0 ? -10 : 10
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel.value + delta))

    zoomLevel.value = newZoom
  }
}

// 切换预览区显示
function togglePreview() {
  showPreview.value = !showPreview.value
  previewOnlyMode.value = false
}

// 切换仅预览模式
function togglePreviewOnly() {
  if (previewOnlyMode.value) {
    // 退出仅预览模式，恢复显示编辑区和预览区
    previewOnlyMode.value = false
    showPreview.value = true
  } else {
    // 进入仅预览模式
    showPreview.value = true
    previewOnlyMode.value = true
  }
}

// Tabbed 标签页切换脚本（用于 HTML 导出）
// 注意：使用字符串拼接避免 Vue SFC 解析 <script> 标签
const tabbedClickScript = '<' + 'script>\n' +
`  document.querySelectorAll('.tabbed-label').forEach(label => {
    label.addEventListener('click', function() {
      const tabSet = this.closest('.tabbed-set');
      if (!tabSet) return;

      const tabIndex = this.getAttribute('data-tab-index');

      // 更新标签状态
      tabSet.querySelectorAll('.tabbed-label').forEach(l => l.classList.remove('active'));
      this.classList.add('active');

      // 更新内容状态
      tabSet.querySelectorAll('.tabbed-block').forEach(block => {
        if (block.getAttribute('data-tab-index') === tabIndex) {
          block.classList.add('active');
        } else {
          block.classList.remove('active');
        }
      });
    });
  });
` + '<' + '/script>'

// 计算渲染后的 HTML 和 metadata
const renderedHtml = computed(() => {
  const result = render(content.value)
  currentMetadata.value = result.metadata
  return result.html
})

// 导出 HTML
async function exportHTML() {
  try {
    const filePath = await save({
      filters: [{
        name: 'HTML',
        extensions: ['html']
      }]
    })

    if (filePath) {
      // 从预览区域获取已渲染的 HTML（包含 Mermaid SVG）
      const previewElement = document.querySelector('.preview-content')
      let previewContent = previewElement?.innerHTML || renderedHtml.value

      // 将 asset 协议 URL 转换为原始绝对路径（用于浏览器显示）
      // 查找所有包含 data-original-src 的 img 标签，用原始路径替换 src
      previewContent = previewContent.replace(
        /<img([^>]*)>/g,
        (match, attrs) => {
          const originalSrcMatch = attrs.match(/data-original-src="([^"]+)"/)
          if (originalSrcMatch) {
            const originalSrc = originalSrcMatch[1]
            // 移除 data-original-src 属性，替换 src
            const newAttrs = attrs
              .replace(/data-original-src="[^"]+"/, '')
              .replace(/src="[^"]+"/, `src="${originalSrc}"`)
            return `<img${newAttrs}>`
          }
          return match
        }
      )

      // 使用 metadata.title 或从 h1 提取标题
      const title = currentMetadata.value.title || extractH1Title(content.value) || 'Exported Document'

      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${katexStyles}
    ${highlightStyles}
    ${document.querySelector('style[data-vite-dev-id*="markdown"]')?.textContent || ''}
    body {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div class="markdown-body">
    ${previewContent}
  </div>
${tabbedClickScript}
</body>
</html>`
      await writeTextFile(filePath, fullHtml)
      await message('HTML 导出成功！', { title: '成功', kind: 'info' })
    }
  } catch (error) {
    await handleError(error, '导出 HTML')
  }
}

// 导出 PDF
async function exportPDF() {
  if (workState.value === 'mkdocs') {
    // MkDocs 模式：组合导出所有 nav 条目
    try {
      // 准备组合导出
      const { chapters, bookmarkTree, combinedHtml } = await prepareMkdocsExport(
        mdFiles.value,
        importedFolderPath.value || ''
      )

      // 存储结果用于预览对话框
      mkdocsChapters.value = chapters
      mkdocsBookmarkTree.value = bookmarkTree
      mkdocsCombinedHtml.value = combinedHtml

      // 显示预览对话框
      showMkdocsPreview.value = true
    } catch (error) {
      await handleError(error, '准备 MkDocs 导出')
    }
  } else {
    // 单文件模式：导出当前打开的文件
    // 从预览区域获取已渲染的 HTML（包含 Mermaid SVG）
    const previewElement = document.querySelector('.preview-content')
    const previewContent = previewElement?.innerHTML || renderedHtml.value

    await exportToPDF(previewContent, currentMetadata.value)
  }
}

// MkDocs 预览对话框确认导出
async function confirmMkdocsExport() {
  showMkdocsPreview.value = false

  try {
    // 使用组合后的 HTML 导出 PDF
    await exportToPDF(mkdocsCombinedHtml.value, currentMetadata.value)
  } catch (error) {
    await handleError(error, 'MkDocs 组合导出')
  }
}

// MkDocs 预览对话框取消
function cancelMkdocsExport() {
  showMkdocsPreview.value = false
}

// 从 Markdown 内容提取第一个 h1 标题
function extractH1Title(mdContent: string): string | null {
  const h1Match = mdContent.match(/^#\s+(.+)$/m)
  return h1Match ? h1Match[1].trim() : null
}

// 检查未保存改动并提示用户
async function checkUnsavedChanges(): Promise<boolean> {
  if (!hasUnsavedChanges.value) return true

  const shouldSave = await ask('当前文件有未保存的改动，是否保存？', {
    title: '保存确认',
    kind: 'warning'
  })

  if (shouldSave) {
    // 用户选择保存，尝试保存
    await saveFile()
    // 即使保存失败（用户取消），也允许继续操作
    return true
  }

  // 用户选择不保存，继续操作
  return true
}

// 新建文件
async function newFile() {
  // 检查未保存改动
  const canProceed = await checkUnsavedChanges()
  if (!canProceed) return

  content.value = ''
  savedContent.value = ''
  currentFileDir.value = null
  currentFilePath.value = null
  workState.value = 'file'

  // 清空导航历史
  navigationHistory.value = []
  navigationIndex.value = -1
}

// 打开文件
async function openFile() {
  // 检查未保存改动
  const canProceed = await checkUnsavedChanges()
  if (!canProceed) return

  try {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Markdown',
        extensions: ['md', 'markdown', 'txt']
      }]
    })

    if (selected && typeof selected === 'string') {
      // 如果从文件夹或 Mkdocs 状态切换到文件状态，关闭文件树
      if (workState.value === 'folder' || workState.value === 'mkdocs') {
        showFileTree.value = false
      }
      workState.value = 'file'

      // 使用支持 GB18030 编码的读取命令
      const [text, encoding] = await invoke<[string, string]>('read_file_with_encoding', { path: selected })
      // 规范化换行符，与编辑器内部处理保持一致
      const normalizedText = text.replace(/\r\n/g, '\n')
      content.value = normalizedText
      savedContent.value = normalizedText

      // 从文件路径提取目录（使用字符串操作，不导入 Tauri API）
      const lastSep = Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\'))
      currentFileDir.value = lastSep > 0 ? selected.substring(0, lastSep) : null
      currentFilePath.value = selected
      console.log('Opened file:', selected, 'Encoding:', encoding)
      console.log('File directory:', currentFileDir.value)

      // 记录导航历史（打开文件时初始化历史栈）
      pushNavigationState(selected)
    }
  } catch (error) {
    await handleError(error, '打开文件')
  }
}

// 保存文件，返回是否保存成功
async function saveFile(): Promise<boolean> {
  try {
    // 如果已有文件路径，直接保存
    if (currentFilePath.value) {
      await writeTextFile(currentFilePath.value, content.value)
      savedContent.value = content.value
      await message('文件保存成功！', { title: '成功', kind: 'info' })
      return true
    }

    // 没有文件路径，弹出保存对话框
    const filePath = await save({
      filters: [{
        name: 'Markdown',
        extensions: ['md']
      }]
    })

    if (filePath) {
      await writeTextFile(filePath, content.value)
      savedContent.value = content.value
      currentFilePath.value = filePath

      // 更新文件目录
      const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
      currentFileDir.value = lastSep > 0 ? filePath.substring(0, lastSep) : null

      await message('文件保存成功！', { title: '成功', kind: 'info' })
      return true
    }

    return false
  } catch (error) {
    await handleError(error, '保存文件')
    return false
  }
}

// 导入文件夹（递归读取子文件夹）
async function importFolder() {
  try {
    const selected = await open({
      directory: true,
      multiple: false
    })

    if (selected && typeof selected === 'string') {
      importedFolderPath.value = selected

      // 清空导航历史（导入新文件夹时重新开始）
      navigationHistory.value = []
      navigationIndex.value = -1

      // 递归读取文件夹结构
      mdFiles.value = await readFolderRecursive(selected)

      showFileTree.value = true
      workState.value = 'folder'
      console.log('导入文件夹:', selected, '文件数:', countMdFiles(mdFiles.value))

      // 自动打开第一个 md 文件
      const firstFilePath = findFirstMdFilePath(mdFiles.value)
      if (firstFilePath) {
        await openFileFromTree(firstFilePath)
      }
    }
  } catch (error) {
    await handleError(error, '导入文件夹')
  }
}

// 递归读取文件夹，构建树状结构
async function readFolderRecursive(folderPath: string): Promise<MdFile[]> {
  const result: MdFile[] = []

  try {
    const entries = await readDir(folderPath)

    // 先添加文件，再添加文件夹
    const files = entries
      .filter(e => !e.isDirectory && e.name.endsWith('.md'))
      .map(e => ({
        name: e.name.replace(/\.md$/i, ''),
        path: folderPath + '/' + e.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // 获取子文件夹（排除以 . 或 _ 开头的隐藏文件夹）
    const subFolders = entries
      .filter(e => e.isDirectory && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .sort((a, b) => a.name.localeCompare(b.name))

    // 先添加文件
    result.push(...files)

    // 再递归添加子文件夹
    for (const folder of subFolders) {
      try {
        const children = await readFolderRecursive(folderPath + '/' + folder.name)
        if (children.length > 0) {
          result.push({
            name: folder.name,
            isFolder: true,
            children
          })
        }
      } catch {
        // 跳过无法访问的文件夹
        console.warn('跳过无法访问的文件夹:', folderPath + '/' + folder.name)
      }
    }
  } catch {
    // 跳过无法访问的文件夹
    console.warn('无法读取文件夹:', folderPath)
  }

  return result
}

// 统计 md 文件数量
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

// 查找第一个 md 文件路径（递归）
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

// 导入 Mkdocs（解析完整导航结构）
async function importMkdocs() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
    })

    if (selected && typeof selected === 'string') {
      // 读取 mkdocs.yml 内容
      const ymlContent = await readTextFile(selected)
      const config = parseYaml(ymlContent) as { nav?: any[]; docs_dir?: string }

      // 获取 docs_dir（默认 docs）
      const mkdocsPath = selected.substring(0, Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\')))
      const docsDir = config.docs_dir || 'docs'
      const docsPath = mkdocsPath + '/' + docsDir

      importedFolderPath.value = docsPath

      // 清空导航历史（导入新项目时重新开始）
      navigationHistory.value = []
      navigationIndex.value = -1

      // 从 nav 结构提取 md 文件（保留层级结构）
      if (config.nav && Array.isArray(config.nav)) {
        mdFiles.value = extractMdFilesFromNav(config.nav, docsPath)
      } else {
        mdFiles.value = []
      }

      showFileTree.value = true
      workState.value = 'mkdocs'
      console.log('导入 Mkdocs:', selected, 'docs_dir:', docsPath, '文件数:', mdFiles.value.length)

      // 自动打开第一个 md 文件
      const firstFilePath = findFirstMdFilePath(mdFiles.value)
      if (firstFilePath) {
        await openFileFromTree(firstFilePath)
      }
    }
  } catch (error) {
    await handleError(error, '导入 Mkdocs')
  }
}

// 从 nav 结构递归提取 md 文件（保留层级结构）
function extractMdFilesFromNav(nav: any[], basePath: string): MdFile[] {
  const files: MdFile[] = []

  for (const item of nav) {
    if (typeof item === 'string' && item.endsWith('.md')) {
      // 字符串形式："index.md"
      files.push({
        name: item.replace(/\.md$/i, ''),
        path: basePath + '/' + item
      })
    } else if (typeof item === 'object') {
      for (const [title, value] of Object.entries(item)) {
        if (typeof value === 'string' && value.endsWith('.md')) {
          // 对象形式：{ "Home": "index.md" }
          files.push({
            name: title,
            path: basePath + '/' + value
          })
        } else if (Array.isArray(value)) {
          // 嵌套导航：{ "Section": [...] }
          files.push({
            name: title,
            isFolder: true,
            children: extractMdFilesFromNav(value, basePath)
          })
        }
      }
    }
  }

  return files
}

// 从文件树打开文件
async function openFileFromTree(path: string) {
  const canProceed = await checkUnsavedChanges()
  if (!canProceed) return

  try {
    const [text, encoding] = await invoke<[string, string]>('read_file_with_encoding', { path })
    const normalizedText = text.replace(/\r\n/g, '\n')
    content.value = normalizedText
    savedContent.value = normalizedText

    const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    currentFileDir.value = lastSep > 0 ? path.substring(0, lastSep) : null
    currentFilePath.value = path
    console.log('从文件树打开:', path, '编码:', encoding)

    // 记录导航历史
    pushNavigationState(path, pendingAnchor.value)

    // 如果有待跳转的锚点，延迟跳转（等待渲染完成）
    if (pendingAnchor.value) {
      const anchor = pendingAnchor.value
      pendingAnchor.value = null
      await nextTick()
      setTimeout(() => scrollToAnchor(anchor), 200)
    }
  } catch (error) {
    await handleError(error, '打开文件')
  }
}

// 待跳转的锚点（跨文件链接跳转时使用）
const pendingAnchor = ref<string | null>(null)

// 导航历史栈
interface NavigationState {
  filePath: string
  anchor?: string
}
const navigationHistory = ref<NavigationState[]>([])
const navigationIndex = ref<number>(-1)
const MAX_HISTORY_SIZE = 50

// 导航状态
const canNavigateBack = computed(() => navigationIndex.value > 0)
const canNavigateForward = computed(() => navigationIndex.value < navigationHistory.value.length - 1)

// 推送导航状态到历史栈
function pushNavigationState(filePath: string, anchor?: string | null) {
  // 如果当前有索引，截断后面的历史（用户已返回后重新导航）
  if (navigationIndex.value >= 0 && navigationIndex.value < navigationHistory.value.length - 1) {
    navigationHistory.value = navigationHistory.value.slice(0, navigationIndex.value + 1)
  }

  // 添加新状态
  navigationHistory.value.push({ filePath, anchor: anchor || undefined })

  // 限制历史栈大小
  if (navigationHistory.value.length > MAX_HISTORY_SIZE) {
    navigationHistory.value.shift()
  } else {
    navigationIndex.value++
  }
}

// 处理跨文件链接跳转
async function navigateToFile(filePath: string, anchor?: string) {
  // 检查文件是否为 .md 文件
  if (!filePath.endsWith('.md')) return

  // 记录当前状态（跳转前的位置）
  if (currentFilePath.value) {
    // 更新当前状态的锚点（如果有待跳转锚点）
    if (navigationIndex.value >= 0) {
      navigationHistory.value[navigationIndex.value].anchor = pendingAnchor.value || undefined
    }
  }

  // 保存待跳转的锚点
  pendingAnchor.value = anchor || null

  // 如果是当前文件，直接跳转到锚点，不添加新历史
  if (currentFilePath.value === filePath) {
    if (anchor) {
      await nextTick()
      scrollToAnchor(anchor)
      // 更新当前状态的锚点
      if (navigationIndex.value >= 0) {
        navigationHistory.value[navigationIndex.value].anchor = anchor
      }
    }
    return
  }

  // 打开新文件（会检查未保存改动）
  await openFileFromTree(filePath)
}

// 处理同文件锚点跳转（记录历史）
async function navigateToAnchor(anchor: string) {
  if (!currentFilePath.value) return

  // 记录当前状态（跳转前的位置）
  if (navigationIndex.value >= 0) {
    navigationHistory.value[navigationIndex.value].anchor = pendingAnchor.value || undefined
  }

  // 添加新的锚点状态到历史栈
  pushNavigationState(currentFilePath.value, anchor)

  // 保存当前锚点
  pendingAnchor.value = anchor
}

// 返回上一位置
async function navigateBack() {
  if (!canNavigateBack.value) return

  // 保存当前位置的锚点
  if (navigationIndex.value >= 0 && pendingAnchor.value) {
    navigationHistory.value[navigationIndex.value].anchor = pendingAnchor.value
  }

  navigationIndex.value--
  const state = navigationHistory.value[navigationIndex.value]

  // 如果是当前文件，直接跳转到锚点
  if (currentFilePath.value === state.filePath) {
    pendingAnchor.value = state.anchor || null
    if (state.anchor) {
      await nextTick()
      scrollToAnchor(state.anchor)
    }
    return
  }

  // 打开目标文件
  pendingAnchor.value = state.anchor || null
  await openFileFromTreeNoHistory(state.filePath)
}

// 前进到下一位置
async function navigateForward() {
  if (!canNavigateForward.value) return

  // 保存当前位置的锚点
  if (navigationIndex.value >= 0 && pendingAnchor.value) {
    navigationHistory.value[navigationIndex.value].anchor = pendingAnchor.value
  }

  navigationIndex.value++
  const state = navigationHistory.value[navigationIndex.value]

  // 如果是当前文件，直接跳转到锚点
  if (currentFilePath.value === state.filePath) {
    pendingAnchor.value = state.anchor || null
    if (state.anchor) {
      await nextTick()
      scrollToAnchor(state.anchor)
    }
    return
  }

  // 打开目标文件
  pendingAnchor.value = state.anchor || null
  await openFileFromTreeNoHistory(state.filePath)
}

// 打开文件但不记录历史（用于返回/前进）
async function openFileFromTreeNoHistory(path: string) {
  const canProceed = await checkUnsavedChanges()
  if (!canProceed) return

  try {
    const [text, encoding] = await invoke<[string, string]>('read_file_with_encoding', { path })
    const normalizedText = text.replace(/\r\n/g, '\n')
    content.value = normalizedText
    savedContent.value = normalizedText

    const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    currentFileDir.value = lastSep > 0 ? path.substring(0, lastSep) : null
    currentFilePath.value = path
    console.log('打开文件（无历史记录）:', path, '编码:', encoding)

    // 如果有待跳转的锚点，延迟跳转
    if (pendingAnchor.value) {
      const anchor = pendingAnchor.value
      await nextTick()
      setTimeout(() => scrollToAnchor(anchor), 200)
    }
  } catch (error) {
    await handleError(error, '打开文件')
  }
}

// 跳转到锚点
function scrollToAnchor(anchor: string) {
  if (!previewRef.value) return

  const previewContainer = previewRef.value.getScrollContainer()
  if (!previewContainer) return

  const targetElement = previewContainer.querySelector(`#${CSS.escape(anchor)}`)
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// 初始化滚动同步
async function initScrollSync() {
  await nextTick()
  // 等待编辑器初始化完成
  setTimeout(() => {
    if (editorRef.value) {
      editorScrollContainer.value = editorRef.value.getScrollContainer()
    }
    if (previewRef.value) {
      previewScrollContainer.value = previewRef.value.getScrollContainer()
    }
    startSync()
  }, 100)
}

// 窗口关闭事件监听清理函数
let windowCloseUnlisten: (() => void) | null = null

// 处理窗口关闭请求
async function handleCloseRequest() {
  // 检查是否有未保存的改动
  const canProceed = await checkUnsavedChanges()
  if (canProceed) {
    // 用户确认关闭，真正关闭窗口
    const appWindow = getCurrentWindow()
    await appWindow.destroy()
  }
}

// 初始化
onMounted(async () => {
  initScrollSync()
  // 添加滚轮缩放事件监听
  window.addEventListener('wheel', handleWheel, { passive: false })

  // 监听窗口关闭请求事件（来自 Rust 后端）
  windowCloseUnlisten = await listen('close-requested', handleCloseRequest)
})

onUnmounted(() => {
  window.removeEventListener('wheel', handleWheel)
  // 清理关闭事件监听
  if (windowCloseUnlisten) {
    windowCloseUnlisten()
    windowCloseUnlisten = null
  }
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f8fafc;
}

.dark .app-container {
  background-color: #0f172a;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-pane,
.preview-pane {
  min-width: 0;
  overflow: hidden;
  flex-shrink: 0;
}

.editor-pane {
  border-right: none;
}

.dark .editor-pane {
  border-right-color: transparent;
}

/* 分割器样式 */
.splitter {
  width: 5px;
  background-color: #e2e8f0;
  cursor: col-resize;
  flex-shrink: 0;
  transition: background-color 0.2s;
  position: relative;
}

.splitter:hover {
  background-color: #3b82f6;
}

.splitter:active {
  background-color: #2563eb;
}

.dark .splitter {
  background-color: #334155;
}

.dark .splitter:hover {
  background-color: #3b82f6;
}

.dark .splitter:active {
  background-color: #60a5fa;
}
</style>
