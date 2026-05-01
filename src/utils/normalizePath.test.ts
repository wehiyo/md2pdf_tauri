import { describe, it, expect } from 'vitest'
import { normalizePath } from './normalizePath'

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