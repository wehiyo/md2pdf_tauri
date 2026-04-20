<template>
  <div class="outline-panel">
    <div class="outline-header">
      <span>大纲</span>
    </div>
    <div class="outline-content">
      <div
        v-for="item in outlineItems"
        :key="item.id"
        class="outline-item"
        :class="'outline-level-' + item.level"
        :title="item.rawText"
        @click="scrollToHeading(item.id)"
      >
        {{ item.text }}
      </div>
      <div v-if="outlineItems.length === 0" class="outline-empty">
        暂无标题
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

interface OutlineItem {
  id: string
  text: string      // 显示文本（不含编号）
  rawText: string   // 原始文本（含编号，用于 tooltip）
  level: number
}

const props = defineProps<{
  previewRef: HTMLElement | null
}>()

const emit = defineEmits<{
  'scroll-to-heading': [id: string]
}>()

const outlineItems = ref<OutlineItem[]>([])
let previewElement: HTMLElement | null = null

// 从 Preview 组件提取大纲
function extractOutline() {
  if (!previewElement) {
    outlineItems.value = []
    return
  }

  const headings = previewElement.querySelectorAll('h1, h2, h3, h4')
  const items: OutlineItem[] = []

  headings.forEach(heading => {
    const id = heading.id
    const rawText = heading.textContent || ''
    const level = parseInt(heading.tagName.charAt(1))

    if (id && level >= 1 && level <= 4) {
      // 移除开头的数字编号（如 "1.2.3 " 或 "1. "）
      const text = removeNumbering(rawText)
      items.push({ id, text, rawText, level })
    }
  })

  outlineItems.value = items
}

// 移除标题编号（支持 "1.2.3. "、"1. "、"1.2. " 等格式）
function removeNumbering(text: string): string {
  // 匹配开头的数字编号模式：如 "1.2.3. " 或 "1. " 或 "1.2. "
  // 编号格式：数字序列，每个数字后跟句号，最后有空格
  const match = text.match(/^(\d+\.(\d+\.)*\s+)/)
  if (match) {
    return text.substring(match[0].length)
  }
  return text
}

// 滚动到指定标题
function scrollToHeading(id: string) {
  emit('scroll-to-heading', id)
}

// 更新 Preview 引用并提取大纲
function updatePreviewRef(element: HTMLElement | null) {
  previewElement = element
  extractOutline()
}

// 监听 previewRef 变化
watch(() => props.previewRef, (newRef) => {
  updatePreviewRef(newRef)
}, { immediate: true })

// 监听 DOM 变化（大纲内容更新）
let mutationObserver: MutationObserver | null = null

onMounted(() => {
  if (previewElement) {
    mutationObserver = new MutationObserver(() => {
      extractOutline()
    })
    mutationObserver.observe(previewElement, { childList: true, subtree: true })
  }
})

onUnmounted(() => {
  if (mutationObserver) {
    mutationObserver.disconnect()
  }
})

// 暴露方法供外部调用
defineExpose({
  extractOutline,
  updatePreviewRef
})
</script>

<style scoped>
.outline-panel {
  display: flex;
  flex-direction: column;
  width: 240px;
  height: 100%;
  background-color: #f8fafc;
  border-left: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.outline-header {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 36px;
  border-bottom: 1px solid #e2e8f0;
  background-color: #e2e8f0;
  font-weight: 600;
  font-size: 12px;
  color: #374151;
}

.outline-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.outline-item {
  padding: 6px 16px;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.outline-item:hover {
  background-color: #e2e8f0;
}

.outline-level-1 {
  font-weight: 600;
  padding-left: 16px;
}

.outline-level-2 {
  padding-left: 28px;
}

.outline-level-3 {
  padding-left: 40px;
}

.outline-level-4 {
  padding-left: 52px;
  font-size: 11px;
  color: #6b7280;
}

.outline-empty {
  padding: 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
}

/* 深色主题 */
:root.dark .outline-panel {
  background-color: #1e1e1e;
  border-left-color: #333333;
}

:root.dark .outline-header {
  background-color: #252526;
  border-bottom-color: #333333;
  color: #e5e5e5;
}

:root.dark .outline-item {
  color: #9ca3af;
}

:root.dark .outline-item:hover {
  background-color: #2d2d2d;
}

:root.dark .outline-level-4 {
  color: #6b6b6b;
}

:root.dark .outline-empty {
  color: #6b6b6b;
}
</style>