<template>
  <Teleport to="body">
    <div v-if="visible" class="search-result-overlay" @click.self="emit('close')">
      <div class="search-result-dialog">
        <div class="search-result-header">
          <span>搜索结果 - "{{ searchText }}"</span>
          <button class="close-btn" @click="emit('close')">×</button>
        </div>
        <div class="search-result-body">
          <div v-if="results.length === 0" class="no-results">
            未找到匹配结果
          </div>
          <div v-else class="search-result-list">
            <div
              v-for="result in results"
              :key="result.path"
              class="search-result-item"
              @click="handleSelect(result)"
            >
              <div class="result-file-name">{{ getFileName(result.path) }}</div>
              <div class="result-match-count">{{ result.matches }} 个匹配</div>
              <div v-if="result.context" class="result-context">{{ result.context }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
interface SearchResult {
  path: string
  matches: number
  context?: string
}

defineProps<{
  visible: boolean
  searchText: string
  results: SearchResult[]
}>()

const emit = defineEmits<{
  close: []
  select: [path: string]
}>()

// 从路径提取文件名
function getFileName(path: string): string {
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return lastSep > 0 ? path.substring(lastSep + 1) : path
}

// 选择搜索结果
function handleSelect(result: SearchResult) {
  emit('select', result.path)
  emit('close')
}
</script>

<style scoped>
.search-result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.search-result-dialog {
  background-color: #ffffff;
  border-radius: 8px;
  min-width: 400px;
  max-width: 600px;
  max-height: 500px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
}

.search-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 18px;
  color: #64748b;
  cursor: pointer;
}

.close-btn:hover {
  color: #1e293b;
}

.search-result-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.no-results {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}

.search-result-list {
  display: flex;
  flex-direction: column;
}

.search-result-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid #f1f5f9;
}

.search-result-item:hover {
  background-color: #f1f5f9;
}

.search-result-item:last-child {
  border-bottom: none;
}

.result-file-name {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
}

.result-match-count {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.result-context {
  font-size: 12px;
  color: #475569;
  margin-top: 8px;
  padding: 8px;
  background-color: #f8fafc;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>