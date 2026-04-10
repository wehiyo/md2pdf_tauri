import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTheme } from './useTheme'

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key]),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
}

// Mock document.documentElement.classList
const classListMock = {
  classes: new Set<string>(),
  add: vi.fn((cls: string) => classListMock.classes.add(cls)),
  remove: vi.fn((cls: string) => classListMock.classes.delete(cls)),
  contains: vi.fn((cls: string) => classListMock.classes.has(cls)),
}

vi.stubGlobal('localStorage', localStorageMock)
vi.stubGlobal('document', {
  documentElement: {
    classList: classListMock,
  },
})

describe('useTheme', () => {
  beforeEach(() => {
    // 重置 mock 状态
    localStorageMock.store = {}
    classListMock.classes.clear()
    vi.clearAllMocks()
  })

  describe('主题状态', () => {
    it('初始主题应为 light', () => {
      const { theme } = useTheme()
      expect(theme.value).toBe('light')
    })

    it('主题值应为 light 或 dark', () => {
      const { theme } = useTheme()
      expect(['light', 'dark']).toContain(theme.value)
    })
  })

  describe('toggleTheme - 主题切换', () => {
    it('应从 light 切换到 dark', () => {
      const { theme, toggleTheme } = useTheme()
      theme.value = 'light'
      toggleTheme()
      expect(theme.value).toBe('dark')
    })

    it('应从 dark 切换到 light', () => {
      const { theme, toggleTheme } = useTheme()
      theme.value = 'dark'
      toggleTheme()
      expect(theme.value).toBe('light')
    })

    it('切换应更新 DOM 类', () => {
      const { theme, toggleTheme } = useTheme()
      theme.value = 'light'
      toggleTheme()
      expect(classListMock.add).toHaveBeenCalledWith('dark')
    })

    it('切换应持久化到 localStorage', () => {
      const { theme, toggleTheme } = useTheme()
      theme.value = 'light'
      toggleTheme()
      expect(localStorageMock.setItem).toHaveBeenCalledWith('markrefine-theme', 'dark')
    })
  })

  describe('setTheme - 设置主题', () => {
    it('应正确设置 light 主题', () => {
      const { theme, setTheme } = useTheme()
      setTheme('light')
      expect(theme.value).toBe('light')
    })

    it('应正确设置 dark 主题', () => {
      const { theme, setTheme } = useTheme()
      setTheme('dark')
      expect(theme.value).toBe('dark')
    })

    it('设置 light 主题应移除 dark 类', () => {
      const { setTheme } = useTheme()
      classListMock.classes.add('dark')
      setTheme('light')
      expect(classListMock.remove).toHaveBeenCalledWith('dark')
    })

    it('设置 dark 主题应添加 dark 类', () => {
      const { setTheme } = useTheme()
      setTheme('dark')
      expect(classListMock.add).toHaveBeenCalledWith('dark')
    })

    it('设置应持久化到 localStorage', () => {
      const { setTheme } = useTheme()
      setTheme('dark')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('markrefine-theme', 'dark')
    })
  })

  describe('DOM 类更新', () => {
    it('dark 主题时 html 应有 dark 类', () => {
      const { setTheme } = useTheme()
      setTheme('dark')
      expect(classListMock.classes.has('dark')).toBe(true)
    })

    it('light 主题时 html 应无 dark 类', () => {
      const { setTheme } = useTheme()
      setTheme('light')
      expect(classListMock.classes.has('dark')).toBe(false)
    })
  })
})