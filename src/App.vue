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
        :file-dir="currentFileDir"
        class="preview-pane"
      />
    </div>
    <ExportProgress />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import Toolbar from './components/Toolbar.vue'
import ExportProgress from './components/ExportProgress.vue'
import { useMarkdown } from './composables/useMarkdown'
import type { Metadata } from './composables/useMarkdown'
import { usePDF } from './composables/usePDF'
import { save, open, message } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
// @ts-ignore
import katexStyles from './assets/katex/katex-inline.css?raw'
// @ts-ignore
import highlightStyles from './assets/github.min.css?raw'

// 默认提示内容
const defaultContent = `# MD2PDF - Markdown 编辑器

欢迎使用 MD2PDF！

## 使用说明

- 在左侧编辑器中编写 Markdown 内容
- 右侧预览区会实时显示渲染结果
- 点击工具栏按钮可以：
  - **打开文件**：从文件系统打开 .md 文件
  - **保存文件**：保存当前内容到 .md 文件
  - **导出 HTML**：导出为 HTML 文件
  - **导出 PDF**：导出为 PDF 文件

## 功能支持

- 数学公式（KaTeX）
- 代码高亮
- Mermaid 图表
- 本地图片

---

请点击工具栏的「打开文件」按钮打开一个 Markdown 文件，或直接在此编写内容。
`

const content = ref(defaultContent)
const currentFileDir = ref<string | null>(null)
const currentMetadata = ref<Metadata>({})
const { render } = useMarkdown()
const { exportToPDF } = usePDF()
const previewRef = ref<InstanceType<typeof Preview>>()

// 计算渲染后的 HTML 和 metadata
const renderedHtml = computed(() => {
  const result = render(content.value)
  currentMetadata.value = result.metadata
  return result.html
})

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
      let previewContent = previewElement?.innerHTML || renderedHtml.value

      // 将 asset 协议 URL 转换为原始绝对路径（用于浏览器显示）
      // 查找所有包含 data-original-src 的 img 标签，用原始路径替换 src
      previewContent = previewContent.replace(
        /<img([^>]*)>/g,
        (match, attrs) => {
          const originalSrcMatch = attrs.match(/data-original-src="([^"]+)"/)
          if (originalSrcMatch) {
            const originalSrc = originalSrcMatch[1]
            // 移除 data-original-src 属性，替换 src
            const newAttrs = attrs
              .replace(/data-original-src="[^"]+"/, '')
              .replace(/src="[^"]+"/, `src="${originalSrc}"`)
            return `<img${newAttrs}>`
          }
          return match
        }
      )

      // 使用 metadata.title 或从 h1 提取标题
      const title = currentMetadata.value.title || extractH1Title(content.value) || 'Exported Document'

      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${katexStyles}
    ${highlightStyles}
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

  await exportToPDF(previewContent, currentMetadata.value)
}

// 从 Markdown 内容提取第一个 h1 标题
function extractH1Title(mdContent: string): string | null {
  const h1Match = mdContent.match(/^#\s+(.+)$/m)
  return h1Match ? h1Match[1].trim() : null
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

      // 从文件路径提取目录（使用字符串操作，不导入 Tauri API）
      const lastSep = Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\'))
      currentFileDir.value = lastSep > 0 ? selected.substring(0, lastSep) : null
      console.log('Opened file:', selected)
      console.log('File directory:', currentFileDir.value)
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
