import { describe, it, expect, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { useSearch } from './useSearch'
import type { MdFile } from '../types'

// ── Helpers ──────────────────────────────────────────

function makeMdFiles(): Ref<MdFile[]> {
  return ref([
    { name: 'doc1', path: '/a/doc1.md' },
    { name: 'doc2', path: '/a/doc2.md' },
    { name: 'sub', isFolder: true, children: [
      { name: 'doc3', path: '/a/sub/doc3.md' },
    ]},
  ]) as any
}

function makePreviewRef() {
  return ref({
    highlightSearchResults: vi.fn(() => []),
    jumpToSearchResult: vi.fn(),
    clearSearchHighlights: vi.fn(),
    getSearchIndex: () => 0,
    getSearchTotal: () => 0,
  }) as any
}

function makeEditorRef() {
  return ref({
    highlightSearchResults: vi.fn(() => []),
    jumpToSearchResult: vi.fn(),
    clearSearchHighlights: vi.fn(),
    getSearchIndex: () => 0,
    getSearchTotal: () => 0,
  }) as any
}

function makeSidebarRef() {
  return ref({ updateResults: vi.fn() }) as any
}

// ── Tests ────────────────────────────────────────────

describe('useSearch', () => {
  describe('globalTotalMatches', () => {
    it('空结果时应返回 0', () => {
      const search = useSearch(ref([]), ref(null), vi.fn() as any, makePreviewRef(), makeEditorRef(), makeSidebarRef())
      expect(search.globalTotalMatches.value).toBe(0)
    })
  })

  describe('handleSearchClear', () => {
    it('应重置所有搜索状态', () => {
      const search = useSearch(makeMdFiles(), ref('/a/doc1.md'), vi.fn() as any, makePreviewRef(), makeEditorRef(), makeSidebarRef())
      search.globalSearchText.value = 'test'
      search.globalSearchMode.value = 'global'
      search.globalCurrentIndex.value = 5
      search.globalSearchResults.value = [{ path: '/a/doc1.md', matches: 3 }]

      search.handleSearchClear()

      expect(search.globalSearchText.value).toBe('')
      expect(search.globalSearchResults.value).toEqual([])
      expect(search.globalSearchMode.value).toBe('current')
      expect(search.globalCurrentIndex.value).toBe(-1)
    })
  })

  describe('handleSearch (current file mode)', () => {
    it('无匹配时应更新 sidebarRef 为 0/-1', async () => {
      const previewRef = makePreviewRef()
      const sidebarRef = makeSidebarRef()
      const search = useSearch(makeMdFiles(), ref('/a/doc1.md'), vi.fn() as any, previewRef, makeEditorRef(), sidebarRef)

      await search.handleSearch('no-match-text', 'current')

      expect(sidebarRef.value.updateResults).toHaveBeenCalledWith(0, -1)
    })

    it('有匹配时应跳转到第一个结果', async () => {
      const previewRef = makePreviewRef()
      previewRef.value.highlightSearchResults = vi.fn(() => ['match1', 'match2'])
      const sidebarRef = makeSidebarRef()
      const search = useSearch(makeMdFiles(), ref('/a/doc1.md'), vi.fn() as any, previewRef, makeEditorRef(), sidebarRef)

      await search.handleSearch('text', 'current')

      expect(previewRef.value.jumpToSearchResult).toHaveBeenCalledWith(0)
      expect(sidebarRef.value.updateResults).toHaveBeenCalledWith(2, 0)
    })
  })
})
