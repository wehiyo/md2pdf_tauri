import { createApp } from 'vue'
import App from './App.vue'
import './styles/index.css'
import './styles/markdown.css'

// 导入 KaTeX 样式
import 'katex/dist/katex.min.css'

// 导入 highlight.js 样式
import 'highlight.js/styles/github.css'

console.log('App starting...')
const app = createApp(App)
app.mount('#app')
console.log('App mounted')
