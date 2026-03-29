# 发现与决策

## 需求分析

### 核心需求
1. **Markdown 编辑**：实时编辑 Markdown 文档
2. **实时预览**：边编辑边预览渲染效果
3. **HTML 导出**：将 Markdown 导出为 HTML 文件
4. **PDF 导出**：将 Markdown 导出为专业格式的 PDF
5. **离线运行**：不依赖网络，单机可用

### 科学文档特性需求
- 数学公式（LaTeX 语法）
- 代码块与高亮
- 表格（支持复杂样式）
- 图表（流程图、时序图等）
- 脚注和引用
- 目录生成

## 技术研究发现

### Markdown 解析方案对比
| 方案 | 优点 | 缺点 |
|------|------|------|
| markdown-it | 插件丰富、速度快、CommonMark 兼容 | 需要手动配置插件 |
| marked | 轻量、易用 | 插件生态较弱 |
| unified/remark | 功能强大、可定制 | 配置复杂 |

**决策**：使用 markdown-it + 插件生态

### PDF 生成方案对比
| 方案 | 优点 | 缺点 |
|------|------|------|
| Tauri print_to_pdf | 无额外依赖、质量高 | 依赖系统打印 |
| puppeteer | 功能全面 | 需要打包 Chromium |
| jsPDF | 纯前端 | 不支持复杂 CSS |
| weasyprint | 专业排版 | 需要 Python 依赖 |

**决策**：使用 Tauri 原生 print_to_pdf API

### 数学公式渲染方案
| 方案 | 优点 | 缺点 |
|------|------|------|
| KaTeX | 速度快、可离线 | 部分高级功能不支持 |
| MathJax | 功能全面 | 体积大、速度慢 |

**决策**：使用 KaTeX，配合 mhchem 扩展支持化学公式

## 技术决策汇总
| 决策 | 理由 |
|------|------|
| Tauri 2.x | 体积小、性能好、安全、跨平台 |
| Vue 3 Composition API | 现代、类型友好、逻辑复用方便 |
| TypeScript | 类型安全、IDE 支持好 |
| Vite | 构建速度快、生态好 |
| Tailwind CSS | 实用优先、快速开发 |
| Monaco Editor | VS Code 同款、功能强大 |

## 项目结构规划
```
md2pdf/
├── src/                      # Vue 前端源码
│   ├── components/           # 组件
│   │   ├── Editor.vue        # 编辑器组件
│   │   ├── Preview.vue       # 预览组件
│   │   └── Toolbar.vue       # 工具栏
│   ├── composables/          # 组合式函数
│   │   ├── useMarkdown.ts    # Markdown 处理
│   │   └── usePDF.ts         # PDF 导出
│   ├── styles/               # 样式文件
│   │   ├── markdown.css      # Markdown 渲染样式
│   │   └── pdf.css           # PDF 打印样式
│   ├── utils/                # 工具函数
│   ├── App.vue               # 根组件
│   └── main.ts               # 入口文件
├── src-tauri/                # Tauri 后端源码
│   ├── src/                  # Rust 源码
│   └── Cargo.toml            # Rust 依赖
├── public/                   # 静态资源
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 无 | - |

## 资源
- Tauri 文档：https://tauri.app/
- markdown-it 文档：https://markdown-it.github.io/
- KaTeX 文档：https://katex.org/docs/
- Mermaid 文档：https://mermaid.js.org/

## 视觉/浏览器发现
- 无（离线项目，不依赖外部资源）

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*
