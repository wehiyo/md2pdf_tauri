import { ref, onUnmounted, type Ref } from 'vue'

/**
 * 编辑器和预览区滚动同步 composable
 * 只在用户主动滚动时同步， 不在内容变化导致的自动滚动时同步
 */
export function useScrollSync(
  editorScrollContainer: Ref<HTMLElement | null>,
  previewScrollContainer: Ref<HTMLElement | null>
) {
  const isSyncing = ref(false)
  let syncTimeout: ReturnType<typeof setTimeout> | null = null

  // 记录上一次的滚动位置， 用于判断是否是真正的滚动
  let lastEditorScrollTop = 0
  let lastPreviewScrollTop = 0

  // 标记是否是用户主动滚动（通过鼠标滚轮或触摸)
  let isUserScrolling = false

  /**
   * 讻录用户开始滚动
   */
  function onScrollStart(): void {
    isUserScrolling = true
    // 滚动结束后重置状态
    setTimeout(() => {
      isUserScrolling = false
    }, 150)
  }

  /**
   * 讻算滚动比例 (0-1)
   */
  function getScrollRatio(element: HTMLElement): number {
    const scrollTop = element.scrollTop
    const scrollHeight = element.scrollHeight
    const clientHeight = element.clientHeight
    const maxScroll = scrollHeight - clientHeight
    if (maxScroll <= 0) return 0
    return scrollTop / maxScroll
  }

  /**
   * 根据比例设置滚动位置
   */
  function setScrollRatio(element: HTMLElement, ratio: number): void {
    const scrollHeight = element.scrollHeight
    const clientHeight = element.clientHeight
    const maxScroll = scrollHeight - clientHeight
    if (maxScroll <= 0) return
    element.scrollTop = ratio * maxScroll
  }

  /**
   * 同步编辑器滚动到预览区
   */
  function syncEditorToPreview(): void {
    if (isSyncing.value || !editorScrollContainer.value || !previewScrollContainer.value) return
    // 只有用户主动滚动时才同步
    if (!isUserScrolling) return

    const currentScrollTop = editorScrollContainer.value.scrollTop

    // 如果滚动位置没有实际变化，跳过同步
    if (Math.abs(currentScrollTop - lastEditorScrollTop) < 1) {
      return
    }

    lastEditorScrollTop = currentScrollTop
    isSyncing.value = true
    const ratio = getScrollRatio(editorScrollContainer.value)
    setScrollRatio(previewScrollContainer.value, ratio)

    if (syncTimeout) clearTimeout(syncTimeout)
    syncTimeout = setTimeout(() => {
      isSyncing.value = false
    }, 100)
  }

  /**
   * 同步预览区滚动到编辑器
   */
  function syncPreviewToEditor(): void {
    if (isSyncing.value || !editorScrollContainer.value || !previewScrollContainer.value) return

    // 只有用户主动滚动时才同步
    if (!isUserScrolling) return

    const currentScrollTop = previewScrollContainer.value.scrollTop

    // 如果滚动位置没有实际变化，跳过同步
    if (Math.abs(currentScrollTop - lastPreviewScrollTop) < 1) {
      return
    }

    lastPreviewScrollTop = currentScrollTop
    isSyncing.value = true
    const ratio = getScrollRatio(previewScrollContainer.value)
    setScrollRatio(editorScrollContainer.value, ratio)

    if (syncTimeout) clearTimeout(syncTimeout)
    syncTimeout = setTimeout(() => {
      isSyncing.value = false
    }, 100)
  }

  /**
   * 启动滚动监听
   */
  function startSync(): void {
    if (editorScrollContainer.value) {
      editorScrollContainer.value.addEventListener('scroll', syncEditorToPreview)
      editorScrollContainer.value.addEventListener('wheel', onScrollStart)
      editorScrollContainer.value.addEventListener('touchstart', onScrollStart)
    }
    if (previewScrollContainer.value) {
      previewScrollContainer.value.addEventListener('scroll', syncPreviewToEditor)
      previewScrollContainer.value.addEventListener('wheel', onScrollStart)
      previewScrollContainer.value.addEventListener('touchstart', onScrollStart)
    }
  }

  /**
   * 停止滚动监听
   */
  function stopSync(): void {
    if (editorScrollContainer.value) {
      editorScrollContainer.value.removeEventListener('scroll', syncEditorToPreview)
      editorScrollContainer.value.removeEventListener('wheel', onScrollStart)
      editorScrollContainer.value.removeEventListener('touchstart', onScrollStart)
    }
    if (previewScrollContainer.value) {
      previewScrollContainer.value.removeEventListener('scroll', syncPreviewToEditor)
      previewScrollContainer.value.removeEventListener('wheel', onScrollStart)
      previewScrollContainer.value.removeEventListener('touchstart', onScrollStart)
    }
  }

  onUnmounted(() => {
    stopSync()
  })

  return {
    isSyncing,
    startSync,
    stopSync
  }
}