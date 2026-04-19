# MarkRefine - Markdown 转 HTML/PDF 编辑器

一个专业的 Markdown 编辑器，支持实时预览、导出 HTML 和 PDF，支持 MkDocs 项目导入和静态站点导出，专为科学文档和技术文档设计。

## 特性

### 核心功能
- ✨ 实时预览：边编辑边预览，同步滚动
- 📄 HTML 导出：导出为独立 HTML 文件，包含所有样式
- 📑 PDF 导出：专业格式 PDF，支持书签、封面、页眉页脚
- 📁 MkDocs 模式：导入 MkDocs 项目，组合导出 PDF 或静态站点
- 🌐 静态站点：导出 Material 风格多页面站点，支持搜索和导航
- 🎨 主题切换：支持浅色/深色主题
- 🖼️ 图片支持：本地图片自动加载，支持尺寸属性
- 📝 文件编码：支持 UTF-8 和 GB18030 编码文件
- 🔍 全局搜索：跨文件搜索，快速定位内容

### Markdown 扩展
- 📐 数学公式：LaTeX 公式（KaTeX），支持行内 `$...$` 和块级 `$$...$$`
- 📊 Mermaid 图表：流程图、时序图、甘特图等
- 🌿 PlantUML 图表：UML 图、架构图等（需 Java）
- 📈 WaveDrom：数字时序图
- 📝 代码高亮：多种编程语言，带行号显示
- 📋 Admonition：12 种提示框类型（note、tip、warning、danger 等）
- 🔢 标题编号：h2-h4 自动层级编号（如 1.2.3）
- 📌 脚注：学术论文必备
- ✅ 任务列表：GitHub 风格
- 📑 YAML Frontmatter：元数据提取（title、author、date、密级等）

### PDF 高级功能
- 📖 书签：h1-h4 自动生成嵌套书签
- 📄 封面页：自动生成文档封面
- 🔖 页眉页脚：标题、密级、页码
- 📏 分页控制：h1 标题自动分页

### 静态站点功能
- 🎨 Material 风格：模仿 MkDocs Material 主题
- 📐 正文宽度：1000px 居中显示
- 📍 侧边栏导航：目录树导航，当前页面高亮
- 🔍 前端搜索：实时搜索，支持标题和内容
- 🔗 页面导航：上一篇/下一篇导航链接
- 🖼️ 图片复制：自动复制图片到 assets 目录

## 技术栈

| 类别 | 技术 |
|------|------|
| GUI 框架 | Tauri 2.x（Rust + WebView） |
| 前端 | Vue 3 + TypeScript + Vite |
| 样式 | Tailwind CSS |
| Markdown | markdown-it + 插件生态 |
| 数学公式 | KaTeX（离线渲染） |
| 图表 | Mermaid、PlantUML、WaveDrom |
| 代码高亮 | highlight.js |
| PDF 处理 | lopdf、pdf-extract、pdf-lib |

## 开发环境要求

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (最新稳定版)
- [Tauri CLI](https://tauri.app/start/prerequisites/)
- [Java 8+](https://www.java.com/)（可选，PlantUML 功能需要）

## 快速开始

```bash
# 1. 克隆项目
git clone <repository-url>
cd markrefine

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run tauri:dev

# 4. 构建生产版本
npm run tauri:build
```

## 项目结构

```
markrefine/
├── src/                        # Vue 前端源码
│   ├── components/
│   │   ├── Editor.vue          # 文本编辑器
│   │   ├── Preview.vue         # HTML 预览
│   │   ├── Toolbar.vue         # 工具栏
│   │   ├── SettingsDialog.vue  # 设置对话框（Tab样式）
│   │   ├── FileTree.vue        # 文件树
│   │   ├── MkdocsPreviewDialog.vue # MkDocs PDF 预览对话框
│   │   └── SearchResultDialog.vue  # 搜索结果对话框
│   ├── composables/
│   │   ├── useMarkdown.ts      # Markdown 渲染
│   │   ├── usePDF.ts           # PDF 导出
│   │   ├── useMkdocsExport.ts  # MkDocs 组合导出
│   │   ├── useStaticSiteExport.ts # 静态站点导出
│   │   ├── useConfig.ts        # 配置管理
│   │   ├── useFonts.ts         # 字体加载
│   │   ├── useTheme.ts         # 主题管理
│   │   └── useScrollSync.ts    # 滚动同步
│   ├── styles/
│   │   ├── markdown.css        # GitHub 风格样式
│   │   ├── pdf.css             # 打印样式
│   │   └── index.css           # Tailwind 入口
│   └── assets/                 # 示例文件、字体
│   └── main.ts                 # 入口文件
├── src-tauri/                  # Tauri 后端源码
│   ├── src/
│   │   ├── main.rs             # Tauri 入口
│   │   ├── print.rs            # PDF 打印
│   │   ├── bookmark.rs         # 书签注入
│   │   ├── pdf_extract.rs      # 标记提取
│   │   ├── plantuml.rs         # PlantUML 渲染
│   │   └── encoding.rs         # 文件编码支持
│   ├── assets/                 # plantuml.jar、内置字体
│   └── tauri.conf.json         # Tauri 配置
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── CLAUDE.md                   # 架构文档
```

## 使用说明

### 基本操作

| 操作 | 说明 |
|------|------|
| 打开文件 | 支持 .md、.markdown、.txt 文件 |
| 保存文件 | Ctrl+S 快捷键 |
| 导出 HTML | 导出完整 HTML 文件，可在浏览器中查看 |
| 导出 PDF | 导出专业 PDF，包含书签和页眉页脚 |
| 切换主题 | 浅色/深色主题切换 |
| 缩放 | Ctrl + 鼬轮调整界面缩放 |
| 全局搜索 | 跨文件搜索关键词 |

### MkDocs 模式

导入 MkDocs 项目后，可以：

1. **组合导出 PDF**：将所有 nav 条目合并为单个 PDF，自动编号、书签导航
2. **导出静态站点**：生成 Material 风格多页面站点

#### 导入 MkDocs 项目

点击「导入 MkDocs」按钮，选择 `mkdocs.yml` 文件。系统自动解析：
- `nav` 导航结构
- `docs_dir` 文档目录
- `site_name` 站点名称

#### 静态站点输出结构

```
输出目录/
├── index.html              # 首页
├── pages/
│   ├── chapter-1.html      # 第 1 章
│   ├── chapter-1-1.html    # 第 1.1 章
│   └── ...
├── assets/
│   ├── css/
│   │   └── site.css        # Material 风格样式
│   ├── js/
│   │   ├── search.js       # 搜索功能
│   │   └── navigation.js   # 导航高亮
│   └── images/             # 图片资源
└── search-index.json       # 搜索索引
```

### Markdown 语法支持

#### 标准语法
- 段落、标题、粗体、斜体、删除线
- 有序列表、无序列表、任务列表
- 表格、代码块、引用块
- 链接、图片（支持本地路径）

#### 数学公式
```markdown
行内公式：$E = mc^2$

块级公式：
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

或使用代码块：
```math
\frac{a}{b}
\```
```

#### 图表

**Mermaid：**
```markdown
\```mermaid
graph LR
    A[开始] --> B[处理]
    B --> C[结束]
\```
```

**PlantUML：**
```markdown
\```plantuml
@startuml
Alice -> Bob: Hello
@enduml
\```
```

**WaveDrom：**
```markdown
\```wavedrom
{ signal: [
  { name: "clk", wave: "p...." },
  { name: "data", wave: "x345x" }
]}
\```
```

#### Admonition 提示框
```markdown
!!! note 注意
    这是一个提示框

!!! warning 警告
    这是警告信息
```

支持类型：`note`、`tip`、`warning`、`danger`、`info`、`success`、`failure`、`bug`、`example`、`quote`、`abstract`、`question`

#### YAML Frontmatter
```yaml
---
title: 文档标题
author: 作者
date: 2026-04-08
security level: 内部资料
---

# 文档内容
```

#### 图片属性
```markdown
![图片描述](image.png){ width="300" }
```

#### 脚注
```markdown
正文内容[^1]

[^1]: 脚注内容
```

### PDF 导出特性

PDF 导出使用 WebView2 PrintToPdf API（Windows），生成特性：

- **封面页**：自动生成，显示标题、作者、日期、密级
- **书签**：h1-h4 标题自动生成嵌套书签
- **页眉**：文档标题 + 密级信息
- **页脚**：页码
- **分页**：h1 标题自动分页（除第一个）
- **样式保留**：完整保留 Markdown 渲染样式
- **图表嵌入**：Mermaid、PlantUML、WaveDrom 预渲染为 SVG

### 排版设置

在设置对话框中可调整：

| 设置项 | 说明 |
|--------|------|
| 中文字体 | 等线、微软雅黑、思源黑体等 |
| 英文字体 | Arial、Times New Roman 等 |
| 代码字体 | Source Code Pro、Consolas 等 |
| 基础字号 | 12px - 22px |
| 行间距 | 1.4 - 2.0 |
| 段落间距 | 0.5em - 1.5em |
| 预览宽度 | 600px - 1200px |
| 预览背景 | 白色、浅灰、暖黄、褐色等 |

## PlantUML 配置

PlantUML 功能需要 Java 环境：

1. 安装 Java 8 或更高版本
2. 将 `plantuml.jar` 放置到 `src-tauri/assets/` 目录
3. 下载地址：https://plantuml.com/download

## 许可证

MIT License