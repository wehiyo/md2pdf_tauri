<template>
  <div class="app-container">
    <div class="main-content" :style="mainContentStyle">
      <LeftSidebar
        ref="sidebarRef"
        :work-state="workState"
        :folder-path="importedFolderPath || ''"
        :files="mdFiles"
        :current-file="currentFilePath"
        :has-multiple-files="mdFiles.length > 0 || openedFiles.length > 1"
        :global-search-results="globalSearchResults"
        :opened-files="openedFiles"
        :current-file-index="currentFileIndex"
        :style="{ width: sidebarWidth + 'px' }"
        @select-file="openFileFromTree"
        @search="handleSearch"
        @search-jump="handleSearchJump"
        @search-clear="handleSearchClear"
        @select-search-result="handleSearchResultSelect"
        @open-file="openFile"
        @switch-file="handleSwitchFile"
        @close-file="handleCloseFile"
      />
      <div
        class="splitter sidebar-splitter"
        @mousedown="startSidebarResize"
      />
      <Editor
        ref="editorRef"
        v-show="!previewOnlyMode"
        v-model="content"
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
        :md-files="mdFiles"
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
        @font-config-change="handleFontConfigChange"
      />
      <div class="splitter outline-splitter" />
      <OutlinePanel
        ref="outlineRef"
        :preview-ref="previewElement"
        class="outline-pane"
        @scroll-to-heading="handleOutlineScroll"
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

    <!-- 保存确认对话框 -->
    <Teleport to="body">
      <div v-if="showSaveConfirmDialog" class="save-confirm-overlay">
        <div class="save-confirm-dialog">
          <div class="save-confirm-title">保存确认</div>
          <div class="save-confirm-message">当前文件有未保存的改动，是否保存？</div>
          <div class="save-confirm-buttons">
            <button class="save-btn" @click="handleSaveConfirmYes">保存</button>
            <button class="discard-btn" @click="handleSaveConfirmNo">不保存</button>
            <button class="cancel-btn" @click="handleSaveConfirmCancel">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import LeftSidebar from './components/LeftSidebar.vue'
import OutlinePanel from './components/OutlinePanel.vue'
import ExportProgress from './components/ExportProgress.vue'
import MkdocsPreviewDialog from './components/MkdocsPreviewDialog.vue'
import { useMarkdown, slugifyForMkdocs } from './composables/useMarkdown'
import type { Metadata } from './composables/useMarkdown'
import { usePDF } from './composables/usePDF'
import { useScrollSync } from './composables/useScrollSync'
import { useErrorHandling } from './composables/useErrorHandling'
import { loadConfig, type FontConfig } from './composables/useConfig'
import { loadFonts } from './composables/useFonts'
import {
  prepareMkdocsExport,
  collectNavChapters,
  loadAllMdFiles,
  resetChapterCounters,
  type BookmarkTreeNode
} from './composables/useMkdocsExport'
import { exportStaticSite } from './composables/useStaticSiteExport'
import { save, open, message } from '@tauri-apps/plugin-dialog'
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

// 多文件打开：打开的文件列表
interface OpenedFile {
  path: string | null      // 文件路径（新建文件时为 null）
  content: string          // 文件内容
  savedContent: string     // 已保存的内容（用于检测修改）
  dir: string | null       // 文件目录
  name: string             // 文件名
}
const openedFiles = ref<OpenedFile[]>([])
const currentFileIndex = ref<number>(-1)  // 当前激活的文件索引，-1 表示无文件

// 字体配置（用于 PDF 导出）
const fontConfig = ref<FontConfig>({
  chineseFont: 'DengXian',
  englishFont: 'Arial',
  codeFont: 'SourceCodePro',
  bodyFontSize: 16,
  chineseCustomFonts: [],
  englishCustomFonts: [],
  codeCustomFonts: [],
  lineHeight: 1.6,
  paragraphSpacing: 1,
  previewWidth: 900,
  previewBackgroundColor: '#ffffff'
})

// 保存确认对话框状态
const showSaveConfirmDialog = ref(false)
let saveConfirmResolver: ((result: 'save' | 'discard' | 'cancel' | 'none') => void) | null = null
const { render, getHeadingLine } = useMarkdown()
const { exportToPDF } = usePDF()
const { handleError } = useErrorHandling()
const editorRef = ref<InstanceType<typeof Editor>>()
const previewRef = ref<InstanceType<typeof Preview>>()
const sidebarRef = ref<InstanceType<typeof LeftSidebar>>()
const outlineRef = ref<InstanceType<typeof OutlinePanel>>()
const previewElement = ref<HTMLElement | null>(null)

// 左侧边栏相关状态
const importedFolderPath = ref<string | null>(null)
const sidebarWidth = ref(240) // 左侧边栏宽度（像素）
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 350

interface MdFile {
  name: string
  path?: string  // 文件节点才有路径
  children?: MdFile[]  // 目录节点才有子节点
  isFolder?: boolean  // 是否为目录节点
  hasExplicitTitle?: boolean  // 是否有显式标题（nav 中指定）
}
const mdFiles = ref<MdFile[]>([])

// 工作状态：'file' = 通过按钮打开文件, 'folder' = 导入文件夹, 'mkdocs' = 导入 Mkdocs
type WorkState = 'file' | 'folder' | 'mkdocs'
const workState = ref<WorkState>('file')

// MkDocs 组合导出预览对话框状态
const showMkdocsPreview = ref(false)
const mkdocsBookmarkTree = ref<BookmarkTreeNode[]>([])
const mkdocsCombinedHtml = ref('')
const mkdocsChapters = ref<any[]>([])

// MkDocs 配置（从 mkdocs.yml 解析）
interface MkdocsConfig {
  siteName: string           // site_name，用于 PDF 文件名
  coverTitle?: string        // plugins/with-pdf cover_title，封面主标题
  coverSubtitle?: string     // plugins/with-pdf cover_subtitle，封面副标题
  author?: string            // author，封面右下角显示
  copyright?: string         // copyright，封面右下角显示
}
const mkdocsConfig = ref<MkdocsConfig>({
  siteName: 'Documentation'
})

// 全局搜索结果（传递给 LeftSidebar 显示）
const globalSearchText = ref('')
interface GlobalSearchResult {
  path: string
  matches: number
  context?: string
}
const globalSearchResults = ref<GlobalSearchResult[]>([])

// 检测是否有未保存的改动（基于当前打开的文件）
const hasUnsavedChanges = computed(() => {
  if (currentFileIndex.value < 0 || openedFiles.value.length === 0) return false
  const currentFile = openedFiles.value[currentFileIndex.value]
  return currentFile ? currentFile.content !== currentFile.savedContent : false
})

// 计算窗口标题
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

// 更新窗口标题
async function updateWindowTitle() {
  const win = getCurrentWindow()
  await win.setTitle(windowTitle.value)
}

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
let resizeStartX = 0 // 拖动开始时的鼠标 X 坐标
let resizeStartWidth = 0 // 拖动开始时的编辑器宽度百分比

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

// 计算主内容区域样式（只在缩放时应用 zoom）
const mainContentStyle = computed(() => {
  if (zoomLevel.value !== 100) {
    return { zoom: zoomLevel.value / 100 }
  }
  return {}
})

// 开始拖动分割器
function startResize(event: MouseEvent) {
  event.preventDefault()
  isResizing.value = true
  resizeStartX = event.clientX
  resizeStartWidth = editorWidth.value
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
  // 计算鼠标移动的距离（像素），转换为宽度百分比变化
  const deltaX = event.clientX - resizeStartX
  const deltaPercent = (deltaX / rect.width) * 100
  const newWidth = resizeStartWidth + deltaPercent

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

// 左侧边栏分割器拖动
let isSidebarResizing = false
let sidebarResizeStartX = 0
let sidebarResizeStartWidth = 0

function startSidebarResize(event: MouseEvent) {
  event.preventDefault()
  isSidebarResizing = true
  sidebarResizeStartX = event.clientX
  sidebarResizeStartWidth = sidebarWidth.value
  document.addEventListener('mousemove', handleSidebarResize)
  document.addEventListener('mouseup', stopSidebarResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleSidebarResize(event: MouseEvent) {
  if (!isSidebarResizing) return

  const zoom = zoomLevel.value / 100
  // 计算鼠标移动的距离，考虑 zoom 缩放
  const deltaX = (event.clientX - sidebarResizeStartX) / zoom
  const newWidth = sidebarResizeStartWidth + deltaX

  sidebarWidth.value = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, newWidth))
}

function stopSidebarResize() {
  isSidebarResizing = false
  document.removeEventListener('mousemove', handleSidebarResize)
  document.removeEventListener('mouseup', stopSidebarResize)
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
  // MkDocs 模式：导出静态站点
  if (workState.value === 'mkdocs' && importedFolderPath.value) {
    try {
      // 选择输出目录
      const outputDir = await open({
        directory: true,
        multiple: false,
        title: '选择静态站点输出目录'
      })

      if (!outputDir || typeof outputDir !== 'string') return

      // 读取 mkdocs.yml 获取 site_name
      const mkdocsYmlPath = findMkdocsYmlPath(importedFolderPath.value)
      let siteName = 'Documentation'
      if (mkdocsYmlPath) {
        try {
          const ymlContent = await readTextFile(mkdocsYmlPath)
          const config = parseYaml(ymlContent) as { site_name?: string }
          siteName = config.site_name || 'Documentation'
        } catch {
          // 无法读取配置，使用默认名称
        }
      }

      // 准备章节列表
      resetChapterCounters()
      const chapters = collectNavChapters(mdFiles.value, importedFolderPath.value, 0, '')
      await loadAllMdFiles(chapters)

      // 执行静态站点导出
      await exportStaticSite({
        outputDir,
        siteName,
        chapters
      })

      await message('静态站点导出成功！', { title: '成功', kind: 'info' })
    } catch (error) {
      await handleError(error, '导出静态站点')
    }
    return
  }

  // 单文件模式：导出单个 HTML 文件
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

    await exportToPDF(previewContent, currentMetadata.value, fontConfig.value)
  }
}

// MkDocs 预览对话框确认导出
async function confirmMkdocsExport() {
  showMkdocsPreview.value = false

  try {
    // 构建 metadata，使用 mkdocs.yml 的配置
    const metadata: Metadata = {
      title: mkdocsConfig.value.siteName,           // PDF 文件名
      coverTitle: mkdocsConfig.value.coverTitle,    // 封面主标题
      coverSubtitle: mkdocsConfig.value.coverSubtitle, // 封面副标题
      author: mkdocsConfig.value.author,            // 作者
      copyright: mkdocsConfig.value.copyright       // 版权信息
    }
    // 使用组合后的 HTML 导出 PDF
    await exportToPDF(mkdocsCombinedHtml.value, metadata, fontConfig.value)
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

// 从 docs 目录路径推断 mkdocs.yml 路径
function findMkdocsYmlPath(docsPath: string): string | null {
  // docs 目录通常是 mkdocs.yml 同级的 docs 子目录
  // 例如：docsPath = /project/docs，则 mkdocs.yml = /project/mkdocs.yml
  const normalized = docsPath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) return null

  const projectDir = normalized.substring(0, lastSlash)
  return `${projectDir}/mkdocs.yml`
}

// 检查未保存改动并提示用户
// 返回：'save' - 用户选择保存，'discard' - 用户选择不保存，'cancel' - 用户取消，'none' - 无改动
async function checkUnsavedChanges(): Promise<'save' | 'discard' | 'cancel' | 'none'> {
  if (!hasUnsavedChanges.value) return 'none'

  // 显示自定义保存确认对话框
  showSaveConfirmDialog.value = true

  // 等待用户选择
  return new Promise((resolve) => {
    saveConfirmResolver = resolve
  })
}

// 批量检查所有未保存文件并依次提示保存
// 返回：true - 继续操作（已保存或用户选择丢弃），false - 用户取消
async function checkAllUnsavedFiles(): Promise<boolean> {
  const unsavedFiles: { index: number; file: OpenedFile }[] = []

  // 收集所有未保存的文件
  for (let i = 0; i < openedFiles.value.length; i++) {
    const file = openedFiles.value[i]
    if (file.content !== file.savedContent) {
      unsavedFiles.push({ index: i, file })
    }
  }

  if (unsavedFiles.length === 0) return true

  // 依次提示保存每个未保存的文件
  for (const { index } of unsavedFiles) {
    // 切换到该文件以便用户确认
    switchToFile(index)

    const result = await checkUnsavedChanges()
    if (result === 'cancel') return false
    if (result === 'save') {
      await saveFile()
    }
    // result === 'discard' 时，继续下一个文件
  }

  return true
}

// 保存确认对话框按钮处理
function handleSaveConfirmYes() {
  showSaveConfirmDialog.value = false
  if (saveConfirmResolver) {
    saveConfirmResolver('save')
    saveConfirmResolver = null
  }
}

function handleSaveConfirmNo() {
  showSaveConfirmDialog.value = false
  // 同步 savedContent，避免后续再次触发保存确认
  savedContent.value = content.value
  if (saveConfirmResolver) {
    saveConfirmResolver('discard')
    saveConfirmResolver = null
  }
}

function handleSaveConfirmCancel() {
  showSaveConfirmDialog.value = false
  if (saveConfirmResolver) {
    saveConfirmResolver('cancel')
    saveConfirmResolver = null
  }
}

// ===== 多文件打开辅助函数 =====

// 从路径提取文件名
function getFileName(path: string | null): string {
  if (!path) return '未命名'
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return lastSep >= 0 ? path.substring(lastSep + 1) : path
}

// 查找文件在列表中的索引
function findFileIndex(path: string): number {
  return openedFiles.value.findIndex(f => f.path === path)
}

// 添加文件到列表
function addFileToList(path: string, content: string): number {
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const dir = lastSep > 0 ? path.substring(0, lastSep) : null
  const name = getFileName(path)

  openedFiles.value.push({
    path,
    content,
    savedContent: content,
    dir,
    name
  })
  return openedFiles.value.length - 1
}

// 切换到指定文件（更新编辑器内容）
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

// 关闭指定文件
async function closeFile(index: number) {
  if (index < 0 || index >= openedFiles.value.length) return

  const file = openedFiles.value[index]
  const wasCurrentFile = index === currentFileIndex.value
  const originalCurrentIndex = currentFileIndex.value

  // 检查被关闭文件是否有未保存改动
  if (file.content !== file.savedContent) {
    // 如果不是当前文件，先切换到它以便用户确认
    if (!wasCurrentFile) {
      switchToFile(index)
    }

    const result = await checkUnsavedChanges()
    if (result === 'cancel') {
      // 用户取消，恢复原来的文件
      if (!wasCurrentFile) {
        switchToFile(originalCurrentIndex)
      }
      return
    }
    if (result === 'save') {
      await saveFile()
    }
  }

  // 从列表移除
  openedFiles.value.splice(index, 1)

  // 调整当前索引
  if (openedFiles.value.length === 0) {
    // 无文件，重置状态
    currentFileIndex.value = -1
    content.value = ''
    savedContent.value = ''
    currentFilePath.value = null
    currentFileDir.value = null
  } else if (wasCurrentFile) {
    // 关闭的是当前文件，切换到相邻文件
    if (currentFileIndex.value >= openedFiles.value.length) {
      currentFileIndex.value = openedFiles.value.length - 1
    }
    const newFile = openedFiles.value[currentFileIndex.value]
    content.value = newFile.content
    savedContent.value = newFile.savedContent
    currentFilePath.value = newFile.path
    currentFileDir.value = newFile.dir
  } else {
    // 关闭的不是当前文件
    // 如果关闭的文件在当前文件之前，当前索引需要减1
    if (index < originalCurrentIndex) {
      currentFileIndex.value = originalCurrentIndex - 1
    } else {
      currentFileIndex.value = originalCurrentIndex
    }
    // 恢复到原来的文件内容
    const currentFile = openedFiles.value[currentFileIndex.value]
    content.value = currentFile.content
    savedContent.value = currentFile.savedContent
    currentFilePath.value = currentFile.path
    currentFileDir.value = currentFile.dir
  }
}

// 监听编辑器内容变化，同步到 openedFiles
watch(content, (newContent) => {
  if (currentFileIndex.value >= 0 && currentFileIndex.value < openedFiles.value.length) {
    openedFiles.value[currentFileIndex.value].content = newContent
  }
})

// ===== 文件操作函数 =====

// 新建文件（不提示保存，直接创建新文件）
async function newFile() {
  // 创建空白文件项
  const newFileItem: OpenedFile = {
    path: null,
    content: '',
    savedContent: '',
    dir: null,
    name: '未命名'
  }
  openedFiles.value.push(newFileItem)

  // 切换到新文件
  const newIndex = openedFiles.value.length - 1
  currentFileIndex.value = newIndex
  content.value = ''
  savedContent.value = ''
  currentFileDir.value = null
  currentFilePath.value = null
  workState.value = 'file'

  // 清空导航历史
  navigationHistory.value = []
  navigationIndex.value = -1
}

// 打开文件（支持多选）
// 打开时不提示保存，维持未修改状态
async function openFile() {
  try {
    const selected = await open({
      multiple: true,
      filters: [{
        name: 'Markdown',
        extensions: ['md', 'markdown', 'txt']
      }]
    })

    if (!selected) return

    // 处理多选结果（selected 可能是字符串或数组）
    const paths: string[] = Array.isArray(selected) ? selected : [selected]

    for (const path of paths) {
      // 如果文件已在列表中，跳过
      const existingIndex = findFileIndex(path)
      if (existingIndex >= 0) continue

      // 使用支持 GB18030 编码的读取命令
      const [text, encoding] = await invoke<[string, string]>('read_file_with_encoding', { path: path })
      const normalizedText = text.replace(/\r\n/g, '\n')

      // 添加到文件列表
      addFileToList(path, normalizedText)
      console.log('Opened file:', path, 'Encoding:', encoding)
    }

    // 切换到最后打开的文件
    const lastIndex = openedFiles.value.length - 1
    switchToFile(lastIndex)
    pushNavigationState(paths[paths.length - 1])
  } catch (error) {
    await handleError(error, '打开文件')
  }
}

// 保存文件，返回是否保存成功
async function saveFile(): Promise<boolean> {
  if (currentFileIndex.value < 0 || openedFiles.value.length === 0) return false

  try {
    const currentFile = openedFiles.value[currentFileIndex.value]

    // 如果已有文件路径，直接保存
    if (currentFile.path) {
      await writeTextFile(currentFile.path, content.value)
      // 更新 openedFiles 中的 savedContent
      openedFiles.value[currentFileIndex.value].savedContent = content.value
      savedContent.value = content.value
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
      // 更新 openedFiles 中的信息
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

// 导入文件夹（递归读取子文件夹）
async function importFolder() {
  // 批量检查所有未保存文件
  const canContinue = await checkAllUnsavedFiles()
  if (!canContinue) return

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

      // 清空打开的文件列表（替换为文件夹视图）
      openedFiles.value = []
      currentFileIndex.value = -1
      content.value = ''
      savedContent.value = ''
      currentFilePath.value = null
      currentFileDir.value = null

      // 递归读取文件夹结构
      mdFiles.value = await readFolderRecursive(selected)

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
  // 批量检查所有未保存文件
  const canContinue = await checkAllUnsavedFiles()
  if (!canContinue) return

  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
    })

    if (selected && typeof selected === 'string') {
      // 读取 mkdocs.yml 内容
      const ymlContent = await readTextFile(selected)
      const config = parseYaml(ymlContent) as {
        nav?: any[]
        docs_dir?: string
        site_name?: string
        plugins?: any
      }

      // 解析 site_name
      const siteName = config.site_name || 'Documentation'

      // 解析 plugins/with-pdf 配置
      let coverTitle: string | undefined
      let coverSubtitle: string | undefined
      let author: string | undefined
      let copyright: string | undefined
      if (config.plugins) {
        // plugins 可以是数组或对象
        let withPdfConfig: any = null
        if (Array.isArray(config.plugins)) {
          // 数组形式: plugins: [search, { with-pdf: {...} }]
          for (const plugin of config.plugins) {
            if (typeof plugin === 'object' && plugin['with-pdf']) {
              withPdfConfig = plugin['with-pdf']
              break
            }
          }
        } else if (typeof config.plugins === 'object') {
          // 对象形式: plugins: { with-pdf: {...} }
          withPdfConfig = config.plugins['with-pdf']
        }
        if (withPdfConfig) {
          coverTitle = withPdfConfig.cover_title
          coverSubtitle = withPdfConfig.cover_subtitle
          author = withPdfConfig.author
          copyright = withPdfConfig.copyright
        }
      }

      // 存储 MkDocs 配置
      mkdocsConfig.value = {
        siteName,
        coverTitle,
        coverSubtitle,
        author,
        copyright
      }

      // 获取 docs_dir（默认 docs）
      const mkdocsPath = selected.substring(0, Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\')))
      const docsDir = config.docs_dir || 'docs'
      const docsPath = mkdocsPath + '/' + docsDir

      importedFolderPath.value = docsPath

      // 清空导航历史（导入新项目时重新开始）
      navigationHistory.value = []
      navigationIndex.value = -1

      // 清空打开的文件列表（替换为 mkdocs nav 视图）
      openedFiles.value = []
      currentFileIndex.value = -1
      content.value = ''
      savedContent.value = ''
      currentFilePath.value = null
      currentFileDir.value = null

      // 从 nav 结构提取 md 文件（保留层级结构）
      if (config.nav && Array.isArray(config.nav)) {
        mdFiles.value = extractMdFilesFromNav(config.nav, docsPath)
      } else {
        mdFiles.value = []
      }

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
      // 字符串形式："index.md" - 无显式标题
      files.push({
        name: item.replace(/\.md$/i, ''),
        path: basePath + '/' + item,
        hasExplicitTitle: false
      })
    } else if (typeof item === 'object') {
      for (const [title, value] of Object.entries(item)) {
        if (typeof value === 'string' && value.endsWith('.md')) {
          // 对象形式：{ "Home": "index.md" } - 有显式标题
          files.push({
            name: title,
            path: basePath + '/' + value,
            hasExplicitTitle: true
          })
        } else if (Array.isArray(value)) {
          // 嵌套导航：{ "Section": [...] } - 文件夹有显式标题
          files.push({
            name: title,
            isFolder: true,
            children: extractMdFilesFromNav(value, basePath),
            hasExplicitTitle: true
          })
        }
      }
    }
  }

  return files
}

// 从文件树打开文件（不提示保存）
async function openFileFromTree(path: string) {
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
      // 增加延迟时间，等待图表渲染完成
      setTimeout(() => scrollToAnchor(anchor), 500)
    } else {
      // 没有锚点跳转，重置滚动位置到顶部
      await nextTick()
      setTimeout(() => {
        const scrollContainer = previewRef.value?.getScrollContainer()
        if (scrollContainer) {
          scrollContainer.scrollTop = 0
        }
      }, 100)
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

  // 打开新文件（不提示保存）
  await openFileFromTree(filePath)
}

// 处理同文件锚点跳转（记录历史）
async function navigateToAnchor(anchor: string) {
  if (!currentFilePath.value) return

  // 同步滚动编辑器到对应行
  const lineNumber = getHeadingLine(anchor)
  if (lineNumber !== undefined && editorRef.value) {
    editorRef.value.scrollToLine(lineNumber)
  }

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

// 打开文件但不记录历史（用于返回/前进）（不提示保存）
async function openFileFromTreeNoHistory(path: string) {
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
      pendingAnchor.value = null
      await nextTick()
      // 增加延迟时间，等待图表渲染完成
      setTimeout(() => scrollToAnchor(anchor), 500)
    } else {
      // 没有锚点跳转，重置滚动位置到顶部
      await nextTick()
      setTimeout(() => {
        const scrollContainer = previewRef.value?.getScrollContainer()
        if (scrollContainer) {
          scrollContainer.scrollTop = 0
        }
      }, 100)
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

  // 尝试多种方式查找锚点元素
  let targetElement: Element | null = null

  // 1. 先尝试 URL 解码
  let decodedAnchor = anchor
  try {
    decodedAnchor = decodeURIComponent(anchor)
  } catch {
    // URL 解码失败，使用原始值
  }

  // 2. 使用 slugifyForMkdocs 转换（匹配 MkDocs 模式 ID）
  const slugifiedAnchor = slugifyForMkdocs(decodedAnchor)

  // 3. 尝试直接查找（无编号前缀）
  targetElement = previewContainer.querySelector(`#${CSS.escape(slugifiedAnchor)}`)
  if (!targetElement) {
    targetElement = previewContainer.querySelector(`[id="${slugifiedAnchor}"]`)
  }

  // 4. 如果找不到，尝试带编号前缀的 ID（普通模式：如 "1-数据库", "1-2-数据库"）
  if (!targetElement) {
    // 尝试匹配各种编号前缀格式
    const numberedIdPatterns = [
      `^[0-9]+-${slugifiedAnchor}$`,           // h2: 1-数据库
      `^[0-9]+-[0-9]+-${slugifiedAnchor}$`,    // h3: 1-2-数据库
      `^[0-9]+-[0-9]+-[0-9]+-${slugifiedAnchor}$` // h4: 1-2-3-数据库
    ]
    const headings = previewContainer.querySelectorAll('h1, h2, h3, h4, h5, h6')
    for (const heading of headings) {
      const id = heading.getAttribute('id')
      if (id) {
        // 检查是否匹配编号前缀模式
        for (const pattern of numberedIdPatterns) {
          if (new RegExp(pattern).test(id)) {
            targetElement = heading
            break
          }
        }
        if (targetElement) break

        // 也检查 ID 是否以 slugifiedAnchor 结尾
        if (id.endsWith(`-${slugifiedAnchor}`) || id === slugifiedAnchor) {
          targetElement = heading
          break
        }
      }
    }
  }

  // 5. 如果还是找不到，遍历标题匹配文本内容
  if (!targetElement) {
    const headings = previewContainer.querySelectorAll('h1, h2, h3, h4, h5, h6')
    for (const heading of headings) {
      const text = heading.textContent?.trim() || ''
      if (slugifyForMkdocs(text) === slugifiedAnchor) {
        targetElement = heading
        break
      }
    }
  }

  // 6. 同步滚动编辑器到对应行
  if (targetElement) {
    const headingId = targetElement.getAttribute('id')
    if (headingId) {
      const lineNumber = getHeadingLine(headingId)
      if (lineNumber !== undefined && editorRef.value) {
        editorRef.value.scrollToLine(lineNumber)
      }
    }
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    console.log('跳转到锚点:', slugifiedAnchor)
  } else {
    console.warn('未找到锚点:', anchor, 'decoded:', decodedAnchor, 'slugified:', slugifiedAnchor)
  }
}

// 搜索处理
async function handleSearch(text: string, mode: 'current' | 'global') {
  if (mode === 'global') {
    // 全局搜索 - 搜索所有文件
    globalSearchText.value = text
    globalSearchResults.value = await searchInAllFiles(text, mdFiles.value)
  } else {
    // 当前文件搜索 - 在 Preview 中高亮
    if (previewRef.value) {
      const highlights = previewRef.value.highlightSearchResults(text)
      if (highlights.length > 0) {
        previewRef.value.jumpToSearchResult(0)
        sidebarRef.value?.updateResults(highlights.length, 0)
      } else {
        sidebarRef.value?.updateResults(0, -1)
      }
    }
  }
}

function handleSearchJump(direction: 'prev' | 'next') {
  // 通过 Preview 组件处理，然后更新 LeftSidebar 显示
  if (previewRef.value) {
    previewRef.value.jumpToSearchResult(direction === 'prev' ? -1 : 1)
  }
}

function handleSearchClear() {
  // 清除 Preview 中的高亮
  if (previewRef.value) {
    previewRef.value.clearSearchHighlights()
  }
  globalSearchText.value = ''
  globalSearchResults.value = []
}

// 处理字体配置变化
function handleFontConfigChange(config: FontConfig) {
  fontConfig.value = config
}

// 处理大纲点击，同步滚动编辑器和预览区
function handleOutlineScroll(id: string) {
  // 获取标题对应的源文本行号
  const lineNumber = getHeadingLine(id)

  // 滚动编辑器到对应行（使用 CodeMirror API）
  if (lineNumber !== undefined && editorRef.value) {
    editorRef.value.scrollToLine(lineNumber)
  }

  // 滚动预览区（仅在预览可见时）
  if (previewElement.value) {
    const element = previewElement.value.querySelector(`#${CSS.escape(id)}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

// 选择搜索结果，跳转到对应文件（不提示保存）
async function handleSearchResultSelect(path: string) {
  // 打开选中的文件
  await openFileFromTree(path)

  // 等待渲染完成后，在 Preview 中高亮搜索文本并跳转到第一个结果
  await nextTick()
  setTimeout(() => {
    if (previewRef.value && globalSearchText.value) {
      const highlights = previewRef.value.highlightSearchResults(globalSearchText.value)
      // highlightSearchResults 已自动更新工具栏显示，再跳转到第一个结果
      if (highlights.length > 0) {
        previewRef.value.jumpToSearchResult(0)
      }
    }
  }, 300)
}

// 处理切换文件（从 LeftSidebar 触发）
// 切换时不提示保存，维持未修改状态
async function handleSwitchFile(index: number) {
  switchToFile(index)
}

// 处理关闭文件（从 LeftSidebar 触发）
async function handleCloseFile(index: number) {
  await closeFile(index)
}

// 递归搜索所有文件
async function searchInAllFiles(text: string, files: MdFile[]): Promise<GlobalSearchResult[]> {
  const results: GlobalSearchResult[] = []

  for (const file of files) {
    if (file.isFolder && file.children) {
      const subResults = await searchInAllFiles(text, file.children)
      results.push(...subResults)
    } else if (file.path) {
      try {
        const [fileContent] = await invoke<[string, string]>('read_file_with_encoding', { path: file.path })
        const matches = countMatches(fileContent, text)
        if (matches > 0) {
          // 提取上下文（第一个匹配位置前后各 50 个字符）
          const context = extractContext(fileContent, text)
          results.push({ path: file.path, matches, context })
        }
      } catch {
        // 跳过无法读取的文件
      }
    }
  }

  return results
}

// 计算匹配次数
function countMatches(content: string, text: string): number {
  let count = 0
  let index = content.indexOf(text)
  while (index >= 0) {
    count++
    index = content.indexOf(text, index + text.length)
  }
  return count
}

// 提取搜索上下文（第一个匹配位置前后各 50 个字符）
function extractContext(content: string, text: string): string {
  const index = content.indexOf(text)
  if (index < 0) return ''

  const start = Math.max(0, index - 50)
  const end = Math.min(content.length, index + text.length + 50)

  let context = content.substring(start, end)
  // 如果不是从头开始，添加省略号
  if (start > 0) context = '...' + context
  // 如果不是到末尾结束，添加省略号
  if (end < content.length) context = context + '...'

  return context.replace(/\n/g, ' ').trim()
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
  // 检查所有未保存的改动
  const canContinue = await checkAllUnsavedFiles()
  if (!canContinue) return  // 用户取消，不做任何操作

  // 用户选择不保存，或者保存成功，关闭窗口
  const appWindow = getCurrentWindow()
  await appWindow.destroy()
}

// 初始化
onMounted(async () => {
  initScrollSync()
  // 添加滚轮缩放事件监听
  window.addEventListener('wheel', handleWheel, { passive: false })

  // 监听窗口关闭请求事件（来自 Rust 后端）
  windowCloseUnlisten = await listen('close-requested', handleCloseRequest)

  // 初始化窗口标题
  updateWindowTitle()

  // 加载字体配置
  try {
    const config = await loadConfig()
    fontConfig.value = config
    await loadFonts(config)
  } catch {
    // 使用默认配置
  }

  // 关闭 splash 窗口并显示主窗口
  try {
    await invoke('close_splash_window')
  } catch {
    // splash 窗口可能不存在（开发模式或单文件模式）
  }
})

// 监听标题变化，更新窗口标题
watch(windowTitle, () => {
  updateWindowTitle()
})

// 监听 HTML 渲染完成，更新大纲面板
watch(renderedHtml, async () => {
  await nextTick()
  // 获取 Preview 组件的 DOM 元素并更新大纲
  if (previewRef.value) {
    const element = previewRef.value.getPreviewRef()
    previewElement.value = element
    if (outlineRef.value && element) {
      outlineRef.value.updatePreviewRef(element)
    }
  }
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

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-pane,
.preview-pane,
.outline-pane {
  min-width: 0;
  flex-shrink: 0;
}

.editor-pane {
  overflow: hidden;
  border-right: none;
}

.outline-pane {
  flex-shrink: 0;
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

/* 保存确认对话框样式 */
.save-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.save-confirm-dialog {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  max-width: 400px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.save-confirm-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
}

.save-confirm-message {
  font-size: 14px;
  color: #475569;
  margin-bottom: 20px;
}

.save-confirm-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.save-confirm-buttons .save-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  background-color: #3b82f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-confirm-buttons .save-btn:hover {
  background-color: #2563eb;
}

.save-confirm-buttons .discard-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  background-color: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-confirm-buttons .discard-btn:hover {
  background-color: #e5e7eb;
}

.save-confirm-buttons .cancel-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  background-color: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-confirm-buttons .cancel-btn:hover {
  background-color: #e5e7eb;
}
</style>
