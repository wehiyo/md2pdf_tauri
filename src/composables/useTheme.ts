// 应用固定使用浅色模式

const theme = 'light'

export function useTheme() {
  // 确保使用浅色模式
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('dark')
  }

  return {
    theme
  }
}