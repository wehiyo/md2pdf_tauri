<template>
  <div class="editor-container">
    <MdEditor
      ref="editorRef"
      v-model="content"
      :preview="false"
      :htmlPreview="false"
      :theme="theme"
      :language="language"
      :toolbars="[]"
      class="md-editor no-toolbar"
      @onSave="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { MdEditor } from 'md-editor-v3'
import type { ExposeParam } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const props = defineProps<{
  modelValue: string
  theme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'save-file': []
  'editor-ready': [editor: ExposeParam]
}>()

const content = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 编辑器语言（中文）
const language = 'zh-CN'

// 编辑器引用
const editorRef = ref<ExposeParam>()

// 暴露编辑器实例
defineExpose({
  getEditor: () => editorRef.value
})

// 处理内置保存事件
function handleSave() {
  emit('save-file')
}

// 编辑器挂载后通知父组件
onMounted(() => {
  // 等待编辑器实例准备好
  setTimeout(() => {
    if (editorRef.value) {
      emit('editor-ready', editorRef.value)
    }
  }, 100)
})
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

/* 隐藏工具栏 */
.md-editor.no-toolbar:deep(.md-editor-toolbar-wrapper) {
  display: none;
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
</style>