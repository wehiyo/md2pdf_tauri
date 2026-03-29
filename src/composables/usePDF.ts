import { invoke } from '@tauri-apps/api/core'
import { save, message } from '@tauri-apps/plugin-dialog'

export function usePDF() {
  /**
   * 导出 HTML 为 PDF
   */
  async function exportToPDF(htmlContent: string): Promise<void> {
    try {
      const filePath = await save({
        filters: [{
          name: 'PDF',
          extensions: ['pdf']
        }]
      })

      if (!filePath) {
        return // 用户取消
      }

      // 调用 Rust 后端生成 PDF
      await invoke('export_pdf', {
        options: {
          path: filePath,
          html: htmlContent
        }
      })

      await message('PDF 导出成功！', { title: '成功', kind: 'info' })
    } catch (error) {
      console.error('导出 PDF 失败:', error)
      await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
    }
  }

  return {
    exportToPDF
  }
}
