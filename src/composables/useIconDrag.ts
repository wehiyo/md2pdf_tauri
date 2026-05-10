import { ref } from 'vue'

const dragging = ref<string | null>(null)
const dragFrom = ref<'left' | 'right' | null>(null)
const ghostStyle = ref<Record<string, string>>({ display: 'none' })
let dragMoved = false

export function useIconDrag(
  emitMove: (icon: string, to: 'left' | 'right') => void,
  emitReorder: (side: 'left' | 'right', fromIdx: number, toIdx: number) => void
) {
  function startDrag(e: PointerEvent, icon: string, from: 'left' | 'right') {
    dragging.value = icon
    dragFrom.value = from
    dragMoved = false
    ghostStyle.value = {
      display: 'block', position: 'fixed',
      left: (e.clientX - 16) + 'px', top: (e.clientY - 16) + 'px',
      width: '32px', height: '32px', pointerEvents: 'none', zIndex: '9999',
    }
    const onMove = (ev: PointerEvent) => {
      dragMoved = true
      ghostStyle.value.left = (ev.clientX - 16) + 'px'
      ghostStyle.value.top = (ev.clientY - 16) + 'px'
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      dragging.value = null; dragFrom.value = null
      ghostStyle.value.display = 'none'
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  function onDropZone(side: 'left' | 'right') {
    if (dragging.value && dragFrom.value !== side) {
      emitMove(dragging.value, side)
    }
  }

  function onIconDrop(side: 'left' | 'right', targetIdx: number) {
    if (!dragging.value || !dragMoved) return
    if (dragFrom.value === side) {
      emitReorder(side, getCurrentIconIndex(), targetIdx)
    }
  }

  return { dragging, ghostStyle, startDrag, onDropZone, onIconDrop }
}

let currentDragIdx = -1
export function setStartIdx(idx: number) { currentDragIdx = idx }
export function getCurrentIconIndex() { return currentDragIdx }
