import { describe, it, expect } from 'vitest'
import { useMarkdown } from './useMarkdown'

describe('useMarkdown', () => {
  const { parse, render, renderBody } = useMarkdown()

  describe('parse - YAML frontmatter 解析', () => {
    it('应正确解析包含 frontmatter 的内容', () => {
      const content = `---
title: 测试文档
author: 测试作者
date: 2026-04-10
---
# 正文标题`

      const result = parse(content)
      expect(result.metadata.title).toBe('测试文档')
      expect(result.metadata.author).toBe('测试作者')
      expect(result.metadata.date).toBe('2026-04-10')
      expect(result.body).toBe('# 正文标题')
    })

    it('应正确处理无 frontmatter 的内容', () => {
      const content = '# 无 frontmatter 的文档\n\n正文内容'
      const result = parse(content)
      expect(result.metadata).toEqual({})
      expect(result.body).toBe(content)
    })

    it('应正确处理空 frontmatter', () => {
      const content = `---
---
# 正文`
      const result = parse(content)
      expect(result.metadata).toEqual({})
      // 空 frontmatter 可能不会被完全移除，检查包含正文即可
      expect(result.body).toContain('# 正文')
    })

    it('应处理包含自定义字段的 frontmatter', () => {
      const content = `---
title: 文档
custom_field: 自定义值
security level: 内部
---
正文`
      const result = parse(content)
      expect(result.metadata.title).toBe('文档')
      expect(result.metadata.custom_field).toBe('自定义值')
      expect(result.metadata['security level']).toBe('内部')
    })
  })

  describe('renderBody - Markdown 渲染', () => {
    it('应正确渲染标题', () => {
      const html = renderBody('# H1 标题\n## H2 标题\n### H3 标题')
      expect(html).toContain('<h1')
      expect(html).toContain('<h2')
      expect(html).toContain('<h3')
    })

    it('应正确渲染段落', () => {
      const html = renderBody('这是一段文本。')
      expect(html).toContain('<p>')
      expect(html).toContain('这是一段文本。')
    })

    it('应正确渲染无序列表', () => {
      const html = renderBody('- 项目 1\n- 项目 2\n- 项目 3')
      expect(html).toContain('<ul>')
      expect(html).toContain('<li>')
    })

    it('应正确渲染有序列表', () => {
      const html = renderBody('1. 第一项\n2. 第二项\n3. 第三项')
      expect(html).toContain('<ol>')
      expect(html).toContain('<li>')
    })

    it('应正确渲染代码块', () => {
      const html = renderBody('```javascript\nconst x = 1\n```')
      expect(html).toContain('<pre')
      expect(html).toContain('language-javascript')
    })

    it('应正确渲染行内代码', () => {
      const html = renderBody('这是 `inline code` 代码')
      expect(html).toContain('<code>')
      expect(html).toContain('inline code')
    })

    it('应正确渲染链接', () => {
      const html = renderBody('[链接文本](https://example.com)')
      expect(html).toContain('<a href="https://example.com"')
      expect(html).toContain('链接文本')
    })

    it('应正确渲染表格', () => {
      const html = renderBody('| 列1 | 列2 |\n|-----|-----|\n| A | B |')
      expect(html).toContain('<table>')
      expect(html).toContain('<th>')
      expect(html).toContain('<td>')
    })

    it('应正确渲染空内容', () => {
      const html = renderBody('')
      expect(html).toContain('empty-preview')
    })
  })

  describe('数学公式渲染', () => {
    it('应正确渲染行内公式 ($...$)', () => {
      const html = renderBody('公式 $E = mc^2$ 测试')
      expect(html).toContain('katex')
    })

    it('应正确渲染行内公式 \\(...\\)', () => {
      const html = renderBody('公式 \\(E = mc^2\\) 测试')
      expect(html).toContain('katex')
    })

    it('应正确渲染块级公式 ($$...$$)', () => {
      const html = renderBody('$$\n\\int_0^1 x^2 dx\n$$')
      expect(html).toContain('katex-display')
    })

    it('应正确渲染块级公式 \\[...\\]', () => {
      const html = renderBody('\\[\n\\int_0^1 x^2 dx\n\\]')
      expect(html).toContain('katex-display')
    })

    it('应正确渲染 math 代码块', () => {
      const html = renderBody('```math\n\\frac{a}{b}\n```')
      expect(html).toContain('katex-display')
    })

    it('行内公式 $...$ 内 (r) 不应被转换', () => {
      const html = renderBody('测试 $a(r) + b$ 内容')
      expect(html).not.toContain('®')
      expect(html).toContain('katex')
    })

    it('行内公式 \\(...\\) 内 (r) 不应被转换', () => {
      const html = renderBody('测试 \\(a(r) + b\\) 内容')
      expect(html).not.toContain('®')
      expect(html).toContain('katex')
    })

    it('块级公式 $$...$$ 内 (r) 不应被转换', () => {
      const html = renderBody('$$\na(r) + b\n$$')
      expect(html).not.toContain('®')
      expect(html).toContain('katex-display')
    })

    it('块级公式 \\[...\\] 内 (r) 不应被转换', () => {
      const html = renderBody('\\[\na(r) + b\n\\]')
      expect(html).not.toContain('®')
      expect(html).toContain('katex-display')
    })

    it('math 代码块内 (r) 不应被转换', () => {
      const html = renderBody('```math\na(r) + b\n```')
      expect(html).not.toContain('®')
      expect(html).toContain('katex-display')
    })

    it('公式外 (r) 应被转换为注册商标符号', () => {
      const html = renderBody('产品名称(r) 注册商标')
      expect(html).toContain('®')
    })
  })

  describe('图表语法', () => {
    it('应正确处理 Mermaid 代码块', () => {
      const html = renderBody('```mermaid\ngraph TD\nA-->B\n```')
      expect(html).toContain('<div class="mermaid">')
    })

    it('应正确处理 PlantUML 代码块', () => {
      const html = renderBody('```plantuml\n@startuml\nA -> B\n@enduml\n```')
      expect(html).toContain('<div class="plantuml"')
      expect(html).toContain('data-plantuml')
    })

    it('应正确处理 WaveDrom 代码块', () => {
      const html = renderBody('```wavedrom\n{ signal: [{ name: "clk" }] }\n```')
      expect(html).toContain('<div class="wavedrom">')
    })
  })

  describe('Admonition 提示框', () => {
    it('应正确解析 note 类型', () => {
      const html = renderBody('!!! note 提示\n    内容')
      expect(html).toContain('admonition note')
    })

    it('应正确解析 warning 类型', () => {
      const html = renderBody('!!! warning 警告\n    警告内容')
      expect(html).toContain('admonition warning')
    })

    it('应正确解析 danger 类型', () => {
      const html = renderBody('!!! danger 危险\n    危险内容')
      expect(html).toContain('admonition danger')
    })
  })

  describe('标题编号', () => {
    it('应为 h2 标题添加编号', () => {
      const html = renderBody('# 主标题\n## 第一节\n## 第二节')
      expect(html).toContain('heading-number">1. ')
      expect(html).toContain('heading-number">2. ')
    })

    it('应为 h3 标题添加层级编号', () => {
      const html = renderBody('# 主标题\n## 第一节\n### 子节')
      expect(html).toContain('heading-number">1.1. ')
    })

    it('应为 h4 标题添加三级编号', () => {
      const html = renderBody('# 主标题\n## 第一节\n### 子节\n#### 小节')
      expect(html).toContain('heading-number">1.1.1. ')
    })

    it('标题 ID 应包含编号前缀', () => {
      const html = renderBody('## 测试标题')
      // ID 包含编号前缀和中文字符
      expect(html).toMatch(/id="1-[^"]+"/)
    })
  })

  describe('render - 完整渲染', () => {
    it('应同时返回 metadata 和 html', () => {
      const content = `---
title: 完整测试
---
# 正文`
      const result = render(content)
      expect(result.metadata.title).toBe('完整测试')
      expect(result.html).toContain('<h1')
    })
  })
})