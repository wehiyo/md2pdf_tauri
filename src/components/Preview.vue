<template>
  <div class="preview-container">
    <PreviewToolbar
      :preview-only-mode="previewOnlyMode"
      :show-toc="showToc"
      :can-navigate-back="canNavigateBack"
      :can-navigate-forward="canNavigateForward"
      @preview-only="emit('preview-only')"
      @toggle-toc="toggleToc"
      @import-folder="emit('import-folder')"
      @import-mkdocs="emit('import-mkdocs')"
      @export-html="emit('export-html')"
      @export-pdf="emit('export-pdf')"
      @navigate-back="emit('navigate-back')"
      @navigate-forward="emit('navigate-forward')"
    />
    <div class="preview-body">
      <div class="preview-content-wrapper">
        <div
          ref="previewRef"
          class="preview-content markdown-body"
          v-html="html"
          @click.stop="handleLinkClick"
        />
      </div>
      <div v-if="showToc" class="toc-panel">
        <div class="toc-header">
          <span>目录</span>
          <button class="toc-close" @click="showToc = false">×</button>
        </div>
        <div class="toc-content">
          <div
            v-for="item in tocItems"
            :key="item.id"
            class="toc-item"
            :class="'toc-level-' + item.level"
            @click="scrollToHeading(item.id)"
          >
            {{ item.text }}
          </div>
          <div v-if="tocItems.length === 0" class="toc-empty">
            暂无标题
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUpdated, watch, nextTick } from 'vue'
import mermaid from 'mermaid'
import wavedrom from 'wavedrom'
import JSON5 from 'json5'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import PreviewToolbar from './PreviewToolbar.vue'

interface TocItem {
  id: string
  text: string
  level: number
}

const props = defineProps<{
  html: string
  fileDir?: string | null
  previewOnlyMode?: boolean
  canNavigateBack?: boolean
  canNavigateForward?: boolean
}>()

const emit = defineEmits<{
  'preview-only': []
  'import-folder': []
  'import-mkdocs': []
  'export-html': []
  'export-pdf': []
  'navigate-to-file': [filePath: string, anchor?: string]
  'navigate-back': []
  'navigate-forward': []
}>()

const previewRef = ref<HTMLDivElement>()
const showToc = ref(false)
const tocItems = ref<TocItem[]>([])

// 暴露滚动容器
defineExpose({
  getScrollContainer: (): HTMLElement | null => previewRef.value ?? null
})

// 切换目录显示
function toggleToc() {
  showToc.value = !showToc.value
  if (showToc.value) {
    extractToc()
  }
}

// 从预览区提取目录
function extractToc() {
  if (!previewRef.value) return

  const headings = previewRef.value.querySelectorAll('h1, h2, h3, h4')
  const items: TocItem[] = []

  headings.forEach(heading => {
    const id = heading.id
    const text = heading.textContent || ''
    const level = parseInt(heading.tagName.charAt(1))

    if (id && level >= 1 && level <= 4) {
      items.push({ id, text, level })
    }
  })

  tocItems.value = items
}

// 滚动到指定标题
function scrollToHeading(id: string) {
  if (!previewRef.value) return

  const element = previewRef.value.querySelector(`#${CSS.escape(id)}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// 处理文档内链接跳转
function handleLinkClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const link = target.closest('a')
  if (!link) return

  const href = link.getAttribute('href')
  if (!href) return

  // 处理锚点链接 #section
  if (href.startsWith('#')) {
    event.preventDefault()
    const targetId = href.slice(1)
    const targetElement = previewRef.value?.querySelector(`#${CSS.escape(targetId)}`)
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    return
  }

  // 处理跨文件链接：other.md、./other.md、../other.md 或带锚点
  // 支持 ../ 相对路径
  // 只有在文件模式下才处理（有 fileDir）
  // 检查 href 是否包含 .md 文件
  const isMdLink = /\.md(?:#|$)/.test(href) || href.endsWith('.md')
  if (props.fileDir && isMdLink) {
    event.preventDefault()

    // 解析文件路径和锚点
    const hashIndex = href.indexOf('#')
    const fileName = hashIndex >= 0 ? href.substring(0, hashIndex) : href
    const anchor = hashIndex >= 0 ? href.substring(hashIndex + 1) : undefined

    // 构建绝对路径，使用 normalizePath 处理 ../ 相对路径
    const fileDirNormalized = props.fileDir.replace(/\\/g, '/')
    const fullPath = fileDirNormalized + '/' + fileName
    const filePath = normalizePath(fullPath)

    // 触发导航事件
    emit('navigate-to-file', filePath, anchor)
    return
  }
}

// 初始化 Mermaid
onMounted(() => {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'inherit'
  })
})

// 渲染 Mermaid 图表
async function renderMermaid() {
  if (!previewRef.value) return

  const mermaidElements = previewRef.value.querySelectorAll('.mermaid')

  for (const element of mermaidElements) {
    if (element.getAttribute('data-processed')) continue

    try {
      const graphDefinition = element.textContent || ''
      const { svg } = await mermaid.render(
        `mermaid-${Math.random().toString(36).substr(2, 9)}`,
        graphDefinition
      )
      element.innerHTML = svg
      element.setAttribute('data-processed', 'true')
    } catch (error) {
      console.error('Mermaid render error:', error)
    }
  }
}

// 渲染 PlantUML 图表
async function renderPlantuml() {
  if (!previewRef.value) return

  const plantumlElements = previewRef.value.querySelectorAll('.plantuml')

  for (const element of plantumlElements) {
    if (element.getAttribute('data-processed')) continue

    const encoded = element.getAttribute('data-plantuml')
    if (!encoded) continue

    try {
      const content = decodeURIComponent(encoded)
      const svg = await invoke<string>('render_plantuml', { content })
      element.innerHTML = svg
      element.setAttribute('data-processed', 'true')
    } catch (error) {
      console.error('PlantUML render error:', error)
      element.innerHTML = `<pre class="error">PlantUML 渲染失败: ${error}</pre>`
      element.setAttribute('data-processed', 'true')
    }
  }
}

// 渲染 WaveDrom 时序图
function renderWavedrom() {
  if (!previewRef.value) return

  const wavedromElements = previewRef.value.querySelectorAll('.wavedrom')

  for (const element of wavedromElements) {
    if (element.getAttribute('data-processed')) continue

    try {
      const jsonText = element.textContent || ''
      // WaveDrom 使用 JavaScript 对象字面量语法，使用 JSON5 安全解析
      const data = JSON5.parse(jsonText)
      // wavedrom.renderWaveElement 直接渲染 SVG 到 DOM 元素
      wavedrom.renderWaveElement(0, data, element as HTMLElement, wavedrom.waveSkin)
      element.setAttribute('data-processed', 'true')
    } catch (error) {
      console.error('WaveDrom render error:', error)
      element.innerHTML = `<pre class="error">WaveDrom 渲染失败: ${error}</pre>`
      element.setAttribute('data-processed', 'true')
    }
  }
}

// 规范化路径，解析 . 和 ..
function normalizePath(path: string): string {
  // 先统一使用正斜杠
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const result: string[] = []

  // 检测是否为 Windows 路径（以盘符开头）
  const isWindowsPath = normalized.match(/^[A-Za-z]:/)
  // 检测是否为 Unix 绝对路径（以 / 开头）
  const isUnixAbsolutePath = normalized.startsWith('/')

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part === '..') {
      // Windows 路径中，保留盘符部分不被移除
      if (result.length > 1 || (result.length === 1 && !isWindowsPath)) {
        result.pop()
      }
    } else if (part !== '.' && part !== '') {
      result.push(part)
    }
  }

  const joinedPath = result.join('/')

  // Unix 绝对路径需要添加前导 /
  if (isUnixAbsolutePath && !isWindowsPath) {
    return '/' + joinedPath
  }

  return joinedPath
}

// 修复本地图片路径
function fixImagePaths() {
  if (!previewRef.value) return
  if (!props.fileDir) return

  const images = previewRef.value.querySelectorAll('img')

  for (const img of images) {
    const src = img.getAttribute('src')
    if (src && !src.match(/^https?:\/\//) && !src.startsWith('data:') && !src.startsWith('asset:') && !src.includes('asset.localhost')) {
      // 相对路径，统一使用正斜杠后拼接
      const fileDirNormalized = props.fileDir.replace(/\\/g, '/')
      const absolutePath = fileDirNormalized + '/' + src
      const normalizedPath = normalizePath(absolutePath)

      // 使用 convertFileSrc 转换为 asset 协议 URL
      const assetUrl = convertFileSrc(normalizedPath)
      // 保存原始路径用于导出
      img.setAttribute('data-original-src', normalizedPath)
      img.setAttribute('src', assetUrl)
    }
  }
}

// 监听 HTML 变化，渲染图表和修复图片路径
watch(() => props.html, async () => {
  await nextTick()
  await renderMermaid()
  await renderPlantuml()
  renderWavedrom()
  fixImagePaths()
  if (showToc.value) {
    extractToc()
  }
}, { immediate: true })

onUpdated(async () => {
  await renderMermaid()
  await renderPlantuml()
  renderWavedrom()
  fixImagePaths()
})
</script>

<style scoped>
.preview-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #ffffff;
}

.dark .preview-container {
  background-color: #1e293b;
}

.preview-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.preview-content {
  flex: 1;
  overflow: auto;
  max-width: 900px;
  padding: 2rem;
  width: 100%;
}

.preview-content-wrapper {
  flex: 1;
  display: flex;
  justify-content: center;
  overflow: hidden;
}

/* 目录面板 */
.toc-panel {
  width: 280px;
  border-left: 1px solid #e2e8f0;
  background-color: #f8fafc;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.dark .toc-panel {
  border-left-color: #334155;
  background-color: #0f172a;
}

.toc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 600;
  font-size: 14px;
  color: #374151;
}

.dark .toc-header {
  border-bottom-color: #334155;
  color: #e2e8f0;
}

.toc-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.toc-close:hover {
  color: #374151;
}

.dark .toc-close:hover {
  color: #e2e8f0;
}

.toc-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.toc-item {
  padding: 6px 16px;
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toc-item:hover {
  background-color: #e2e8f0;
}

.dark .toc-item {
  color: #9ca3af;
}

.dark .toc-item:hover {
  background-color: #1e293b;
}

.toc-level-1 {
  font-weight: 600;
  padding-left: 16px;
}

.toc-level-2 {
  padding-left: 28px;
}

.toc-level-3 {
  padding-left: 40px;
}

.toc-level-4 {
  padding-left: 52px;
  font-size: 12px;
}

.toc-empty {
  padding: 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>
