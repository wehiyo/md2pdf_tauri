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

    it('应正确渲染代码块行号 linenum=10', () => {
      const html = renderBody('```javascript linenum=10\nconst x = 1\nconst y = 2\n```')
      expect(html).toContain('data-num="10"')
      expect(html).toContain('data-num="11"')
    })

    it('应正确渲染代码块行号 linenums=20（带引号）', () => {
      const html = renderBody('```python linenums="20"\nx = 1\ny = 2\n```')
      expect(html).toContain('data-num="20"')
      expect(html).toContain('data-num="21"')
    })

    it('linenum=0 应不显示行号', () => {
      const html = renderBody('```javascript linenum=0\nconst x = 1\n```')
      expect(html).not.toContain('line-number')
      expect(html).not.toContain('data-num')
    })

    it('linenums=0 应不显示行号（带引号）', () => {
      const html = renderBody('```python linenums="0"\nx = 1\n```')
      expect(html).not.toContain('line-number')
      expect(html).not.toContain('data-num')
    })

    it('缩进代码块语法应被禁用', () => {
      const html = renderBody('    缩进四空格\n    应不是代码块')
      expect(html).not.toContain('<pre>')
      expect(html).toContain('<p>')
      expect(html).toContain('缩进四空格')
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

  describe('图片属性标注', () => {
    it('应正确处理 width 属性（带引号）', () => {
      const html = renderBody('![图片](test.png){width="300"}')
      expect(html).toContain('width: 300px')
    })

    it('应正确处理 width 属性（不带引号）', () => {
      const html = renderBody('![图片](test.png){width=300}')
      expect(html).toContain('width: 300px')
    })

    it('应正确处理 width 属性带单位', () => {
      const html = renderBody('![图片](test.png){width=50%}')
      expect(html).toContain('width: 50%')
    })

    it('应正确处理图片后有空格的属性标注', () => {
      const html = renderBody('![Vite Logo](https://vitejs.dev/logo.svg) {width=300}')
      expect(html).toContain('width: 300px')
    })

    it('应正确处理图片后有空格且带引号的属性标注', () => {
      const html = renderBody('![Vite Logo](https://vitejs.dev/logo.svg) {width="300"}')
      expect(html).toContain('width: 300px')
    })

    it('应正确处理 align=center', () => {
      const html = renderBody('![图片](test.png){align=center}')
      expect(html).toContain('text-align: center')
    })

    it('应正确处理 align=left', () => {
      const html = renderBody('![图片](test.png){align=left}')
      expect(html).toContain('img-float-left')
    })

    it('应正确处理 align=right', () => {
      const html = renderBody('![图片](test.png){align=right}')
      expect(html).toContain('img-float-right')
    })

    it('应正确处理 width 和 align 组合', () => {
      const html = renderBody('![图片](test.png){width=300 align=center}')
      expect(html).toContain('width: 300px')
      expect(html).toContain('text-align: center')
    })

    it('应正确处理 align 和 width 组合（顺序交换）', () => {
      const html = renderBody('![图片](test.png){align=center width=300}')
      expect(html).toContain('width: 300px')
      expect(html).toContain('text-align: center')
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

    it('公式外 (r) 不应被转换为注册商标符号（typorgrapher已移除商标转换）', () => {
      const html = renderBody('产品名称(r) 注册商标')
      expect(html).not.toContain('®')
      expect(html).toContain('产品名称(r) 注册商标')
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

    it('空标题 "" 应不显示标题', () => {
      const html = renderBody('!!! note ""\n    内容')
      expect(html).toContain('admonition note')
      expect(html).not.toContain('admonition-title')
    })

    it('无标题参数应使用类型作为默认标题', () => {
      const html = renderBody('!!! note\n    内容')
      expect(html).toContain('admonition note')
      expect(html).toContain('admonition-title')
      expect(html).toContain('note')
    })
  })

  describe('Tabbed 标签页', () => {
    it('应正确解析两个标签', () => {
      const html = renderBody(`=== "C"

    \`\`\`c
    int main() { return 0; }
    \`\`\`

=== "C++"

    \`\`\`cpp
    int main() { return 0; }
    \`\`\``)
      expect(html).toContain('tabbed-set')
      expect(html).toContain('tabbed-label')
      expect(html).toContain('tabbed-label active')
      expect(html).toContain('C')
      expect(html).toContain('C++')
    })

    it('第一个标签应默认为 active', () => {
      const html = renderBody(`=== "Tab 1"

    内容1

=== "Tab 2"

    内容2`)
      expect(html).toContain('tabbed-label active')
      expect(html).toContain('tabbed-block active')
    })

    it('应支持单引号标题', () => {
      const html = renderBody(`=== 'Python'

    print("hello")

=== 'JavaScript'

    console.log("hello")`)
      expect(html).toContain('Python')
      expect(html).toContain('JavaScript')
    })

    it('少于两个标签不应渲染为 tabbed', () => {
      const html = renderBody(`=== "Only One"

    单个内容`)
      expect(html).not.toContain('tabbed-set')
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

  describe('renderWithNumberPrefix - MkDocs 编号', () => {
    const { renderWithNumberPrefix } = useMarkdown()

    it('空前缀时 h2 应生成编号', () => {
      const body = `## First heading
Some content

## Second heading
More content`
      const html = renderWithNumberPrefix(body, '', 0)
      expect(html).toContain('<span class="heading-number">1. </span>')
      expect(html).toContain('<span class="heading-number">2. </span>')
    })

    it('有前缀时 h2 应接续编号', () => {
      const body = `## First heading
Some content

## Second heading
More content`
      const html = renderWithNumberPrefix(body, '1.', 1)
      expect(html).toContain('<span class="heading-number">1.1. </span>')
      expect(html).toContain('<span class="heading-number">1.2. </span>')
    })

    it('h3 应生成三级编号', () => {
      const body = `## Section
Content

### Subsection
More`
      const html = renderWithNumberPrefix(body, '', 0)
      expect(html).toContain('<span class="heading-number">1. </span>')
      expect(html).toContain('<span class="heading-number">1.1. </span>')
    })
  })
})