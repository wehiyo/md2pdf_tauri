/**
 * 配置管理模块
 * 保存和加载字体配置到 config.json
 */

import { invoke } from '@tauri-apps/api/core'
import { readFile, writeFile, mkdir } from '@tauri-apps/plugin-fs'

// 自定义字体
export interface CustomFont {
  id: string       // 唯一标识（文件名去掉扩展名）
  name: string     // 显示名称
  filename: string // 字体文件名
}

// 预设页面尺寸（mm）
export const PAGE_SIZE_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  A4: { width: 210, height: 297, label: 'A4 (210×297mm)' },
  B5: { width: 176, height: 250, label: 'B5 (176×250mm)' },
  Letter: { width: 216, height: 279, label: 'Letter (8.5×11in)' },
}

// 页面尺寸选项（用于 UI）
export const PAGE_SIZE_OPTIONS: { value: 'A4' | 'B5' | 'Letter'; label: string }[] = [
  { value: 'A4', label: 'A4 (210×297mm)' },
  { value: 'B5', label: 'B5 (176×250mm)' },
  { value: 'Letter', label: 'Letter (216×279mm)' },
]

// 页边距选项（mm）
export const PAGE_MARGIN_OPTIONS = [
  { value: 10, label: '10mm（紧凑）' },
  { value: 15, label: '15mm（较紧凑）' },
  { value: 20, label: '20mm（标准）' },
  { value: 25, label: '25mm（宽松）' },
  { value: 30, label: '30mm（较宽松）' },
]

export interface PageConfig {
  pageSize: 'A4' | 'B5' | 'Letter'  // 页面尺寸预设
  marginTop: number     // 上边距 mm
  marginBottom: number  // 下边距 mm
  marginLeft: number    // 左边距 mm
  marginRight: number   // 右边距 mm
}

export interface FontConfig {
  chineseFont: string           // 中文字体ID（内置或自定义）
  englishFont: string           // 英文字体ID（内置或自定义）
  codeFont: string              // 代码字体ID（内置或自定义）
  bodyFontSize: number          // 基础字号（px），默认16
  chineseCustomFonts: CustomFont[]  // 中文自定义字体列表
  englishCustomFonts: CustomFont[]  // 英文自定义字体列表
  codeCustomFonts: CustomFont[]     // 代码自定义字体列表
  // 排版设置
  lineHeight: number            // 正文行间距，默认 1.6
  paragraphSpacing: number      // 段落间距（em），默认 1
  previewWidth: number          // 预览宽度（px），默认 900
  previewBackgroundColor: string  // 预览背景色，默认 '#ffffff'
  // 页面设置
  pageSize: 'A4' | 'B5' | 'Letter'  // 页面尺寸预设
  marginTop: number     // 上边距 mm
  marginBottom: number  // 下边距 mm
  marginLeft: number    // 左边距 mm
  marginRight: number   // 右边距 mm
}

const DEFAULT_CONFIG: FontConfig = {
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
  // 页面设置默认值
  pageSize: 'A4',
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 25,
  marginRight: 25,
}

const CONFIG_FILE_NAME = 'config.json'

// 内置中文字体
export const BUILTIN_CHINESE_FONTS = [
  { id: 'DengXian', name: '等线', needLoad: false },
  { id: 'MicrosoftYaHei', name: '微软雅黑', needLoad: false },
  { id: 'SimSun', name: '新宋体', needLoad: false },
  { id: 'FangSong', name: '仿宋', needLoad: false },
  { id: 'SourceHanSans', name: '思源黑体', needLoad: true },
  { id: 'SourceHanSerif', name: '思源宋体', needLoad: true }
]

// 内置英文字体（Windows自带）
export const BUILTIN_ENGLISH_FONTS = [
  { id: 'Arial', name: 'Arial', needLoad: false },
  { id: 'TimesNewRoman', name: 'Times New Roman', needLoad: false },
  { id: 'Georgia', name: 'Georgia', needLoad: false },
  { id: 'Calibri', name: 'Calibri', needLoad: false },
  { id: 'Verdana', name: 'Verdana', needLoad: false },
  { id: 'Tahoma', name: 'Tahoma', needLoad: false }
]

// 内置代码字体
export const BUILTIN_CODE_FONTS = [
  { id: 'SourceCodePro', name: 'Source Code Pro', needLoad: true },
  { id: 'Consolas', name: 'Consolas', needLoad: false },
  { id: 'CourierNew', name: 'Courier New', needLoad: false }
]

// 可选字号列表（px）
export const FONT_SIZE_OPTIONS = [
  { value: 12, label: '12px（最小）' },
  { value: 14, label: '14px（小）' },
  { value: 16, label: '16px（标准）' },
  { value: 18, label: '18px（中）' },
  { value: 20, label: '20px（大）' },
  { value: 22, label: '22px（较大）' }
]

// 行间距选项
export const LINE_HEIGHT_OPTIONS = [
  { value: 1.4, label: '1.4（紧凑）' },
  { value: 1.5, label: '1.5（较紧凑）' },
  { value: 1.6, label: '1.6（标准）' },
  { value: 1.7, label: '1.7（较宽松）' },
  { value: 1.8, label: '1.8（宽松）' },
  { value: 2.0, label: '2.0（很宽松）' }
]

// 段落间距选项（em）
export const PARAGRAPH_SPACING_OPTIONS = [
  { value: 0.5, label: '0.5em（紧凑）' },
  { value: 0.75, label: '0.75em（较紧凑）' },
  { value: 1, label: '1em（标准）' },
  { value: 1.25, label: '1.25em（较宽松）' },
  { value: 1.5, label: '1.5em（宽松）' }
]

// 预览宽度选项（px）
export const PREVIEW_WIDTH_OPTIONS = [
  { value: 600, label: '600px（窄）' },
  { value: 800, label: '800px（较窄）' },
  { value: 900, label: '900px（标准）' },
  { value: 1000, label: '1000px（较宽）' },
  { value: 1200, label: '1200px（宽）' }
]

// 预览背景色选项
export const PREVIEW_BACKGROUND_COLORS = [
  { value: '#ffffff', label: '白色' },
  { value: '#f8f9fa', label: '浅灰' },
  { value: '#F4ECDA', label: '暖黄' },
  { value: '#D8CBB2', label: '褐色' },
  { value: '#ecfdf5', label: '淡绿' },
  { value: '#eff6ff', label: '淡蓝' }
]

let cachedConfig: FontConfig | null = null

/**
 * 获取配置目录路径
 */
async function getConfigDir(): Promise<string> {
  return await invoke<string>('get_config_dir')
}

/**
 * 加载配置
 */
export async function loadConfig(): Promise<FontConfig> {
  if (cachedConfig) {
    return cachedConfig
  }

  try {
    const configDir = await getConfigDir()
    const configPath = `${configDir}/${CONFIG_FILE_NAME}`

    // 尝试读取配置文件
    const bytes = await readFile(configPath)
    const text = new TextDecoder().decode(bytes)
    const config = JSON.parse(text) as FontConfig

    // 验证配置有效性
    if (!isValidConfig(config)) {
      console.warn('配置文件无效，使用默认配置')
      cachedConfig = DEFAULT_CONFIG
    } else {
      // 合并默认配置确保所有字段存在（兼容旧配置）
      cachedConfig = {
        ...DEFAULT_CONFIG,
        ...config,
        bodyFontSize: config.bodyFontSize || DEFAULT_CONFIG.bodyFontSize,
        chineseCustomFonts: config.chineseCustomFonts || [],
        englishCustomFonts: config.englishCustomFonts || [],
        codeCustomFonts: config.codeCustomFonts || [],
        lineHeight: config.lineHeight || DEFAULT_CONFIG.lineHeight,
        paragraphSpacing: config.paragraphSpacing || DEFAULT_CONFIG.paragraphSpacing,
        previewWidth: config.previewWidth || DEFAULT_CONFIG.previewWidth,
        previewBackgroundColor: config.previewBackgroundColor || DEFAULT_CONFIG.previewBackgroundColor,
        // 页面设置（兼容旧配置）
        pageSize: config.pageSize || DEFAULT_CONFIG.pageSize,
        marginTop: config.marginTop || DEFAULT_CONFIG.marginTop,
        marginBottom: config.marginBottom || DEFAULT_CONFIG.marginBottom,
        marginLeft: config.marginLeft || DEFAULT_CONFIG.marginLeft,
        marginRight: config.marginRight || DEFAULT_CONFIG.marginRight,
      }
    }
  } catch (e) {
    // 配置文件不存在或读取失败，使用默认配置
    console.log('加载配置失败，使用默认配置:', e)
    cachedConfig = DEFAULT_CONFIG
  }

  return cachedConfig
}

/**
 * 保存配置
 */
export async function saveConfig(config: FontConfig): Promise<void> {
  try {
    const configDir = await getConfigDir()

    // 确保配置目录存在
    try {
      await mkdir(configDir, { recursive: true })
    } catch {
      // 目录可能已存在
    }

    const configPath = `${configDir}/${CONFIG_FILE_NAME}`
    const text = JSON.stringify(config, null, 2)
    const bytes = new TextEncoder().encode(text)

    await writeFile(configPath, bytes)
    cachedConfig = config

    console.log('配置已保存:', config)
  } catch (e) {
    console.error('保存配置失败:', e)
    throw e
  }
}

/**
 * 扫描 fonts 目录下的字体文件
 */
export async function scanFonts(): Promise<CustomFont[]> {
  try {
    const fonts = await invoke<[string, string, string][]>('scan_fonts_dir')

    return fonts.map(([id, name, filename]) => ({
      id,
      name,
      filename
    }))
  } catch (e) {
    console.error('扫描字体目录失败:', e)
    return []
  }
}

/**
 * 验证配置有效性
 */
function isValidConfig(config: any): boolean {
  return (
    config &&
    typeof config.chineseFont === 'string' &&
    typeof config.englishFont === 'string' &&
    typeof config.codeFont === 'string' &&
    Array.isArray(config.chineseCustomFonts || []) &&
    Array.isArray(config.englishCustomFonts || []) &&
    Array.isArray(config.codeCustomFonts || [])
  )
}

/**
 * 获取字体信息
 */
export function getFontInfo(fontId: string, customFonts: CustomFont[]): { name: string; needLoad: boolean; filename?: string } | null {
  // 检查内置中文字体
  const builtinChinese = BUILTIN_CHINESE_FONTS.find(f => f.id === fontId)
  if (builtinChinese) {
    const fontFiles: Record<string, string> = {
      'SourceHanSans': 'SourceHanSansSC-Regular.ttf',
      'SourceHanSerif': 'SourceHanSerifSC-Regular.ttf'
    }
    return { name: builtinChinese.name, needLoad: builtinChinese.needLoad, filename: builtinChinese.needLoad ? fontFiles[fontId] : undefined }
  }

  // 检查内置英文字体
  const builtinEnglish = BUILTIN_ENGLISH_FONTS.find(f => f.id === fontId)
  if (builtinEnglish) {
    return { name: builtinEnglish.name, needLoad: builtinEnglish.needLoad }
  }

  // 检查内置代码字体
  const builtinCode = BUILTIN_CODE_FONTS.find(f => f.id === fontId)
  if (builtinCode) {
    return { name: builtinCode.name, needLoad: builtinCode.needLoad, filename: builtinCode.needLoad ? 'SourceCodePro-Regular.ttf' : undefined }
  }

  // 检查自定义字体
  const custom = customFonts.find(f => f.id === fontId)
  if (custom) {
    return { name: custom.name, needLoad: true, filename: custom.filename }
  }

  return null
}