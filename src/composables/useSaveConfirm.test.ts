import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useSaveConfirm } from './useSaveConfirm'
import type { OpenedFile } from '../types'

function makeFile(overrides: Partial<OpenedFile> = {}): OpenedFile {
  return {
    path: '/test/file.md',
    content: 'hello',
    savedContent: 'hello',
    dir: '/test',
    name: 'file.md',
    ...overrides,
  }
}

describe('useSaveConfirm', () => {
  describe('初始状态', () => {
    it('showSaveConfirmDialog 应为 false', () => {
      const openedFiles = ref([makeFile()])
      const { showSaveConfirmDialog } = useSaveConfirm(
        openedFiles, ref(0), computed(() => false),
        ref('hello'), ref('hello'),
        () => {}, async () => true,
      )
      expect(showSaveConfirmDialog.value).toBe(false)
    })
  })

  describe('checkUnsavedChanges', () => {
    it('无未保存改动时应返回 none', async () => {
      const openedFiles = ref([makeFile()])
      const sc = useSaveConfirm(
        openedFiles, ref(0), computed(() => false),
        ref('hello'), ref('hello'),
        () => {}, async () => true,
      )
      const result = await sc.checkUnsavedChanges()
      expect(result).toBe('none')
    })

    it('有未保存改动时应显示对话框并等待用户选择', async () => {
      const openedFiles = ref([makeFile({ content: 'modified', savedContent: 'hello' })])
      const hasUnsaved = computed(() => true)
      const sc = useSaveConfirm(
        openedFiles, ref(0), hasUnsaved,
        ref('hello'), ref('modified'),
        () => {}, async () => true,
      )
      // Start the check (doesn't resolve until user chooses)
      const promise = sc.checkUnsavedChanges()
      expect(sc.showSaveConfirmDialog.value).toBe(true)

      // Simulate user clicking "Yes"
      sc.handleSaveConfirmYes()
      const result = await promise
      expect(result).toBe('save')
      expect(sc.showSaveConfirmDialog.value).toBe(false)
    })

    it('用户点击"不保存"应返回 discard 并同步 savedContent', async () => {
      const openedFiles = ref([makeFile({ content: 'modified', savedContent: 'hello' })])
      const savedContent = ref('hello')
      const content = ref('modified')
      const sc = useSaveConfirm(
        openedFiles, ref(0), computed(() => true),
        savedContent, content,
        () => {}, async () => true,
      )
      const promise = sc.checkUnsavedChanges()
      sc.handleSaveConfirmNo()
      const result = await promise
      expect(result).toBe('discard')
      expect(savedContent.value).toBe('modified')
    })

    it('用户点击"取消"应返回 cancel', async () => {
      const openedFiles = ref([makeFile({ content: 'modified', savedContent: 'hello' })])
      const sc = useSaveConfirm(
        openedFiles, ref(0), computed(() => true),
        ref('hello'), ref('modified'),
        () => {}, async () => true,
      )
      const promise = sc.checkUnsavedChanges()
      sc.handleSaveConfirmCancel()
      const result = await promise
      expect(result).toBe('cancel')
    })
  })

  describe('checkAllUnsavedFiles', () => {
    it('无未保存文件时应返回 true', async () => {
      const openedFiles = ref([makeFile()])
      const sc = useSaveConfirm(
        openedFiles, ref(0), computed(() => false),
        ref('hello'), ref('hello'),
        () => {}, async () => true,
      )
      expect(await sc.checkAllUnsavedFiles()).toBe(true)
    })

    it('所有文件已保存时应返回 true', async () => {
      const openedFiles = ref([
        makeFile({ path: '/a.md' }),
        makeFile({ path: '/b.md' }),
      ])
      const sc = useSaveConfirm(
        openedFiles, ref(0), computed(() => false),
        ref('hello'), ref('hello'),
        () => {}, async () => true,
      )
      expect(await sc.checkAllUnsavedFiles()).toBe(true)
    })

    it('有未保存文件且用户选择保存时应调用 saveFile 并返回 true', async () => {
      const openedFiles = ref([
        makeFile({ path: '/a.md', content: 'mod', savedContent: 'orig' }),
      ])
      const currentIndex = ref(0)
      const switchFn = (idx: number) => { currentIndex.value = idx }
      const saveFn = vi.fn(async () => { return true })
      const hasUnsaved = computed(() => {
        const f = openedFiles.value[currentIndex.value]
        return f ? f.content !== f.savedContent : false
      })

      const sc = useSaveConfirm(
        openedFiles, currentIndex, hasUnsaved,
        ref('orig'), ref('mod'),
        switchFn, saveFn,
      )
      const promise = sc.checkAllUnsavedFiles()
      // Wait for microtasks to resolve
      await vi.waitFor(() => sc.showSaveConfirmDialog.value === true, { timeout: 100 })
      sc.handleSaveConfirmYes()
      const result = await promise
      expect(result).toBe(true)
      expect(saveFn).toHaveBeenCalled()
    })

    it('用户取消时应返回 false', async () => {
      const openedFiles = ref([
        makeFile({ path: '/a.md', content: 'mod', savedContent: 'orig' }),
      ])
      const currentIndex = ref(0)
      const switchFn = (idx: number) => { currentIndex.value = idx }
      const hasUnsaved = computed(() => {
        const f = openedFiles.value[currentIndex.value]
        return f ? f.content !== f.savedContent : false
      })

      const sc = useSaveConfirm(
        openedFiles, currentIndex, hasUnsaved,
        ref('orig'), ref('mod'),
        switchFn, async () => true,
      )
      const promise = sc.checkAllUnsavedFiles()
      await vi.waitFor(() => sc.showSaveConfirmDialog.value === true, { timeout: 100 })
      sc.handleSaveConfirmCancel()
      const result = await promise
      expect(result).toBe(false)
    })
  })
})
