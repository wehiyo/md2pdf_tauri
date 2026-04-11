<template>
  <Teleport to="body">
    <div v-if="visible" class="preview-dialog-overlay">
      <div class="preview-dialog">
        <!-- 主内容区域（水平布局） -->
        <div class="dialog-main">
          <!-- 左侧书签树 -->
          <div class="bookmark-tree">
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

          <!-- 分割线 -->
          <div class="dialog-divider"></div>

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
import { ref, watch, nextTick } from 'vue'
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
  width: 90vw;
  max-width: 1200px;
  height: 85vh;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
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
  width: 250px;
  flex-shrink: 0;
  background-color: #f8fafc;
  border-right: 1px solid #e2e8f0;
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
  width: 1px;
  background-color: #e2e8f0;
  flex-shrink: 0;
}

.dark .dialog-divider {
  background-color: #334155;
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

/* 预览对话框中显示标题编号 */
.preview-content .heading-number {
  display: inline !important;
  font-weight: 600;
  color: #3b82f6;
  margin-right: 0.25em;
}

.dark .preview-content .heading-number {
  color: #60a5fa;
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