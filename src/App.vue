<template>
  <div class="app-container">
    <div class="main-content" :style="mainContentStyle">
      <LeftSidebar
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
        :style="{ width: sidebarWidth + 'px' }"
        @select-file="openFileFromTree"
        @search="search.handleSearch"
        @search-jump="search.handleSearchJump"
        @search-clear="search.handleSearchClear"
        @select-search-result="search.handleSearchResultSelect"
        @switch-file="handleSwitchFile"
        @close-file="handleCloseFile"
        @close-folder="fileMgmt.closeProject"
      />
      <div
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
        :preview-only-mode="previewOnlyMode"
        :can-navigate-back="nav.canNavigateBack.value"
        :can-navigate-forward="nav.canNavigateForward.value"
        :md-files="fileMgmt.mdFiles.value"
        class="preview-pane"
        :style="previewPaneStyle"
        @preview-only="togglePreviewOnly"
        @close-preview="showPreview = false"
        @import-folder="importFolder"
        @import-mkdocs="importMkdocs"
        @export-html="exportHTML"
        @export-pdf="exportPDF"
        @navigate-to-file="nav.navigateToFile"
        @navigate-to-anchor="nav.navigateToAnchor"
        @navigate-back="nav.navigateBack"
        @navigate-forward="nav.navigateForward"
        @font-config-change="handleFontConfigChange"
      />
      <div class="splitter outline-splitter" />
      <OutlinePanel
        ref="outlineRef"
        :preview-ref="previewElement"
        class="outline-pane"
        @scroll-to-heading="handleOutlineScroll"
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
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
import { loadConfig, type FontConfig } from './composables/useConfig'
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
  sidebarRef,
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
}

async function openRecentMkdocs(path: string) {
  await fileMgmt.importMkdocsByPath(path, saveConfirm.checkAllUnsavedFiles, nav.resetNavigation, openFileFromTree)
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
  previewBackgroundColor: '#ffffff', pageSize: 'A4',
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
}

async function importMkdocs() {
  await fileMgmt.importMkdocs(saveConfirm.checkAllUnsavedFiles, nav.resetNavigation, openFileFromTree)
}

async function handleCloseFile(index: number) {
  await fileMgmt.closeFile(index, saveConfirm.checkUnsavedChanges, fileMgmt.saveFile, nav.pushNavigationState)
}

function handleSwitchFile(index: number) {
  fileMgmt.switchToFile(index)
}

function handleFontConfigChange(config: FontConfig) {
  fontConfig.value = config
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
  setTimeout(() => {
    if (editorRef.value) editorScrollContainer.value = editorRef.value.getScrollContainer()
    if (previewRef.value) previewScrollContainer.value = previewRef.value.getScrollContainer()
    startSync()
  }, 100)
}

let windowCloseUnlisten: (() => void) | null = null

async function handleCloseRequest() {
  const canContinue = await saveConfirm.checkAllUnsavedFiles()
  if (!canContinue) return
  const appWindow = getCurrentWindow()
  await appWindow.destroy()
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
    await loadFonts(config)
  } catch (e) {
    console.error('加载配置或字体失败，使用默认值:', e)
  }

  // 无论前面是否出错，都关闭 splash 显示主窗口
  try {
    await invoke('close_splash_window')
  } catch (e) {
    console.error('关闭 splash 窗口失败:', e)
  }
})

watch(fileMgmt.windowTitle, () => fileMgmt.updateWindowTitle())

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
