<template>
  <Teleport to="body">
    <div v-if="visible" class="preview-dialog-overlay">
      <div class="preview-dialog" :style="{ width: dialogWidth, height: dialogHeight }">
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

// 对话框尺寸
const dialogWidth = '90vw'
const dialogHeight = '100vh'

// 书签树宽度
const treeWidth = ref(250)

// 拖动状态
let isResizingTree = false
let startX = 0
let startTreeWidth = 0

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

.preview-dialog {
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
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

.bookmark-tree-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background-color: #e2e8f0;
  border-bottom: 1px solid #cbd5e1;
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

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background-color: #ffffff;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
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
</style>

<style>
/* 预览对话框中显示标题编号（非 scoped，因为 Teleport 到 body） */
.preview-content .markdown-body .heading-number {
  display: inline !important;
  font-weight: 600;
  color: #3b82f6;
  margin-right: 0.25em;
}
</style>