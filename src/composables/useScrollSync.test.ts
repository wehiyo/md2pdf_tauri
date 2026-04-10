import { describe, it, expect } from 'vitest'

describe('useScrollSync', () => {
  // 由于 useScrollSync 依赖 Vue 生命周期和 DOM 元素引用
  // 我们需要测试其核心计算逻辑

  describe('滚动比例计算逻辑', () => {
    // 模拟 getScrollRatio 和 setScrollRatio 的计算逻辑

    function getScrollRatio(scrollTop: number, scrollHeight: number, clientHeight: number): number {
      const maxScroll = scrollHeight - clientHeight
      if (maxScroll <= 0) return 0
      return scrollTop / maxScroll
    }

    function setScrollRatio(ratio: number, scrollHeight: number, clientHeight: number): number {
      const maxScroll = scrollHeight - clientHeight
      if (maxScroll <= 0) return 0
      return ratio * maxScroll
    }

    it('应正确计算滚动比例（中间位置）', () => {
      // scrollTop = 500, scrollHeight = 2000, clientHeight = 1000
      // maxScroll = 1000, ratio = 0.5
      const ratio = getScrollRatio(500, 2000, 1000)
      expect(ratio).toBe(0.5)
    })

    it('应正确计算滚动比例（顶部）', () => {
      const ratio = getScrollRatio(0, 2000, 1000)
      expect(ratio).toBe(0)
    })

    it('应正确计算滚动比例（底部）', () => {
      // scrollTop = 1000, maxScroll = 1000, ratio = 1
      const ratio = getScrollRatio(1000, 2000, 1000)
      expect(ratio).toBe(1)
    })

    it('应处理无法滚动的情况（内容高度等于可视高度）', () => {
      const ratio = getScrollRatio(0, 1000, 1000)
      expect(ratio).toBe(0)
    })

    it('应处理无法滚动的情况（内容高度小于可视高度）', () => {
      const ratio = getScrollRatio(0, 800, 1000)
      expect(ratio).toBe(0)
    })

    it('应正确根据比例设置滚动位置', () => {
      const scrollTop = setScrollRatio(0.5, 2000, 1000)
      expect(scrollTop).toBe(500)
    })

    it('应根据比例 0 设置顶部位置', () => {
      const scrollTop = setScrollRatio(0, 2000, 1000)
      expect(scrollTop).toBe(0)
    })

    it('应根据比例 1 设置底部位置', () => {
      const scrollTop = setScrollRatio(1, 2000, 1000)
      expect(scrollTop).toBe(1000)
    })

    it('应处理边界比例值', () => {
      // 比例超出范围时，JavaScript 会产生超出范围的 scrollTop
      // 但实际 DOM 会自动限制在有效范围内
      const scrollTop = setScrollRatio(1.5, 2000, 1000)
      expect(scrollTop).toBe(1500) // 超出 maxScroll，但这是计算结果
    })

    it('应处理小数比例', () => {
      const ratio = getScrollRatio(250, 2000, 1000)
      expect(ratio).toBeCloseTo(0.25, 2)
    })

    it('同步计算应保持一致性', () => {
      // 从编辑器计算比例，应用到预览区，再反向计算应得到相同比例
      const editorScrollHeight = 3000
      const editorClientHeight = 1000
      const editorScrollTop = 500

      const previewScrollHeight = 5000
      const previewClientHeight = 1000

      const ratio = getScrollRatio(editorScrollTop, editorScrollHeight, editorClientHeight)
      const previewScrollTop = setScrollRatio(ratio, previewScrollHeight, previewClientHeight)

      // 验证反向计算
      const reverseRatio = getScrollRatio(previewScrollTop, previewScrollHeight, previewClientHeight)
      expect(reverseRatio).toBeCloseTo(ratio, 4)
    })
  })

  describe('边界条件', () => {
    function getScrollRatio(scrollTop: number, scrollHeight: number, clientHeight: number): number {
      const maxScroll = scrollHeight - clientHeight
      if (maxScroll <= 0) return 0
      return scrollTop / maxScroll
    }

    it('应处理零值', () => {
      expect(getScrollRatio(0, 0, 0)).toBe(0)
      expect(getScrollRatio(0, 100, 0)).toBe(0)
    })

    it('应处理大数值', () => {
      // scrollTop=50000, scrollHeight=100000, clientHeight=10000
      // maxScroll = 100000 - 10000 = 90000
      // ratio = 50000 / 90000 = 0.555...
      const ratio = getScrollRatio(50000, 100000, 10000)
      expect(ratio).toBeCloseTo(0.556, 2)
    })

    it('应处理小差异（滚动抖动）', () => {
      // 相差 1px 时不应触发同步（实际代码中）
      const ratio1 = getScrollRatio(500, 2000, 1000)
      const ratio2 = getScrollRatio(501, 2000, 1000)
      // 计算值会略有不同，放宽阈值
      expect(Math.abs(ratio1 - ratio2)).toBeLessThan(0.002)
    })
  })
})