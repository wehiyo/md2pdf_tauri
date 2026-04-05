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