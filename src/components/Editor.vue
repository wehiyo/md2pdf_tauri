<template>
  <div class="editor-container" ref="containerRef" :style="{ '--editor-font-size': editorFontSize + 'px' }">
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
      <template #defToolbars><NormalToolbar title="新建文件" :onClick="newFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></NormalToolbar><NormalToolbar title="打开文件" :onClick="openFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z"/></svg></NormalToolbar><NormalToolbar title="保存文件" :onClick="saveFile"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></NormalToolbar><NormalToolbar title="另存为" :onClick="saveAs"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/><polyline points="12 2 12 12"/><polyline points="9 5 12 2 15 5"/></svg></NormalToolbar><NormalToolbar title="编辑器字号" :onClick="toggleFontSizeDropdown"><span class="font-size-label">{{ editorFontSize }}px</span></NormalToolbar><NormalToolbar title="切换预览" :onClick="togglePreview"><svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg></NormalToolbar></template>
    </MdEditor>
    <Teleport to="body">
      <div v-if="fontSizeDropdownOpen" class="font-size-dropdown" :style="dropdownStyle" @click.stop>
        <div
          v-for="size in fontSizes"
          :key="size"
          class="font-size-option"
          :class="{ active: editorFontSize === size }"
          @click="selectFontSize(size)"
        >{{ size }}px</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { MdEditor, NormalToolbar, config } from 'md-editor-v3'
import type { ToolbarNames } from 'md-editor-v3'
import { writeFile, mkdir, readDir } from '@tauri-apps/plugin-fs'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.min.css'
import 'md-editor-v3/lib/style.css'

// 将本地 Cropper 实例注入全局配置，替代 CDN 加载
config({
  editorExtensions: {
    cropper: {
      instance: Cropper
    }
  }
})

const props = defineProps<{
  modelValue: string
  fileDir?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'new-file': []
  'open-file': []
  'save-file': []
  'save-as': []
  'toggle-preview': []
}>()

const containerRef = ref<HTMLElement>()
const mdEditorRef = ref<InstanceType<typeof MdEditor>>()

// 编辑器字体大小
const editorFontSize = ref(14)
const fontSizes = [12, 14, 16, 18, 20]
const fontSizeDropdownOpen = ref(false)

function toggleFontSizeDropdown(e: MouseEvent) {
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  dropdownStyle.value = {
    top: (rect.bottom + 4) + 'px',
    left: (rect.left + rect.width / 2) + 'px',
    transform: 'translateX(-50%)'
  }
  fontSizeDropdownOpen.value = !fontSizeDropdownOpen.value
}
const dropdownStyle = ref<Record<string, string>>({})

function selectFontSize(size: number) {
  editorFontSize.value = size
  fontSizeDropdownOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (fontSizeDropdownOpen.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.font-size-dropdown') && !target.closest('.font-size-label')) {
      fontSizeDropdownOpen.value = false
    }
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

// ── Editor search ─────────────────────────────────────

  interface MatchPos {
    line: number  // 0-based line
    ch: number    // 0-based character in line
    length: number
  }

  const editorSearchText = ref('')
  const editorMatches = ref<MatchPos[]>([])
  const editorMatchIndex = ref(-1)

  function highlightSearchResultsInEditor(text: string) {
    clearEditorSearchHighlights()
    editorSearchText.value = text
    editorMatches.value = []
    editorMatchIndex.value = -1
    if (!text) return []

    const content = props.modelValue
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      let col = line.indexOf(text)
      while (col >= 0) {
        editorMatches.value.push({ line: i, ch: col, length: text.length })
        col = line.indexOf(text, col + 1)
      }
    }
    if (editorMatches.value.length > 0) editorMatchIndex.value = 0
    return editorMatches.value
  }

  function selectEditorMatch(index: number) {
    const view = (mdEditorRef.value as any)?.getEditorView?.()
    if (!view) return
    const m = editorMatches.value[index]
    if (!m) return
    // CodeMirror 行号从 1 开始
    const line = view.state.doc.line(m.line + 1)
    const from = line.from + m.ch
    const to = from + m.length
    view.dispatch({ selection: { anchor: from, head: to } })
    // 滚动到该行
    const viewState = (view as any).viewState
    const block = viewState?.lineBlockAt(line.from)
    if (block) {
      view.scrollDOM.scrollTop = block.top - view.scrollDOM.clientHeight / 3
    }
  }

  function clearEditorSearchHighlights() {
    editorSearchText.value = ''
    editorMatches.value = []
    editorMatchIndex.value = -1
    // 清除 CodeMirror 选区
    const view = (mdEditorRef.value as any)?.getEditorView?.()
    if (view) {
      const pos = view.state.selection.main.head
      view.dispatch({ selection: { anchor: pos } })
    }
  }

  function jumpToEditorSearchResult(delta: number) {
    if (editorMatches.value.length === 0) return
    let newIndex = editorMatchIndex.value + delta
    if (newIndex < 0) newIndex = editorMatches.value.length - 1
    else if (newIndex >= editorMatches.value.length) newIndex = 0
    editorMatchIndex.value = newIndex
    selectEditorMatch(newIndex)
  }

  // ── Expose ──────────────────────────────────────────

  defineExpose({
    getScrollContainer: () => {
      return containerRef.value?.querySelector('.cm-scroller') as HTMLElement | null
    },
    scrollToLine: (lineNumber: number) => {
      const editorInstance = mdEditorRef.value as any
      const view = editorInstance?.getEditorView?.()
      if (!view) return
      const targetLine = Math.min(lineNumber + 1, view.state.doc.lines)
      if (targetLine < 1) return
      const lineInfo = view.state.doc.line(targetLine)
      const scroller = view.scrollDOM
      if (!scroller) return
      const viewState = (view as any).viewState
      const estimatedBlock = viewState?.lineBlockAt(lineInfo.from)
      if (estimatedBlock) scroller.scrollTop = estimatedBlock.top - 10
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const accurateBlock = viewState?.lineBlockAt(lineInfo.from)
          if (accurateBlock && Math.abs(accurateBlock.top - (estimatedBlock?.top || 0)) > 5) {
            scroller.scrollTop = accurateBlock.top - 10
          }
        })
      })
    },
    // Search interface (mirrors Preview.vue)
    highlightSearchResults: highlightSearchResultsInEditor,
    clearSearchHighlights: clearEditorSearchHighlights,
    jumpToSearchResult: jumpToEditorSearchResult,
    getSearchIndex: () => editorMatchIndex.value,
    getSearchTotal: () => editorMatches.value.length,
  })

const content = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 编辑器语言（中文）
const language = 'zh-CN'

// 工具栏配置
// 0=新建文件, 1=打开文件, 2=保存文件, 3=另存为, 5=编辑器字号, 4=切换预览
const toolbars: ToolbarNames[] = [
  0,  // 新建文件
  1,  // 打开文件
  2,  // 保存文件
  3,  // 另存为
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
  5,  // 编辑器字号
  4   // 切换预览（最后）
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

// 另存为
function saveAs() {
  emit('save-as')
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
  position: relative;
}

.editor-container :deep(.md-editor-content) {
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
  font-size: var(--editor-font-size, 14px);
  line-height: 1.6;
}
.editor-container :deep(.cm-content) {
  font-size: var(--editor-font-size, 14px) !important;
}
.editor-container :deep(.cm-line) {
  font-size: var(--editor-font-size, 14px);
}

.toolbar-icon {
  width: 16px;
  height: 16px;
}

/* 编辑器字体大小标签 */
.font-size-label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  min-width: 32px;
  text-align: center;
}

/* 字体大小下拉菜单 */
.font-size-dropdown {
  position: fixed;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 9999;
  min-width: 64px;
  padding: 4px 0;
}

.font-size-option {
  padding: 4px 12px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s;
}

.font-size-option:hover {
  background: #f3f4f6;
}

.font-size-option.active {
  color: #3b82f6;
  font-weight: 600;
  background: #eff6ff;
}

/* 确保自定义工具栏按钮与内置按钮样式一致 */
.editor-container :deep(.md-editor-toolbar-item) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>