<template>
  <div class="app-container">
    <Toolbar
      @export-html="exportHTML"
      @export-pdf="exportPDF"
      @toggle-theme="toggleTheme"
      @open-file="openFile"
      @save-file="saveFile"
    />
    <div class="main-content">
      <Editor
        v-model="content"
        class="editor-pane"
      />
      <Preview
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
import { useTheme } from './composables/useTheme'
import { save, open, message } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'

// 默认内容
const defaultContent = `# MD2PDF - Markdown 编辑器

欢迎使用 **MD2PDF**，这是一个专业的 Markdown 编辑器，支持导出 HTML 和 PDF。

## 特性

- 实时预览
- 支持数学公式：$E = mc^2$
- 支持代码高亮
- 支持 Mermaid 图表
- 支持表格、脚注等科学文档特性

## 数学公式

行内公式：$\\alpha + \\beta = \\gamma$

块级公式：

$$
\\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## 代码示例

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

## 表格示例

| 名称 | 类型 | 描述 |
|------|------|------|
| name | string | 用户名 |
| age | number | 年龄 |
| email | string | 邮箱 |

## Mermaid 图表

\`\`\`mermaid
graph LR
    A[开始] --> B{判断}
    B -->|是| C[处理1]
    B -->|否| D[处理2]
    C --> E[结束]
    D --> E
\`\`\`

## 任务列表

- [x] 创建项目
- [ ] 实现功能
- [ ] 测试发布

## 脚注

这是一个带有脚注的文本[^1]。

[^1]: 这是脚注的内容。

---

**开始编辑吧！**
`

const content = ref(defaultContent)
const { render } = useMarkdown()
const { exportToPDF } = usePDF()
const { isDark, toggle: toggleTheme } = useTheme()

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
      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Document</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
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
    ${renderedHtml.value}
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
  await exportToPDF(renderedHtml.value)
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
  // 应用主题
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  }
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
