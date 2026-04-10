import { message } from '@tauri-apps/plugin-dialog'

/**
 * 全局错误处理 composable
 *
 * 提供统一的错误处理机制，将错误记录到控制台并向用户显示提示
 */

export interface ErrorContext {
  operation: string      // 操作名称，如 "打开文件"、"导出 PDF"
  silent?: boolean       // 是否静默（不显示用户提示）
  fallback?: () => void  // 错误后的回调
}

/**
 * 格式化错误信息
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name
  }
  if (typeof error === 'string') {
    return error
  }
  return String(error)
}

export function useErrorHandling() {
  /**
   * 处理错误：记录日志并可选地向用户显示
   */
  async function handleError(error: unknown, context: string | ErrorContext): Promise<void> {
    const ctx = typeof context === 'string' ? { operation: context } : context
    const errorMsg = formatError(error)

    // 记录到控制台
    console.error(`[${ctx.operation}]`, error)

    // 向用户显示（非静默模式）
    if (!ctx.silent) {
      try {
        await message(`${ctx.operation}失败：${errorMsg}`, {
          title: '错误',
          kind: 'error'
        })
      } catch {
        // message 可能失败（如用户关闭对话框），忽略
      }
    }

    // 执行回调
    ctx.fallback?.()
  }

  /**
   * 处理警告：仅记录日志
   */
  function handleWarning(warning: unknown, context: string): void {
    console.warn(`[${context}]`, warning)
  }

  /**
   * 包装异步函数，自动处理错误
   */
  function withErrorHandling<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T | undefined> {
    return fn().catch(async (error) => {
      await handleError(error, operation)
      return undefined
    })
  }

  /**
   * 包装同步函数，自动处理错误
   */
  function withErrorHandlingSync<T>(operation: string, fn: () => T): T | undefined {
    try {
      return fn()
    } catch (error) {
      handleError(error, { operation, silent: false })
      return undefined
    }
  }

  return {
    handleError,
    handleWarning,
    withErrorHandling,
    withErrorHandlingSync
  }
}