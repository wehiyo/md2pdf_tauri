<template>
  <div class="editor-container">
    <MdEditor
      v-model="content"
      :preview="false"
      :htmlPreview="false"
      :theme="theme"
      :language="language"
      :toolbars="toolbars"
      class="md-editor"
      @onSave="handleSave"
    >
      <template #defToolbars><NormalToolbar title="打开文件" :onClick="openFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></NormalToolbar><NormalToolbar title="切换预览" :onClick="togglePreview"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg></NormalToolbar><NormalToolbar title="仅预览" :onClick="previewOnly"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></NormalToolbar></template>
    </MdEditor>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MdEditor, NormalToolbar } from 'md-editor-v3'
import type { ToolbarNames } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const props = defineProps<{
  modelValue: string
  theme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'toggle-preview': []
  'preview-only': []
  'open-file': []
  'save-file': []
}>()

const content = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 编辑器语言（中文）
const language = 'zh-CN'

// 工具栏配置
// 0=打开文件, 1=切换预览, 2=仅预览
const toolbars: ToolbarNames[] = [
  0,  // 打开文件（最前面）
  'save',
  1,  // 切换预览
  2,  // 仅预览
  '-',
  'bold',
  'underline',
  'italic',
  '-',
  'title',
  'strikeThrough',
  'sub',
  'sup',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'codeRow',
  'code',
  'link',
  'image',
  'table',
  'mermaid',
  'katex',
  '-',
  'revoke',
  'next',
  '=',
  'pageFullscreen',
  'fullscreen'
]

// 打开文件
function openFile() {
  emit('open-file')
}

// 处理内置保存事件
function handleSave() {
  emit('save-file')
}

// 切换预览（显示/隐藏预览区）
function togglePreview() {
  emit('toggle-preview')
}

// 仅预览（隐藏编辑器，只显示预览区）
function previewOnly() {
  emit('preview-only')
}
</script>

<style scoped>
.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.md-editor {
  height: 100%;
  flex: 1;
}

/* 覆盖 md-editor-v3 的默认样式以适配容器 */
.md-editor:deep(.md-editor) {
  height: 100%;
  border: none;
  border-radius: 0;
}

.md-editor:deep(.md-editor-content) {
  height: 100%;
}

.md-editor:deep(.md-editor-input-wrapper) {
  height: 100%;
}

.md-editor:deep(textarea.md-editor-input) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
  font-size: 14px;
  line-height: 1.6;
}

.toolbar-icon {
  width: 16px;
  height: 16px;
}
</style>