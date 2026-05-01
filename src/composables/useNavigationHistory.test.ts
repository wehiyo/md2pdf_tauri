import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useNavigationHistory } from './useNavigationHistory'

function makeRefs() {
  return {
    currentFilePath: ref<string | null>(null),
    openFileFromTree: vi.fn(async () => ({ success: true })),
    openFileFromTreeNoHistory: vi.fn(async () => ({ success: true })),
    getHeadingLine: vi.fn(() => undefined),
    editorRef: ref<{ scrollToLine: (n: number) => void } | undefined>(undefined),
    previewRef: ref<{ getScrollContainer: () => HTMLElement | null } | undefined>(undefined),
  }
}

describe('useNavigationHistory', () => {
  describe('初始状态', () => {
    it('canNavigateBack 和 canNavigateForward 应为 false', () => {
      const refs = makeRefs()
      const nav = useNavigationHistory(
        refs.currentFilePath, refs.openFileFromTree, refs.openFileFromTreeNoHistory,
        refs.getHeadingLine, refs.editorRef, refs.previewRef,
      )
      expect(nav.canNavigateBack.value).toBe(false)
      expect(nav.canNavigateForward.value).toBe(false)
    })

    it('pendingAnchor 应为 null', () => {
      const refs = makeRefs()
      const nav = useNavigationHistory(
        refs.currentFilePath, refs.openFileFromTree, refs.openFileFromTreeNoHistory,
        refs.getHeadingLine, refs.editorRef, refs.previewRef,
      )
      expect(nav.pendingAnchor.value).toBeNull()
    })
  })

  describe('pushNavigationState', () => {
    it('单次 push 后 canNavigateBack 为 false，两次后为 true', () => {
      const refs = makeRefs()
      const nav = useNavigationHistory(
        refs.currentFilePath, refs.openFileFromTree, refs.openFileFromTreeNoHistory,
        refs.getHeadingLine, refs.editorRef, refs.previewRef,
      )
      nav.pushNavigationState('/a/doc1.md')
      expect(nav.canNavigateBack.value).toBe(false) // index=0, need >0
      expect(nav.canNavigateForward.value).toBe(false)

      nav.pushNavigationState('/a/doc2.md')
      expect(nav.canNavigateBack.value).toBe(true) // index=1, now >0
    })

    it('在历史中间导航后应截断后续历史', () => {
      const refs = makeRefs()
      const nav = useNavigationHistory(
        refs.currentFilePath, refs.openFileFromTree, refs.openFileFromTreeNoHistory,
        refs.getHeadingLine, refs.editorRef, refs.previewRef,
      )
      nav.pushNavigationState('/a/doc1.md')
      nav.pushNavigationState('/a/doc2.md')
      nav.pushNavigationState('/a/doc3.md') // index = 2

      // Simulate going back to doc1
      nav.navigationIndex.value = 0

      // Push a new state from here, should truncate doc2 and doc3
      nav.pushNavigationState('/a/doc1.md', '#section')
      expect(nav.navigationHistory.value.length).toBe(2)
      expect(nav.navigationHistory.value[1].filePath).toBe('/a/doc1.md')
      expect(nav.navigationHistory.value[1].anchor).toBe('#section')
    })
  })

  describe('resetNavigation', () => {
    it('应清空所有历史', () => {
      const refs = makeRefs()
      const nav = useNavigationHistory(
        refs.currentFilePath, refs.openFileFromTree, refs.openFileFromTreeNoHistory,
        refs.getHeadingLine, refs.editorRef, refs.previewRef,
      )
      nav.pushNavigationState('/a/doc1.md')
      nav.pushNavigationState('/a/doc2.md')

      nav.resetNavigation()
      expect(nav.navigationHistory.value).toEqual([])
      expect(nav.navigationIndex.value).toBe(-1)
      expect(nav.canNavigateBack.value).toBe(false)
    })
  })

  describe('MAX_HISTORY_SIZE', () => {
    it('超过50条时应移除最早的记录', () => {
      const refs = makeRefs()
      const nav = useNavigationHistory(
        refs.currentFilePath, refs.openFileFromTree, refs.openFileFromTreeNoHistory,
        refs.getHeadingLine, refs.editorRef, refs.previewRef,
      )
      for (let i = 0; i < 55; i++) {
        nav.pushNavigationState(`/a/doc${i}.md`)
      }
      // Should be capped at 50
      expect(nav.navigationHistory.value.length).toBe(50)
      // First entry should be doc5 (the 6th one pushed, since first 5 were evicted)
      expect(nav.navigationHistory.value[0].filePath).toBe('/a/doc5.md')
      // Last entry should be doc54
      expect(nav.navigationHistory.value[49].filePath).toBe('/a/doc54.md')
    })
  })

  describe('navigateBack', () => {
    it('canNavigateBack 为 false 时不应操作', async () => {
      const refs = makeRefs()
      const nav = useNavigationHistory(
        refs.currentFilePath, refs.openFileFromTree, refs.openFileFromTreeNoHistory,
        refs.getHeadingLine, refs.editorRef, refs.previewRef,
      )
      await nav.navigateBack()
      expect(refs.openFileFromTreeNoHistory).not.toHaveBeenCalled()
    })
  })

  describe('navigateForward', () => {
    it('canNavigateForward 为 false 时不应操作', async () => {
      const refs = makeRefs()
      const nav = useNavigationHistory(
        refs.currentFilePath, refs.openFileFromTree, refs.openFileFromTreeNoHistory,
        refs.getHeadingLine, refs.editorRef, refs.previewRef,
      )
      await nav.navigateForward()
      expect(refs.openFileFromTreeNoHistory).not.toHaveBeenCalled()
    })
  })
})
