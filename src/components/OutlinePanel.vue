<template>
  <div class="outline-panel" :class="{ collapsed, 'empty-bar': rightIcons.length === 0 }">
    <div v-show="!collapsed" class="outline-panel-content">
      <FilesPanel v-if="rightIcons.includes('files')" v-show="activeTab === 'files'"
        :work-state="workState || 'file'" :opened-files="openedFiles || []" :current-file-index="currentFileIndex || 0"
        :folder-path="folderPath || ''" :site-name="siteName"
        @switch-file="$emit('switch-file', $event)"
        @close-file="$emit('close-file', $event)"
        @close-folder="$emit('close-folder')"
      />
      <SearchPanel v-if="rightIcons.includes('search')" v-show="activeTab === 'search'"
        :has-multiple-files="hasMultipleFiles" :global-search-results="globalSearchResults || []"
        @search="(t,m,mm) => $emit('search', t, m, mm)"
        @search-jump="(d) => $emit('search-jump', d)"
        @search-clear="$emit('search-clear')"
        @select-search-result="(p) => $emit('select-search-result', p)"
      />
      <OutlinePanelContent v-if="rightIcons.includes('outline')" v-show="activeTab === 'outline'"
        :preview-element="previewRef"
        @scroll-to-heading="(id) => scrollToHeading(id)"
      />
    </div>
    <div class="outline-icon-bar" @pointerup="onDropZone('right')">
      <button
        v-for="(icon, idx) in rightIcons"
        :key="icon"
        class="outline-icon-btn"
        :class="{ active: activeTab === icon && !collapsed }"
        :title="iconTitle(icon)"
        @click="handleTabClick(icon)"
        @pointerdown.prevent="setStartIdx(idx); startDrag($event, icon, 'right')"
        @pointerup="onIconDrop('right', idx)"
      >
        <svg v-if="icon === 'outline'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        <svg v-else-if="icon === 'files'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
      <div class="outline-icon-spacer"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useIconDrag, setStartIdx } from '../composables/useIconDrag'
import FilesPanel from './FilesPanel.vue'
import SearchPanel from './SearchPanel.vue'
import OutlinePanelContent from './OutlinePanelContent.vue'
import type { MdFile } from '../types'

interface OutlineItem {
  id: string
  text: string      // 显示文本（不含编号）
  rawText: string   // 原始文本（含编号，用于 tooltip）
  level: number
}

interface OpenedFile { path: string | null; content: string; savedContent: string; dir: string | null; name: string }
interface GlobalSearchResult { path: string; matches: number; context?: string }

const props = defineProps<{
  previewRef: HTMLElement | null
  leftIcons: string[]
  rightIcons: string[]
  activeTab: string
  workState?: string
  folderPath?: string
  siteName?: string
  files?: MdFile[]
  currentFile?: string | null
  hasMultipleFiles?: boolean
  globalSearchResults?: GlobalSearchResult[]
  openedFiles?: OpenedFile[]
  currentFileIndex?: number
}>()

const emit = defineEmits<{
  'scroll-to-heading': [id: string]
  'move-icon': [id: string, toSide: 'left' | 'right']
  'reorder-icons': [side: 'left' | 'right', fromIdx: number, toIdx: number]
  'switch-file': [index: number]
  'close-file': [index: number]
  'close-folder': []
  'search': [text: string, mode: string, matchMode: string]
  'search-jump': [direction: 'prev' | 'next']
  'search-clear': []
  'select-search-result': [path: string]
  'select-file': [path: string]
  'update:active-tab': [tab: string]
}>()

const outlineItems = ref<OutlineItem[]>([])
const collapsed = ref(false)

const { startDrag, onDropZone, onIconDrop } = useIconDrag(
  (icon, to) => emit('move-icon', icon, to),
  (side, fromIdx, toIdx) => emit('reorder-icons', side, fromIdx, toIdx)
)

const iconTitle = (id: string) => ({ files: '文件', search: '搜索', outline: '大纲' }[id] || id)
const activeTab = ref(props.activeTab || 'outline')

function handleTabClick(tab: string) {
  if (collapsed.value) {
    collapsed.value = false
    activeTab.value = tab
  } else if (activeTab.value === tab) {
    collapsed.value = true
  } else {
    activeTab.value = tab
  }
  emit('update:active-tab', activeTab.value)
}

// 图标离开时自动切换到剩余的第一个
watch(() => [...props.rightIcons], (icons, oldIcons) => {
  if (icons.length === 0) {
    collapsed.value = true
  } else {
    if (!icons.includes(activeTab.value)) activeTab.value = icons[0]
    if (oldIcons) {
      const added = icons.find(i => !oldIcons.includes(i))
      if (added) activeTab.value = added
    }
  }
}, { deep: true, immediate: true })
let previewElement: HTMLElement | null = null

// 从 Preview 组件提取大纲
function extractOutline() {
  if (!previewElement) {
    outlineItems.value = []
    return
  }

  const headings = previewElement.querySelectorAll('h1, h2, h3, h4')
  const items: OutlineItem[] = []

  headings.forEach(heading => {
    const id = heading.id
    const rawText = heading.textContent || ''
    const level = parseInt(heading.tagName.charAt(1))

    if (id && level >= 1 && level <= 4) {
      // 移除开头的数字编号（如 "1.2.3 " 或 "1. "）
      const text = removeNumbering(rawText)
      items.push({ id, text, rawText, level })
    }
  })

  outlineItems.value = items
}

// 移除标题编号（支持 "1.2.3. "、"1. "、"1.2. " 等格式）
function removeNumbering(text: string): string {
  // 匹配开头的数字编号模式：如 "1.2.3. " 或 "1. " 或 "1.2. "
  // 编号格式：数字序列，每个数字后跟句号，最后有空格
  const match = text.match(/^(\d+\.(\d+\.)*\s+)/)
  if (match) {
    return text.substring(match[0].length)
  }
  return text
}

// 滚动到指定标题
function scrollToHeading(id: string) {
  emit('scroll-to-heading', id)
}

// 更新 Preview 引用并提取大纲
function updatePreviewRef(element: HTMLElement | null) {
  previewElement = element
  extractOutline()
}

// 监听 previewRef 变化
watch(() => props.previewRef, (newRef) => {
  updatePreviewRef(newRef)
}, { immediate: true })

// 监听 DOM 变化（大纲内容更新）
let mutationObserver: MutationObserver | null = null

onMounted(() => {
  if (previewElement) {
    mutationObserver = new MutationObserver(() => {
      extractOutline()
    })
    mutationObserver.observe(previewElement, { childList: true, subtree: true })
  }
})

onUnmounted(() => {
  if (mutationObserver) {
    mutationObserver.disconnect()
  }
})

// 暴露方法供外部调用
defineExpose({
  extractOutline,
  updatePreviewRef
})
</script>

<style scoped>
.outline-panel {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 240px;
  background-color: #f8fafc;
  border-left: 1px solid #e2e8f0;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.15s;
}

.outline-panel.collapsed {
  width: 36px;
}

.outline-panel.empty-bar, .outline-panel.collapsed.empty-bar {
  width: 12px;
}

.outline-panel.empty-bar .outline-icon-bar {
  width: 12px;
  min-width: 12px;
  padding-top: 0;
}

.outline-icon-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 36px;
  min-width: 36px;
  background-color: #e2e8f0;
  padding-top: 4px;
  gap: 2px;
}

.outline-icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: grab;
  touch-action: none;
  transition: color 0.15s, background 0.15s;
}

.outline-icon-btn:active {
  cursor: grabbing;
}

.outline-icon-btn:hover {
  color: #374151;
  background: #cbd5e1;
}

.outline-icon-btn.active {
  color: #1e40af;
  background: #f8fafc;
}

.outline-icon-btn svg {
  width: 18px;
  height: 18px;
}

.outline-icon-spacer {
  flex: 1;
}

.outline-panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.outline-header {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 36px;
  border-bottom: 1px solid #e2e8f0;
  background-color: #e2e8f0;
  font-weight: 600;
  font-size: 12px;
  color: #374151;
}

.outline-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.outline-item {
  padding: 6px 16px;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.outline-item:hover {
  background-color: #e2e8f0;
}

.outline-level-1 {
  font-weight: 600;
  padding-left: 16px;
}

.outline-level-2 {
  padding-left: 28px;
}

.outline-level-3 {
  padding-left: 40px;
}

.outline-level-4 {
  padding-left: 52px;
  font-size: 11px;
  color: #6b7280;
}

.outline-empty {
  padding: 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
}

/* 深色主题 */
:root.dark .outline-panel {
  background-color: #1e1e1e;
  border-left-color: #333333;
}

:root.dark .outline-header {
  background-color: #252526;
  border-bottom-color: #333333;
  color: #e5e5e5;
}

:root.dark .outline-item {
  color: #9ca3af;
}

:root.dark .outline-item:hover {
  background-color: #2d2d2d;
}

:root.dark .outline-level-4 {
  color: #6b6b6b;
}

:root.dark .outline-empty {
  color: #6b6b6b;
}
</style>