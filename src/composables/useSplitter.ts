import { ref, computed, type Ref } from 'vue'

export interface SplitterOptions {
  /** Current width/percentage value (writable ref) */
  value: Ref<number>
  /** Min allowed value */
  min: number
  /** Max allowed value */
  max: number
  /** CSS unit (e.g., 'px' or '%') */
  unit?: string
  /** Custom value calculator from delta (default: startValue + deltaPercent) */
  calcValue?: (startValue: number, deltaX: number, containerWidth: number) => number
}

export function useSplitter(options: SplitterOptions) {
  const { value, min, max } = options

  const isResizing = ref(false)
  let resizeStartX = 0
  let resizeStartValue = 0

  function startResize(event: MouseEvent) {
    event.preventDefault()
    isResizing.value = true
    resizeStartX = event.clientX
    resizeStartValue = value.value
    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function handleResize(event: MouseEvent) {
    if (!isResizing.value) return
    const mainContent = document.querySelector('.main-content') as HTMLElement
    if (!mainContent) return

    const rect = mainContent.getBoundingClientRect()
    const deltaX = event.clientX - resizeStartX

    let newValue: number
    if (options.calcValue) {
      newValue = options.calcValue(resizeStartValue, deltaX, rect.width)
    } else {
      // Default: delta as percentage of container
      const deltaPercent = (deltaX / rect.width) * 100
      newValue = resizeStartValue + deltaPercent
    }

    value.value = Math.min(max, Math.max(min, newValue))
  }

  function stopResize() {
    isResizing.value = false
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  return {
    startResize,
    isResizing,
  }
}

/** Creates computed pane styles for editor/preview splitter */
export function createSplitterPaneStyles(
  value: Ref<number>,
  previewOnlyMode: Ref<boolean>,
  showPreview: Ref<boolean>,
) {
  const primaryStyle = computed(() => {
    if (previewOnlyMode.value) return { display: 'none' }
    if (!showPreview.value) return { flex: '1', width: '0' }
    return { flex: `${value.value} 1 0` }
  })

  const secondaryStyle = computed(() => {
    if (previewOnlyMode.value) return { flex: '1', width: '100%' }
    if (!showPreview.value) return { display: 'none' }
    return { flex: `${100 - value.value} 1 0` }
  })

  return { primaryStyle, secondaryStyle }
}
