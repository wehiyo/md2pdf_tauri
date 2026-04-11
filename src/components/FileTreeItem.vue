<template>
  <div class="tree-item">
    <!-- 文件夹节点 -->
    <div
      v-if="item.isFolder"
      class="folder-item"
      :style="{ paddingLeft: level * 12 + 12 + 'px' }"
      @click="toggleFolder"
    >
      <svg class="folder-arrow" :class="{ expanded: isExpanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <!-- 关闭的文件夹图标 -->
      <svg v-if="!isExpanded" class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 0-2 2H4a2 2 0 0 0-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <!-- 打开的文件夹图标 -->
      <svg v-else class="folder-icon folder-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 3h4a2 2 0 0 1 2 2v1"/>
        <path d="M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9l-2 3H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2z"/>
      </svg>
      <span class="item-name">{{ item.name }}</span>
    </div>

    <!-- 文件节点 -->
    <div
      v-else
      class="file-item"
      :class="{ active: item.path === currentFile }"
      :style="{ paddingLeft: level * 12 + 12 + 'px' }"
      @click="selectFile"
      :title="item.path"
    >
      <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <span class="item-name">{{ item.name }}</span>
    </div>

    <!-- 子节点 -->
    <div v-if="item.isFolder && isExpanded && item.children" class="children">
      <FileTreeItem
        v-for="(child, index) in item.children"
        :key="index"
        :item="child"
        :current-file="currentFile"
        :level="level + 1"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface MdFile {
  name: string
  path?: string
  children?: MdFile[]
  isFolder?: boolean
}

const props = defineProps<{
  item: MdFile
  currentFile: string | null
  level: number
}>()

const emit = defineEmits<{
  'select': [path: string]
}>()

// 文件夹默认关闭
const isExpanded = ref(false)

function toggleFolder() {
  isExpanded.value = !isExpanded.value
}

function selectFile() {
  if (props.item.path) {
    emit('select', props.item.path)
  }
}
</script>

<style scoped>
.tree-item {
  user-select: none;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}

.folder-item:hover {
  background-color: #e2e8f0;
}

.dark .folder-item {
  color: #e2e8f0;
}

.dark .folder-item:hover {
  background-color: #334155;
}

.folder-arrow {
  width: 12px;
  height: 12px;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.folder-arrow.expanded {
  transform: rotate(90deg);
}

.folder-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #f59e0b;
}

.folder-icon.folder-open {
  color: #fbbf24;
}

.dark .folder-icon {
  color: #fbbf24;
}

.dark .folder-icon.folder-open {
  color: #fcd34d;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 12px;
  color: #374151;
}

.file-item:hover {
  background-color: #e2e8f0;
}

.dark .file-item {
  color: #e2e8f0;
}

.dark .file-item:hover {
  background-color: #334155;
}

.file-item.active {
  background-color: #dbeafe;
  color: #2563eb;
}

.dark .file-item.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

.file-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #6b7280;
}

.dark .file-icon {
  color: #9ca3af;
}

.file-item.active .file-icon {
  color: #2563eb;
}

.dark .file-item.active .file-icon {
  color: #60a5fa;
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.children {
  /* 子节点无需额外样式 */
}
</style>