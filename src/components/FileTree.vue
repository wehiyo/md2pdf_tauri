<template>
  <div class="file-tree">
    <div class="file-tree-header">
      <span class="header-title">{{ folderName }}</span>
      <button class="close-btn" @click="$emit('close')" title="关闭">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="file-tree-content">
      <FileTreeItem
        v-for="(file, index) in files"
        :key="index"
        :item="file"
        :current-file="currentFile"
        :level="0"
        @select="$emit('select', $event)"
      />
      <div v-if="files.length === 0" class="empty-message">
        无 Markdown 文件
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FileTreeItem from './FileTreeItem.vue'

interface MdFile {
  name: string
  path?: string
  children?: MdFile[]
  isFolder?: boolean
}

const props = defineProps<{
  folderPath: string
  files: MdFile[]
  currentFile: string | null
}>()

defineEmits<{
  'select': [path: string]
  'close': []
}>()

const folderName = computed(() => {
  if (!props.folderPath) return '文件列表'
  const lastSep = Math.max(props.folderPath.lastIndexOf('/'), props.folderPath.lastIndexOf('\\'))
  return lastSep >= 0 ? props.folderPath.substring(lastSep + 1) : props.folderPath
})
</script>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f8fafc;
  border-right: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.dark .file-tree {
  background-color: #1e293b;
  border-right-color: #334155;
}

.file-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #e2e8f0;
  border-bottom: 1px solid #cbd5e1;
}

.dark .file-tree-header {
  background-color: #334155;
  border-bottom-color: #475569;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark .header-title {
  color: #e2e8f0;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  background-color: transparent;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
}

.close-btn:hover {
  background-color: #cbd5e1;
  color: #374151;
}

.dark .close-btn {
  color: #94a3b8;
}

.dark .close-btn:hover {
  background-color: #475569;
  color: #e2e8f0;
}

.close-btn svg {
  width: 14px;
  height: 14px;
}

.file-tree-content {
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

.dark .empty-message {
  color: #6b7280;
}
</style>