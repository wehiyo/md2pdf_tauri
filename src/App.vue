<template>
  <div class="app-container">
    <div class="main-content" :style="{ zoom: zoomLevel + '%' }">
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
        class="preview-pane"
        :style="previewPaneStyle"
        @preview-only="togglePreviewOnly"
        @export-html="exportHTML"
        @export-pdf="exportPDF"
      />
    </div>
    <ExportProgress />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import ExportProgress from './components/ExportProgress.vue'
import { useMarkdown } from './composables/useMarkdown'
import type { Metadata } from './composables/useMarkdown'
import { usePDF } from './composables/usePDF'
import { useTheme } from './composables/useTheme'
import { useScrollSync } from './composables/useScrollSync'
import { save, open, message, ask } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
// @ts-ignore
import katexStyles from './assets/katex/katex-inline.css?raw'
// @ts-ignore
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
const editorRef = ref<InstanceType<typeof Editor>>()
const previewRef = ref<InstanceType<typeof Preview>>()

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
  if (previewOnlyMode.value || !showPreview.value) {
    return { width: '100%' }
  }
  return { width: `${editorWidth.value}%` }
})

const previewPaneStyle = computed(() => {
  if (previewOnlyMode.value) {
    return { width: '100%' }
  }
  if (!showPreview.value) {
    return { width: '0%' }
  }
  return { width: `${100 - editorWidth.value}%` }
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
</body>
</html>`
      await writeTextFile(filePath, fullHtml)
      await message('HTML 导出成功！', { title: '成功', kind: 'info' })
    }
  } catch (error) {
    console.error('导出 HTML 失败:', error)
    await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
  }
}

// 导出 PDF
async function exportPDF() {
  // 从预览区域获取已渲染的 HTML（包含 Mermaid SVG）
  const previewElement = document.querySelector('.preview-content')
  const previewContent = previewElement?.innerHTML || renderedHtml.value

  await exportToPDF(previewContent, currentMetadata.value)
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
    // 用户选择保存
    const saved = await saveFile()
    return saved
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
    }
  } catch (error) {
    console.error('打开文件失败:', error)
    await message('打开文件失败：' + String(error), { title: '错误', kind: 'error' })
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
    console.error('保存文件失败:', error)
    await message('保存失败：' + String(error), { title: '错误', kind: 'error' })
    return false
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

// 初始化
onMounted(() => {
  initScrollSync()
  // 添加滚轮缩放事件监听
  window.addEventListener('wheel', handleWheel, { passive: false })
})

onUnmounted(() => {
  window.removeEventListener('wheel', handleWheel)
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
