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

export interface FontConfig {
  bodyFont: string           // 正文字体ID（内置或自定义）
  codeFont: string           // 代码字体ID（内置或自定义）
  bodyFontSize: number       // 正文字号（px），默认16
  bodyCustomFonts: CustomFont[]  // 正文自定义字体列表
  codeCustomFonts: CustomFont[]  // 代码自定义字体列表
}

const DEFAULT_CONFIG: FontConfig = {
  bodyFont: 'SourceHanSans',
  codeFont: 'SourceCodePro',
  bodyFontSize: 16,
  bodyCustomFonts: [],
  codeCustomFonts: []
}

const CONFIG_FILE_NAME = 'config.json'

// 内置正文字体
export const BUILTIN_BODY_FONTS = [
  { id: 'SourceHanSans', name: '思源黑体', needLoad: true },
  { id: 'MicrosoftYaHei', name: '微软雅黑', needLoad: false },
  { id: 'DengXian', name: '等线', needLoad: false }
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
        bodyCustomFonts: config.bodyCustomFonts || [],
        codeCustomFonts: config.codeCustomFonts || []
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
    // 通过 Rust 命令扫描字体目录
    console.log('调用 scan_fonts_dir 命令...')
    const fonts = await invoke<[string, string, string][]>('scan_fonts_dir')
    console.log('scan_fonts_dir 返回:', fonts)

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
    typeof config.bodyFont === 'string' &&
    typeof config.codeFont === 'string' &&
    Array.isArray(config.bodyCustomFonts || []) &&
    Array.isArray(config.codeCustomFonts || [])
  )
}

/**
 * 获取字体信息
 */
export function getFontInfo(fontId: string, customFonts: CustomFont[]): { name: string; needLoad: boolean; filename?: string } | null {
  // 检查内置正文字体
  const builtinBody = BUILTIN_BODY_FONTS.find(f => f.id === fontId)
  if (builtinBody) {
    return { name: builtinBody.name, needLoad: builtinBody.needLoad, filename: builtinBody.needLoad ? 'SourceHanSansSC-Regular.ttf' : undefined }
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