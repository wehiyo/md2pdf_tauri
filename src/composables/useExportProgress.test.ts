import { describe, it, expect, beforeEach } from 'vitest'
import { useExportProgress } from './useExportProgress'

describe('useExportProgress', () => {
  const { progress, startExport, updateStep, endExport } = useExportProgress()

  beforeEach(() => {
    // 重置状态
    endExport()
    progress.value = {
      isExporting: false,
      currentStep: '',
      stepIndex: 0,
      totalSteps: 5,
    }
  })

  describe('初始状态', () => {
    it('初始状态不应在导出中', () => {
      const { progress } = useExportProgress()
      expect(progress.value.isExporting).toBe(false)
    })

    it('初始步骤应为空', () => {
      const { progress } = useExportProgress()
      expect(progress.value.currentStep).toBe('')
    })

    it('初始步骤索引应为 0', () => {
      const { progress } = useExportProgress()
      expect(progress.value.stepIndex).toBe(0)
    })

    it('总步骤数应为 5', () => {
      const { progress } = useExportProgress()
      expect(progress.value.totalSteps).toBe(5)
    })
  })

  describe('startExport - 开始导出', () => {
    it('应设置 isExporting 为 true', () => {
      startExport()
      expect(progress.value.isExporting).toBe(true)
    })

    it('应设置初始步骤文本', () => {
      startExport()
      expect(progress.value.currentStep).toBe('准备导出...')
    })

    it('应重置步骤索引为 0', () => {
      progress.value.stepIndex = 3 // 先设置一个非零值
      startExport()
      expect(progress.value.stepIndex).toBe(0)
    })

    it('应重置 totalSteps 为 5', () => {
      progress.value.totalSteps = 10
      startExport()
      expect(progress.value.totalSteps).toBe(5)
    })
  })

  describe('updateStep - 更新步骤', () => {
    it('应更新步骤文本', () => {
      startExport()
      updateStep('生成 PDF...', 2)
      expect(progress.value.currentStep).toBe('生成 PDF...')
    })

    it('应更新步骤索引', () => {
      startExport()
      updateStep('注入书签...', 4)
      expect(progress.value.stepIndex).toBe(4)
    })

    it('不应改变 isExporting 状态', () => {
      startExport()
      const exportingBefore = progress.value.isExporting
      updateStep('新步骤', 1)
      expect(progress.value.isExporting).toBe(exportingBefore)
    })

    it('应支持多次更新', () => {
      startExport()
      updateStep('步骤1', 1)
      expect(progress.value.currentStep).toBe('步骤1')
      expect(progress.value.stepIndex).toBe(1)

      updateStep('步骤2', 2)
      expect(progress.value.currentStep).toBe('步骤2')
      expect(progress.value.stepIndex).toBe(2)

      updateStep('步骤3', 3)
      expect(progress.value.currentStep).toBe('步骤3')
      expect(progress.value.stepIndex).toBe(3)
    })
  })

  describe('endExport - 结束导出', () => {
    it('应设置 isExporting 为 false', () => {
      startExport()
      endExport()
      expect(progress.value.isExporting).toBe(false)
    })

    it('结束导出不应影响其他字段', () => {
      startExport()
      updateStep('测试步骤', 3)
      const stepBefore = progress.value.currentStep
      const indexBefore = progress.value.stepIndex

      endExport()

      // 其他字段保持不变（实际应用中可能需要重置）
      expect(progress.value.currentStep).toBe(stepBefore)
      expect(progress.value.stepIndex).toBe(indexBefore)
    })

    it('可以多次调用 endExport', () => {
      startExport()
      endExport()
      expect(progress.value.isExporting).toBe(false)

      endExport()
      expect(progress.value.isExporting).toBe(false)
    })
  })

  describe('完整导出流程模拟', () => {
    it('应模拟完整导出生命周期', () => {
      // 开始
      startExport()
      expect(progress.value.isExporting).toBe(true)
      expect(progress.value.stepIndex).toBe(0)

      // 步骤 1
      updateStep('预渲染图表...', 1)
      expect(progress.value.currentStep).toBe('预渲染图表...')
      expect(progress.value.stepIndex).toBe(1)

      // 步骤 2
      updateStep('生成 PDF...', 2)
      expect(progress.value.stepIndex).toBe(2)

      // 步骤 3
      updateStep('提取书签位置...', 3)
      expect(progress.value.stepIndex).toBe(3)

      // 步骤 4
      updateStep('注入书签...', 4)
      expect(progress.value.stepIndex).toBe(4)

      // 步骤 5
      updateStep('添加页码...', 5)
      expect(progress.value.stepIndex).toBe(5)

      // 结束
      endExport()
      expect(progress.value.isExporting).toBe(false)
    })
  })
})