<template>
  <div class="preview-container">
    <PreviewToolbar
      :preview-only-mode="previewOnlyMode"
      :can-navigate-back="canNavigateBack"
      :can-navigate-forward="canNavigateForward"
      @preview-only="emit('preview-only')"
      @import-folder="emit('import-folder')"
      @import-mkdocs="emit('import-mkdocs')"
      @export-html="emit('export-html')"
      @export-pdf="emit('export-pdf')"
      @navigate-back="emit('navigate-back')"
      @navigate-forward="emit('navigate-forward')"
      @open-settings="showSettings = true"
      @close-preview="emit('close-preview')"
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
import { normalizePath } from '../utils/normalizePath'
import { buildRegex, type SearchOptions } from '../composables/useSearch'

const props = defineProps<{
  html: string
  fileDir?: string | null
  previewOnlyMode?: boolean
  canNavigateBack?: boolean
  canNavigateForward?: boolean
  mdFiles?: MdFile[]
}>()

const emit = defineEmits<{
  'preview-only': []
  'close-preview': []
  'import-folder': []
  'import-mkdocs': []
  'export-html': []
  'export-pdf': []
  'navigate-to-file': [filePath: string, anchor?: string]
  'navigate-to-anchor': [anchor: string]
  'navigate-back': []
  'navigate-forward': []
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

// 搜索相关状态
const searchHighlights = ref<HTMLElement[]>([])
const currentSearchIndex = ref(0)
const currentSearchText = ref('')

// 字体设置对话框状态
const showSettings = ref(false)
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
  previewBackgroundColor: '#ffffff',
  pageSize: 'A4',
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 25,
  marginRight: 25,
  showHeadingNumbers: true
})

// 处理设置保存
async function handleSettingsSave(config: FontConfig) {
  fontConfig.value = config
  await saveConfig(config)
  await loadFonts(config)
  showSettings.value = false
  emit('font-config-change', config)
}

// 暴露滚动容器、previewRef 和搜索相关方法
defineExpose({
  getScrollContainer: (): HTMLElement | null => previewRef.value ?? null,
  getPreviewRef: (): HTMLElement | null => previewRef.value ?? null,
  highlightSearchResults,
  clearSearchHighlights,
  jumpToSearchResult,
  getSearchIndex: () => currentSearchIndex.value,
  getSearchTotal: () => searchHighlights.value.length
})

// 高亮搜索结果
function highlightSearchResults(options: SearchOptions): HTMLElement[] {
  if (!previewRef.value || !options.text) return []

  clearSearchHighlights()
  currentSearchText.value = options.text

  const re = buildRegex(options)
  if (!re) return []
  // TreeWalker 文本搜索必须用 global flag 配合 lastIndex，重置为 0
  const regex = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')

  const highlights: HTMLElement[] = []
  const walker = document.createTreeWalker(previewRef.value, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  for (const node of textNodes) {
    processNodeMatches(node, regex, highlights)
  }

  searchHighlights.value = highlights
  if (highlights.length > 0) currentSearchIndex.value = 0
  else currentSearchIndex.value = -1

  return highlights
}

// 递归处理单个文本节点中的所有匹配
function processNodeMatches(node: Text, regex: RegExp, highlights: HTMLElement[]) {
  if (!node.parentNode) return
  const content = node.textContent || ''
  regex.lastIndex = 0
  const match = regex.exec(content)
  if (!match) return

  try {
    const index = match.index
    const len = match[0].length
    const before = node.splitText(index)
    const highlighted = before.splitText(len)

    const mark = document.createElement('mark')
    mark.className = 'search-highlight'
    node.parentNode.insertBefore(mark, before)
    mark.appendChild(before)
    highlights.push(mark)

    // 继续处理剩余文本（需要重置 lastIndex）
    regex.lastIndex = 0
    processNodeMatches(highlighted, regex, highlights)
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
  currentSearchIndex.value = -1
}

// 跳转到指定搜索结果（delta: -1 表示上一个，1 表示下一个）
function jumpToSearchResult(delta: number) {
  if (searchHighlights.value.length === 0) return

  // 计算新的索引（支持循环）
  let newIndex = currentSearchIndex.value + delta
  if (newIndex < 0) {
    newIndex = searchHighlights.value.length - 1  // 从第一个跳到最后一个
  } else if (newIndex >= searchHighlights.value.length) {
    newIndex = 0  // 从最后一个跳到第一个
  }

  currentSearchIndex.value = newIndex
  const target = searchHighlights.value[newIndex]
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // 更新当前高亮的样式
  searchHighlights.value.forEach((mark, i) => {
    if (i === newIndex) {
      mark.classList.add('search-highlight-current')
    } else {
      mark.classList.remove('search-highlight-current')
    }
  })
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
  background-color: var(--preview-bg-color);
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
  max-width: var(--preview-width);
  padding: 2rem;
  width: 100%;
}

.preview-content-wrapper {
  flex: 1;
  display: flex;
  justify-content: center;
  overflow: hidden;
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