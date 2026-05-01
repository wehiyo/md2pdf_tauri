import { describe, it, expect } from 'vitest'
import { getFontInfo, BUILTIN_CHINESE_FONTS, BUILTIN_CODE_FONTS, PAGE_SIZE_PRESETS } from './useConfig'
import type { CustomFont } from './useConfig'

describe('useConfig', () => {
  describe('PAGE_SIZE_PRESETS', () => {
    it('应包含 A4、B5、Letter 预设', () => {
      expect(PAGE_SIZE_PRESETS).toHaveProperty('A4')
      expect(PAGE_SIZE_PRESETS).toHaveProperty('B5')
      expect(PAGE_SIZE_PRESETS).toHaveProperty('Letter')
    })

    it('A4 尺寸应为 210×297mm', () => {
      expect(PAGE_SIZE_PRESETS.A4).toEqual({ width: 210, height: 297, label: 'A4 (210×297mm)' })
    })
  })

  describe('BUILTIN_CHINESE_FONTS', () => {
    it('应包含等线和思源字体', () => {
      const ids = BUILTIN_CHINESE_FONTS.map(f => f.id)
      expect(ids).toContain('DengXian')
      expect(ids).toContain('SourceHanSans')
      expect(ids).toContain('SourceHanSerif')
    })

    it('系统字体标记为 needLoad: false', () => {
      for (const font of BUILTIN_CHINESE_FONTS.filter(f => ['DengXian', 'MicrosoftYaHei', 'SimSun', 'FangSong'].includes(f.id))) {
        expect(font.needLoad).toBe(false)
      }
    })

    it('思源字体标记为 needLoad: true', () => {
      expect(BUILTIN_CHINESE_FONTS.find(f => f.id === 'SourceHanSans')?.needLoad).toBe(true)
      expect(BUILTIN_CHINESE_FONTS.find(f => f.id === 'SourceHanSerif')?.needLoad).toBe(true)
    })
  })

  describe('BUILTIN_CODE_FONTS', () => {
    it('SourceCodePro 标记为 needLoad: true', () => {
      const f = BUILTIN_CODE_FONTS.find(f => f.id === 'SourceCodePro')
      expect(f?.needLoad).toBe(true)
    })

    it('Consolas 标记为 needLoad: false', () => {
      expect(BUILTIN_CODE_FONTS.find(f => f.id === 'Consolas')?.needLoad).toBe(false)
    })
  })

  describe('getFontInfo', () => {
    it('应返回内置中文字体（等线）', () => {
      const info = getFontInfo('DengXian', [])
      expect(info?.name).toBe('等线')
      expect(info?.needLoad).toBe(false)
    })

    it('应返回思源黑体并包含文件名', () => {
      const info = getFontInfo('SourceHanSans', [])
      expect(info?.name).toBe('思源黑体')
      expect(info?.needLoad).toBe(true)
      expect(info?.filename).toBe('SourceHanSansSC-Regular.ttf')
    })

    it('应返回内置英文字体', () => {
      const info = getFontInfo('Arial', [])
      expect(info?.name).toBe('Arial')
      expect(info?.needLoad).toBe(false)
    })

    it('应返回内置代码字体', () => {
      const info = getFontInfo('SourceCodePro', [])
      expect(info?.name).toBe('Source Code Pro')
      expect(info?.needLoad).toBe(true)
      expect(info?.filename).toBe('SourceCodePro-Regular.ttf')
    })

    it('应返回自定义字体', () => {
      const custom: CustomFont = { id: 'MyFont', name: 'My Font', filename: 'MyFont.ttf' }
      const info = getFontInfo('MyFont', [custom])
      expect(info?.name).toBe('My Font')
      expect(info?.needLoad).toBe(true)
      expect(info?.filename).toBe('MyFont.ttf')
    })

    it('未知字体应返回 null', () => {
      expect(getFontInfo('NonExistent', [])).toBeNull()
    })

    it('自定义字体优先匹配列表中的第一个', () => {
      const customs: CustomFont[] = [
        { id: 'font1', name: 'Font1', filename: 'f1.ttf' },
        { id: 'font2', name: 'Font2', filename: 'f2.ttf' },
      ]
      const info = getFontInfo('font2', customs)
      expect(info?.name).toBe('Font2')
    })
  })
})
