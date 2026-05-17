<template>
  <div class="app-container" @contextmenu.prevent>
    <div class="main-content" :style="mainContentStyle">
      <LeftSidebar
        v-if="!showWelcome"
        ref="sidebarRef"
        :work-state="fileMgmt.workState.value"
        :folder-path="fileMgmt.importedFolderPath.value || ''"
        :site-name="fileMgmt.mkdocsConfig.value.siteName"
        :files="fileMgmt.mdFiles.value"
        :current-file="fileMgmt.currentFilePath.value"
        :has-multiple-files="fileMgmt.mdFiles.value.length > 0 || fileMgmt.openedFiles.value.length > 1"
        :global-search-results="search.globalSearchResults.value"
        :opened-files="fileMgmt.openedFiles.value"
        :current-file-index="fileMgmt.currentFileIndex.value"
        :left-icons="leftIcons"
        :right-icons="rightIcons"
        :active-tab="leftActiveTab"
        :preview-element="previewElement"
        @select-file="openFileFromTree"
        @rename-file="(old: string, name: string) => fileMgmt.renameFile(old, name)"
        @delete-file="(path: string) => fileMgmt.deleteFile(path)"
        @save-as="(path: string) => fileMgmt.saveFileAsFromPath(path)"
        @save-as-opened="(path: string) => fileMgmt.saveAsOpenedFile(path)"
        @scroll-to-heading="handleOutlineScroll"
        @search="(t: string, m: string, mm: string) => search.handleSearch(t, m as any, mm as any)"
        @search-jump="search.handleSearchJump"
        @search-clear="search.handleSearchClear"
        @select-search-result="search.handleSearchResultSelect"
        @switch-file="handleSwitchFile"
        @close-file="handleCloseFile"
        @close-folder="fileMgmt.closeProject"
        @add-bookmark="handleAddBookmark"
        @jump-bookmark="handleJumpBookmark"
        @delete-annotation="handleDeleteAnnotation"
        @jump-annotation="handleJumpAnnotation"
        @update:active-tab="(t: string) => leftActiveTab = t as IconId"
        @move-icon="(id: string, to: 'left'|'right') => moveIcon(id, to)" @reorder-icons="(s: 'left'|'right', f: number, t: number) => reorderIcons(s, f, t)"
      />
      <div
        v-if="!showWelcome"
        class="splitter sidebar-splitter"
        @mousedown="sidebarSplitter.startResize"
      />
      <WelcomePage
        v-if="showWelcome"
        @new-file="newFile"
        @open-file="openFile"
        @import-folder="importFolder"
        @import-mkdocs="importMkdocs"
        @open-recent-file="openRecentFile"
        @open-recent-folder="openRecentFolder"
        @open-recent-mkdocs="openRecentMkdocs"
      />
      <Editor
        v-if="!showWelcome"
        ref="editorRef"
        v-show="!previewOnlyMode"
        v-model="fileMgmt.content.value"
        :file-dir="fileMgmt.currentFileDir.value"
        class="editor-pane"
        :style="editorPaneStyle"
        @new-file="newFile"
        @open-file="openFile"
        @save-file="fileMgmt.saveFile"
        @save-as="fileMgmt.saveFileAs"
        @toggle-preview="togglePreview"
      />
      <div
        v-if="!showWelcome"
        v-show="showPreview && !previewOnlyMode"
        class="splitter"
        @mousedown="editorSplitter.startResize"
      />
      <Preview
        v-if="!showWelcome"
        v-show="showPreview || previewOnlyMode"
        ref="previewRef"
        :html="renderedHtml"
        :file-dir="fileMgmt.currentFileDir.value"
        :current-file-path="fileMgmt.currentFilePath.value"
        :preview-only-mode="previewOnlyMode"
        :can-navigate-back="nav.canNavigateBack.value"
        :can-navigate-forward="nav.canNavigateForward.value"
        :show-bookmark-btn="fileMgmt.workState.value !== 'file'"
        :show-annotation-btn="fileMgmt.workState.value === 'mkdocs'"
        :annotations-visible="annotationsVisible"
        :project-path="fileMgmt.workState.value === 'mkdocs' ? fileMgmt.importedFolderPath.value : null"
        :md-files="fileMgmt.mdFiles.value"
        class="preview-pane"
        :style="previewPaneStyle"
        @preview-only="togglePreviewOnly"
        @close-preview="showPreview = false"
        @add-bookmark="handleAddBookmark"
        @add-annotation="handleAddAnnotation"
        @delete-annotation="handleDeleteAnnotation"
        @import-folder="importFolder"
        @import-mkdocs="importMkdocs"
        @export-html="exportHTML"
        @export-pdf="exportPDF"
        @navigate-to-file="nav.navigateToFile"
        @navigate-to-anchor="nav.navigateToAnchor"
        @navigate-back="nav.navigateBack"
        @navigate-forward="nav.navigateForward"
        @toggle-annotations="annotationsVisible = !annotationsVisible"
        @font-config-change="handleFontConfigChange"
      />
      <div v-if="!showWelcome" class="splitter outline-splitter" />
      <OutlinePanel
        v-if="!showWelcome"
        ref="outlineRef"
        :preview-ref="previewElement"
        :left-icons="leftIcons"
        :right-icons="rightIcons"
        :active-tab="rightActiveTab"
        :work-state="fileMgmt.workState.value"
        :folder-path="fileMgmt.importedFolderPath.value || ''"
        :site-name="fileMgmt.mkdocsConfig.value.siteName"
        :files="fileMgmt.mdFiles.value"
        :current-file="fileMgmt.currentFilePath.value"
        :has-multiple-files="fileMgmt.mdFiles.value.length > 0 || fileMgmt.openedFiles.value.length > 1"
        :global-search-results="search.globalSearchResults.value"
        :opened-files="fileMgmt.openedFiles.value"
        :current-file-index="fileMgmt.currentFileIndex.value"
        @scroll-to-heading="handleOutlineScroll"
        @switch-file="handleSwitchFile"
        @close-file="handleCloseFile"
        @close-folder="fileMgmt.closeProject"
        @search="(t: string, m: string, mm: string) => search.handleSearch(t, m as any, mm as any)"
        @search-jump="search.handleSearchJump"
        @search-clear="search.handleSearchClear"
        @select-search-result="search.handleSearchResultSelect"
        @select-file="openFileFromTree"
        @update:active-tab="(t: string) => rightActiveTab = t as IconId"
        @move-icon="(id: string, to: 'left'|'right') => moveIcon(id, to)" @reorder-icons="(s: 'left'|'right', f: number, t: number) => reorderIcons(s, f, t)"
      />
    </div>
    <ExportProgress />
    <MkdocsPreviewDialog
      :visible="showMkdocsPreview"
      :bookmark-tree="mkdocsBookmarkTree"
      :combined-html="mkdocsCombinedHtml"
      @confirm="confirmMkdocsExport"
      @cancel="cancelMkdocsExport"
    />

    <!-- 保存确认对话框 -->
    <Teleport to="body">
      <div v-if="saveConfirm.showSaveConfirmDialog.value" class="save-confirm-overlay">
        <div class="save-confirm-dialog">
          <div class="save-confirm-title">保存确认</div>
          <div class="save-confirm-message">当前文件有未保存的改动，是否保存？</div>
          <div class="save-confirm-buttons">
            <button class="save-btn" @click="saveConfirm.handleSaveConfirmYes">保存</button>
            <button class="discard-btn" @click="saveConfirm.handleSaveConfirmNo">不保存</button>
            <button class="cancel-btn" @click="saveConfirm.handleSaveConfirmCancel">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch, provide } from 'vue'
import Editor from './components/Editor.vue'
import Preview from './components/Preview.vue'
import WelcomePage from './components/WelcomePage.vue'
import LeftSidebar from './components/LeftSidebar.vue'
import OutlinePanel from './components/OutlinePanel.vue'
import ExportProgress from './components/ExportProgress.vue'
import MkdocsPreviewDialog from './components/MkdocsPreviewDialog.vue'
import { useMarkdown, setShowHeadingNumbers } from './composables/useMarkdown'
import type { Metadata } from './composables/useMarkdown'
import { usePDF, getHtmlMarkdownStyles } from './composables/usePDF'
import { useScrollSync } from './composables/useScrollSync'
import { useErrorHandling } from './composables/useErrorHandling'
import { loadConfig, loadProjectConfig, saveProjectConfig, type FontConfig } from './composables/useConfig'
import { useTheme } from './composables/useTheme'
import { loadFonts } from './composables/useFonts'
import {
  prepareMkdocsExport,
  collectNavChapters,
  loadAllMdFiles,
  resetChapterCounters,
  type BookmarkTreeNode
} from './composables/useMkdocsExport'
import { exportStaticSite } from './composables/useStaticSiteExport'
import { useFileManagement, extractH1Title, findMkdocsYmlPath } from './composables/useFileManagement'
import { useSaveConfirm } from './composables/useSaveConfirm'
import { useNavigationHistory } from './composables/useNavigationHistory'
import { useSearch } from './composables/useSearch'
import { useSplitter, createSplitterPaneStyles } from './composables/useSplitter'
import { save, open, message } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { parse as parseYaml } from 'yaml'
import katexStyles from './assets/katex/katex-inline.css?raw'
import highlightStyles from './assets/github.min.css?raw'

// ── Composables ────────────────────────────────────────

const { render, getHeadingLine } = useMarkdown()
const { exportToPDF } = usePDF()
const { handleError } = useErrorHandling()
const { applyTheme } = useTheme()
const bookmarksRefresh = ref(0)
provide('bookmarksRefresh', bookmarksRefresh)
const annotationsRefresh = ref(0)
provide('annotationsRefresh', annotationsRefresh)
const annotationsVisible = ref(true)

const fileMgmt = useFileManagement()

const saveConfirm = useSaveConfirm(
  fileMgmt.openedFiles,
  fileMgmt.currentFileIndex,
  fileMgmt.hasUnsavedChanges,
  fileMgmt.savedContent,
  fileMgmt.content,
  fileMgmt.switchToFile,
  fileMgmt.saveFile,
)

const editorRef = ref<InstanceType<typeof Editor>>()
const previewRef = ref<InstanceType<typeof Preview>>()

// 侧边栏图标拖拽：管理图标归属
type IconId = 'files' | 'search' | 'outline' | 'bookmarks' | 'annotations'
const leftIcons = ref<IconId[]>(['files', 'search', 'bookmarks', 'annotations'])
const rightIcons = ref<IconId[]>(['outline'])
const leftActiveTab = ref<IconId>('files')
const rightActiveTab = ref<IconId>('outline')

function moveIcon(id: string, toSide: 'left' | 'right') {
  if (!['files', 'search', 'outline', 'bookmarks', 'annotations'].includes(id)) return
  const fromList = toSide === 'left' ? rightIcons : leftIcons
  const toList = toSide === 'left' ? leftIcons : rightIcons
  // 确保图标不在目标侧（防止重复）
  const toIdx = toList.value.indexOf(id as IconId)
  if (toIdx >= 0) return
  const fromIdx = fromList.value.indexOf(id as IconId)
  if (fromIdx >= 0) {
    fromList.value.splice(fromIdx, 1)
    toList.value.push(id as IconId)
  }
}

async function handleAddBookmark() {
  const fp = fileMgmt.currentFilePath.value
  if (!fp || fileMgmt.workState.value !== 'mkdocs') return
  const projectPath = fileMgmt.importedFolderPath.value
  if (!projectPath) return

  let anchorId = ''
  let headingText = ''
  let scrollRatio = 0
  const container = previewRef.value?.getScrollContainer?.()
  if (container) {
    const headings = container.querySelectorAll('h1[id],h2[id],h3[id],h4[id]')
    for (const h of headings) {
      const rect = (h as HTMLElement).getBoundingClientRect()
      if (rect.top >= 0 && rect.top < container.clientHeight * 0.6) {
        anchorId = h.id
        headingText = h.textContent || ''
        break
      }
    }
    const maxScroll = container.scrollHeight - container.clientHeight
    scrollRatio = maxScroll > 0 ? container.scrollTop / maxScroll : 0
  }

  // 从 .markrefine.json 读取已有书签
  let config: any = {}
  try {
    const configPath = projectPath.replace(/\\/g, '/') + '/.markrefine.json'
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const raw = await readTextFile(configPath)
    config = JSON.parse(raw)
  } catch { /* file doesn't exist yet */ }

  const bookmarks = config.bookmarks || []
  if (bookmarks.some((b: any) => b.filePath === fp && b.anchorId === anchorId && Math.abs((b.scrollRatio ?? 0) - (scrollRatio ?? 0)) < 0.01)) return
  bookmarks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: headingText || fp.replace(/\\/g, '/').split('/').pop()?.replace('.md', '') || '书签',
    filePath: fp,
    anchorId,
    headingText,
    scrollRatio,
    timestamp: Date.now(),
  })
  config.bookmarks = bookmarks
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const configPath = projectPath.replace(/\\/g, '/') + '/.markrefine.json'
    await writeTextFile(configPath, JSON.stringify(config, null, 2))
  } catch { /* ignore */ }
  bookmarksRefresh.value++
}

function handleJumpBookmark(item: { filePath: string; anchorId: string; scrollRatio?: number }) {
  const sameFile = fileMgmt.currentFilePath.value === item.filePath
  if (!sameFile) {
    if (fileMgmt.workState.value === 'mkdocs' || fileMgmt.workState.value === 'folder') {
      fileMgmt.openFileFromTreeNoHistory(item.filePath)
    } else {
      fileMgmt.openFileFromPath(item.filePath)
    }
  }
  // 滚动到书签位置，并同步编辑器
  const doScroll = () => {
    const previewScroller = previewRef.value?.getScrollContainer?.()
    const editorScroller = editorRef.value?.getScrollContainer?.()

    if (item.scrollRatio != null) {
      if (previewScroller) {
        const max = previewScroller.scrollHeight - previewScroller.clientHeight
        if (max > 0) previewScroller.scrollTop = item.scrollRatio * max
      }
      if (editorScroller) {
        const emax = editorScroller.scrollHeight - editorScroller.clientHeight
        const targetTop = emax > 0 ? item.scrollRatio * emax : 0
        // 使用双重 rAF + target 避免内容变化后 scrollTop 被重置
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            editorScroller.scrollTop = targetTop
          })
        })
      }
      return
    }
    const el = document.getElementById(item.anchorId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (sameFile) {
    doScroll()
  } else {
    setTimeout(doScroll, 300)
  }
}

interface Annotation {
  id: string
  type: 'highlight' | 'underline' | 'wavy' | 'comment'
  filePath: string
  selectedText: string
  contextBefore: string
  contextAfter: string
  headingId: string
  comment?: string
  timestamp: number
}

async function getAnnotationsConfig(): Promise<{ config: any; configPath: string }> {
  const projectPath = fileMgmt.importedFolderPath.value
  if (!projectPath) return { config: {}, configPath: '' }
  const configPath = projectPath.replace(/\\/g, '/') + '/.markrefine.json'
  let config: any = {}
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const raw = await readTextFile(configPath)
    config = JSON.parse(raw)
  } catch { /* file doesn't exist yet */ }
  return { config, configPath }
}

async function handleAddAnnotation(anno: Omit<Annotation, 'id' | 'timestamp'>) {
  console.log('[anno] handleAddAnnotation called: type=%s filePath=%s text="%s"', anno.type, anno.filePath, anno.selectedText)
  const { config, configPath } = await getAnnotationsConfig()
  if (!configPath) { console.log('[anno] no configPath, aborting'); return }

  const annotations: Annotation[] = config.annotations || []
  // 去重：同文件+同文本+同类型不重复添加
  if (annotations.some(a => a.filePath === anno.filePath && a.selectedText === anno.selectedText && a.type === anno.type)) {
    console.log('[anno] duplicate, skipping')
    return
  }

  annotations.push({
    ...anno,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
  })
  config.annotations = annotations
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(configPath, JSON.stringify(config, null, 2))
    console.log('[anno] saved to %s, total: %d', configPath, annotations.length)
  } catch { /* ignore */ }
  annotationsRefresh.value++
}

async function handleDeleteAnnotation(id: string) {
  const { config, configPath } = await getAnnotationsConfig()
  if (!configPath) return

  const annotations: Annotation[] = config.annotations || []
  config.annotations = annotations.filter(a => a.id !== id)
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(configPath, JSON.stringify(config, null, 2))
  } catch { /* ignore */ }
  annotationsRefresh.value++
}

function handleJumpAnnotation(annotation: Annotation) {
  const sameFile = fileMgmt.currentFilePath.value === annotation.filePath
  if (!sameFile) {
    if (fileMgmt.workState.value === 'mkdocs' || fileMgmt.workState.value === 'folder') {
      fileMgmt.openFileFromTreeNoHistory(annotation.filePath)
    }
  }
  const doScroll = () => {
    // 使用 headingId 约束搜索范围，然后滚动到匹配的标记元素
    const previewEl = previewRef.value?.getPreviewRef?.()
    if (!previewEl) return
    const markers = previewEl.querySelectorAll('.anno-highlight, .anno-underline, .anno-wavy, .anno-comment')
    for (const m of markers) {
      if (m.getAttribute('data-anno-id') === annotation.id) {
        m.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 高亮选中状态
        markers.forEach(x => x.classList.remove('anno-selected'))
        m.classList.add('anno-selected')
        return
      }
    }
  }
  if (sameFile) {
    doScroll()
  } else {
    setTimeout(doScroll, 400)
  }
}

function reorderIcons(side: 'left' | 'right', fromIdx: number, toIdx: number) {
  const list = side === 'left' ? leftIcons : rightIcons
  if (fromIdx < 0 || fromIdx >= list.value.length || toIdx < 0 || toIdx >= list.value.length) return
  const item = list.value.splice(fromIdx, 1)[0]
  list.value.splice(toIdx, 0, item)
}
const sidebarRef = ref<InstanceType<typeof LeftSidebar>>()
const outlineRef = ref<InstanceType<typeof OutlinePanel>>()
const previewElement = ref<HTMLElement | null>(null)

const nav = useNavigationHistory(
  fileMgmt.currentFilePath,
  fileMgmt.openFileFromTree,
  fileMgmt.openFileFromTreeNoHistory,
  getHeadingLine,
  editorRef,
  previewRef,
)

const search = useSearch(
  fileMgmt.mdFiles,
  fileMgmt.currentFilePath,
  fileMgmt.openFileFromTree,
  previewRef,
  editorRef,
  sidebarRef as any,
  nav.pushNavigationState,
)

// ── UI state ────────────────────────────────────────────

const showPreview = ref(true)
const previewOnlyMode = ref(false)

// 搜索目标跟随预览可见性切换
watch([showPreview, previewOnlyMode], ([sp, po]) => {
  search.setSearchTarget(po || sp ? 'preview' : 'editor')
}, { immediate: true })

// 欢迎页面：仅在单文件模式且无打开文件时显示
const showWelcome = computed(() =>
  fileMgmt.workState.value === 'file' && fileMgmt.openedFiles.value.length === 0
)

// 从最近记录打开
async function openRecentFile(path: string) {
  await fileMgmt.openFileFromPath(path, nav.pushNavigationState)
}

async function openRecentFolder(path: string) {
  await fileMgmt.importFolderByPath(path, saveConfirm.checkAllUnsavedFiles, nav.resetNavigation, openFileFromTree)
  await applyProjectConfig()
}

async function openRecentMkdocs(path: string) {
  await fileMgmt.importMkdocsByPath(path, saveConfirm.checkAllUnsavedFiles, nav.resetNavigation, openFileFromTree)
  await applyProjectConfig()
}
const editorWidth = ref(50)
const editorSplitter = useSplitter({ value: editorWidth, min: 20, max: 80 })
const { primaryStyle: editorPaneStyle, secondaryStyle: previewPaneStyle } =
  createSplitterPaneStyles(editorWidth, previewOnlyMode, showPreview)

const sidebarWidth = ref(240)
const sidebarSplitter = useSplitter({
  value: sidebarWidth,
  min: 180,
  max: 350,
  calcValue: (startVal, deltaX) => startVal + deltaX / (zoomLevel.value / 100),
})

const zoomLevel = ref(100)

const mainContentStyle = computed(() => {
  if (zoomLevel.value !== 100) return { zoom: zoomLevel.value / 100 }
  return {}
})

const fontConfig = ref<FontConfig>({
  chineseFont: 'DengXian', englishFont: 'Arial', codeFont: 'SourceCodePro',
  bodyFontSize: 16, chineseCustomFonts: [], englishCustomFonts: [], codeCustomFonts: [],
  lineHeight: 1.6, paragraphSpacing: 1, previewWidth: 900,
  previewBackgroundColor: '#ffffff', previewTheme: 'default', pageSize: 'A4',
  marginTop: 20, marginBottom: 20, marginLeft: 25, marginRight: 25,
  showHeadingNumbers: true
})

// ── MkDocs preview ─────────────────────────────────────

const showMkdocsPreview = ref(false)
const mkdocsBookmarkTree = ref<BookmarkTreeNode[]>([])
const mkdocsCombinedHtml = ref('')

// ── Rendered HTML ──────────────────────────────────────

const currentMetadata = fileMgmt.currentMetadata
const renderedHtml = computed(() => {
  setShowHeadingNumbers(fontConfig.value.showHeadingNumbers !== false)
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  fontConfig.value.previewTheme // 主题变化时触发重新渲染
  const result = render(fileMgmt.content.value)
  currentMetadata.value = result.metadata
  return result.html
})

// ── Wiring: events raised by child components ──────────

async function openFile() {
  await fileMgmt.openFile(nav.pushNavigationState)
}

function newFile() {
  fileMgmt.newFile(nav.resetNavigation)
}

async function openFileFromTree(path: string) {
  const result = await fileMgmt.openFileFromTree(path, nav.pushNavigationState, nav.pendingAnchor.value)
  if (result.success) {
    nav.pushNavigationState(path, nav.pendingAnchor.value)
    await nav.handlePendingAnchor()
  }
}

async function importFolder() {
  await fileMgmt.importFolder(saveConfirm.checkAllUnsavedFiles, nav.resetNavigation, openFileFromTree)
  await applyProjectConfig()
}

async function importMkdocs() {
  await fileMgmt.importMkdocs(saveConfirm.checkAllUnsavedFiles, nav.resetNavigation, openFileFromTree)
  await applyProjectConfig()
}

// 加载项目级 .markrefine.json，覆盖全局设置
async function applyProjectConfig() {
  const projectPath = fileMgmt.importedFolderPath.value
  if (!projectPath) return
  const merged = await loadProjectConfig(projectPath, fontConfig.value)
  fontConfig.value = merged
  await loadFonts(merged)
}

// 恢复光标位置或预览滚动位置
async function restoreCursorPos(pos: number | null, previewRatio: number | null) {
  // 仅预览模式：恢复预览滚动位置
  if (previewOnlyMode.value && previewRatio != null) {
    await nextTick()
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const scroller = previewRef.value?.getScrollContainer?.()
    if (scroller) {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight
      if (maxScroll > 0) scroller.scrollTop = previewRatio * maxScroll
    }
    return
  }

  // 编辑器模式：恢复光标位置，并同步预览区滚动
  if (pos != null) {
    await nextTick()
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    editorRef.value?.setCursorPos?.(pos)

    await nextTick()
    await new Promise(r => setTimeout(r, 150))
    const editorScroller = editorRef.value?.getScrollContainer?.()
    const previewScroller = previewRef.value?.getScrollContainer?.()
    if (editorScroller && previewScroller && editorScroller.scrollHeight > editorScroller.clientHeight) {
      const ratio = editorScroller.scrollTop / (editorScroller.scrollHeight - editorScroller.clientHeight)
      const previewMax = previewScroller.scrollHeight - previewScroller.clientHeight
      if (previewMax > 0) previewScroller.scrollTop = ratio * previewMax
    }
  }
}

async function handleCloseFile(index: number) {
  await fileMgmt.closeFile(index, saveConfirm.checkUnsavedChanges, fileMgmt.saveFile, nav.pushNavigationState)
}

function handleSwitchFile(index: number) {
  fileMgmt.switchToFile(index)
}

function handleFontConfigChange(config: FontConfig) {
  fontConfig.value = config
  applyTheme(config.previewTheme || 'default')
}

function handleOutlineScroll(id: string) {
  const lineNumber = getHeadingLine(id)
  if (lineNumber !== undefined && editorRef.value) editorRef.value.scrollToLine(lineNumber)
  if (previewElement.value) {
    const element = previewElement.value.querySelector(`#${CSS.escape(id)}`)
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function togglePreview() {
  showPreview.value = !showPreview.value
  previewOnlyMode.value = false
}

function togglePreviewOnly() {
  if (previewOnlyMode.value) { previewOnlyMode.value = false; showPreview.value = true }
  else { showPreview.value = true; previewOnlyMode.value = true }
}

// ── Zoom ───────────────────────────────────────────────

function handleWheel(event: WheelEvent) {
  if (event.ctrlKey) {
    event.preventDefault()
    zoomLevel.value = Math.min(200, Math.max(50, zoomLevel.value + (event.deltaY > 0 ? -10 : 10)))
  }
}

// ── Tabbed click script (for HTML export) ──────────────

const tabbedClickScript = '<' + 'script>\n' +
`  document.querySelectorAll('.tabbed-label').forEach(label => {
    label.addEventListener('click', function() {
      const tabSet = this.closest('.tabbed-set');
      if (!tabSet) return;
      const tabIndex = this.getAttribute('data-tab-index');
      tabSet.querySelectorAll('.tabbed-label').forEach(l => l.classList.remove('active'));
      this.classList.add('active');
      tabSet.querySelectorAll('.tabbed-block').forEach(block => {
        if (block.getAttribute('data-tab-index') === tabIndex) block.classList.add('active');
        else block.classList.remove('active');
      });
    });
  });
` + '<' + '/script>'

// ── Export ─────────────────────────────────────────────

async function exportHTML() {
  if (fileMgmt.workState.value === 'mkdocs' && fileMgmt.importedFolderPath.value) {
    try {
      const outputDir = await open({ directory: true, multiple: false, title: '选择静态站点输出目录' })
      if (!outputDir || typeof outputDir !== 'string') return
      const mkdocsYmlPath = findMkdocsYmlPath(fileMgmt.importedFolderPath.value)
      let siteName = 'Documentation'
      if (mkdocsYmlPath) {
        try {
          const ymlContent = await readTextFile(mkdocsYmlPath)
          const config = parseYaml(ymlContent) as { site_name?: string }
          siteName = config.site_name || 'Documentation'
        } catch { /* ignore */ }
      }
      resetChapterCounters()
      const chapters = collectNavChapters(fileMgmt.mdFiles.value, fileMgmt.importedFolderPath.value, 0, '')
      await loadAllMdFiles(chapters)
      await exportStaticSite({
        outputDir, siteName, chapters,
        showHeadingNumbers: fontConfig.value.showHeadingNumbers !== false
      })
      await message('静态站点导出成功！', { title: '成功', kind: 'info' })
    } catch (error) { await handleError(error, '导出静态站点') }
    return
  }
  try {
    const filePath = await save({ filters: [{ name: 'HTML', extensions: ['html'] }] })
    if (filePath) {
      const pe = document.querySelector('.preview-content')
      let previewContent = pe?.innerHTML || renderedHtml.value
      previewContent = previewContent.replace(/<img([^>]*)>/g, (match, attrs) => {
        const originalSrcMatch = attrs.match(/data-original-src="([^"]+)"/)
        if (originalSrcMatch) {
          const newAttrs = attrs.replace(/data-original-src="[^"]+"/, '').replace(/src="[^"]+"/, `src="${originalSrcMatch[1]}"`)
          return `<img${newAttrs}>`
        }
        return match
      })
      const title = currentMetadata.value.title || extractH1Title(fileMgmt.content.value) || 'Exported Document'
      const markdownStyles = getHtmlMarkdownStyles(fontConfig.value)
      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title><style>${katexStyles}${highlightStyles}${markdownStyles}
body{max-width:${fontConfig.value.previewWidth || 900}px;margin:0 auto;padding:2rem;background-color:${fontConfig.value.previewBackgroundColor || '#ffffff'}}
</style></head><body><div class="markdown-body">${previewContent}</div>${tabbedClickScript}</body></html>`
      await writeTextFile(filePath, fullHtml)
      await message('HTML 导出成功！', { title: '成功', kind: 'info' })
    }
  } catch (error) { await handleError(error, '导出 HTML') }
}

async function exportPDF() {
  if (previewRef.value) previewRef.value.clearSearchHighlights()
  if (fileMgmt.workState.value === 'mkdocs') {
    try {
      const { chapters, bookmarkTree, combinedHtml } = await prepareMkdocsExport(
        fileMgmt.mdFiles.value, fileMgmt.importedFolderPath.value || '',
        fontConfig.value.showHeadingNumbers !== false
      )
      fileMgmt.mkdocsChapters.value = chapters
      mkdocsBookmarkTree.value = bookmarkTree
      mkdocsCombinedHtml.value = combinedHtml
      showMkdocsPreview.value = true
    } catch (error) { await handleError(error, '准备 MkDocs 导出') }
  } else {
    const pe = document.querySelector('.preview-content')
    const previewContent = pe?.innerHTML || renderedHtml.value
    await exportToPDF(previewContent, currentMetadata.value, fontConfig.value)
  }
}

async function confirmMkdocsExport() {
  showMkdocsPreview.value = false
  try {
    const metadata: Metadata = {
      title: fileMgmt.mkdocsConfig.value.siteName,
      coverTitle: fileMgmt.mkdocsConfig.value.coverTitle,
      coverSubtitle: fileMgmt.mkdocsConfig.value.coverSubtitle,
      author: fileMgmt.mkdocsConfig.value.author,
      copyright: fileMgmt.mkdocsConfig.value.copyright
    }
    await exportToPDF(mkdocsCombinedHtml.value, metadata, fontConfig.value)
  } catch (error) { await handleError(error, 'MkDocs 组合导出') }
}

function cancelMkdocsExport() {
  showMkdocsPreview.value = false
}

// ── Lifecycle ──────────────────────────────────────────

const editorScrollContainer = ref<HTMLElement | null>(null)
const previewScrollContainer = ref<HTMLElement | null>(null)
const { startSync } = useScrollSync(editorScrollContainer, previewScrollContainer)

async function initScrollSync() {
  await nextTick()
  // 等待 Editor/Preview 组件渲染完成后获取滚动容器
  await nextTick()
  if (editorRef.value) editorScrollContainer.value = editorRef.value.getScrollContainer()
  if (previewRef.value) previewScrollContainer.value = previewRef.value.getScrollContainer()
  if (editorScrollContainer.value || previewScrollContainer.value) startSync()
}

// 欢迎页关闭后编辑器才渲染，需重新初始化滚动同步
watch(showWelcome, async (welcome) => {
  if (!welcome) {
    await nextTick()
    await nextTick()
    if (editorRef.value) editorScrollContainer.value = editorRef.value.getScrollContainer()
    if (previewRef.value) previewScrollContainer.value = previewRef.value.getScrollContainer()
    startSync()
  }
})

let windowCloseUnlisten: (() => void) | null = null

async function handleCloseRequest() {
  const canContinue = await saveConfirm.checkAllUnsavedFiles()
  if (!canContinue) return
  saveWorkspace()
  const appWindow = getCurrentWindow()
  await appWindow.destroy()
}

// ── Workspace persistence ──────────────────────────────

const WORKSPACE_KEY = 'markrefine-workspace'

interface WorkspaceState {
  workState: 'file' | 'folder' | 'mkdocs'
  openedFilePaths: string[]
  activeFilePath: string | null
  cursorPos: number | null
  previewScrollRatio: number | null
  importedFolderPath: string | null
  showPreview: boolean
  previewOnlyMode: boolean
  sidebarWidth: number
  editorWidth: number
  leftIcons: string[]
  rightIcons: string[]
  leftActiveTab: string
  rightActiveTab: string
}

function saveWorkspace() {
  try {
    const cursorPos = editorRef.value?.getCursorPos?.()?.pos ?? null
    let previewScrollRatio: number | null = null
    const previewScroller = previewRef.value?.getScrollContainer?.()
    if (previewScroller && previewScroller.scrollHeight > previewScroller.clientHeight) {
      previewScrollRatio = previewScroller.scrollTop / (previewScroller.scrollHeight - previewScroller.clientHeight)
    }
    const state: WorkspaceState = {
      workState: fileMgmt.workState.value,
      openedFilePaths: fileMgmt.openedFiles.value
        .map(f => f.path).filter((p): p is string => !!p),
      activeFilePath: fileMgmt.currentFilePath.value,
      cursorPos,
      previewScrollRatio,
      importedFolderPath: fileMgmt.importedFolderPath.value,
      showPreview: showPreview.value,
      previewOnlyMode: previewOnlyMode.value,
      sidebarWidth: sidebarWidth.value,
      editorWidth: editorWidth.value,
      leftIcons: [...leftIcons.value],
      rightIcons: [...rightIcons.value],
      leftActiveTab: leftActiveTab.value,
      rightActiveTab: rightActiveTab.value,
    }
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}

async function restoreWorkspace() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (!raw) return false
    const state: WorkspaceState = JSON.parse(raw)

    // 恢复 UI 状态
    showPreview.value = state.showPreview
    previewOnlyMode.value = state.previewOnlyMode
    if (state.sidebarWidth) sidebarWidth.value = state.sidebarWidth
    if (state.editorWidth) editorWidth.value = state.editorWidth
    if (state.leftIcons?.length || state.rightIcons?.length) {
      const valid = (i: string): i is IconId => ['files', 'search', 'outline', 'bookmarks', 'annotations'].includes(i)
      const left = (state.leftIcons || ['files', 'search', 'bookmarks', 'annotations']).filter(valid) as IconId[]
      if (!left.includes('bookmarks')) left.push('bookmarks')
      if (!left.includes('annotations')) left.push('annotations')
      leftIcons.value = left
      rightIcons.value = (state.rightIcons || ['outline']).filter(valid).filter(i => !left.includes(i)) as IconId[]
      if (state.leftActiveTab && valid(state.leftActiveTab)) leftActiveTab.value = state.leftActiveTab as IconId
      if (state.rightActiveTab) rightActiveTab.value = state.rightActiveTab as IconId
    }

    // 恢复工作区状态
    if (state.workState === 'folder' && state.importedFolderPath) {
      await fileMgmt.importFolderByPath(state.importedFolderPath)
      await applyProjectConfig()
      if (state.activeFilePath) {
        await fileMgmt.openFileFromTreeNoHistory(state.activeFilePath)
      }
      await restoreCursorPos(state.cursorPos, state.previewScrollRatio)
      return true
    }

    if (state.workState === 'mkdocs' && state.importedFolderPath) {
      await fileMgmt.importMkdocsByPath(state.importedFolderPath)
      await applyProjectConfig()
      if (state.activeFilePath) {
        await fileMgmt.openFileFromTreeNoHistory(state.activeFilePath)
      }
      await restoreCursorPos(state.cursorPos, state.previewScrollRatio)
      return true
    }

    // 单文件模式：恢复打开的文件
    if (state.openedFilePaths.length > 0) {
      for (let i = 0; i < state.openedFilePaths.length; i++) {
        await fileMgmt.openFileFromPath(state.openedFilePaths[i])
      }
      // 切换到上次活跃的文件
      if (state.activeFilePath) {
        const idx = fileMgmt.openedFiles.value.findIndex(f => f.path === state.activeFilePath)
        if (idx >= 0) fileMgmt.switchToFile(idx)
      }
      // 恢复光标位置
      await restoreCursorPos(state.cursorPos, state.previewScrollRatio)
      return true
    }
    return false
  } catch {
    localStorage.removeItem(WORKSPACE_KEY)
    return false
  }
}

onMounted(async () => {
  fileMgmt.startAutoSave()
  initScrollSync()
  window.addEventListener('wheel', handleWheel, { passive: false })

  try {
    windowCloseUnlisten = await listen('close-requested', handleCloseRequest)
  } catch (e) {
    console.error('注册关闭事件监听失败:', e)
  }

  fileMgmt.updateWindowTitle()

  try {
    const config = await loadConfig()
    fontConfig.value = config
    applyTheme(config.previewTheme || 'default')
    await loadFonts(config)
  } catch (e) {
    console.error('加载配置或字体失败，使用默认值:', e)
  }

  // 尝试恢复上次的工作区状态
  await restoreWorkspace()

  // 无论前面是否出错，都关闭 splash 显示主窗口
  try {
    await invoke('close_splash_window')
  } catch (e) {
    console.error('关闭 splash 窗口失败:', e)
  }
})

watch(fileMgmt.windowTitle, () => fileMgmt.updateWindowTitle())

// 在文件夹/MkDocs模式下，设置变更时自动保存到项目 .markrefine.json
watch(fontConfig, async (config) => {
  const projectPath = fileMgmt.importedFolderPath.value
  if (!projectPath) return
  try {
    await saveProjectConfig(projectPath, config)
  } catch { /* ignore */ }
}, { deep: true })

watch(renderedHtml, async () => {
  await nextTick()
  if (previewRef.value) {
    const element = previewRef.value.getPreviewRef()
    previewElement.value = element
    if (outlineRef.value && element) outlineRef.value.updatePreviewRef(element)
  }
})

onUnmounted(() => {
  fileMgmt.stopAutoSave()
  window.removeEventListener('wheel', handleWheel)
  if (windowCloseUnlisten) { windowCloseUnlisten(); windowCloseUnlisten = null }
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f8fafc;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-pane,
.preview-pane,
.outline-pane {
  min-width: 0;
  flex-shrink: 0;
}

.editor-pane {
  overflow: hidden;
  border-right: none;
}

.outline-pane {
  flex-shrink: 0;
}

/* 分割器样式 */
.splitter {
  width: 5px;
  background-color: #e2e8f0;
  cursor: col-resize;
  flex-shrink: 0;
  transition: background-color 0.2s;
  position: relative;
}

.splitter:hover {
  background-color: #3b82f6;
}

.splitter:active {
  background-color: #2563eb;
}

/* 保存确认对话框样式 */
.save-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.save-confirm-dialog {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  max-width: 400px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.save-confirm-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12px;
}

.save-confirm-message {
  font-size: 14px;
  color: #475569;
  margin-bottom: 20px;
}

.save-confirm-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.save-confirm-buttons .save-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  background-color: #3b82f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-confirm-buttons .save-btn:hover {
  background-color: #2563eb;
}

.save-confirm-buttons .discard-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  background-color: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-confirm-buttons .discard-btn:hover {
  background-color: #e5e7eb;
}

.save-confirm-buttons .cancel-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  background-color: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-confirm-buttons .cancel-btn:hover {
  background-color: #e5e7eb;
}
</style>
