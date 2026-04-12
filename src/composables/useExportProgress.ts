import { ref } from 'vue'

export interface ExportProgressState {
  isExporting: boolean
  currentStep: string
  stepIndex: number
  totalSteps: number
}

const progress = ref<ExportProgressState>({
  isExporting: false,
  currentStep: '',
  stepIndex: 0,
  totalSteps: 5
})

export function useExportProgress() {
  function startExport() {
    progress.value = {
      isExporting: true,
      currentStep: '准备导出...',
      stepIndex: 0,
      totalSteps: 5
    }
  }

  function updateStep(step: string, index: number) {
    progress.value.currentStep = step
    progress.value.stepIndex = index
  }

  function endExport() {
    progress.value.isExporting = false
  }

  return {
    progress,
    startExport,
    updateStep,
    endExport
  }
}

// 导出步骤常量
export const EXPORT_STEPS = {
  PREPARE: { text: '准备导出...', index: 0 },
  RENDER_DIAGRAMS: { text: '预渲染图表...', index: 1 },
  GENERATE_PDF: { text: '生成 PDF...', index: 2 },
  EXTRACT_BOOKMARKS: { text: '提取书签位置...', index: 3 },
  INJECT_BOOKMARKS: { text: '注入书签...', index: 4 },
  ADD_PAGE_NUMBERS: { text: '添加页码...', index: 5 }
}