<template>
  <div class="editor-container">
    <textarea
      v-model="content"
      class="editor"
      placeholder="在此输入 Markdown..."
      spellcheck="false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const content = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
</script>

<style scoped>
.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor {
  flex: 1;
  width: 100%;
  padding: 1.5rem;
  border: none;
  outline: none;
  resize: none;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #1f2937;
  background-color: #ffffff;
  tab-size: 2;
}

.editor:focus {
  outline: none;
}

.dark .editor {
  color: #e2e8f0;
  background-color: #1e293b;
}

.editor::placeholder {
  color: #9ca3af;
}
</style>
