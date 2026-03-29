# MD2PDF - Markdown 转 HTML/PDF 编辑器

一个专业的 Markdown 编辑器，支持实时预览、导出 HTML 和 PDF，支持科学文档所需的各种特性。

## 特性

- ✨ 实时预览：边编辑边预览
- 📄 HTML 导出：导出为标准 HTML 文件
- 📑 PDF 导出：导出为专业格式 PDF
- 🎨 主题切换：支持浅色/深色主题
- 📐 数学公式：支持 LaTeX 公式（KaTeX）
- 📊 Mermaid 图表：流程图、时序图等
- 📝 代码高亮：支持多种编程语言
- ✅ 任务列表：GitHub 风格的任务列表
- 📋 目录生成：自动生成文档目录
- 📌 脚注支持：学术论文必备

## 技术栈

- **GUI 框架**: Tauri 2.x
- **前端**: Vue 3 + TypeScript + Vite
- **样式**: Tailwind CSS
- **Markdown**: markdown-it + 插件生态
- **数学公式**: KaTeX
- **图表**: Mermaid

## 开发环境要求

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (最新稳定版)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

## 快速开始

```bash
# 1. 克隆项目
git clone <repository-url>
cd md2pdf

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run tauri:dev

# 4. 构建生产版本
npm run tauri:build
```

## 项目结构

```
md2pdf/
├── src/                      # Vue 前端源码
│   ├── components/           # 组件
│   ├── composables/          # 组合式函数
│   ├── styles/               # 样式文件
│   └── main.ts               # 入口文件
├── src-tauri/                # Tauri 后端源码
│   └── src/main.rs           # Rust 主程序
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## 使用说明

### 基本操作

1. **打开文件**: 点击工具栏的"打开"按钮或使用快捷键
2. **保存文件**: 点击工具栏的"保存"按钮
3. **导出 HTML**: 点击"导出 HTML"按钮
4. **导出 PDF**: 点击"导出 PDF"按钮
5. **切换主题**: 点击右上角的主题图标

### Markdown 语法支持

- 标准 Markdown 语法
- 表格、代码块、引用块
- 数学公式：`$...$` 行内公式，`$$...$$` 块级公式
- Mermaid 图表：使用 ```mermaid 代码块
- 任务列表：`- [ ]` 和 `- [x]`
- 脚注：`[^1]` 和 `[^1]: 内容`

### PDF 导出

PDF 导出使用 Tauri 的 `print_to_pdf` API，生成的 PDF：
- 使用 A4 纸张大小
- 自动分页
- 保留所有样式和格式
- 支持打印优化

## 许可证

MIT License
