import { describe, it, expect } from 'vitest'
import { extractH1Title, findMkdocsYmlPath } from './useFileManagement'

describe('extractH1Title', () => {
  it('应提取第一个 h1 标题', () => {
    expect(extractH1Title('# 文档标题\n\n内容')).toBe('文档标题')
  })

  it('应提取含空格的标题', () => {
    expect(extractH1Title('#  Getting Started  \n\n## Section')).toBe('Getting Started')
  })

  it('无 h1 时应返回 null', () => {
    expect(extractH1Title('## 二级标题\n\n内容')).toBeNull()
  })

  it('只有 h1 格式但实际是 h2 时应返回 null', () => {
    expect(extractH1Title('## 这不是 h1')).toBeNull()
  })

  it('应处理 YAML frontmatter 后的 h1', () => {
    const md = `---
title: test
---

# 真实标题
内容`
    expect(extractH1Title(md)).toBe('真实标题')
  })

  it('应只提取第一个 h1', () => {
    const md = `# 第一个标题
# 第二个标题`
    expect(extractH1Title(md)).toBe('第一个标题')
  })

  it('空内容应返回 null', () => {
    expect(extractH1Title('')).toBeNull()
  })

  it('应提取中文标题', () => {
    expect(extractH1Title('# 中文文档标题')).toBe('中文文档标题')
  })
})

describe('findMkdocsYmlPath', () => {
  it('应返回 docs 上级目录的 mkdocs.yml', () => {
    expect(findMkdocsYmlPath('/project/docs')).toBe('/project/mkdocs.yml')
  })

  it('Windows 路径也应正确', () => {
    expect(findMkdocsYmlPath('C:\\project\\docs')).toBe('C:/project/mkdocs.yml')
  })

  it('docs 目录包含子文件夹时返回子文件夹上一级的 mkdocs.yml', () => {
    expect(findMkdocsYmlPath('/project/docs/subdir')).toBe('/project/docs/mkdocs.yml')
  })

  it('根目录 docs 应返回 null', () => {
    expect(findMkdocsYmlPath('/docs')).toBeNull()
  })

  it('只有 docs 没有上级目录时应返回 null', () => {
    expect(findMkdocsYmlPath('docs')).toBeNull()
  })
})
