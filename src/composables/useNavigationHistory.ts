import { ref, computed, nextTick, type Ref } from 'vue'
import { slugifyForMkdocs } from './useMarkdown'

interface NavigationState {
  filePath: string
  anchor?: string
}

const MAX_HISTORY_SIZE = 50

export function useNavigationHistory(
  currentFilePath: Ref<string | null>,
  openFileFromTree: (path: string, pushNav?: (path: string, anchor?: string | null) => void, pendingAnchor?: string | null) => Promise<{ success: boolean }>,
  openFileFromTreeNoHistory: (path: string) => Promise<{ success: boolean }>,
  getHeadingLine: (id: string) => number | undefined,
  editorRef: Ref<{ scrollToLine: (n: number) => void } | undefined>,
  previewRef: Ref<{ getScrollContainer: () => HTMLElement | null } | undefined>,
) {
  const pendingAnchor = ref<string | null>(null)
  const navigationHistory = ref<NavigationState[]>([])
  const navigationIndex = ref<number>(-1)

  const canNavigateBack = computed(() => navigationIndex.value > 0)
  const canNavigateForward = computed(() => navigationIndex.value < navigationHistory.value.length - 1)

  function pushNavigationState(filePath: string, anchor?: string | null) {
    if (navigationIndex.value >= 0 && navigationIndex.value < navigationHistory.value.length - 1) {
      navigationHistory.value = navigationHistory.value.slice(0, navigationIndex.value + 1)
    }
    navigationHistory.value.push({ filePath, anchor: anchor || undefined })
    if (navigationHistory.value.length > MAX_HISTORY_SIZE) {
      navigationHistory.value.shift()
    } else {
      navigationIndex.value++
    }
  }

  function resetNavigation() {
    navigationHistory.value = []
    navigationIndex.value = -1
  }

  async function navigateToFile(filePath: string, anchor?: string) {
    if (!filePath.endsWith('.md')) return
    if (currentFilePath.value) {
      if (navigationIndex.value >= 0) {
        navigationHistory.value[navigationIndex.value].anchor = pendingAnchor.value || undefined
      }
    }
    pendingAnchor.value = anchor || null
    if (currentFilePath.value === filePath) {
      if (anchor) {
        await nextTick()
        scrollToAnchor(anchor)
        if (navigationIndex.value >= 0) {
          navigationHistory.value[navigationIndex.value].anchor = anchor
        }
      }
      return
    }
    await openFileFromTree(filePath, pushNavigationState, pendingAnchor.value)
    await handlePendingAnchor()
  }

  async function navigateToAnchor(anchor: string) {
    if (!currentFilePath.value) return
    const lineNumber = getHeadingLine(anchor)
    if (lineNumber !== undefined && editorRef.value) {
      editorRef.value.scrollToLine(lineNumber)
    }
    if (navigationIndex.value >= 0) {
      navigationHistory.value[navigationIndex.value].anchor = pendingAnchor.value || undefined
    }
    pushNavigationState(currentFilePath.value, anchor)
    pendingAnchor.value = anchor
  }

  async function navigateBack() {
    if (!canNavigateBack.value) return
    if (navigationIndex.value >= 0 && pendingAnchor.value) {
      navigationHistory.value[navigationIndex.value].anchor = pendingAnchor.value
    }
    navigationIndex.value--
    const state = navigationHistory.value[navigationIndex.value]
    if (currentFilePath.value === state.filePath) {
      pendingAnchor.value = state.anchor || null
      if (state.anchor) {
        await nextTick()
        scrollToAnchor(state.anchor)
      }
      return
    }
    pendingAnchor.value = state.anchor || null
    await openFileFromTreeNoHistory(state.filePath)
    await handlePendingAnchor()
  }

  async function navigateForward() {
    if (!canNavigateForward.value) return
    if (navigationIndex.value >= 0 && pendingAnchor.value) {
      navigationHistory.value[navigationIndex.value].anchor = pendingAnchor.value
    }
    navigationIndex.value++
    const state = navigationHistory.value[navigationIndex.value]
    if (currentFilePath.value === state.filePath) {
      pendingAnchor.value = state.anchor || null
      if (state.anchor) {
        await nextTick()
        scrollToAnchor(state.anchor)
      }
      return
    }
    pendingAnchor.value = state.anchor || null
    await openFileFromTreeNoHistory(state.filePath)
    await handlePendingAnchor()
  }

  async function handlePendingAnchor() {
    if (pendingAnchor.value) {
      const anchor = pendingAnchor.value
      pendingAnchor.value = null
      await nextTick()
      setTimeout(() => scrollToAnchor(anchor), 500)
    } else {
      await nextTick()
      setTimeout(() => {
        const scrollContainer = previewRef.value?.getScrollContainer()
        if (scrollContainer) scrollContainer.scrollTop = 0
      }, 100)
    }
  }

  function scrollToAnchor(anchor: string) {
    if (!previewRef.value) return
    const previewContainer = previewRef.value.getScrollContainer()
    if (!previewContainer) return

    let targetElement: Element | null = null
    let decodedAnchor = anchor
    try { decodedAnchor = decodeURIComponent(anchor) } catch { /* keep original */ }

    const slugifiedAnchor = slugifyForMkdocs(decodedAnchor)

    targetElement = previewContainer.querySelector(`#${CSS.escape(slugifiedAnchor)}`)
    if (!targetElement) {
      targetElement = previewContainer.querySelector(`[id="${slugifiedAnchor}"]`)
    }

    if (!targetElement) {
      const numberedIdPatterns = [
        `^[0-9]+-${slugifiedAnchor}$`,
        `^[0-9]+-[0-9]+-${slugifiedAnchor}$`,
        `^[0-9]+-[0-9]+-[0-9]+-${slugifiedAnchor}$`
      ]
      const headings = previewContainer.querySelectorAll('h1, h2, h3, h4, h5, h6')
      for (const heading of headings) {
        const id = heading.getAttribute('id')
        if (id) {
          for (const pattern of numberedIdPatterns) {
            if (new RegExp(pattern).test(id)) { targetElement = heading; break }
          }
          if (targetElement) break
          if (id.endsWith(`-${slugifiedAnchor}`) || id === slugifiedAnchor) {
            targetElement = heading; break
          }
        }
      }
    }

    if (!targetElement) {
      const headings = previewContainer.querySelectorAll('h1, h2, h3, h4, h5, h6')
      for (const heading of headings) {
        const text = heading.textContent?.trim() || ''
        if (slugifyForMkdocs(text) === slugifiedAnchor) {
          targetElement = heading; break
        }
      }
    }

    if (targetElement) {
      const headingId = targetElement.getAttribute('id')
      if (headingId) {
        const lineNumber = getHeadingLine(headingId)
        if (lineNumber !== undefined && editorRef.value) {
          editorRef.value.scrollToLine(lineNumber)
        }
      }
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      console.log('跳转到锚点:', slugifiedAnchor)
    } else {
      console.warn('未找到锚点:', anchor, 'decoded:', decodedAnchor, 'slugified:', slugifiedAnchor)
    }
  }

  return {
    pendingAnchor,
    navigationHistory,
    navigationIndex,
    canNavigateBack,
    canNavigateForward,
    pushNavigationState,
    resetNavigation,
    navigateToFile,
    navigateToAnchor,
    navigateBack,
    navigateForward,
    scrollToAnchor,
    handlePendingAnchor,
  }
}
