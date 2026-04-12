<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="progress.isExporting" class="progress-overlay">
        <div class="progress-card">
          <div class="progress-icon">
            <svg class="spinner" viewBox="0 0 24 24">
              <circle class="spinner-track" cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
              <path class="spinner-head" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          </div>
          <div class="progress-text">{{ progress.currentStep }}</div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${(progress.stepIndex / progress.totalSteps) * 100}%` }"
            />
          </div>
          <div class="progress-hint">请稍候，正在生成 PDF...</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useExportProgress, EXPORT_STEPS } from '../composables/useExportProgress'

const { progress, updateStep } = useExportProgress()

// 监听后端发送的进度事件
let unlisten: UnlistenFn | null = null

onMounted(async () => {
  unlisten = await listen<string>('export-progress', (event) => {
    const stepText = event.payload

    // 根据进度文本更新步骤索引
    if (stepText.includes('生成 PDF')) {
      updateStep(EXPORT_STEPS.GENERATE_PDF.text, EXPORT_STEPS.GENERATE_PDF.index)
    } else if (stepText.includes('提取书签')) {
      updateStep(EXPORT_STEPS.EXTRACT_BOOKMARKS.text, EXPORT_STEPS.EXTRACT_BOOKMARKS.index)
    } else if (stepText.includes('注入书签')) {
      updateStep(EXPORT_STEPS.INJECT_BOOKMARKS.text, EXPORT_STEPS.INJECT_BOOKMARKS.index)
    } else if (stepText.includes('添加页码')) {
      updateStep(EXPORT_STEPS.ADD_PAGE_NUMBERS.text, EXPORT_STEPS.ADD_PAGE_NUMBERS.index)
    }
  })
})

onUnmounted(() => {
  if (unlisten) {
    unlisten()
  }
})
</script>

<style scoped>
.progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.progress-card {
  background: white;
  border-radius: 12px;
  padding: 24px 32px;
  min-width: 300px;
  max-width: 400px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  text-align: center;
}

.progress-icon {
  margin-bottom: 16px;
}

.spinner {
  width: 40px;
  height: 40px;
  color: #3b82f6;
  animation: spin 1s linear infinite;
}

.spinner-track {
  opacity: 0.2;
}

.spinner-head {
  stroke: #3b82f6;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.progress-text {
  font-size: 1rem;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 16px;
}

.progress-bar {
  height: 6px;
  background-color: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  background-color: #3b82f6;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-hint {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>