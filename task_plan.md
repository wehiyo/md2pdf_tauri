# 任务计划：Markdown 转 HTML/PDF 专业编辑器

## 目标
创建一个功能完整的 Markdown 编辑器，支持实时预览、导出 HTML 和高质量 PDF，支持科学文档所需的各种特性，打包后可在单机离线运行。

## 当前阶段
阶段 5

## 各阶段

### 阶段 1：需求分析与技术选型
- [x] 理解用户核心需求
- [x] 确定技术栈（Tauri + Vue + TypeScript）
- [x] 评估科学文档支持方案
- [x] 记录技术决策到 findings.md
- **状态：** complete

### 阶段 2：项目初始化与架构设计
- [x] 创建 Tauri + Vue 项目结构
- [x] 配置开发环境和依赖
- [x] 设计应用架构（前端组件、后端 API）
- [x] 设计数据流和状态管理
- **状态：** complete

### 阶段 3：核心功能实现
- [x] 实现 Markdown 编辑器（textarea）
- [x] 实现实时预览功能
- [x] 集成 Markdown 解析（markdown-it + 插件）
- [x] 实现 HTML 导出功能
- **状态：** complete

### 阶段 4：PDF 导出与科学文档支持
- [x] 实现 PDF 导出（使用 Tauri 的 print_to_pdf）
- [x] 集成 KaTeX 数学公式支持
- [x] 集成 Mermaid 图表支持
- [x] 支持代码高亮、表格、脚注等
- **状态：** complete

### 阶段 5：UI/UX 优化与打包
- [x] 设计专业美观的界面
- [x] 实现主题切换（浅色/深色）
- [x] 配置 Tauri 打包选项
- [ ] 测试离线运行能力
- **状态：** in_progress

### 阶段 6：测试与交付
- [ ] 功能测试
- [ ] 性能测试
- [ ] 文档编写
- [ ] 最终交付
- **状态：** pending

## 关键问题
1. 如何在离线状态下渲染数学公式？→ 使用本地 KaTeX 库
2. PDF 分页如何处理？→ 使用 CSS @media print 和分页符控制
3. 如何保持预览和导出一致性？→ 统一使用相同的 HTML 模板和 CSS

## 已做决策
| 决策 | 理由 |
|------|------|
| Tauri 而非 Electron | 打包体积小（~5-15MB），使用系统 WebView2，更安全 |
| Vue 3 + TypeScript | 类型安全，生态丰富，适合中型项目 |
| markdown-it 而非 marked | 插件生态丰富，扩展性更好 |
| KaTeX 而非 MathJax | 渲染速度更快，支持离线 |
| 本地 print_to_pdf | 无需外部依赖，输出质量高 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 无 | 0 | - |

## 备注
- 技术栈：Tauri 2.x + Vue 3 + TypeScript + Vite
- 核心依赖：markdown-it, katex, mermaid, highlight.js
- 目标平台：Windows（优先）、macOS、Linux

## 文件清单

### 配置文件
- package.json - npm 配置
- tsconfig.json - TypeScript 配置
- vite.config.ts - Vite 配置
- tailwind.config.js - Tailwind CSS 配置
- postcss.config.js - PostCSS 配置
- index.html - HTML 入口

### 源代码
- src/main.ts - 入口文件
- src/App.vue - 根组件
- src/components/Editor.vue - 编辑器组件
- src/components/Preview.vue - 预览组件
- src/components/Toolbar.vue - 工具栏组件
- src/composables/useMarkdown.ts - Markdown 处理逻辑
- src/composables/usePDF.ts - PDF 导出逻辑
- src/composables/useTheme.ts - 主题管理
- src/styles/index.css - 基础样式
- src/styles/markdown.css - Markdown 渲染样式
- src/styles/pdf.css - PDF 打印样式

### Tauri 后端
- src-tauri/Cargo.toml - Rust 依赖
- src-tauri/build.rs - 构建脚本
- src-tauri/src/main.rs - Rust 主程序
- src-tauri/tauri.conf.json - Tauri 配置

### 文档
- README.md - 项目说明
- task_plan.md - 任务计划
- findings.md - 研究发现
- progress.md - 进度日志
