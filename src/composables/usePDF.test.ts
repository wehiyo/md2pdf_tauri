import { describe, it, expect } from 'vitest'
import { getChineseFontCss, getEnglishFontCss, getCodeFontCss, getMarkdownStyles } from './usePDF'
import type { FontConfig } from './useConfig'

describe('getChineseFontCss', () => {
  it('应返回映射值', () => {
    expect(getChineseFontCss('DengXian')).toBe("'DengXian'")
    expect(getChineseFontCss('SourceHanSans')).toBe("'SourceHanSans'")
    expect(getChineseFontCss('SimSun')).toBe("'SimSun'")
    expect(getChineseFontCss('FangSong')).toBe("'FangSong'")
  })

  it('未知字体应回退到 ID 本身', () => {
    expect(getChineseFontCss('UnknownFont')).toBe("'UnknownFont'")
  })
})

describe('getEnglishFontCss', () => {
  it('应返回映射值', () => {
    expect(getEnglishFontCss('Arial')).toBe("'Arial'")
    expect(getEnglishFontCss('TimesNewRoman')).toBe("'Times New Roman'")
    expect(getEnglishFontCss('Verdana')).toBe("'Verdana'")
  })

  it('未知字体应回退到 ID 本身', () => {
    expect(getEnglishFontCss('Roboto')).toBe("'Roboto'")
  })
})

describe('getCodeFontCss', () => {
  it('应返回映射值（含 monospace 回退）', () => {
    expect(getCodeFontCss('SourceCodePro')).toBe("'SourceCodePro', 'Consolas', monospace")
    expect(getCodeFontCss('Consolas')).toBe("'Consolas', monospace")
    expect(getCodeFontCss('CourierNew')).toBe("'Courier New', monospace")
  })

  it('未知字体应回退到 ID + monospace', () => {
    expect(getCodeFontCss('FiraCode')).toBe("'FiraCode', monospace")
  })
})

describe('getMarkdownStyles', () => {
  const defaultConfig: FontConfig = {
    chineseFont: 'DengXian',
    englishFont: 'Arial',
    codeFont: 'SourceCodePro',
    bodyFontSize: 16,
    chineseCustomFonts: [],
    englishCustomFonts: [],
    codeCustomFonts: [],
    lineHeight: 1.6,
    paragraphSpacing: 1,
    previewWidth: 900,
    previewBackgroundColor: '#ffffff',
    pageSize: 'A4',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
  }

  it('应生成 pt 格式样式（默认 PDF 模式）', () => {
    const css = getMarkdownStyles(defaultConfig)
    // Font size: 16 * 0.75 = 12pt
    expect(css).toContain('font-size: 12pt')
    expect(css).toContain("font-family: 'Arial', 'DengXian', sans-serif")
    expect(css).toContain('line-height: 1.6')
    // PDF break rules
    expect(css).toContain('break-inside: auto')
    expect(css).toContain('table-header-group')
  })

  it('应生成 px 格式样式（HTML 模式）', () => {
    const css = getMarkdownStyles(defaultConfig, 'px')
    expect(css).toContain('font-size: 16px')
    expect(css).not.toContain('table-header-group')
    // HTML extras
    expect(css).toContain('figure-span')
  })

  it('应使用自定义字体配置', () => {
    const css = getMarkdownStyles({
      ...defaultConfig,
      chineseFont: 'SimSun',
      englishFont: 'Georgia',
      codeFont: 'Consolas',
      lineHeight: 1.8,
      paragraphSpacing: 1.5,
    })
    expect(css).toContain("font-family: 'Georgia', 'SimSun', sans-serif")
    expect(css).toContain("'Consolas', monospace")
    expect(css).toContain('line-height: 1.8')
    expect(css).toContain('margin-bottom: 1.5em')
  })

  it('应包含 admonition 样式', () => {
    const css = getMarkdownStyles(defaultConfig)
    expect(css).toContain('.admonition')
    expect(css).toContain('.admonition.note')
    expect(css).toContain('.admonition.warning')
    expect(css).toContain('admonition-title')
  })

  it('应包含 tabbed 标签页样式', () => {
    const css = getMarkdownStyles(defaultConfig)
    expect(css).toContain('.tabbed-set')
    expect(css).toContain('.tabbed-block')
    expect(css).toContain('.tabbed-block-title')
  })

  it('应包含代码行号容器样式', () => {
    const css = getMarkdownStyles(defaultConfig)
    expect(css).toContain('.code-lines-container')
    expect(css).toContain('.line-number')
    expect(css).toContain('line-num-width-1')
    expect(css).toContain('line-num-width-5')
  })

  it('应包含图片浮动样式', () => {
    const css = getMarkdownStyles(defaultConfig)
    expect(css).toContain('.img-float-left')
    expect(css).toContain('.img-float-right')
  })

  it('应包含 heading-number 样式', () => {
    const css = getMarkdownStyles(defaultConfig)
    expect(css).toContain('.heading-number')
  })

  it('空 fontConfig 应使用默认值', () => {
    const css = getMarkdownStyles()
    // Default bodyFontSize 16 * 0.75 = 12pt
    expect(css).toContain('font-size: 12pt')
    expect(css).toContain("'DengXian'")
    expect(css).toContain("'Arial'")
  })
})
