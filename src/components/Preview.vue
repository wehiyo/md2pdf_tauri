<template>
  <div class="preview-container">
    <PreviewToolbar
      :preview-only-mode="previewOnlyMode"
      :can-navigate-back="canNavigateBack"
      :can-navigate-forward="canNavigateForward"
      :show-bookmark-btn="showBookmarkBtn"
      :show-annotation-btn="showAnnotationBtn"
      :has-selection="hasSelection"
      :has-selected-annotation="selectedAnnotationId !== null"
      :annotations-visible="annotationsVisible"
      @preview-only="emit('preview-only')"
      @import-folder="emit('import-folder')"
      @import-mkdocs="emit('import-mkdocs')"
      @export-html="emit('export-html')"
      @export-pdf="emit('export-pdf')"
      @navigate-back="emit('navigate-back')"
      @navigate-forward="emit('navigate-forward')"
      @open-settings="showSettings = true"
      @close-preview="emit('close-preview')"
      @add-bookmark="emit('add-bookmark')"
      @add-annotation-type="addAnnotationType"
      @delete-annotation="handleDeleteSelectedAnnotation"
      @toggle-annotations="$emit('toggle-annotations')"
    />
    <div class="preview-body">
      <div class="preview-content-wrapper">
        <div
          ref="previewRef"
          class="preview-content markdown-body"
          v-html="html"
          @click="handleLinkClick"
        />
      </div>
    </div>
    <SettingsDialog
      :visible="showSettings"
      :config="fontConfig"
      @close="showSettings = false"
      @save="handleSettingsSave"
    />
    <Teleport to="body">
      <div v-if="annoMenuVisible" class="anno-context-menu" :style="annoMenuStyle" @click.stop>
        <template v-if="annoMenuMode === 'selection'">
          <div class="menu-item" @click="addAnnotationType('highlight')">高亮</div>
          <div class="menu-item" @click="addAnnotationType('underline')">下划线</div>
          <div class="menu-item" @click="addAnnotationType('wavy')">波浪线</div>
          <div class="menu-item" @click="addAnnotationType('comment')">批注</div>
        </template>
        <template v-else>
          <div class="menu-item menu-danger" @click="deleteAnnoFromMenu">删除标注</div>
        </template>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="commentDialogVisible" class="comment-overlay" @click="cancelComment">
        <div class="comment-dialog" @click.stop>
          <div class="comment-title">添加批注</div>
          <textarea v-model="commentInput" class="comment-textarea" placeholder="输入批注内容..." rows="3"></textarea>
          <div class="comment-btns">
            <button class="comment-btn cancel" @click="cancelComment">取消</button>
            <button class="comment-btn confirm" @click="confirmComment">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, onMounted, onUnmounted, onUpdated, watch, nextTick } from 'vue'
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
  currentFilePath?: string | null
  previewOnlyMode?: boolean
  canNavigateBack?: boolean
  canNavigateForward?: boolean
  showBookmarkBtn?: boolean
  showAnnotationBtn?: boolean
  annotationsVisible?: boolean
  projectPath?: string | null
  mdFiles?: MdFile[]
}>()

const emit = defineEmits<{
  'preview-only': []
  'close-preview': []
  'add-bookmark': []
  'add-annotation': [anno: { type: 'highlight' | 'underline' | 'wavy' | 'comment'; filePath: string; selectedText: string; contextBefore: string; contextAfter: string; headingId: string; comment?: string }]
  'delete-annotation': [id: string]
  'toggle-annotations': []
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
  showHeadingNumbers: true,
  previewTheme: 'default'
})

// 标注上下文菜单状态
const annoMenuVisible = ref(false)
const annoMenuStyle = ref<Record<string, string>>({})
const annoMenuMode = ref<'selection' | 'existing'>('selection')
const annoSelectedText = ref('')
const annoContextBefore = ref('')
const annoContextAfter = ref('')
const annoContextHeadingId = ref('')
const annoExistingId = ref('')
const annoMouseX = ref(0)
const annoMouseY = ref(0)

// 批注输入对话框
const commentDialogVisible = ref(false)
const commentInput = ref('')

// 选中的标注 ID（用于工具栏删除按钮）
const selectedAnnotationId = ref<string | null>(null)

// 跟踪预览区文本选择状态（用于工具栏按钮状态）
const hasSelection = ref(false)
function updateSelectionState() {
  const sel = window.getSelection()
  hasSelection.value = !!(sel && !sel.isCollapsed && sel.toString().trim() &&
    previewRef.value?.contains(sel.anchorNode))
}

// 标注数据接口
interface AnnotationData {
  id: string
  type: 'highlight' | 'underline' | 'wavy' | 'comment'
  filePath: string
  selectedText: string
  contextBefore: string
  contextAfter: string
  headingId: string
  comment?: string
  timestamp: number
}

// 监听 annotationsRefresh 以在新标注添加后重新渲染
const annoRefresh = inject('annotationsRefresh', ref(0))!
watch(annoRefresh, async () => {
  await nextTick()
  await applyAnnotations()
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
  getSearchTotal: () => searchHighlights.value.length,
  applyAnnotations,
  clearSelectedAnnotation,
  getSelectedAnnotationId: () => selectedAnnotationId.value
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
    event.preventDefault(); event.stopPropagation()
    open(href)
    return
  }

  // 处理锚点链接 #section
  if (href.startsWith('#')) {
    event.preventDefault(); event.stopPropagation()
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
    event.preventDefault(); event.stopPropagation()

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

// ── 标注上下文菜单 ──────────────────────────────────────

function showAnnoContextMenu(e: MouseEvent) {
  e.preventDefault()
  // 检查点击是否在已有标注元素上
  const target = e.target as HTMLElement
  const annoEl = target.closest('[data-anno-id]') as HTMLElement | null

  annoMouseX.value = e.clientX
  annoMouseY.value = e.clientY

  if (annoEl) {
    // 已有标注：显示删除菜单
    const id = annoEl.getAttribute('data-anno-id')
    if (id) {
      annoExistingId.value = id
      annoMenuMode.value = 'existing'
      showAnnoMenuAt(e.clientX, e.clientY)
    }
    return
  }

  // 选区菜单
  if (!captureCurrentSelection()) return
  annoMenuMode.value = 'selection'
  console.log('[anno] context menu: text="%s" before="%s" after="%s" heading="%s"',
    annoSelectedText.value, annoContextBefore.value, annoContextAfter.value, annoContextHeadingId.value)
  showAnnoMenuAt(e.clientX, e.clientY)
}

// 捕获当前选区（供右键菜单和工具栏按钮共用）
function captureCurrentSelection(): boolean {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return false
  const range = sel.getRangeAt(0)
  if (!previewRef.value?.contains(range.commonAncestorContainer)) return false

  const text = sel.toString().trim()
  if (!text) return false

  const node = range.startContainer
  const nodeText = node.textContent || ''
  const startIdx = nodeText.indexOf(text)
  let before = ''
  let after = ''
  if (startIdx >= 0) {
    before = nodeText.substring(Math.max(0, startIdx - 50), startIdx)
    after = nodeText.substring(startIdx + text.length, Math.min(nodeText.length, startIdx + text.length + 50))
  }

  let headingId = ''
  let el: HTMLElement | null = node.parentElement
  while (el && el !== previewRef.value && !headingId) {
    let sib: HTMLElement | null = el
    while (sib) {
      if (/^H[1-4]$/.test(sib.tagName) && sib.id) {
        headingId = sib.id; break
      }
      sib = sib.previousElementSibling as HTMLElement | null
    }
    el = el.parentElement
  }

  annoSelectedText.value = text
  annoContextBefore.value = before
  annoContextAfter.value = after
  annoContextHeadingId.value = headingId
  return true
}

function showAnnoMenuAt(x: number, y: number) {
  // 先设置初始位置再显示，避免首帧出现在 (0,0)
  annoMenuStyle.value = { position: 'fixed', left: x + 'px', top: y + 'px', zIndex: '10000' }
  annoMenuVisible.value = true
  nextTick(() => {
    const menu = document.querySelector('.anno-context-menu') as HTMLElement | null
    if (!menu) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const mw = menu.offsetWidth
    const mh = menu.offsetHeight
    let left = x
    let top = y
    if (x + mw > vw) left = Math.max(0, vw - mw - 8)
    if (y + mh > vh) top = Math.max(0, vh - mh - 8)
    if (left !== x || top !== y) {
      annoMenuStyle.value = { position: 'fixed', left: left + 'px', top: top + 'px', zIndex: '10000' }
    }
    document.addEventListener('click', hideAnnoMenu)
  })
}

function hideAnnoMenu() {
  annoMenuVisible.value = false
  document.removeEventListener('click', hideAnnoMenu)
}

async function addAnnotationType(type: 'highlight' | 'underline' | 'wavy' | 'comment') {
  hideAnnoMenu()
  if (!captureCurrentSelection()) return
  if (type === 'comment') {
    commentInput.value = ''
    commentDialogVisible.value = true
    return
  }
  emitAddAnnotation(type, '')
}

function emitAddAnnotation(type: 'highlight' | 'underline' | 'wavy' | 'comment', comment: string) {
  const filePath = (props.currentFilePath || props.fileDir || '').replace(/\\/g, '/')
  console.log('[anno] emit add-annotation: type=%s filePath=%s text="%s"', type, filePath, annoSelectedText.value)
  emit('add-annotation', {
    type,
    filePath,
    selectedText: annoSelectedText.value,
    contextBefore: annoContextBefore.value,
    contextAfter: annoContextAfter.value,
    headingId: annoContextHeadingId.value,
    comment: comment || undefined,
  })
}

function confirmComment() {
  commentDialogVisible.value = false
  emitAddAnnotation('comment', commentInput.value.trim())
}

function cancelComment() {
  commentDialogVisible.value = false
}

async function deleteAnnoFromMenu() {
  hideAnnoMenu()
  if (annoExistingId.value) {
    emit('delete-annotation', annoExistingId.value)
    selectedAnnotationId.value = null
  }
}

// 点击标注元素选中
function handleAnnoClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const annoEl = target.closest('[data-anno-id]') as HTMLElement | null
  if (!annoEl) {
    // 点击非标注区域，清除选中
    clearSelectedAnnotation()
    return
  }
  const id = annoEl.getAttribute('data-anno-id')
  if (id) {
    // 清除之前的选中
    const all = previewRef.value?.querySelectorAll('[data-anno-id]')
    all?.forEach(el => el.classList.remove('anno-selected'))
    annoEl.classList.add('anno-selected')
    selectedAnnotationId.value = id
  }
}

function clearSelectedAnnotation() {
  const all = previewRef.value?.querySelectorAll('.anno-selected')
  all?.forEach(el => el.classList.remove('anno-selected'))
  selectedAnnotationId.value = null
}

function handleDeleteSelectedAnnotation() {
  if (selectedAnnotationId.value) {
    emit('delete-annotation', selectedAnnotationId.value)
    selectedAnnotationId.value = null
  }
}

// ── 标注渲染 ────────────────────────────────────────────

// 加载当前项目的所有标注
async function loadAnnotations(): Promise<AnnotationData[]> {
  if (!props.projectPath || !props.currentFilePath) return []
  const configPath = props.projectPath.replace(/\\/g, '/') + '/.markrefine.json'
  const fp = props.currentFilePath.replace(/\\/g, '/')
  console.log('[anno] loadAnnotations: configPath=%s fp=%s', configPath, fp)
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const raw = await readTextFile(configPath)
    const config = JSON.parse(raw)
    const allAnnotations = (config.annotations || []) as AnnotationData[]
    const matched = allAnnotations.filter(a => a.filePath === fp)
    console.log('[anno] loadAnnotations: total=%d matched=%d for fp=%s', allAnnotations.length, matched.length, fp)
    return matched
  } catch {
    console.log('[anno] loadAnnotations: file not found at %s', configPath)
    return []
  }
}

// 应用标注到预览 DOM
let applyLock = false
async function applyAnnotations() {
  if (!previewRef.value) return
  if (!props.currentFilePath) return  // 文件未加载
  if (applyLock) return
  applyLock = true
  try {
    // 总是先清除旧的标注包裹元素，还原文本节点
    removeAllAnnotationWrappers()
    await nextTick()

    if (!props.annotationsVisible) return

    const annotations = await loadAnnotations()
    console.log('[anno] applyAnnotations: loaded %d annotations for current file', annotations.length)
    if (annotations.length === 0) return

    // 收集所有文本节点
    const textNodes: Text[] = []
    const walker = document.createTreeWalker(previewRef.value, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

    for (const anno of annotations) {
      try {
        applySingleAnnotation(anno, textNodes)
      } catch (e) {
        console.error('[anno] error applying annotation:', e)
      }
    }
  } finally {
    applyLock = false
  }
}

function removeAllAnnotationWrappers() {
  if (!previewRef.value) return
  const wrappers = previewRef.value.querySelectorAll('.anno-highlight, .anno-underline, .anno-wavy, .anno-comment')
  wrappers.forEach(w => {
    const parent = w.parentNode
    if (parent) {
      while (w.firstChild) parent.insertBefore(w.firstChild, w)
      parent.removeChild(w)
    }
  })
}

function applySingleAnnotation(anno: AnnotationData, textNodes: Text[]) {
  const headingEl = anno.headingId ? previewRef.value?.querySelector(`#${CSS.escape(anno.headingId)}`) : null
  const scopeNodes = headingEl ? filterNodesInScope(textNodes, headingEl as HTMLElement) : textNodes

  // 连接所有作用域内文本节点的内容，记录每个节点的偏移范围
  const fullText = scopeNodes.map(n => n.textContent || '').join('')
  const nodeRanges: { node: Text; start: number; end: number }[] = []
  let pos = 0
  for (const n of scopeNodes) {
    const len = (n.textContent || '').length
    if (len > 0) {
      nodeRanges.push({ node: n, start: pos, end: pos + len })
      pos += len
    }
  }

  // 首先用上下文精确匹配
  const searchPattern = anno.contextBefore + anno.selectedText + anno.contextAfter
  let matchIdx = fullText.indexOf(searchPattern)
  let matchStart: number
  let matchLen: number

  if (matchIdx >= 0) {
    matchStart = matchIdx + anno.contextBefore.length
    matchLen = anno.selectedText.length
  } else {
    // 退化为简单文本匹配
    matchIdx = fullText.indexOf(anno.selectedText)
    if (matchIdx >= 0) {
      matchStart = matchIdx
      matchLen = anno.selectedText.length
    } else {
      console.log('[anno] no match for text="%s" in full scope (len=%d)', anno.selectedText, fullText.length)
      return
    }
  }

  // 根据偏移找到对应的文本节点并包裹
  const matchEnd = matchStart + matchLen
  for (const r of nodeRanges) {
    if (matchStart >= r.end || matchEnd <= r.start) continue  // 不在此节点
    const localStart = Math.max(0, matchStart - r.start)
    const localLen = Math.min(r.end, matchEnd) - r.start - localStart
    if (localLen > 0 && r.node.parentNode && (r.node.textContent?.length || 0) >= localStart + localLen) {
      wrapTextNode(r.node, localStart, localLen, anno)
    }
  }
}

function filterNodesInScope(nodes: Text[], headingEl: HTMLElement): Text[] {
  const result: Text[] = []
  for (const node of nodes) {
    // compareDocumentPosition: FOLLOWING(4) = 在 heading 之后, CONTAINED_BY(16) = 在 heading 内部
    const pos = headingEl.compareDocumentPosition(node)
    if (pos & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)) {
      // 遇到下一个标题时停止
      if (node.parentElement && /^H[1-4]$/.test(node.parentElement.tagName) && node.parentElement !== headingEl) {
        break
      }
      if (node.textContent?.trim()) {
        result.push(node)
      }
    }
  }
  return result
}

function wrapTextNode(node: Text, offset: number, length: number, anno: AnnotationData) {
  if (!node.parentNode || node.textContent!.length < offset + length) return

  const before = node.splitText(offset)
  before.splitText(length)

  const wrapper = document.createElement('span')
  wrapper.setAttribute('data-anno-id', anno.id)
  wrapper.setAttribute('data-anno-type', anno.type)

  const classMap: Record<string, string> = {
    highlight: 'anno-highlight',
    underline: 'anno-underline',
    wavy: 'anno-wavy',
    comment: 'anno-comment',
  }
  wrapper.className = classMap[anno.type] || 'anno-highlight'

  if (anno.comment) {
    wrapper.title = anno.comment
  }

  node.parentNode.insertBefore(wrapper, before)
  wrapper.appendChild(before)
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
  // 标注事件
  initAnnotationHandlers()
})

onUnmounted(() => {
  if (previewRef.value) {
    previewRef.value.removeEventListener('contextmenu', showAnnoContextMenu)
    previewRef.value.removeEventListener('click', handleAnnoClick)
  }
  document.removeEventListener('click', hideAnnoMenu)
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

// 初始化标注事件处理
function initAnnotationHandlers() {
  if (!previewRef.value) return

  // 右键菜单
  previewRef.value.addEventListener('contextmenu', showAnnoContextMenu)
  // 点击选中
  previewRef.value.addEventListener('click', handleAnnoClick)
  // 选择状态跟踪
  previewRef.value.addEventListener('mouseup', updateSelectionState)
  document.addEventListener('selectionchange', () => {
    // 延迟检查，确保 selection 已更新
    setTimeout(updateSelectionState, 0)
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
  await nextTick()
  await applyAnnotations()
}, { immediate: true })

watch(() => props.annotationsVisible, async () => {
  await nextTick()
  await applyAnnotations()
})

onUpdated(async () => {
  await renderMermaid()
  await renderPlantuml()
  renderWavedrom()
  fixImagePaths()
  await nextTick()
  await applyAnnotations()
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

/* 标注样式 */
:deep(.anno-highlight) {
  background-color: #fef08a;
  border-radius: 2px;
  padding: 1px 0;
}

:deep(.anno-underline) {
  text-decoration: underline;
  text-decoration-color: #3b82f6;
  text-underline-offset: 2px;
}

:deep(.anno-wavy) {
  text-decoration: underline wavy #dc2626;
  text-underline-offset: 4px;
}

:deep(.anno-comment) {
  background-color: #fef08a;
  border-bottom: 2px dotted #f59e0b;
  border-radius: 2px;
  padding: 1px 0;
}

:deep(.anno-selected) {
  outline: 2px solid #3b82f6;
  outline-offset: 1px;
  border-radius: 2px;
}
</style>

<style>
.anno-context-menu {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,.12);
  min-width: 100px;
  padding: 4px 0;
}
.anno-context-menu .menu-item {
  padding: 6px 14px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}
.anno-context-menu .menu-item:hover {
  background: #f1f5f9;
}
.anno-context-menu .menu-danger {
  color: #dc2626;
}
.anno-context-menu .menu-danger:hover {
  background: #fee2e2;
}
.comment-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}
.comment-dialog {
  background: #fff;
  border-radius: 8px;
  padding: 20px 24px;
  min-width: 320px;
  box-shadow: 0 8px 24px rgba(0,0,0,.15);
}
.comment-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
}
.comment-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
}
.comment-textarea:focus {
  border-color: #3b82f6;
}
.comment-btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.comment-btn {
  padding: 5px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  background: #fff;
  color: #374151;
}
.comment-btn.confirm {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}
</style>