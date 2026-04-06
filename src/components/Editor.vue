<template>
  <div class="editor-container" ref="containerRef">
    <MdEditor
      ref="mdEditorRef"
      v-model="content"
      :preview="false"
      :htmlPreview="false"
      :theme="theme"
      :language="language"
      :toolbars="toolbars"
      class="md-editor"
      @onSave="saveFile"
    >
      <template #defToolbars><NormalToolbar title="新建文件" :onClick="newFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></NormalToolbar><NormalToolbar title="打开文件" :onClick="openFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z"/></svg></NormalToolbar><NormalToolbar title="保存文件" :onClick="saveFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></NormalToolbar><NormalToolbar title="切换预览" :onClick="togglePreview"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg></NormalToolbar></template>
    </MdEditor>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { MdEditor, NormalToolbar } from 'md-editor-v3'
import type { ToolbarNames } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const props = defineProps<{
  modelValue: string
  theme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'new-file': []
  'open-file': []
  'save-file': []
  'toggle-preview': []
}>()

const containerRef = ref<HTMLElement>()
const mdEditorRef = ref<InstanceType<typeof MdEditor>>()

// 暴露滚动容器
defineExpose({
  getScrollContainer: () => {
    // CodeMirror 滚动容器
    return containerRef.value?.querySelector('.cm-scroller') as HTMLElement | null
  }
})

const content = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 编辑器语言（中文）
const language = 'zh-CN'

// 工具栏配置
// 0=新建文件, 1=打开文件, 2=保存文件, 3=切换预览
const toolbars: ToolbarNames[] = [
  0,  // 新建文件
  1,  // 打开文件
  2,  // 保存文件
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
  3,  // 切换预览（最后）
  'pageFullscreen',
  'fullscreen'
]

// 新建文件
function newFile() {
  emit('new-file')
}

// 打开文件
function openFile() {
  emit('open-file')
}

// 保存文件
function saveFile() {
  emit('save-file')
}

// 切换预览
function togglePreview() {
  emit('toggle-preview')
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

/* 确保自定义工具栏按钮与内置按钮样式一致 */
.md-editor:deep(.md-editor-toolbar-item) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>