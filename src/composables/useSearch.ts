import { ref, computed, nextTick, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { MdFile } from '../types'

interface GlobalSearchResult {
  path: string
  matches: number
  context?: string
}

interface SearchTarget {
  highlightSearchResults: (t: string) => any[]
  jumpToSearchResult: (d: number) => void
  clearSearchHighlights: () => void
  getSearchIndex: () => number
  getSearchTotal: () => number
}

export function useSearch(
  mdFiles: Ref<MdFile[]>,
  currentFilePath: Ref<string | null>,
  openFileFromTree: (path: string, pushNav?: (path: string, anchor?: string | null) => void, pendingAnchor?: string | null) => Promise<{ success: boolean }>,
  previewRef: Ref<SearchTarget | undefined>,
  editorRef: Ref<SearchTarget | undefined>,
  sidebarRef: Ref<{ updateResults: (t: number, i: number) => void } | undefined>,
  _pushNav?: (path: string) => void,
) {
  const globalSearchText = ref('')
  const globalSearchMode = ref<'current' | 'global'>('current')
  const globalCurrentIndex = ref(-1)
  const globalSearchResults = ref<GlobalSearchResult[]>([])

  const globalTotalMatches = computed(() => {
    return globalSearchResults.value.reduce((sum, r) => sum + r.matches, 0)
  })

  function countMatches(content: string, text: string): number {
    let count = 0
    let index = content.indexOf(text)
    while (index >= 0) {
      count++
      index = content.indexOf(text, index + text.length)
    }
    return count
  }

  function extractContext(content: string, text: string): string {
    const index = content.indexOf(text)
    if (index < 0) return ''
    const start = Math.max(0, index - 50)
    const end = Math.min(content.length, index + text.length + 50)
    let context = content.substring(start, end)
    if (start > 0) context = '...' + context
    if (end < content.length) context = context + '...'
    return context.replace(/\n/g, ' ').trim()
  }

  async function searchInAllFiles(text: string, files: MdFile[]): Promise<GlobalSearchResult[]> {
    const results: GlobalSearchResult[] = []
    for (const file of files) {
      if (file.isFolder && file.children) {
        const subResults = await searchInAllFiles(text, file.children)
        results.push(...subResults)
      } else if (file.path) {
        try {
          const [fileContent] = await invoke<[string, string]>('read_file_with_encoding', { path: file.path })
          const matches = countMatches(fileContent, text)
          if (matches > 0) {
            const context = extractContext(fileContent, text)
            results.push({ path: file.path, matches, context })
          }
        } catch { /* skip unreadable files */ }
      }
    }
    return results
  }

  function findFileForGlobalIndex(globalIndex: number): { path: string; localIndex: number } | null {
    let cumulative = 0
    for (const result of globalSearchResults.value) {
      if (cumulative + result.matches > globalIndex) {
        return { path: result.path, localIndex: globalIndex - cumulative }
      }
      cumulative += result.matches
    }
    return null
  }

  let visibleTarget: 'preview' | 'editor' = 'preview'

  function getCurrentTarget(): SearchTarget | undefined {
    // 预览可见时优先使用预览，否则使用编辑器
    if (visibleTarget === 'preview' && previewRef.value) return previewRef.value
    if (editorRef.value) return editorRef.value
    return previewRef.value || editorRef.value
  }

  async function handleSearch(text: string, mode: 'current' | 'global') {
    globalSearchMode.value = mode
    if (mode === 'global') {
      globalSearchText.value = text
      globalSearchResults.value = await searchInAllFiles(text, mdFiles.value)
      globalCurrentIndex.value = globalTotalMatches.value > 0 ? 0 : -1
      sidebarRef.value?.updateResults(globalTotalMatches.value, globalCurrentIndex.value)
    } else {
      // 同时在预览区和编辑器搜索高亮
      let total = 0
      if (previewRef.value) {
        const highlights = previewRef.value.highlightSearchResults(text)
        total = highlights.length
      }
      if (editorRef.value) {
        const editorHighlights = editorRef.value.highlightSearchResults(text)
        if (editorHighlights.length > 0 && !previewRef.value) {
          total = editorHighlights.length
        }
      }
      if (total > 0) {
        const target = getCurrentTarget()
        target?.jumpToSearchResult(0)
        sidebarRef.value?.updateResults(total, 0)
      } else {
        sidebarRef.value?.updateResults(0, -1)
      }
    }
  }

  async function handleSearchJump(direction: 'prev' | 'next') {
    if (globalSearchMode.value === 'global') {
      if (globalTotalMatches.value === 0) return
      let newGlobalIndex = globalCurrentIndex.value + (direction === 'next' ? 1 : -1)
      if (newGlobalIndex < 0) newGlobalIndex = globalTotalMatches.value - 1
      else if (newGlobalIndex >= globalTotalMatches.value) newGlobalIndex = 0
      globalCurrentIndex.value = newGlobalIndex

      const target = findFileForGlobalIndex(newGlobalIndex)
      if (!target) return

      const currentPath = currentFilePath.value
      if (currentPath !== target.path) {
        await openFileFromTree(target.path)
        setTimeout(() => {
          if (previewRef.value && globalSearchText.value) {
            previewRef.value.highlightSearchResults(globalSearchText.value)
            previewRef.value.jumpToSearchResult(target.localIndex)
          }
        }, 300)
      } else {
        const t = getCurrentTarget()
        if (t) t.jumpToSearchResult(direction === 'next' ? 1 : -1)
      }
      sidebarRef.value?.updateResults(globalTotalMatches.value, globalCurrentIndex.value)
    } else {
      // 同时在预览和编辑器中跳转
      if (previewRef.value) previewRef.value.jumpToSearchResult(direction === 'prev' ? -1 : 1)
      if (editorRef.value) editorRef.value.jumpToSearchResult(direction === 'prev' ? -1 : 1)
      const target = getCurrentTarget()
      if (target) {
        sidebarRef.value?.updateResults(target.getSearchTotal(), target.getSearchIndex())
      }
    }
  }

  function handleSearchClear() {
    if (previewRef.value) previewRef.value.clearSearchHighlights()
    if (editorRef.value) editorRef.value.clearSearchHighlights()
    globalSearchText.value = ''
    globalSearchResults.value = []
    globalSearchMode.value = 'current'
    globalCurrentIndex.value = -1
  }

  function setSearchTarget(target: 'preview' | 'editor') {
    visibleTarget = target
  }

  async function handleSearchResultSelect(path: string) {
    let startIndex = 0
    for (const result of globalSearchResults.value) {
      if (result.path === path) break
      startIndex += result.matches
    }
    await openFileFromTree(path)
    globalCurrentIndex.value = startIndex
    await nextTick()
    setTimeout(() => {
      if (previewRef.value && globalSearchText.value) {
        const highlights = previewRef.value.highlightSearchResults(globalSearchText.value)
        if (highlights.length > 0) previewRef.value.jumpToSearchResult(0)
        sidebarRef.value?.updateResults(globalTotalMatches.value, globalCurrentIndex.value)
      }
    }, 300)
  }

  return {
    globalSearchText,
    globalSearchMode,
    globalCurrentIndex,
    globalSearchResults,
    globalTotalMatches,
    handleSearch,
    handleSearchJump,
    handleSearchClear,
    handleSearchResultSelect,
    setSearchTarget,
  }
}
