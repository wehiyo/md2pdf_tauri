<template>
  <div class="preview-container">
    <PreviewToolbar
      ref="toolbarRef"
      :preview-only-mode="previewOnlyMode"
      :show-toc="showToc"
      :can-navigate-back="canNavigateBack"
      :can-navigate-forward="canNavigateForward"
      :has-multiple-files="hasMultipleFiles"
      @preview-only="emit('preview-only')"
      @toggle-toc="toggleToc"
      @import-folder="emit('import-folder')"
      @import-mkdocs="emit('import-mkdocs')"
      @export-html="emit('export-html')"
      @export-pdf="emit('export-pdf')"
      @navigate-back="emit('navigate-back')"
      @navigate-forward="emit('navigate-forward')"
      @open-settings="showSettings = true"
      @search="handleSearch"
      @search-jump="handleSearchJump"
      @search-clear="handleSearchClear"
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
            :title="item.text"
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
    <SettingsDialog
      :visible="showSettings"
      :config="fontConfig"
      @close="showSettings = false"
      @save="handleSettingsSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUpdated, watch, nextTick } from 'vue'
import mermaid from 'mermaid'
import wavedrom from 'wavedrom'
import JSON5 from 'json5'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import PreviewToolbar from './PreviewToolbar.vue'
import SettingsDialog from './SettingsDialog.vue'
import { loadConfig, saveConfig, type FontConfig } from '../composables/useConfig'
import { loadFonts } from '../composables/useFonts'

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
  hasMultipleFiles?: boolean
  mdFiles?: MdFile[]
}>()

const emit = defineEmits<{
  'preview-only': []
  'import-folder': []
  'import-mkdocs': []
  'export-html': []
  'export-pdf': []
  'navigate-to-file': [filePath: string, anchor?: string]
  'navigate-to-anchor': [anchor: string]
  'navigate-back': []
  'navigate-forward': []
  'search': [text: string, mode: 'current' | 'global', mdFiles?: MdFile[]]
  'search-jump': [direction: 'prev' | 'next']
  'search-clear': []
  'font-config-change': [config: FontConfig]
}>()

// MdFile 类型定义
interface MdFile {
  name: string
  path?: string
  children?: MdFile[]
  isFolder?: boolean
}

const previewRef = ref<HTMLDivElement>()
const toolbarRef = ref<InstanceType<typeof PreviewToolbar>>()
const showToc = ref(false)
const tocItems = ref<TocItem[]>([])

// 搜索相关状态
const searchHighlights = ref<HTMLElement[]>([])
const currentSearchIndex = ref(0)
const currentSearchText = ref('')

// 字体设置对话框状态
const showSettings = ref(false)
const fontConfig = ref<FontConfig>({
  bodyFont: 'SourceHanSans',
  codeFont: 'SourceCodePro',
  bodyFontSize: 16,
  bodyCustomFonts: [],
  codeCustomFonts: []
})

// 处理设置保存
async function handleSettingsSave(config: FontConfig) {
  fontConfig.value = config
  await saveConfig(config)
  await loadFonts(config)
  showSettings.value = false
  emit('font-config-change', config)
}

// 暴露滚动容器和搜索相关方法
defineExpose({
  getScrollContainer: (): HTMLElement | null => previewRef.value ?? null,
  highlightSearchResults,
  clearSearchHighlights,
  jumpToSearchResult
})

// 搜索处理
function handleSearch(text: string, mode: 'current' | 'global') {
  if (mode === 'current') {
    // 当前文件搜索
    const highlights = highlightSearchResults(text)
    if (highlights.length > 0) {
      jumpToSearchResult(0)
    }
  } else {
    // 全局搜索 - 传递给 App.vue 处理
    emit('search', text, mode, props.mdFiles)
  }
}

function handleSearchJump(direction: 'prev' | 'next') {
  if (searchHighlights.value.length === 0) return

  if (direction === 'prev') {
    currentSearchIndex.value = (currentSearchIndex.value - 1 + searchHighlights.value.length) % searchHighlights.value.length
  } else {
    currentSearchIndex.value = (currentSearchIndex.value + 1) % searchHighlights.value.length
  }

  jumpToSearchResult(currentSearchIndex.value)
  toolbarRef.value?.updateSearchResults(searchHighlights.value.length, currentSearchIndex.value)
}

function handleSearchClear() {
  clearSearchHighlights()
  currentSearchText.value = ''
  searchHighlights.value = []
  currentSearchIndex.value = 0
}

// 高亮搜索结果
function highlightSearchResults(text: string): HTMLElement[] {
  if (!previewRef.value || !text) return []

  // 先清除之前的高亮
  clearSearchHighlights()

  // 更新当前搜索文本
  currentSearchText.value = text

  const highlights: HTMLElement[] = []

  // 使用 TreeWalker 遍历文本节点
  const walker = document.createTreeWalker(previewRef.value, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  // 先收集所有文本节点（不修改 DOM）
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  // 对每个文本节点进行处理
  for (const node of textNodes) {
    // 递归处理一个节点中的所有匹配
    processNodeMatches(node, text, highlights)
  }

  searchHighlights.value = highlights

  // 更新搜索索引和工具栏显示
  if (highlights.length > 0) {
    currentSearchIndex.value = 0
    toolbarRef.value?.updateSearchResults(highlights.length, 0)
  } else {
    currentSearchIndex.value = -1
    toolbarRef.value?.updateSearchResults(0, -1)
  }

  return highlights
}

// 递归处理单个文本节点中的所有匹配
function processNodeMatches(node: Text, text: string, highlights: HTMLElement[]) {
  if (!node.parentNode) return

  const content = node.textContent || ''
  const index = content.indexOf(text)

  if (index < 0) return // 没有匹配

  try {
    // 分割文本节点：前部分 + 高亮部分 + 后部分
    const before = node.splitText(index)
    const highlighted = before.splitText(text.length)

    // 创建高亮元素包裹匹配文本
    const mark = document.createElement('mark')
    mark.className = 'search-highlight'
    node.parentNode.insertBefore(mark, before)
    mark.appendChild(before)

    highlights.push(mark)

    // 继续处理剩余文本（highlighted 节点之后的文本）
    processNodeMatches(highlighted, text, highlights)
  } catch {
    // 跳过无法处理的情况
  }
}

// 清除高亮
function clearSearchHighlights() {
  searchHighlights.value.forEach(mark => {
    const parent = mark.parentNode
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark)
      }
      parent.removeChild(mark)
    }
  })
  searchHighlights.value = []
}

// 跳转到指定搜索结果
function jumpToSearchResult(index: number) {
  if (searchHighlights.value.length === 0 || index < 0 || index >= searchHighlights.value.length) return

  const target = searchHighlights.value[index]
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // 更新当前高亮的样式
  searchHighlights.value.forEach((mark, i) => {
    if (i === index) {
      mark.classList.add('search-highlight-current')
    } else {
      mark.classList.remove('search-highlight-current')
    }
  })
}

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

  // 处理外部链接（http/https）：在系统浏览器中打开
  if (href.startsWith('http://') || href.startsWith('https://')) {
    event.preventDefault()
    open(href)
    return
  }

  // 处理锚点链接 #section
  if (href.startsWith('#')) {
    event.preventDefault()
    const targetId = href.slice(1)
    const targetElement = previewRef.value?.querySelector(`#${CSS.escape(targetId)}`)
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    // 触发同文件锚点导航事件（用于记录历史）
    emit('navigate-to-anchor', targetId)
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

// 初始化 Mermaid 和字体配置
onMounted(async () => {
  // 加载字体配置
  const config = await loadConfig()
  fontConfig.value = config
  await loadFonts(config)

  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'inherit'
  })

  // 初始化 tabbed 标签页点击事件
  initTabbedClickHandler()
})

// 初始化 tabbed 标签页点击事件处理
function initTabbedClickHandler() {
  if (!previewRef.value) return

  previewRef.value.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const label = target.closest('.tabbed-label')
    if (!label) return

    const tabSet = label.closest('.tabbed-set')
    if (!tabSet) return

    const tabIndex = label.getAttribute('data-tab-index')
    if (!tabIndex) return

    // 更新标签状态
    const labels = tabSet.querySelectorAll('.tabbed-label')
    labels.forEach(l => l.classList.remove('active'))
    label.classList.add('active')

    // 更新内容状态
    const blocks = tabSet.querySelectorAll('.tabbed-block')
    blocks.forEach(b => {
      if (b.getAttribute('data-tab-index') === tabIndex) {
        b.classList.add('active')
      } else {
        b.classList.remove('active')
      }
    })
  })
}

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

/* 搜索高亮样式 - 使用 :deep 以应用到动态创建的元素 */
:deep(.search-highlight) {
  background-color: #fef08a;
  padding: 1px 2px;
  border-radius: 2px;
  transition: all 0.15s ease;
}

/* 当前高亮搜索结果 - 更加醒目的样式 */
:deep(.search-highlight.search-highlight-current) {
  background-color: #f59e0b;
  color: #ffffff;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 500;
}
</style>
