<template>
  <div class="editor-container" ref="containerRef">
    <MdEditor
      ref="mdEditorRef"
      v-model="content"
      :preview="false"
      :htmlPreview="false"
      :language="language"
      :toolbars="toolbars"
      :scrollAuto="false"
      class="md-editor"
      @onSave="saveFile"
      :onUploadImg="handleUploadImg"
    >
      <template #defToolbars><NormalToolbar title="新建文件" :onClick="newFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></NormalToolbar><NormalToolbar title="打开文件" :onClick="openFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z"/></svg></NormalToolbar><NormalToolbar title="保存文件" :onClick="saveFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></NormalToolbar><NormalToolbar title="切换预览" :onClick="togglePreview"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg></NormalToolbar></template>
    </MdEditor>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { MdEditor, NormalToolbar } from 'md-editor-v3'
import type { ToolbarNames } from 'md-editor-v3'
import { writeFile, mkdir, readDir } from '@tauri-apps/plugin-fs'
import 'md-editor-v3/lib/style.css'

const props = defineProps<{
  modelValue: string
  fileDir?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'new-file': []
  'open-file': []
  'save-file': []
  'toggle-preview': []
}>()

const containerRef = ref<HTMLElement>()
const mdEditorRef = ref<InstanceType<typeof MdEditor>>()

// 暴露滚动容器和滚动方法
defineExpose({
  getScrollContainer: () => {
    // CodeMirror 滚动容器
    return containerRef.value?.querySelector('.cm-scroller') as HTMLElement | null
  },
  /**
   * 滚动到指定行号（不使用 dispatch，避免触发工具栏消失）
   * @param lineNumber 行号（从 0 开始）
   */
  scrollToLine: (lineNumber: number) => {
    const editorInstance = mdEditorRef.value as any
    const view = editorInstance?.getEditorView?.()
    if (!view) return

    // 确保行号在有效范围内（CodeMirror 行号从 1 开始）
    const targetLine = Math.min(lineNumber + 1, view.state.doc.lines)
    if (targetLine < 1) return

    // 获取行信息
    const lineInfo = view.state.doc.line(targetLine)

    // 获取滚动容器
    const scroller = view.scrollDOM
    if (!scroller) return

    // 获取 viewState 用于测量位置
    const viewState = (view as any).viewState

    // 第一次：估算位置并滚动，触发 CodeMirror 渲染目标区域
    const estimatedBlock = viewState?.lineBlockAt(lineInfo.from)
    if (estimatedBlock) {
      scroller.scrollTop = estimatedBlock.top - 10
    }

    // 第二次：等待渲染完成后，获取准确位置并修正滚动
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 双重 raf 确保 CodeMirror 完成渲染和测量
        const accurateBlock = viewState?.lineBlockAt(lineInfo.from)
        if (accurateBlock) {
          // 只有位置有明显偏差时才修正
          if (Math.abs(accurateBlock.top - (estimatedBlock?.top || 0)) > 5) {
            scroller.scrollTop = accurateBlock.top - 10
          }
        }
      })
    })
  }
})

const content = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 编辑器语言（中文）
const language = 'zh-CN'

// 工具栏配置
// 0=新建文件, 1=打开文件, 2=保存文件, 3=切换预览
const toolbars: ToolbarNames[] = [
  0,  // 新建文件
  1,  // 打开文件
  2,  // 保存文件
  '-',
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
  3  // 切换预览（最后）
]

// 图片上传处理：保存到 md 文件同目录的 md_pics/ 子目录，重名自动加数字后缀
async function handleUploadImg(files: File[], callback: (urls: string[]) => void) {
  if (!props.fileDir) return

  const urls: string[] = []
  const picsDir = props.fileDir.replace(/\\/g, '/') + '/md_pics'

  try { await mkdir(picsDir, { recursive: true }) } catch { /* ignore */ }

  let existingFiles: string[] = []
  try {
    const entries = await readDir(picsDir)
    existingFiles = entries.map(e => e.name)
  } catch { /* dir doesn't exist yet */ }

  for (const file of files) {
    const originalName = file.name
    const dotIndex = originalName.lastIndexOf('.')
    const baseName = dotIndex > 0 ? originalName.substring(0, dotIndex) : originalName
    const ext = dotIndex > 0 ? originalName.substring(dotIndex) : ''

    let destName = originalName
    let counter = 1
    while (existingFiles.includes(destName)) {
      destName = `${baseName}_${counter}${ext}`
      counter++
    }

    const buffer = await file.arrayBuffer()
    await writeFile(picsDir + '/' + destName, new Uint8Array(buffer))
    existingFiles.push(destName)
    urls.push(`md_pics/${destName}`)
  }

  callback(urls)
}

// 新建文件
function newFile() {
  emit('new-file')
}

// 打开文件
function openFile() {
  emit('open-file')
}

// 保存文件
function saveFile() {
  emit('save-file')
}

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
  overflow: hidden;
}

.editor-container :deep(.md-editor) {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 0;
}

.editor-container :deep(.md-editor-content) {
  height: 100%;
  flex: 1;
  display: flex;
}

.editor-container :deep(.md-editor-input-wrapper) {
  height: 100%;
  flex: 1;
}

.editor-container :deep(.cm-editor) {
  height: 100%;
}

.editor-container :deep(.cm-scroller) {
  overflow: auto;
}

/* CodeMirror 滚动区域底部 padding，确保最后几行可见 */
.editor-container :deep(.cm-content) {
  padding-bottom: 80px;
}

.editor-container :deep(textarea.md-editor-input) {
  font-family: 'SourceCodePro', Consolas, 'Courier New', Monaco, monospace;
  font-size: 14px;
  line-height: 1.6;
}

.toolbar-icon {
  width: 16px;
  height: 16px;
}

/* 确保自定义工具栏按钮与内置按钮样式一致 */
.editor-container :deep(.md-editor-toolbar-item) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>