<template>
  <div class="app-container">
    <Toolbar
      @export-html="exportHTML"
      @export-pdf="exportPDF"
      @open-file="openFile"
      @save-file="saveFile"
    />
    <div class="main-content">
      <Editor
        v-model="content"
        class="editor-pane"
      />
      <Preview
        ref="previewRef"
        :html="renderedHtml"
        class="preview-pane"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import Toolbar from './components/Toolbar.vue'
import { useMarkdown } from './composables/useMarkdown'
import { usePDF } from './composables/usePDF'
import { save, open, message } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import exampleContent from './assets/example.md?raw'

// 使用 example.md 作为默认内容
const content = ref(exampleContent)
const { render } = useMarkdown()
const { exportToPDF } = usePDF()
const previewRef = ref<InstanceType<typeof Preview>>()

// 计算渲染后的 HTML
const renderedHtml = computed(() => render(content.value))

// 导出 HTML
async function exportHTML() {
  try {
    const filePath = await save({
      filters: [{
        name: 'HTML',
        extensions: ['html']
      }]
    })

    if (filePath) {
      // 从预览区域获取已渲染的 HTML（包含 Mermaid SVG）
      const previewElement = document.querySelector('.preview-content')
      const previewContent = previewElement?.innerHTML || renderedHtml.value

      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Document</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css">
  <style>
    ${document.querySelector('style[data-vite-dev-id*="markdown"]')?.textContent || ''}
    body {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div class="markdown-body">
    ${previewContent}
  </div>
</body>
</html>`
      await writeTextFile(filePath, fullHtml)
      await message('HTML 导出成功！', { title: '成功', kind: 'info' })
    }
  } catch (error) {
    console.error('导出 HTML 失败:', error)
    await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
  }
}

// 导出 PDF
async function exportPDF() {
  // 从预览区域获取已渲染的 HTML（包含 Mermaid SVG）
  const previewElement = document.querySelector('.preview-content')
  const previewContent = previewElement?.innerHTML || renderedHtml.value
  await exportToPDF(previewContent)
}

// 打开文件
async function openFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Markdown',
        extensions: ['md', 'markdown', 'txt']
      }]
    })

    if (selected && typeof selected === 'string') {
      const text = await readTextFile(selected)
      content.value = text
    }
  } catch (error) {
    console.error('打开文件失败:', error)
    await message('打开文件失败：' + String(error), { title: '错误', kind: 'error' })
  }
}

// 保存文件
async function saveFile() {
  try {
    const filePath = await save({
      filters: [{
        name: 'Markdown',
        extensions: ['md']
      }]
    })

    if (filePath) {
      await writeTextFile(filePath, content.value)
      await message('文件保存成功！', { title: '成功', kind: 'info' })
    }
  } catch (error) {
    console.error('保存文件失败:', error)
    await message('保存失败：' + String(error), { title: '错误', kind: 'error' })
  }
}

// 初始化
onMounted(() => {
  // 应用已加载
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f8fafc;
}

.dark .app-container {
  background-color: #0f172a;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-pane,
.preview-pane {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.editor-pane {
  border-right: 1px solid #e2e8f0;
}

.dark .editor-pane {
  border-right-color: #334155;
}
</style>
