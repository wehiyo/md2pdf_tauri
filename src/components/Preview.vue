<template>
  <div class="preview-container">
    <div
      ref="previewRef"
      class="preview-content markdown-body"
      v-html="html"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUpdated, watch, nextTick } from 'vue'
import mermaid from 'mermaid'

const props = defineProps<{
  html: string
}>()

const previewRef = ref<HTMLDivElement>()

// 初始化 Mermaid
onMounted(() => {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'inherit'
  })
})

// 渲染 Mermaid 图表
async function renderMermaid() {
  if (!previewRef.value) return

  const mermaidElements = previewRef.value.querySelectorAll('.mermaid')

  for (const element of mermaidElements) {
    if (element.getAttribute('data-processed')) continue

    try {
      const graphDefinition = element.textContent || ''
      const { svg } = await mermaid.render(
        `mermaid-${Math.random().toString(36).substr(2, 9)}`,
        graphDefinition
      )
      element.innerHTML = svg
      element.setAttribute('data-processed', 'true')
    } catch (error) {
      console.error('Mermaid render error:', error)
    }
  }
}

// 监听 HTML 变化，渲染图表
watch(() => props.html, async () => {
  await nextTick()
  await renderMermaid()
}, { immediate: true })

onUpdated(() => {
  renderMermaid()
})
</script>

<style scoped>
.preview-container {
  height: 100%;
  overflow: auto;
  background-color: #ffffff;
}

.preview-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
  min-height: 100%;
}
</style>
