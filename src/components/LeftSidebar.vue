<template>
  <div class="left-sidebar" :class="{ collapsed, 'empty-bar': leftIcons.length === 0 }">
    <!-- 左侧图标栏 -->
    <div class="sidebar-icon-bar" @pointerup="onDropZone('left')">
      <button
        v-for="(icon, idx) in leftIcons"
        :key="icon"
        class="icon-btn"
        :class="{ active: activeTab === icon && !collapsed }"
        :title="iconTitle(icon)"
        @click="handleTabClick(icon)"
        @pointerdown.prevent="setStartIdx(idx); startDrag($event, icon, 'left')"
        @pointerup="onIconDrop('left', idx)"
      >
        <svg v-if="icon === 'files'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <svg v-else-if="icon === 'search'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      </button>
      <div class="icon-bar-spacer"></div>
    </div>

    <!-- 右侧面板 -->
    <div v-show="!collapsed" class="sidebar-panel">
      <FilesPanel v-if="leftIcons.includes('files') && activeTab === 'files'"
        :work-state="workState"
        :opened-files="openedFiles"
        :current-file-index="currentFileIndex"
        :folder-path="folderPath"
        :site-name="siteName"
        @switch-file="$emit('switch-file', $event)"
        @close-file="$emit('close-file', $event)"
        @close-folder="$emit('close-folder')"
        @rename-file="(o,n) => $emit('rename-file', o, n)"
        @delete-file="(p) => $emit('delete-file', p)"
        @save-as-file="(p) => $emit('save-as-opened', p)"
      >
        <template #file-tree>
          <FileTreeItem v-for="(f, i) in files" :key="i" :item="f" :current-file="currentFile" :level="0" :is-readonly="workState === 'mkdocs'" @select="$emit('select-file', $event)" @rename-file="(old, name) => $emit('rename-file', old, name)" @delete-file="(path) => $emit('delete-file', path)" @save-as="(path) => $emit('save-as', path)" />
        </template>
      </FilesPanel>
      <SearchPanel v-if="leftIcons.includes('search') && activeTab === 'search'"
        :has-multiple-files="hasMultipleFiles"
        :global-search-results="globalSearchResults"
        @search="(t,m,mm) => $emit('search', t, m, mm)"
        @search-jump="(d) => $emit('search-jump', d)"
        @search-clear="$emit('search-clear')"
        @select-search-result="(p) => $emit('select-search-result', p)"
      />
      <OutlinePanelContent v-if="leftIcons.includes('outline') && activeTab === 'outline'"
        :preview-element="previewElement"
        @scroll-to-heading="$emit('scroll-to-heading', $event)"
      />
    </div>
  </div>
  <Teleport to="body">
    <div class="icon-drag-ghost" :style="ghostStyle">
      <svg viewBox="0 0 24 24" fill="none" stroke="#1e40af" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import FileTreeItem from './FileTreeItem.vue'
import FilesPanel from './FilesPanel.vue'
import SearchPanel from './SearchPanel.vue'
import OutlinePanelContent from './OutlinePanelContent.vue'
import { useIconDrag, setStartIdx } from '../composables/useIconDrag'

interface MdFile {
  name: string
  path?: string
  children?: MdFile[]
  isFolder?: boolean
}

interface GlobalSearchResult {
  path: string
  matches: number
  context?: string
}

interface OpenedFile {
  path: string | null
  content: string
  savedContent: string
  dir: string | null
  name: string
}

const props = defineProps<{
  workState: 'file' | 'folder' | 'mkdocs'
  folderPath: string
  siteName?: string
  files: MdFile[]
  currentFile: string | null
  hasMultipleFiles: boolean
  globalSearchResults: GlobalSearchResult[]
  openedFiles: OpenedFile[]
  currentFileIndex: number
  leftIcons: string[]
  rightIcons: string[]
  activeTab: string
  previewElement: HTMLElement | null
}>()

const emit = defineEmits<{
  'select-file': [path: string]
  'search': [text: string, mode: string, matchMode: string]
  'search-jump': [direction: 'prev' | 'next']
  'search-clear': []
  'select-search-result': [path: string]
  'switch-file': [index: number]
  'close-file': [index: number]
  'close-folder': []
  'move-icon': [id: string, toSide: 'left' | 'right']
  'reorder-icons': [side: 'left' | 'right', fromIdx: number, toIdx: number]
  'scroll-to-heading': [id: string]
  'update:active-tab': [tab: string]
  'rename-file': [oldPath: string, newName: string]
  'delete-file': [path: string]
  'save-as': [path: string]
  'save-as-opened': [path: string]
}>()

// 状态
const activeTab = ref<string>(props.activeTab || 'files')
const collapsed = ref(false)

// 图标离开时自动切换到剩余的第一个
watch(() => [...props.leftIcons], (icons, oldIcons) => {
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

const { startDrag, onDropZone, onIconDrop, ghostStyle } = useIconDrag(
  (icon, to) => emit('move-icon', icon, to),
  (side, fromIdx, toIdx) => emit('reorder-icons', side, fromIdx, toIdx)
)

const iconTitle = (id: string) => ({ files: '文件', search: '搜索', outline: '大纲' }[id] || id)

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

// 暴露方法
defineExpose({
  updateResults: (_t: number, _i: number) => {},
  switchToSearchTab: () => activeTab.value = 'search'
})
</script>

<style scoped>
.left-sidebar {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 240px;
  background-color: #f8fafc;
  border-right: 1px solid #e2e8f0;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.15s;
}

.left-sidebar.collapsed {
  width: 36px;
}

.left-sidebar.empty-bar, .left-sidebar.collapsed.empty-bar {
  width: 12px;
}

.left-sidebar.empty-bar .sidebar-icon-bar {
  width: 12px;
  min-width: 12px;
  padding-top: 0;
}

.sidebar-icon-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 36px;
  min-width: 36px;
  background-color: #e2e8f0;
  padding-top: 4px;
  gap: 2px;
}

.icon-btn {
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

.icon-btn:active {
  cursor: grabbing;
}

.icon-btn:hover {
  color: #374151;
  background: #cbd5e1;
}

.icon-btn.active {
  color: #1e40af;
  background: #f8fafc;
}

.icon-btn svg {
  width: 18px;
  height: 18px;
}

.icon-bar-spacer {
  flex: 1;
}

.collapse-btn {
  margin-bottom: 4px;
}

.sidebar-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  background-color: #e2e8f0;
}

.tab-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  background-color: transparent;
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.2s;
}

.tab-btn:hover {
  color: #374151;
}

.tab-btn.active {
  color: #2563eb;
  background-color: #f8fafc;
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: #2563eb;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 文件 Tab - 多文件模式 */
.opened-files-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.opened-files-header {
  padding: 8px 12px;
  background-color: #e2e8f0;
  border-bottom: 1px solid #cbd5e1;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.opened-files-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.opened-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;
}

.opened-file-item:hover {
  background-color: #f1f5f9;
}

.opened-file-item.active {
  background-color: #dbeafe;
}

.opened-file-item .file-icon {
  width: 16px;
  height: 16px;
  color: #6b7280;
  flex-shrink: 0;
}

.opened-file-item .file-name {
  flex: 1;
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opened-file-item.active .file-name {
  color: #2563eb;
  font-weight: 500;
}

.opened-file-item.unsaved .file-name {
  font-weight: 500;
}

.unsaved-mark {
  font-size: 14px;
  color: #f59e0b;
  font-weight: bold;
  margin-left: 2px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0;
}

.opened-file-item:hover .close-btn {
  opacity: 1;
}

.close-btn:hover {
  background-color: #fee2e2;
  color: #dc2626;
}

.close-btn svg {
  width: 12px;
  height: 12px;
}

/* 文件 Tab - 单文件模式（已废弃，保留样式以防回退） */
.single-file-card {
  padding: 16px;
}

.file-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background-color: #e2e8f0;
  border-radius: 8px;
}

.file-icon {
  width: 24px;
  height: 24px;
  color: #6b7280;
  flex-shrink: 0;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 文件 Tab - 文件夹模式 */
.folder-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.folder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #e2e8f0;
  border-bottom: 1px solid #cbd5e1;
}

.folder-name {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-close-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.folder-close-btn:hover {
  background: #cbd5e1;
  color: #334155;
}

.folder-close-btn svg {
  width: 14px;
  height: 14px;
}

.folder-tree {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.empty-message {
  padding: 16px 12px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
}

/* 搜索 Tab */
.search-panel {
  padding: 12px;
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-input {
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #3b82f6;
}

.search-input-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
}

.search-history-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  margin-top: 2px;
  z-index: 100;
  max-height: 150px;
  overflow-y: auto;
}

.history-item {
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
}

.history-item:hover {
  background-color: #f3f4f6;
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background-color: #ffffff;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.search-btn:hover {
  background-color: #f1f5f9;
  border-color: #3b82f6;
  color: #2563eb;
}

.search-btn svg {
  width: 14px;
  height: 14px;
}

.search-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

.search-mode-select {
  height: 24px;
  padding: 2px 4px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 11px;
  outline: none;
  cursor: pointer;
  max-width: 90px;
}

.search-count {
  flex: 1;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background-color: #e2e8f0;
}

.nav-btn:disabled {
  color: #9ca3af;
  cursor: not-allowed;
}

.nav-btn svg {
  width: 14px;
  height: 14px;
}

/* 全局搜索结果 */
.search-results {
  margin-top: 12px;
  flex: 1;
  overflow-y: auto;
}

.result-item {
  padding: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid #f1f5f9;
}

.result-item:hover {
  background-color: #f1f5f9;
}

.result-file-name {
  font-size: 12px;
  font-weight: 500;
  color: #1e293b;
}

.result-match-count {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.result-context {
  font-size: 11px;
  color: #475569;
  margin-top: 8px;
  padding: 6px;
  background-color: #e2e8f0;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

.no-results {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
}

/* 深色主题 */
:root.dark .left-sidebar {
  background-color: #1e1e1e;
  border-right-color: #333333;
}

:root.dark .sidebar-tabs {
  background-color: #252526;
  border-bottom-color: #333333;
}

:root.dark .tab-btn {
  color: #9ca3af;
}

:root.dark .tab-btn:hover {
  color: #e5e5e5;
}

:root.dark .tab-btn.active {
  color: #4fc1ff;
  background-color: #1e1e1e;
}

:root.dark .tab-btn.active::after {
  background-color: #4fc1ff;
}

:root.dark .file-info {
  background-color: #2d2d2d;
}

:root.dark .file-name {
  color: #e5e5e5;
}

:root.dark .file-path {
  color: #8b8b8b;
}

/* 多文件列表深色主题 */
:root.dark .opened-files-header {
  background-color: #252526;
  border-bottom-color: #333333;
}

:root.dark .header-title {
  color: #e5e5e5;
}

:root.dark .opened-file-item:hover {
  background-color: #2d2d2d;
}

:root.dark .opened-file-item.active {
  background-color: #1e3a5f;
}

:root.dark .opened-file-item .file-icon {
  color: #8b8b8b;
}

:root.dark .opened-file-item .file-name {
  color: #e5e5e5;
}

:root.dark .opened-file-item.active .file-name {
  color: #4fc1ff;
}

:root.dark .unsaved-mark {
  color: #f59e0b;
}

:root.dark .close-btn:hover {
  background-color: #3d1f1f;
  color: #f87171;
}

:root.dark .folder-header {
  background-color: #252526;
  border-bottom-color: #333333;
}

:root.dark .folder-name {
  color: #e5e5e5;
}

:root.dark .search-input {
  background-color: #2d2d2d;
  border-color: #404040;
  color: #e5e5e5;
}

:root.dark .search-btn {
  background-color: #2d2d2d;
  border-color: #404040;
  color: #e5e5e5;
}

:root.dark .search-btn:hover {
  background-color: #3d3d3d;
  border-color: #4fc1ff;
  color: #4fc1ff;
}

:root.dark .search-mode-select {
  background-color: #2d2d2d;
  border-color: #404040;
  color: #e5e5e5;
}

:root.dark .nav-btn:hover:not(:disabled) {
  background-color: #2d2d2d;
}

:root.dark .result-item:hover {
  background-color: #2d2d2d;
}

:root.dark .result-context {
  background-color: #2d2d2d;
}

:root.dark .no-results {
  color: #6b6b6b;
}
</style>

<style>
.icon-drag-ghost {
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px dashed #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-drag-ghost svg {
  width: 20px;
  height: 20px;
}
</style>