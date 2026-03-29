import { ref, watch } from 'vue'

const STORAGE_KEY = 'md2pdf-theme'

// 主题状态
const isDark = ref(false)

// 从 localStorage 加载主题设置
function loadTheme() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    isDark.value = saved === 'dark'
  } else {
    // 检测系统偏好
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  applyTheme()
}

// 应用主题
function applyTheme() {
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// 切换主题
function toggle() {
  isDark.value = !isDark.value
  localStorage.setItem(STORAGE_KEY, isDark.value ? 'dark' : 'light')
  applyTheme()
}

// 初始化
loadTheme()

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem(STORAGE_KEY)) {
    isDark.value = e.matches
    applyTheme()
  }
})

export function useTheme() {
  return {
    isDark,
    toggle
  }
}
