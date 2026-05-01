import { describe, it, expect } from 'vitest'
import { extractH1TitleFromContent, collectNavChapters, resetChapterCounters } from './useMkdocsExport'
import type { MdFile } from '../types'

describe('extractH1TitleFromContent', () => {
  it('应提取第一个 h1 标题', () => {
    expect(extractH1TitleFromContent('# 文档标题\n\n内容')).toBe('文档标题')
  })

  it('无 h1 时应返回 undefined', () => {
    expect(extractH1TitleFromContent('## 二级标题\n\n内容')).toBeUndefined()
  })

  it('应忽略 frontmatter 后的 h1', () => {
    const md = `---
title: test
---
# 真实标题\n内容`
    expect(extractH1TitleFromContent(md)).toBe('真实标题')
  })

  it('空内容应返回 undefined', () => {
    expect(extractH1TitleFromContent('')).toBeUndefined()
  })

  it('应去除标题首尾空格', () => {
    expect(extractH1TitleFromContent('#   含空格标题   ')).toBe('含空格标题')
  })

  it('应提取英文标题', () => {
    expect(extractH1TitleFromContent('# Getting Started')).toBe('Getting Started')
  })
})

describe('collectNavChapters', () => {
  it('应收集单层 nav 结构', () => {
    resetChapterCounters()
    const nav: MdFile[] = [
      { name: 'Home', path: '/docs/index.md', hasExplicitTitle: true },
      { name: 'Guide', path: '/docs/guide.md', hasExplicitTitle: true },
    ]
    const chapters = collectNavChapters(nav, '/docs', 0, '')
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('Home')
    expect(chapters[0].chapterNumber).toBe('1')
    expect(chapters[0].numberPrefix).toBe('1.')
    expect(chapters[0].navLevel).toBe(0)
    expect(chapters[1].title).toBe('Guide')
    expect(chapters[1].chapterNumber).toBe('2')
    expect(chapters[1].numberPrefix).toBe('2.')
  })

  it('应收集嵌套 nav 结构（多层级）', () => {
    resetChapterCounters()
    const nav: MdFile[] = [
      {
        name: 'Section', isFolder: true, hasExplicitTitle: true,
        children: [
          { name: 'Page1', path: '/docs/section/page1.md' },
          { name: 'Page2', path: '/docs/section/page2.md' },
        ],
      },
    ]
    const chapters = collectNavChapters(nav, '/docs', 0, '')
    expect(chapters).toHaveLength(3) // Section (virtual folder) + 2 pages
    expect(chapters[0].title).toBe('Section')
    expect(chapters[0].chapterNumber).toBe('1')
    // 子条目无 hasExplicitTitle 时 title 为 ''，fallbackTitle 为文件名
    expect(chapters[1].title).toBe('')
    expect(chapters[1].fallbackTitle).toBe('page1')
    expect(chapters[1].chapterNumber).toBe('1.1')
    expect(chapters[1].navLevel).toBe(1)
    expect(chapters[2].title).toBe('')
    expect(chapters[2].fallbackTitle).toBe('page2')
    expect(chapters[2].chapterNumber).toBe('1.2')
  })

  it('应处理三级嵌套', () => {
    resetChapterCounters()
    const nav: MdFile[] = [
      {
        name: 'Ch1', isFolder: true, hasExplicitTitle: true,
        children: [
          {
            name: 'Sub1', isFolder: true,
            children: [
              { name: 'Page', path: '/docs/ch1/sub1/page.md' },
            ],
          },
        ],
      },
    ]
    const chapters = collectNavChapters(nav, '/docs', 0, '')
    expect(chapters).toHaveLength(3)
    expect(chapters[0].chapterNumber).toBe('1')
    expect(chapters[1].chapterNumber).toBe('1.1')
    expect(chapters[2].chapterNumber).toBe('1.1.1')
  })

  it('应处理多个顶层条目且编号连续', () => {
    resetChapterCounters()
    const nav: MdFile[] = [
      { name: 'A', path: '/docs/a.md' },
      { name: 'B', path: '/docs/b.md' },
      { name: 'C', path: '/docs/c.md' },
    ]
    const chapters = collectNavChapters(nav, '/docs', 0, '')
    expect(chapters[0].chapterNumber).toBe('1')
    expect(chapters[1].chapterNumber).toBe('2')
    expect(chapters[2].chapterNumber).toBe('3')
  })

  it('应处理 nav 中无显式标题的条目（使用文件名）', () => {
    resetChapterCounters()
    const nav: MdFile[] = [
      { name: 'index', path: '/docs/index.md', hasExplicitTitle: false },
    ]
    const chapters = collectNavChapters(nav, '/docs', 0, '')
    // hasExplicitTitle: false → title 为 ''，fallbackTitle 为文件名
    expect(chapters[0].title).toBe('')
    expect(chapters[0].fallbackTitle).toBe('index')
  })

  it('空 nav 应返回空数组', () => {
    resetChapterCounters()
    expect(collectNavChapters([], '/docs', 0, '')).toEqual([])
  })

  it('resetChapterCounters 应重置编号从 1 开始', () => {
    // First call
    resetChapterCounters()
    const r1 = collectNavChapters([{ name: 'X', path: '/x.md' }], '/', 0, '')
    expect(r1[0].chapterNumber).toBe('1')

    // Second call with reset
    resetChapterCounters()
    const r2 = collectNavChapters([{ name: 'Y', path: '/y.md' }], '/', 0, '')
    expect(r2[0].chapterNumber).toBe('1')
  })

  it('应正确设置 filePath 和 htmlId', () => {
    resetChapterCounters()
    const nav: MdFile[] = [
      {
        name: 'Getting Started', path: '/docs/getting-started.md', hasExplicitTitle: true,
      },
    ]
    const chapters = collectNavChapters(nav, '/docs', 0, '')
    expect(chapters[0].filePath).toBe('/docs/getting-started.md')
  })
})
