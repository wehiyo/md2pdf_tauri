<template>
  <div class="outline-panel-content">
    <div class="outline-header"><span>大纲</span></div>
    <div class="outline-body">
      <div v-for="item in headings" :key="item.id" class="outline-item" :class="'outline-level-' + item.level"
        :title="item.rawText" @click="$emit('scroll-to-heading', item.id)">{{ item.displayText }}</div>
      <div v-if="headings.length === 0" class="empty-message">暂无标题</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{ previewElement?: HTMLElement | null }>()
defineEmits<{ 'scroll-to-heading': [id: string] }>()

const headings = ref<{ id: string; displayText: string; rawText: string; level: number }[]>([])
let observer: MutationObserver | null = null

function extract() {
  const el = props.previewElement
  if (!el) { headings.value = []; return }
  const hs = el.querySelectorAll('h1, h2, h3, h4')
  headings.value = Array.from(hs).map(h => {
    const id = h.id; const raw = h.textContent || ''
    const m = raw.match(/^(\d+\.(\d+\.)*\s+)/)
    return { id, rawText: raw, displayText: m ? raw.substring(m[0].length) : raw, level: parseInt(h.tagName[1]) }
  })
}

watch(() => props.previewElement, (el) => {
  observer?.disconnect()
  extract()
  if (el) {
    observer = new MutationObserver(extract)
    observer.observe(el, { childList: true, subtree: true })
  }
}, { immediate: true })

onUnmounted(() => observer?.disconnect())
</script>

<style scoped>
.outline-panel-content { display: flex; flex-direction: column; height: 100%; }
.outline-header { display: flex; align-items: center; padding: 0 16px; height: 36px; border-bottom: 1px solid #e2e8f0; background-color: #e2e8f0; font-weight: 600; font-size: 12px; color: #374151; }
.outline-body { flex: 1; overflow-y: auto; padding: 8px 0; }
.outline-item { padding: 6px 16px; font-size: 12px; color: #4b5563; cursor: pointer; transition: background-color .2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.outline-item:hover { background-color: #e2e8f0; }
.outline-level-1 { font-weight: 600; padding-left: 16px; }
.outline-level-2 { padding-left: 28px; }
.outline-level-3 { padding-left: 40px; }
.outline-level-4 { padding-left: 52px; font-size: 11px; color: #6b7280; }
.empty-message { padding: 16px 12px; text-align: center; color: #9ca3af; font-size: 12px; }
</style>
