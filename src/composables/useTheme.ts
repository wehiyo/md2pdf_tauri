import { ref, onMounted } from 'vue'

const theme = ref<'light' | 'dark'>('light')

export function useTheme() {
  // 初始化：从 localStorage 读取主题
  onMounted(() => {
    const savedTheme = localStorage.getItem('md2pdf-theme')
    if (savedTheme === 'dark' || savedTheme === 'light') {
      theme.value = savedTheme
      updateDocumentClass()
    }
  })

  // 更新 html 的 dark 类
  function updateDocumentClass() {
    if (theme.value === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // 切换主题
  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    updateDocumentClass()
    localStorage.setItem('md2pdf-theme', theme.value)
  }

  // 设置主题
  function setTheme(newTheme: 'light' | 'dark') {
    theme.value = newTheme
    updateDocumentClass()
    localStorage.setItem('md2pdf-theme', newTheme)
  }

  return {
    theme,
    toggleTheme,
    setTheme
  }
}