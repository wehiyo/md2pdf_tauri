import { createApp } from 'vue'
import App from './App.vue'
import './styles/index.css'

// 导入 KaTeX 样式
import 'katex/dist/katex.min.css'

// 导入 highlight.js 样式
import 'highlight.js/styles/github.css'

createApp(App).mount('#app')
