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
    >
      <template #defToolbars>
        <NormalToolbar title="预览" @onClick="togglePreview">
          <template #trigger>
            <svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </template>
        </NormalToolbar>
      </template>
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
}>()

const content = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 编辑器语言（中文）
const language = 'zh-CN'

// 工具栏配置：0 表示引用 defToolbars 插槽中的第一个自定义按钮
const toolbars: ToolbarNames[] = [
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
  'fullscreen',
  0  // 自定义预览按钮
]

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
</style>