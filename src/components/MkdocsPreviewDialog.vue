<template>
  <Teleport to="body">
    <div v-if="visible" class="preview-dialog-overlay">
      <div
        class="preview-dialog"
        :style="{ width: dialogWidth, height: dialogHeight }"
      >
        <!-- 主内容区域（水平布局） -->
        <div class="dialog-main">
          <!-- 左侧书签树 -->
          <div class="bookmark-tree" :style="{ width: treeWidth + 'px' }">
            <div class="bookmark-tree-header">
              <span class="header-title">文档结构</span>
            </div>
            <div class="bookmark-tree-content">
              <BookmarkTreeItem
                v-for="(chapter, index) in bookmarkTree"
                :key="index"
                :chapter="chapter"
                :level="0"
                @click="scrollToHeading"
              />
            </div>
          </div>

          <!-- 分割线（可拖动调整书签树宽度） -->
          <div
            class="dialog-divider"
            @mousedown="startTreeResize"
          ></div>

          <!-- 右侧预览区 -->
          <div class="preview-container">
            <div class="preview-header">
              <span class="header-title">预览</span>
            </div>
            <div class="preview-content" ref="previewRef">
              <div class="markdown-body" v-html="combinedHtml"></div>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="dialog-footer">
          <button class="confirm-btn" @click="handleConfirm">
            确认导出
          </button>
          <button class="cancel-btn" @click="handleCancel">
            取消
          </button>
        </div>

        <!-- 对话框大小调整手柄 -->
        <div
          class="resize-handle-corner"
          @mousedown="startDialogResize"
        ></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import BookmarkTreeItem from './BookmarkTreeItem.vue'
import type { BookmarkTreeNode } from '../composables/useMkdocsExport'

const props = defineProps<{
  visible: boolean
  bookmarkTree: BookmarkTreeNode[]
  combinedHtml: string
}>()

const emit = defineEmits<{
  'confirm': []
  'cancel': []
}>()

const previewRef = ref<HTMLElement | null>(null)

// 对话框尺寸（响应式）
const dialogWidth = ref('90vw')
const dialogHeight = ref('85vh')

// 书签树宽度
const treeWidth = ref(250)

// 拖动状态
let isResizingDialog = false
let isResizingTree = false
let startX = 0
let startY = 0
let startWidth = 0
let startHeight = 0
let startTreeWidth = 0

// 开始拖动调整对话框大小
function startDialogResize(e: MouseEvent) {
  isResizingDialog = true
  startX = e.clientX
  startY = e.clientY

  // 获取当前尺寸（像素值）
  const target = e.target as HTMLElement
  const dialog = target.closest('.preview-dialog') as HTMLElement
  const rect = dialog.getBoundingClientRect()
  startWidth = rect.width
  startHeight = rect.height

  // 阻止文本选择
  e.preventDefault()
  document.addEventListener('mousemove', onDialogResize)
  document.addEventListener('mouseup', stopDialogResize)
}

function onDialogResize(e: MouseEvent) {
  if (!isResizingDialog) return

  const deltaX = startX - e.clientX  // 向左拖动增大
  const deltaY = startY - e.clientY  // 向上拖动增大

  const newWidth = Math.max(600, Math.min(window.innerWidth * 0.95, startWidth + deltaX))
  const newHeight = Math.max(400, Math.min(window.innerHeight * 0.9, startHeight + deltaY))

  dialogWidth.value = newWidth + 'px'
  dialogHeight.value = newHeight + 'px'
}

function stopDialogResize() {
  isResizingDialog = false
  document.removeEventListener('mousemove', onDialogResize)
  document.removeEventListener('mouseup', stopDialogResize)
}

// 开始拖动调整书签树宽度
function startTreeResize(e: MouseEvent) {
  isResizingTree = true
  startX = e.clientX
  startTreeWidth = treeWidth.value

  e.preventDefault()
  document.addEventListener('mousemove', onTreeResize)
  document.addEventListener('mouseup', stopTreeResize)
}

function onTreeResize(e: MouseEvent) {
  if (!isResizingTree) return

  const deltaX = e.clientX - startX  // 向右拖动增大
  const newWidth = Math.max(150, Math.min(400, startTreeWidth + deltaX))

  treeWidth.value = newWidth
}

function stopTreeResize() {
  isResizingTree = false
  document.removeEventListener('mousemove', onTreeResize)
  document.removeEventListener('mouseup', stopTreeResize)
}

// 组件卸载时清理事件监听
onUnmounted(() => {
  stopDialogResize()
  stopTreeResize()
})

// 滚动到指定标题
function scrollToHeading(id: string) {
  if (!previewRef.value) return

  // id 可能包含点号，需要转义
  const escapedId = id.replace(/\./g, '\\.')
  const targetElement = previewRef.value.querySelector(`#${escapedId}`)
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    console.log('[scrollToHeading] 滚动到:', id)
  } else {
    console.warn('[scrollToHeading] 未找到元素:', id)
  }
}

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}

// 对话框打开时，初始化图表渲染
watch(() => props.visible, async (newVal) => {
  if (newVal && previewRef.value) {
    await nextTick()
    // 这里可以初始化 Mermaid 等图表渲染
    // 目前暂不处理，因为组合导出时图表已在 prepareMkdocsExport 中预渲染
  }
})
</script>

<style scoped>
.preview-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dark .preview-dialog-overlay {
  background-color: rgba(0, 0, 0, 0.7);
}

.preview-dialog {
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  position: relative;
  min-width: 600px;
  min-height: 400px;
}

.dark .preview-dialog {
  background-color: #1e293b;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

/* 主内容区域（水平布局） */
.dialog-main {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 左侧书签树 */
.bookmark-tree {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background-color: #f8fafc;
  border-right: 1px solid #e2e8f0;
  min-width: 150px;
}

.dark .bookmark-tree {
  background-color: #0f172a;
  border-right-color: #334155;
}

.bookmark-tree-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background-color: #e2e8f0;
  border-bottom: 1px solid #cbd5e1;
}

.dark .bookmark-tree-header {
  background-color: #334155;
  border-bottom-color: #475569;
}

.bookmark-tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* 分割线 */
.dialog-divider {
  width: 4px;
  background-color: #e2e8f0;
  flex-shrink: 0;
  cursor: col-resize;
  transition: background-color 0.2s;
}

.dialog-divider:hover {
  background-color: #3b82f6;
}

.dark .dialog-divider {
  background-color: #334155;
}

.dark .dialog-divider:hover {
  background-color: #3b82f6;
}

/* 对话框角落拖动手柄 */
.resize-handle-corner {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, #9ca3af 50%);
  border-radius: 0 0 8px 0;
}

.resize-handle-corner:hover {
  background: linear-gradient(135deg, transparent 50%, #3b82f6 50%);
}

/* 右侧预览区 */
.preview-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.preview-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background-color: #e2e8f0;
  border-bottom: 1px solid #cbd5e1;
}

.dark .preview-header {
  background-color: #334155;
  border-bottom-color: #475569;
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background-color: #ffffff;
}

.dark .preview-content {
  background-color: #0f172a;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.dark .header-title {
  color: #e2e8f0;
}

/* 底部按钮 */
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px;
  background-color: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.dark .dialog-footer {
  background-color: #1e293b;
  border-top-color: #334155;
}

.confirm-btn {
  padding: 8px 24px;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  background-color: #3b82f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.confirm-btn:hover {
  background-color: #2563eb;
}

.cancel-btn {
  padding: 8px 24px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  background-color: #f3f4f6;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cancel-btn:hover {
  background-color: #e5e7eb;
}

.dark .cancel-btn {
  color: #e2e8f0;
  background-color: #334155;
}

.dark .cancel-btn:hover {
  background-color: #475569;
}
</style>

<style>
/* 预览对话框中显示标题编号（非 scoped，因为 Teleport 到 body） */
.preview-content .markdown-body .heading-number {
  display: inline !important;
  font-weight: 600;
  color: #3b82f6;
  margin-right: 0.25em;
}

.dark .preview-content .markdown-body .heading-number {
  color: #60a5fa;
}
</style>