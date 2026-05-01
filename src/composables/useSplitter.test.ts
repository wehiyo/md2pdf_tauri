import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { createSplitterPaneStyles } from './useSplitter'

describe('createSplitterPaneStyles', () => {
  it('正常模式下编辑器占50%', () => {
    const editorWidth = ref(50)
    const previewOnlyMode = ref(false)
    const showPreview = ref(true)
    const { primaryStyle, secondaryStyle } = createSplitterPaneStyles(editorWidth, previewOnlyMode, showPreview)

    expect(primaryStyle.value).toEqual({ flex: '50 1 0' })
    expect(secondaryStyle.value).toEqual({ flex: '50 1 0' })
  })

  it('previewOnlyMode 下编辑器隐藏、预览全宽', () => {
    const { primaryStyle, secondaryStyle } = createSplitterPaneStyles(
      ref(50), ref(true), ref(true),
    )
    expect(primaryStyle.value).toEqual({ display: 'none' })
    expect(secondaryStyle.value).toEqual({ flex: '1', width: '100%' })
  })

  it('showPreview 为 false 时预览隐藏、编辑器全宽', () => {
    const { primaryStyle, secondaryStyle } = createSplitterPaneStyles(
      ref(50), ref(false), ref(false),
    )
    expect(primaryStyle.value).toEqual({ flex: '1', width: '0' })
    expect(secondaryStyle.value).toEqual({ display: 'none' })
  })

  it('编辑器宽度为 30% 时应正确反映', () => {
    const { primaryStyle, secondaryStyle } = createSplitterPaneStyles(
      ref(30), ref(false), ref(true),
    )
    expect(primaryStyle.value).toEqual({ flex: '30 1 0' })
    expect(secondaryStyle.value).toEqual({ flex: '70 1 0' })
  })

  it('编辑器宽度为 80% 时应正确反映', () => {
    const { primaryStyle, secondaryStyle } = createSplitterPaneStyles(
      ref(80), ref(false), ref(true),
    )
    expect(primaryStyle.value).toEqual({ flex: '80 1 0' })
    expect(secondaryStyle.value).toEqual({ flex: '20 1 0' })
  })
})
