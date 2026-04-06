<template>
  <div class="preview-toolbar">
    <div class="toolbar-left">
      <button class="toolbar-btn" :class="{ active: previewOnlyMode }" title="仅预览" @click="$emit('preview-only')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>仅预览</span>
      </button>
      <button class="toolbar-btn" title="导出HTML" @click="$emit('export-html')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>导出HTML</span>
      </button>
      <button class="toolbar-btn" title="导出PDF" @click="$emit('export-pdf')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span>导出PDF</span>
      </button>
    </div>
    <div class="toolbar-right">
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  'preview-only': []
  'export-html': []
  'export-pdf': []
}>()

defineProps<{
  previewOnlyMode?: boolean
}>()
</script>

<style scoped>
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 36px;
  padding: 0 4px;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.dark .preview-toolbar {
  background-color: #1e293b;
  border-bottom-color: #334155;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 0;
  background-color: transparent;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  height: 28px;
}

.toolbar-btn:hover {
  background-color: #e8e8e8;
}

.toolbar-btn svg {
  width: 16px;
  height: 16px;
}

.toolbar-btn span {
  font-weight: 400;
}

.dark .toolbar-btn {
  color: #e2e8f0;
}

.dark .toolbar-btn:hover {
  background-color: #333;
}

.toolbar-btn.active {
  background-color: #dbeafe;
  color: #2563eb;
}

.dark .toolbar-btn.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}
</style>