<template>
  <div class="search-panel">
    <div class="search-controls">
      <div class="search-input-wrapper">
        <input v-model="searchText" type="text" placeholder="搜索..." class="search-input"
          @keyup.enter="doSearch" @keyup.escape="clearSearch"
          @focus="showHistory = true" @blur="onBlur" />
        <div v-if="showHistory && history.length > 0" class="search-history-dropdown">
          <div v-for="item in history" :key="item" class="history-item" @mousedown.prevent="selectHistory(item)">{{ item }}</div>
        </div>
      </div>
      <button class="search-btn" title="搜索" @click="doSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
    </div>
    <div class="search-nav">
      <select v-if="hasMultipleFiles" v-model="searchMode" class="search-mode-select">
        <option value="current">当前文件</option><option value="global">全局搜索</option>
      </select>
      <select v-model="searchMatchMode" class="search-mode-select">
        <option value="case-sensitive">区分大小写</option><option value="whole-word">全词匹配</option><option value="regex">正则表达式</option>
      </select>
      <span v-if="totalResults > 0" class="search-count">{{ currentIndex + 1 }}/{{ totalResults }}</span>
      <span v-else-if="searchText && hasSearched" class="search-count">无结果</span>
      <button class="nav-btn" title="上一个" :disabled="totalResults === 0" @click="$emit('search-jump', 'prev')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <button class="nav-btn" title="下一个" :disabled="totalResults === 0" @click="$emit('search-jump', 'next')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <button class="nav-btn" title="清除" :disabled="!searchText" @click="clearSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div v-if="searchMode === 'global' && globalSearchResults.length > 0" class="search-results">
      <div v-for="result in globalSearchResults" :key="result.path" class="result-item" @click="$emit('select-search-result', result.path)">
        <div class="result-file-name">{{ getFileName(result.path) }}</div>
        <div class="result-match-count">{{ result.matches }} 个匹配</div>
        <div v-if="result.context" class="result-context">{{ result.context }}</div>
      </div>
    </div>
    <div v-else-if="searchMode === 'global' && hasSearched && globalSearchResults.length === 0" class="no-results">未找到匹配结果</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

interface GlobalSearchResult { path: string; matches: number; context?: string }

defineProps<{
  hasMultipleFiles?: boolean
  globalSearchResults: GlobalSearchResult[]
}>()

const emit = defineEmits<{
  'search': [text: string, mode: string, matchMode: string]
  'search-jump': [direction: 'prev' | 'next']
  'search-clear': []
  'select-search-result': [path: string]
  'update-results': [total: number, index: number]
}>()

const HISTORY_KEY = 'markrefine-search-history'
const searchText = ref('')
const searchMode = ref<'current' | 'global'>('current')
const searchMatchMode = ref('case-sensitive')
const showHistory = ref(false)
const history = ref<string[]>([])
const hasSearched = ref(false)
const totalResults = ref(0)
const currentIndex = ref(-1)

onMounted(() => { try { const r = localStorage.getItem(HISTORY_KEY); if (r) history.value = JSON.parse(r) } catch { /* ignore */ } })

function doSearch() {
  const t = searchText.value.trim()
  if (!t) return
  hasSearched.value = true
  if (!history.value.includes(t)) { history.value.unshift(t); if (history.value.length > 5) history.value.pop(); localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value)) }
  showHistory.value = false
  emit('search', t, searchMode.value, searchMatchMode.value)
}

function clearSearch() {
  searchText.value = ''
  hasSearched.value = false
  totalResults.value = 0
  currentIndex.value = -1
  emit('search-clear')
}

function selectHistory(item: string) { searchText.value = item; showHistory.value = false; doSearch() }
function onBlur() { setTimeout(() => showHistory.value = false, 200) }

watch([searchMode, searchMatchMode], () => { if (searchText.value.trim() && hasSearched.value) emit('search', searchText.value.trim(), searchMode.value, searchMatchMode.value) })

defineExpose({ updateResults(total: number, idx: number) { totalResults.value = total; currentIndex.value = idx } })

function getFileName(path: string) { const s = path.replace(/\\/g, '/').split('/'); return s[s.length - 1] || path }
</script>

<style scoped>
.search-panel { padding: 12px; display: flex; flex-direction: column; height: 100%; }
.search-controls { display: flex; align-items: center; gap: 4px; }
.search-input { width: 100%; height: 28px; padding: 4px 8px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; outline: none; box-sizing: border-box; }
.search-input:focus { border-color: #3b82f6; }
.search-input-wrapper { flex: 1; min-width: 0; position: relative; }
.search-history-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; margin-top: 2px; z-index: 100; max-height: 150px; overflow-y: auto; }
.history-item { padding: 6px 8px; font-size: 12px; cursor: pointer; color: #374151; }
.history-item:hover { background-color: #f3f4f6; }
.search-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid #e2e8f0; border-radius: 4px; background-color: #fff; color: #374151; cursor: pointer; transition: all 0.2s; }
.search-btn:hover { background-color: #f1f5f9; border-color: #3b82f6; color: #2563eb; }
.search-btn svg { width: 14px; height: 14px; }
.search-nav { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
.search-mode-select { height: 24px; padding: 2px 4px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 11px; outline: none; cursor: pointer; max-width: 90px; }
.search-count { flex: 1; font-size: 12px; color: #6b7280; text-align: center; }
.nav-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: 4px; background-color: transparent; color: #374151; cursor: pointer; transition: background-color 0.2s; }
.nav-btn:hover:not(:disabled) { background-color: #e2e8f0; }
.nav-btn:disabled { color: #9ca3af; cursor: not-allowed; }
.nav-btn svg { width: 14px; height: 14px; }
.search-results { margin-top: 12px; flex: 1; overflow-y: auto; }
.result-item { padding: 12px; cursor: pointer; transition: background-color .2s; border-bottom: 1px solid #f1f5f9; }
.result-item:hover { background-color: #f1f5f9; }
.result-file-name { font-size: 12px; font-weight: 500; color: #1e293b; }
.result-match-count { font-size: 11px; color: #64748b; margin-top: 2px; }
.result-context { font-size: 11px; color: #475569; margin-top: 8px; padding: 6px; background-color: #e2e8f0; border-radius: 4px; white-space: pre-wrap; word-break: break-all; }
.no-results { padding: 16px 12px; text-align: center; color: #9ca3af; font-size: 12px; }
</style>
