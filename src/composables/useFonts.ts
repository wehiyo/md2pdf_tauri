/**
 * 字体加载模块
 * 从 Tauri resources 目录加载字体并动态注入 CSS
 */

import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { FontConfig } from './useConfig'
import { BUILTIN_CHINESE_FONTS, BUILTIN_CODE_FONTS, getFontInfo } from './useConfig'

/**
 * 加载单个字体文件
 */
async function loadSingleFont(fontId: string, filename: string): Promise<void> {
  const styleId = `font-face-${fontId}`

  // 检查是否已注入
  if (document.getElementById(styleId)) {
    return
  }

  // 通过 Rust 命令获取字体文件的绝对路径
  const absolutePath = await invoke<string>('get_font_path', { filename })

  // 将 Windows 反斜杠路径转换为正斜杠（convertFileSrc 需要）
  const normalizedPath = absolutePath.replace(/\\/g, '/')

  // 使用 convertFileSrc 转换为 asset URL
  const fontUrl = convertFileSrc(normalizedPath)

  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @font-face {
      font-family: '${fontId}';
      src: url('${fontUrl}') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
  `
  document.head.appendChild(style)
}

/**
 * 根据配置加载字体并设置 CSS 变量
 * CSS设置：英文字体优先，中文字体fallback
 */
export async function loadFonts(config: FontConfig): Promise<void> {
  // 确保 customFonts 数组存在
  const chineseCustomFonts = config.chineseCustomFonts || []
  const englishCustomFonts = config.englishCustomFonts || []
  const codeCustomFonts = config.codeCustomFonts || []

  // 加载内置中文字体（如果需要）
  for (const font of BUILTIN_CHINESE_FONTS) {
    if (font.needLoad && font.id === 'SourceHanSans') {
      await loadSingleFont('SourceHanSans', 'SourceHanSansSC-Regular.ttf')
    }
    if (font.needLoad && font.id === 'SourceHanSerif') {
      await loadSingleFont('SourceHanSerif', 'SourceHanSerifSC-Regular.ttf')
    }
  }

  // 加载中文字体自定义字体
  for (const customFont of chineseCustomFonts) {
    await loadSingleFont(customFont.id, customFont.filename)
  }

  // 加载英文字体自定义字体
  for (const customFont of englishCustomFonts) {
    await loadSingleFont(customFont.id, customFont.filename)
  }

  // 加载内置代码字体（如果需要）
  for (const font of BUILTIN_CODE_FONTS) {
    if (font.needLoad && font.id === 'SourceCodePro') {
      await loadSingleFont('SourceCodePro', 'SourceCodePro-Regular.ttf')
    }
  }

  // 加载代码自定义字体
  for (const customFont of codeCustomFonts) {
    await loadSingleFont(customFont.id, customFont.filename)
  }

  // 获取当前选择的字体信息
  const chineseFontInfo = getFontInfo(config.chineseFont, chineseCustomFonts)
  const englishFontInfo = getFontInfo(config.englishFont, englishCustomFonts)
  const codeFontInfo = getFontInfo(config.codeFont, codeCustomFonts)

  // 构建 CSS font-family 字符串
  // 英文字体优先，中文字体fallback
  let bodyCss = "'Arial', 'Microsoft YaHei', sans-serif"
  let codeCss = "'Consolas', monospace"

  // 构建中文字体CSS（不含 generic fallback，后面统一添加）
  let chineseFontName = "'Microsoft YaHei'"
  if (chineseFontInfo) {
    if (chineseFontInfo.needLoad) {
      chineseFontName = `'${config.chineseFont}'`
    } else {
      // Windows 内置字体 CSS 名称映射
      const nameMap: Record<string, string> = {
        'MicrosoftYaHei': "'Microsoft YaHei'",
        'DengXian': "'DengXian'",
        'SimSun': "'SimSun'",
        'FangSong': "'FangSong'",
        'SourceHanSans': "'SourceHanSans'",
        'SourceHanSerif': "'SourceHanSerif'"
      }
      chineseFontName = nameMap[config.chineseFont] || `'${chineseFontInfo.name}'`
    }
  }

  // 构建英文字体CSS（不含 generic fallback）
  let englishFontName = "'Arial'"
  if (englishFontInfo) {
    if (englishFontInfo.needLoad) {
      englishFontName = `'${config.englishFont}'`
    } else {
      const nameMap: Record<string, string> = {
        'Arial': "'Arial'",
        'TimesNewRoman': "'Times New Roman'",
        'Georgia': "'Georgia'",
        'Calibri': "'Calibri'",
        'Verdana': "'Verdana'",
        'Tahoma': "'Tahoma'"
      }
      englishFontName = nameMap[config.englishFont] || `'${englishFontInfo.name}'`
    }
  }

  // 组合：英文字体优先，中文字体fallback，最后是 generic fallback
  bodyCss = `${englishFontName}, ${chineseFontName}, sans-serif`

  // 构建代码字体CSS（不含 generic fallback）
  let codeFontName = "'Consolas'"
  if (codeFontInfo) {
    if (codeFontInfo.needLoad) {
      codeFontName = `'${config.codeFont}'`
    } else {
      const nameMap: Record<string, string> = {
        'Consolas': "'Consolas'",
        'CourierNew': "'Courier New'"
      }
      codeFontName = nameMap[config.codeFont] || `'${codeFontInfo.name}'`
    }
  }

  // 组合：代码字体 + generic fallback
  codeCss = `${codeFontName}, monospace`

  // 设置 CSS 变量
  document.documentElement.style.setProperty('--body-font', bodyCss)
  document.documentElement.style.setProperty('--code-font', codeCss)
  document.documentElement.style.setProperty('--body-font-size', `${config.bodyFontSize || 16}px`)

  // 设置排版 CSS 变量
  document.documentElement.style.setProperty('--line-height', (config.lineHeight || 1.6).toString())
  document.documentElement.style.setProperty('--paragraph-spacing', `${config.paragraphSpacing || 1}em`)
  document.documentElement.style.setProperty('--preview-width', `${config.previewWidth || 900}px`)
  document.documentElement.style.setProperty('--preview-bg-color', config.previewBackgroundColor || '#ffffff')
}