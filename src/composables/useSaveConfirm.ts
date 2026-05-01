import { ref, type Ref, type ComputedRef } from 'vue'
import type { OpenedFile } from './useFileManagement'

export function useSaveConfirm(
  openedFiles: Ref<OpenedFile[]>,
  _currentFileIndex: Ref<number>,
  hasUnsavedChanges: ComputedRef<boolean>,
  savedContent: Ref<string>,
  content: Ref<string>,
  switchToFile: (index: number) => void,
  saveFile: () => Promise<boolean>,
) {
  const showSaveConfirmDialog = ref(false)
  let saveConfirmResolver: ((result: 'save' | 'discard' | 'cancel' | 'none') => void) | null = null

  async function checkUnsavedChanges(): Promise<'save' | 'discard' | 'cancel' | 'none'> {
    if (!hasUnsavedChanges.value) return 'none'
    showSaveConfirmDialog.value = true
    return new Promise((resolve) => {
      saveConfirmResolver = resolve
    })
  }

  async function checkAllUnsavedFiles(): Promise<boolean> {
    const unsavedFiles: { index: number; file: OpenedFile }[] = []
    for (let i = 0; i < openedFiles.value.length; i++) {
      const file = openedFiles.value[i]
      if (file.content !== file.savedContent) {
        unsavedFiles.push({ index: i, file })
      }
    }
    if (unsavedFiles.length === 0) return true
    for (const { index } of unsavedFiles) {
      switchToFile(index)
      const result = await checkUnsavedChanges()
      if (result === 'cancel') return false
      if (result === 'save') {
        await saveFile()
      }
    }
    return true
  }

  function handleSaveConfirmYes() {
    showSaveConfirmDialog.value = false
    if (saveConfirmResolver) {
      saveConfirmResolver('save')
      saveConfirmResolver = null
    }
  }

  function handleSaveConfirmNo() {
    showSaveConfirmDialog.value = false
    savedContent.value = content.value
    if (saveConfirmResolver) {
      saveConfirmResolver('discard')
      saveConfirmResolver = null
    }
  }

  function handleSaveConfirmCancel() {
    showSaveConfirmDialog.value = false
    if (saveConfirmResolver) {
      saveConfirmResolver('cancel')
      saveConfirmResolver = null
    }
  }

  return {
    showSaveConfirmDialog,
    checkUnsavedChanges,
    checkAllUnsavedFiles,
    handleSaveConfirmYes,
    handleSaveConfirmNo,
    handleSaveConfirmCancel,
  }
}
