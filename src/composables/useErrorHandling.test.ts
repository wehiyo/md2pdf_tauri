import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useErrorHandling } from './useErrorHandling'

// Mock @tauri-apps/plugin-dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(async () => {})
}))

describe('useErrorHandling', () => {
  const { handleError, handleWarning, withErrorHandling, withErrorHandlingSync } = useErrorHandling()

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock console
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('handleError', () => {
    it('应记录错误到控制台', async () => {
      await handleError(new Error('测试错误'), '测试操作')
      expect(console.error).toHaveBeenCalled()
    })

    it('应处理字符串错误', async () => {
      await handleError('字符串错误', '测试操作')
      expect(console.error).toHaveBeenCalled()
    })

    it('应处理未知类型错误', async () => {
      await handleError({ custom: 'error' }, '测试操作')
      expect(console.error).toHaveBeenCalled()
    })

    it('静默模式不应调用 message', async () => {
      const { message } = await import('@tauri-apps/plugin-dialog')
      await handleError(new Error('静默错误'), { operation: '测试', silent: true })
      expect(message).not.toHaveBeenCalled()
    })

    it('应支持 ErrorContext 对象', async () => {
      const fallback = vi.fn()
      await handleError(new Error('测试'), { operation: '测试操作', fallback })
      expect(fallback).toHaveBeenCalled()
    })
  })

  describe('handleWarning', () => {
    it('应记录警告到控制台', () => {
      handleWarning('测试警告', '测试操作')
      expect(console.warn).toHaveBeenCalled()
    })

    it('应处理对象警告', () => {
      handleWarning({ code: 123 }, '测试操作')
      expect(console.warn).toHaveBeenCalled()
    })
  })

  describe('withErrorHandling', () => {
    it('成功时应返回结果', async () => {
      const result = await withErrorHandling('测试', async () => '成功结果')
      expect(result).toBe('成功结果')
    })

    it('失败时应返回 undefined 并处理错误', async () => {
      const result = await withErrorHandling('测试', async () => {
        throw new Error('失败')
      })
      expect(result).toBeUndefined()
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('withErrorHandlingSync', () => {
    it('成功时应返回结果', () => {
      const result = withErrorHandlingSync('测试', () => '成功结果')
      expect(result).toBe('成功结果')
    })

    it('失败时应返回 undefined 并处理错误', () => {
      const result = withErrorHandlingSync('测试', () => {
        throw new Error('失败')
      })
      expect(result).toBeUndefined()
      expect(console.error).toHaveBeenCalled()
    })
  })
})