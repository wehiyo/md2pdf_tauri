<template>
  <div class="left-sidebar" :style="{ width: sidebarWidth + 'px' }">
    <!-- Tab 头部 -->
    <div class="sidebar-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'files' }"
        @click="activeTab = 'files'"
      >文件</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'search' }"
        @click="activeTab = 'search'"
      >搜索</button>
    </div>

    <!-- Tab 内容 -->
    <div class="sidebar-content">
      <!-- 文件 Tab -->
      <div v-show="activeTab === 'files'" class="tab-panel files-panel">
        <!-- 单文件模式 -->
        <div v-if="workState === 'file'" class="single-file-card">
          <div class="file-info">
            <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <div class="file-details">
              <div class="file-name">{{ currentFileName }}</div>
              <div class="file-path" :title="currentFile ?? ''">{{ currentFileShortPath }}</div>
            </div>
          </div>
          <button class="open-file-btn" @click="$emit('open-file')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            打开其他文件
          </button>
        </div>

        <!-- 文件夹/MkDocs 模式 -->
        <div v-else class="folder-view">
          <div class="folder-header">
            <span class="folder-name">{{ folderName }}</span>
          </div>
          <div class="folder-tree">
            <FileTreeItem
              v-for="(file, index) in files"
              :key="index"
              :item="file"
              :current-file="currentFile"
              :level="0"
              @select="$emit('select-file', $event)"
            />
            <div v-if="files.length === 0" class="empty-message">
              无 Markdown 文件
            </div>
          </div>
        </div>
      </div>

      <!-- 搜索 Tab -->
      <div v-show="activeTab === 'search'" class="tab-panel search-panel">
        <div class="search-controls">
          <input
            v-model="searchText"
            type="text"
            placeholder="搜索..."
            class="search-input"
            @keyup.enter="handleSearch"
            @keyup.escape="clearSearch"
          />
          <button class="search-btn" title="搜索" @click="handleSearch">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <select v-if="hasMultipleFiles" v-model="searchMode" class="search-mode-select">
            <option value="current">当前文件</option>
            <option value="global">全局搜索</option>
          </select>
        </div>
        <div class="search-nav">
          <span v-if="totalResults > 0" class="search-count">{{ currentIndex + 1 }}/{{ totalResults }}</span>
          <span v-else-if="searchText && hasSearched" class="search-count">无结果</span>
          <button class="nav-btn" title="上一个" :disabled="totalResults === 0" @click="$emit('search-jump', 'prev')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
          <button class="nav-btn" title="下一个" :disabled="totalResults === 0" @click="$emit('search-jump', 'next')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        <!-- 全局搜索结果列表 -->
        <div v-if="searchMode === 'global' && globalSearchResults.length > 0" class="search-results">
          <div
            v-for="result in globalSearchResults"
            :key="result.path"
            class="result-item"
            @click="handleSelectResult(result)"
          >
            <div class="result-file-name">{{ getFileName(result.path) }}</div>
            <div class="result-match-count">{{ result.matches }} 个匹配</div>
            <div v-if="result.context" class="result-context">{{ result.context }}</div>
          </div>
        </div>
        <div v-else-if="searchMode === 'global' && hasSearched && globalSearchResults.length === 0" class="no-results">
          未找到匹配结果
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import FileTreeItem from './FileTreeItem.vue'

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

const props = defineProps<{
  workState: 'file' | 'folder' | 'mkdocs'
  folderPath: string
  files: MdFile[]
  currentFile: string | null
  hasMultipleFiles: boolean
  globalSearchResults: GlobalSearchResult[]
}>()

const emit = defineEmits<{
  'select-file': [path: string]
  'search': [text: string, mode: 'current' | 'global']
  'search-jump': [direction: 'prev' | 'next']
  'search-clear': []
  'select-search-result': [path: string]
  'open-file': []
  'update-width': [width: number]
}>()

// 状态
const activeTab = ref<'files' | 'search'>('files')
const searchText = ref('')
const searchMode = ref<'current' | 'global'>('current')
const currentIndex = ref(0)
const totalResults = ref(0)
const hasSearched = ref(false)
const sidebarWidth = ref(240)

// 计算属性
const currentFileName = computed(() => {
  if (!props.currentFile) return '未打开文件'
  const lastSep = Math.max(props.currentFile.lastIndexOf('/'), props.currentFile.lastIndexOf('\\'))
  return lastSep > 0 ? props.currentFile.substring(lastSep + 1) : props.currentFile
})

const currentFileShortPath = computed(() => {
  if (!props.currentFile) return ''
  const lastSep = Math.max(props.currentFile.lastIndexOf('/'), props.currentFile.lastIndexOf('\\'))
  const dirPath = lastSep > 0 ? props.currentFile.substring(0, lastSep) : ''
  // 只显示最后两层目录
  const dirParts = dirPath.split(/[\/\\]/)
  if (dirParts.length > 2) {
    return '...' + dirParts.slice(-2).join('/') + '/' + currentFileName.value
  }
  return dirPath ? dirPath + '/' + currentFileName.value : currentFileName.value
})

const folderName = computed(() => {
  if (!props.folderPath) return '文件列表'
  const lastSep = Math.max(props.folderPath.lastIndexOf('/'), props.folderPath.lastIndexOf('\\'))
  return lastSep >= 0 ? props.folderPath.substring(lastSep + 1) : props.folderPath
})

// 方法
function handleSearch() {
  if (searchText.value.trim()) {
    hasSearched.value = true
    emit('search', searchText.value.trim(), searchMode.value)
  }
}

function clearSearch() {
  searchText.value = ''
  totalResults.value = 0
  currentIndex.value = 0
  hasSearched.value = false
  emit('search-clear')
}

function getFileName(path: string): string {
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return lastSep > 0 ? path.substring(lastSep + 1) : path
}

function handleSelectResult(result: GlobalSearchResult) {
  emit('select-search-result', result.path)
}

// 外部更新搜索结果
function updateResults(total: number, current: number) {
  totalResults.value = total
  currentIndex.value = current
}

// 搜索模式切换时重新搜索
watch(searchMode, () => {
  if (searchText.value.trim() && hasSearched.value) {
    emit('search', searchText.value.trim(), searchMode.value)
  }
})

// 暴露方法
defineExpose({
  updateResults,
  switchToSearchTab: () => activeTab.value = 'search'
})
</script>

<style scoped>
.left-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f8fafc;
  border-right: 1px solid #e2e8f0;
  flex-shrink: 0;
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

/* 文件 Tab - 单文件模式 */
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

.open-file-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background-color: #ffffff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.open-file-btn:hover {
  background-color: #f1f5f9;
  border-color: #cbd5e1;
}

.open-file-btn svg {
  width: 14px;
  height: 14px;
}

/* 文件 Tab - 文件夹模式 */
.folder-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.folder-header {
  padding: 8px 12px;
  background-color: #e2e8f0;
  border-bottom: 1px solid #cbd5e1;
}

.folder-name {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
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
  flex: 1;
  height: 28px;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
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

.search-mode-select {
  height: 28px;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.search-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

.search-count {
  flex: 1;
  font-size: 12px;
  color: #6b7280;
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

:root.dark .open-file-btn {
  background-color: #2d2d2d;
  border-color: #404040;
  color: #e5e5e5;
}

:root.dark .open-file-btn:hover {
  background-color: #3d3d3d;
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