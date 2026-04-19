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
    console.log('字体已存在，跳过:', fontId)
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

  // 存储调试信息到 window 对象（方便 release 版本调试）
  if (!(window as any).__fontDebug) {
    (window as any).__fontDebug = []
  }
  (window as any).__fontDebug.push({ fontId, filename, absolutePath, fontUrl })

  console.log('字体已注入:', fontId, '路径:', absolutePath, 'URL:', fontUrl)
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

  // 构建中文字体CSS
  let chineseCss = "'Microsoft YaHei', sans-serif"
  if (chineseFontInfo) {
    if (chineseFontInfo.needLoad) {
      chineseCss = `'${config.chineseFont}', 'Microsoft YaHei', sans-serif`
    } else {
      const nameMap: Record<string, string> = {
        'MicrosoftYaHei': "'Microsoft YaHei'",
        'DengXian': "'DengXian'",
        'SourceHanSans': "'SourceHanSans'"
      }
      chineseCss = `${nameMap[config.chineseFont] || `'${chineseFontInfo.name}'`}, sans-serif`
    }
  }

  // 构建英文字体CSS
  let englishCss = "'Arial', sans-serif"
  if (englishFontInfo) {
    if (englishFontInfo.needLoad) {
      englishCss = `'${config.englishFont}', sans-serif`
    } else {
      const nameMap: Record<string, string> = {
        'Arial': "'Arial'",
        'TimesNewRoman': "'Times New Roman'",
        'Georgia': "'Georgia'",
        'Calibri': "'Calibri'",
        'Verdana': "'Verdana'",
        'Tahoma': "'Tahoma'"
      }
      englishCss = `${nameMap[config.englishFont] || `'${englishFontInfo.name}'`}, sans-serif`
    }
  }

  // 组合：英文字体优先，中文字体fallback
  bodyCss = `${englishCss}, ${chineseCss}`

  if (codeFontInfo) {
    if (codeFontInfo.needLoad) {
      codeCss = `'${config.codeFont}', 'Consolas', monospace`
    } else {
      const nameMap: Record<string, string> = {
        'Consolas': "'Consolas'",
        'CourierNew': "'Courier New'"
      }
      codeCss = `${nameMap[config.codeFont] || `'${codeFontInfo.name}'`}, monospace`
    }
  }

  // 设置 CSS 变量
  document.documentElement.style.setProperty('--body-font', bodyCss)
  document.documentElement.style.setProperty('--code-font', codeCss)
  document.documentElement.style.setProperty('--body-font-size', `${config.bodyFontSize || 16}px`)

  console.log('字体已加载:', {
    chinese: config.chineseFont,
    english: config.englishFont,
    code: config.codeFont,
    bodyFontSize: config.bodyFontSize || 16,
    bodyCss,
    codeCss
  })
}