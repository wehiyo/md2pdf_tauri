/**
 * 字体加载模块
 * 从 Tauri resources 目录加载字体并动态注入 CSS
 */

import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { FontConfig } from './useConfig'
import { BUILTIN_BODY_FONTS, BUILTIN_CODE_FONTS, getFontInfo } from './useConfig'

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
 */
export async function loadFonts(config: FontConfig): Promise<void> {
  // 确保 customFonts 数组存在
  const bodyCustomFonts = config.bodyCustomFonts || []
  const codeCustomFonts = config.codeCustomFonts || []

  // 加载内置字体（如果需要）
  for (const font of BUILTIN_BODY_FONTS) {
    if (font.needLoad && font.id === 'SourceHanSans') {
      await loadSingleFont('SourceHanSans', 'SourceHanSansSC-Regular.ttf')
    }
  }

  for (const font of BUILTIN_CODE_FONTS) {
    if (font.needLoad && font.id === 'SourceCodePro') {
      await loadSingleFont('SourceCodePro', 'SourceCodePro-Regular.ttf')
    }
  }

  // 加载正文自定义字体
  for (const customFont of bodyCustomFonts) {
    await loadSingleFont(customFont.id, customFont.filename)
  }

  // 加载代码自定义字体
  for (const customFont of codeCustomFonts) {
    await loadSingleFont(customFont.id, customFont.filename)
  }

  // 获取当前选择的字体信息（根据类型使用对应的自定义字体列表）
  const bodyFontInfo = getFontInfo(config.bodyFont, bodyCustomFonts)
  const codeFontInfo = getFontInfo(config.codeFont, codeCustomFonts)

  // 构建 CSS font-family 字符串
  let bodyCss = "'Microsoft YaHei', sans-serif"
  let codeCss = "'Consolas', monospace"

  if (bodyFontInfo) {
    if (bodyFontInfo.needLoad) {
      bodyCss = `'${config.bodyFont}', 'Microsoft YaHei', sans-serif`
    } else {
      // 系统字体，直接使用名称
      const nameMap: Record<string, string> = {
        'MicrosoftYaHei': "'Microsoft YaHei'",
        'DengXian': "'DengXian'"
      }
      bodyCss = `${nameMap[config.bodyFont] || `'${bodyFontInfo.name}'`}, sans-serif`
    }
  }

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

  console.log('字体已加载:', {
    body: config.bodyFont,
    code: config.codeFont,
    bodyCss,
    codeCss,
    bodyCustomFonts: config.bodyCustomFonts,
    codeCustomFonts: config.codeCustomFonts
  })
}