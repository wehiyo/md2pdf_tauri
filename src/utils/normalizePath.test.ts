import { describe, it, expect } from 'vitest'

// 复制 Preview.vue 中的 normalizePath 函数进行测试
function normalizePath(path: string): string {
  // 先统一使用正斜杠
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const result: string[] = []

  // 检测是否为 Windows 路径（以盘符开头）
  const isWindowsPath = normalized.match(/^[A-Za-z]:/)
  // 检测是否为 Unix 绝对路径（以 / 开头）
  const isUnixAbsolutePath = normalized.startsWith('/')

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part === '..') {
      // Windows 路径中，保留盘符部分不被移除
      if (result.length > 1 || (result.length === 1 && !isWindowsPath)) {
        result.pop()
      }
    } else if (part !== '.' && part !== '') {
      result.push(part)
    }
  }

  const joinedPath = result.join('/')

  // Unix 绝对路径需要添加前导 /
  if (isUnixAbsolutePath && !isWindowsPath) {
    return '/' + joinedPath
  }

  return joinedPath
}

describe('normalizePath - 图片路径规范化', () => {
  describe('Windows 路径处理', () => {
    it('应正确处理 ../ 向上索引（Windows）', () => {
      const fileDir = 'D:\\Work\\docs\\folder'
      const src = '../images/pic.png'

      const fileDirNormalized = fileDir.replace(/\\/g, '/')
      const absolutePath = fileDirNormalized + '/' + src
      const result = normalizePath(absolutePath)

      expect(result).toBe('D:/Work/docs/images/pic.png')
    })

    it('应正确处理多个 ../ （Windows）', () => {
      const fileDir = 'D:\\Work\\docs\\folder\\subfolder'
      const src = '../../images/pic.png'

      const fileDirNormalized = fileDir.replace(/\\/g, '/')
      const absolutePath = fileDirNormalized + '/' + src
      const result = normalizePath(absolutePath)

      expect(result).toBe('D:/Work/docs/images/pic.png')
    })

    it('应正确处理 ./ 当前目录（Windows）', () => {
      const fileDir = 'D:\\Work\\docs\\folder'
      const src = './images/pic.png'

      const fileDirNormalized = fileDir.replace(/\\/g, '/')
      const absolutePath = fileDirNormalized + '/' + src
      const result = normalizePath(absolutePath)

      expect(result).toBe('D:/Work/docs/folder/images/pic.png')
    })

    it('应正确处理无相对路径的情况（Windows）', () => {
      const fileDir = 'D:\\Work\\docs\\folder'
      const src = 'images/pic.png'

      const fileDirNormalized = fileDir.replace(/\\/g, '/')
      const absolutePath = fileDirNormalized + '/' + src
      const result = normalizePath(absolutePath)

      expect(result).toBe('D:/Work/docs/folder/images/pic.png')
    })
  })

  describe('Unix/Linux/macOS 路径处理', () => {
    it('应正确处理 ../ 向上索引（Unix）', () => {
      const fileDir = '/home/user/docs/folder'
      const src = '../images/pic.png'

      const absolutePath = fileDir + '/' + src
      const result = normalizePath(absolutePath)

      expect(result).toBe('/home/user/docs/images/pic.png')
    })

    it('应正确处理多个 ../ （Unix）', () => {
      const fileDir = '/home/user/docs/folder/subfolder'
      const src = '../../images/pic.png'

      const absolutePath = fileDir + '/' + src
      const result = normalizePath(absolutePath)

      expect(result).toBe('/home/user/docs/images/pic.png')
    })

    it('应正确处理 ./ 当前目录（Unix）', () => {
      const fileDir = '/home/user/docs/folder'
      const src = './images/pic.png'

      const absolutePath = fileDir + '/' + src
      const result = normalizePath(absolutePath)

      expect(result).toBe('/home/user/docs/folder/images/pic.png')
    })
  })

  describe('边界情况', () => {
    it('应处理路径末尾多余的斜杠', () => {
      const result = normalizePath('/home/user/docs/folder/../images/')
      expect(result).toBe('/home/user/docs/images')
    })

    it('应处理连续的斜杠', () => {
      const result = normalizePath('/home//user///docs/../images')
      expect(result).toBe('/home/user/images')
    })

    it('应处理空的路径部分', () => {
      const result = normalizePath('D:///Work//docs/../images')
      expect(result).toBe('D:/Work/images')
    })

    it('不应超出根目录（Unix）', () => {
      const result = normalizePath('/home/../../../etc')
      expect(result).toBe('/etc')  // Unix 路径保持绝对路径格式
    })

    it('不应超出根目录（Windows）', () => {
      const result = normalizePath('D:/folder/../../../other')
      expect(result).toBe('D:/other')  // Windows 路径保留盘符
    })
  })
})