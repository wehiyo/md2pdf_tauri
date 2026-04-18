<template>
  <div class="search-box">
    <input
      v-model="searchText"
      type="text"
      placeholder="搜索..."
      class="search-input"
      @keyup.enter="handleSearch"
      @keyup.escape="clearSearch"
    />
    <span v-if="totalResults > 0" class="search-count">{{ currentIndex + 1 }}/{{ totalResults }}</span>
    <button class="search-nav-btn" title="上一个" :disabled="totalResults === 0" @click="prevResult">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="18 15 12 9 6 15"/>
      </svg>
    </button>
    <button class="search-nav-btn" title="下一个" :disabled="totalResults === 0" @click="nextResult">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    <select v-if="hasMultipleFiles" v-model="searchMode" class="search-mode-select">
      <option value="current">当前文件</option>
      <option value="global">全局搜索</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const emit = defineEmits<{
  search: [text: string, mode: 'current' | 'global']
  jump: [direction: 'prev' | 'next']
  clear: []
}>()

defineProps<{
  hasMultipleFiles?: boolean
}>()

const searchText = ref('')
const searchMode = ref<'current' | 'global'>('current')
const currentIndex = ref(0)
const totalResults = ref(0)

// 外部更新搜索结果数量和当前位置
function updateResults(total: number, current: number) {
  totalResults.value = total
  currentIndex.value = current
}

// 搜索按钮点击或回车
function handleSearch() {
  if (searchText.value.trim()) {
    emit('search', searchText.value.trim(), searchMode.value)
  }
}

// 上一个结果
function prevResult() {
  if (totalResults.value > 0) {
    emit('jump', 'prev')
  }
}

// 下一个结果
function nextResult() {
  if (totalResults.value > 0) {
    emit('jump', 'next')
  }
}

// 清除搜索
function clearSearch() {
  searchText.value = ''
  totalResults.value = 0
  currentIndex.value = 0
  emit('clear')
}

// 搜索模式切换时重新搜索
watch(searchMode, () => {
  if (searchText.value.trim()) {
    emit('search', searchText.value.trim(), searchMode.value)
  }
})

// 暴露方法供外部调用
defineExpose({
  updateResults
})
</script>

<style scoped>
.search-box {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
}

.search-input {
  width: 150px;
  height: 24px;
  padding: 2px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
}

.search-count {
  font-size: 12px;
  color: #6b7280;
  min-width: 40px;
}

.search-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 2px;
  background-color: transparent;
  color: #374151;
  cursor: pointer;
}

.search-nav-btn:hover:not(:disabled) {
  background-color: #e8e8e8;
}

.search-nav-btn:disabled {
  color: #9ca3af;
  cursor: not-allowed;
}

.search-nav-btn svg {
  width: 14px;
  height: 14px;
}

.search-mode-select {
  height: 24px;
  padding: 2px 4px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
}
</style>