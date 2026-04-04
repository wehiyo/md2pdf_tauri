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
import { convertFileSrc, invoke } from '@tauri-apps/api/core'

const props = defineProps<{
  html: string
  fileDir?: string | null
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

// 渲染 PlantUML 图表
async function renderPlantuml() {
  if (!previewRef.value) return

  const plantumlElements = previewRef.value.querySelectorAll('.plantuml')

  for (const element of plantumlElements) {
    if (element.getAttribute('data-processed')) continue

    const encoded = element.getAttribute('data-plantuml')
    if (!encoded) continue

    try {
      const content = decodeURIComponent(encoded)
      const svg = await invoke<string>('render_plantuml', { content })
      element.innerHTML = svg
      element.setAttribute('data-processed', 'true')
    } catch (error) {
      console.error('PlantUML render error:', error)
      element.innerHTML = `<pre class="error">PlantUML 渲染失败: ${error}</pre>`
      element.setAttribute('data-processed', 'true')
    }
  }
}

// 修复本地图片路径
function fixImagePaths() {
  console.log('fixImagePaths called, fileDir:', props.fileDir)
  if (!previewRef.value) {
    console.log('previewRef is null')
    return
  }
  if (!props.fileDir) {
    console.log('fileDir is null, skipping image fix')
    return
  }

  const images = previewRef.value.querySelectorAll('img')
  console.log('Found images:', images.length)

  for (const img of images) {
    const src = img.getAttribute('src')
    console.log('Image src:', src)
    if (src && !src.match(/^https?:\/\//) && !src.startsWith('data:') && !src.startsWith('asset:') && !src.includes('asset.localhost')) {
      // 相对路径，转换为绝对路径
      const absolutePath = props.fileDir + '/' + src
      const normalizedPath = absolutePath.replace(/\\/g, '/')

      // 使用 convertFileSrc 转换为 asset 协议 URL
      const assetUrl = convertFileSrc(normalizedPath)
      console.log('Converting image path (preview):', src, '->', assetUrl)
      // 保存原始路径用于导出
      img.setAttribute('data-original-src', normalizedPath)
      img.setAttribute('src', assetUrl)
    }
  }
}

// 监听 HTML 变化，渲染图表和修复图片路径
watch(() => props.html, async () => {
  await nextTick()
  await renderMermaid()
  await renderPlantuml()
  fixImagePaths()
}, { immediate: true })

onUpdated(async () => {
  await renderMermaid()
  await renderPlantuml()
  fixImagePaths()
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
