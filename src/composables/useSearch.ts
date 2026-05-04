import { ref, computed, nextTick, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { MdFile } from '../types'

interface GlobalSearchResult {
  path: string
  matches: number
  context?: string
}

export type SearchMode = 'case-sensitive' | 'whole-word' | 'regex'

export interface SearchOptions {
  text: string
  mode: SearchMode
}

export function buildRegex(options: SearchOptions): RegExp | null {
  try {
    let pattern = options.text
    if (options.mode === 'whole-word') {
      pattern = `\\b${escapeRegex(options.text)}\\b`
    } else if (options.mode === 'case-sensitive') {
      pattern = escapeRegex(options.text)
    }
    // regex mode: use raw text as pattern
    return new RegExp(pattern, options.mode === 'case-sensitive' ? 'gi' : 'gi')
  } catch {
    return null
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface SearchTarget {
  highlightSearchResults: (options: SearchOptions) => any[]
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

  function countMatches(content: string, options: SearchOptions): number {
    const re = buildRegex(options)
    if (!re) return 0
    return (content.match(re) || []).length
  }

  function extractContext(content: string, options: SearchOptions): string {
    const re = buildRegex(options)
    if (!re) return ''
    const match = re.exec(content)
    if (!match) return ''
    const index = match.index
    const len = match[0].length
    const start = Math.max(0, index - 50)
    const end = Math.min(content.length, index + len + 50)
    let context = content.substring(start, end)
    if (start > 0) context = '...' + context
    if (end < content.length) context = context + '...'
    return context.replace(/\n/g, ' ').trim()
  }

  async function searchInAllFiles(options: SearchOptions, files: MdFile[]): Promise<GlobalSearchResult[]> {
    const results: GlobalSearchResult[] = []
    for (const file of files) {
      if (file.isFolder && file.children) {
        const subResults = await searchInAllFiles(options, file.children)
        results.push(...subResults)
      } else if (file.path) {
        try {
          const [fileContent] = await invoke<[string, string]>('read_file_with_encoding', { path: file.path })
          const matches = countMatches(fileContent, options)
          if (matches > 0) {
            const context = extractContext(fileContent, options)
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

  const searchOptions = ref<SearchOptions>({ text: '', mode: 'case-sensitive' })

  async function handleSearch(text: string, mode: 'current' | 'global', matchMode: SearchMode = 'case-sensitive') {
    globalSearchMode.value = mode
    const options: SearchOptions = { text, mode: matchMode }
    searchOptions.value = options
    if (mode === 'global') {
      globalSearchText.value = text
      globalSearchResults.value = await searchInAllFiles(options, mdFiles.value)
      globalCurrentIndex.value = globalTotalMatches.value > 0 ? 0 : -1
      sidebarRef.value?.updateResults(globalTotalMatches.value, globalCurrentIndex.value)
    } else {
      let total = 0
      if (previewRef.value) {
        const highlights = previewRef.value.highlightSearchResults(options)
        total = highlights.length
      }
      if (editorRef.value) {
        const editorHighlights = editorRef.value.highlightSearchResults(options)
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
          if (previewRef.value && searchOptions.value.text) {
            previewRef.value.highlightSearchResults(searchOptions.value)
            previewRef.value.jumpToSearchResult(target.localIndex)
          }
        }, 300)
      } else {
        const t = getCurrentTarget()
        if (t) t.jumpToSearchResult(direction === 'next' ? 1 : -1)
      }
      sidebarRef.value?.updateResults(globalTotalMatches.value, globalCurrentIndex.value)
    } else {
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
      if (previewRef.value && searchOptions.value.text) {
        const highlights = previewRef.value.highlightSearchResults(searchOptions.value)
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
