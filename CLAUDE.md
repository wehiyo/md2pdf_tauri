# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供本代码库的工作指导。

## 构建命令

```bash
# 开发模式 - 启动 Vite 开发服务器和 Tauri 应用
npm run tauri:dev

# 仅构建前端（生产环境）
npm run build

# 构建完整的 Tauri 应用（生产环境）
npm run tauri:build

# 预览生产构建
npm run preview
```

## 架构概览

这是一个 **Tauri 2.x** 桌面应用，前端使用 **Vue 3** —— 支持导出 HTML 和 PDF 的 Markdown 编辑器。

### 技术栈
- **GUI 框架**: Tauri 2.x（Rust 后端 + WebView 前端）
- **前端**: Vue 3 + TypeScript + Vite
- **样式**: Tailwind CSS
- **Markdown**: markdown-it 及插件（footnote、deflist、abbr、anchor、emoji、sup/sub）
- **数学公式**: KaTeX（解析时离线渲染）
- **图表**: Mermaid（异步渲染）、PlantUML（通过 Java 子进程）、WaveDrom（数字时序图）
- **代码高亮**: highlight.js

### 关键架构模式

#### 前后端通信
- 使用 Tauri 插件实现原生功能：`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`、`@tauri-apps/plugin-shell`
- PDF 导出使用自定义 Rust 命令：`print_to_pdf`、`inject_bookmarks`、`extract_pdf_markers`
- 文件 I/O 通过 Tauri 插件 API，而非直接使用 Node.js fs

#### Markdown 渲染管道（`src/composables/useMarkdown.ts`）
markdown-it 实例配置为单例，包含：
- 自定义 fence 渲染器处理 `mermaid`、`plantuml`、`wavedrom` 和 `math`/`latex` 代码块
- 自定义 block 解析器处理 `$$...$$` 块级公式和 admonition 提示框（`!!! type title`）
- 文本渲染器覆盖处理行内数学公式（`$...$`）
- KaTeX 在解析时渲染，而非浏览器中
- h2-h4 自动标题编号，层级格式如 "1.2.3"
- YAML frontmatter 解析提取元数据（title、author、date、自定义字段）

```
Markdown 输入 → YAML 解析 → markdown-it → 嵌入 KaTeX/Mermaid/PlantUML/WaveDrom 占位的 HTML
                                          ↓
                                     预览（DOM）
                                          ↓
                              Mermaid.render() + PlantUML（异步，通过 Java）+ WaveDrom.renderWaveElement()
```

#### PDF 导出流程（`src/composables/usePDF.ts`）
多阶段流程，依赖 Rust 后端：
1. **预渲染图表**：Mermaid 通过 `mermaid.render()`，PlantUML 通过 `render_plantuml` Rust 命令（Java 子进程）
2. **注入标记文本**：在每个标题处隐藏 ASCII 标记（`PDFMARK000` 等）用于书签定位
3. **添加分页**：h1 标题（除第一个外）添加 `page-break-before: always`
4. **生成 PDF**：隐藏 WebView2 窗口调用 `PrintToPdf` API（仅 Windows）
5. **提取标记位置**：`extract_pdf_markers` 命令使用 pdf-extract crate 在 PDF 中定位标记
6. **注入书签**：`inject_bookmarks` 命令修改 PDF 对象树，添加 UTF-16BE 编码的书签条目
7. **添加页码**：pdf-lib 添加页眉/页脚（标题、密级、页码），使用嵌入的中文字体

PDF 书签支持 h1-h4 嵌套层级。标记定位确保精确的 Y 坐标。

#### 状态管理
- 不使用 Vuex/Pinia —— 使用普通 ref 和 composables
- 主题持久化到 localStorage（`markrefine-theme`）
- 编辑器内容作为 App.vue 中的响应式 ref，通过 v-model 向下传递
- 导出进度通过 `useExportProgress` composable 跟踪，带步骤 UI

### 文件组织

```
src/
  components/
    Editor.vue          # 文本编辑器（v-model 模式）
    Preview.vue         # HTML 预览 + Mermaid/PlantUML 异步初始化
    Toolbar.vue         # 操作按钮
    ExportProgress.vue  # PDF 导出进度覆盖层
  composables/
    useMarkdown.ts      # markdown-it 配置、YAML 解析、渲染
    usePDF.ts           # PDF 导出与书签
    useExportProgress.ts # 导出状态跟踪
    useTheme.ts         # 深色/浅色主题
  styles/
    markdown.css        # GitHub 风格样式
    pdf.css             # @media print 优化
    index.css           # Tailwind 入口

src-tauri/src/
  main.rs               # Tauri 入口，注册所有命令
  print.rs              # WebView2 PrintToPdf（仅 Windows）、书签位置提取
  bookmark.rs           # PDF 书签注入（通过 lopdf）
  pdf_extract.rs        # 标记文本提取（通过 pdf-extract crate）
  plantuml.rs           # PlantUML 渲染（通过 Java 子进程）
```

### 安全配置
见 `src-tauri/tauri.conf.json` —— 权限显式声明：
- `dialog:allow-open`、`dialog:allow-save` 用于文件对话框
- `fs:allow-read-text-file`、`fs:allow-write-text-file` 用于文件读写
- `shell:allow-execute` 用于 PlantUML Java 子进程
- 限定于标准目录（home、desktop、downloads、documents）

### 关键实现细节

1. **Mermaid 渲染**：`Preview.vue` 通过 `onUpdated` + `renderMermaid()` 完成。Fence 渲染器将内容包装在 `<div class="mermaid">` 中。

2. **PlantUML 渲染**：需要 Java 8+ 和 `plantuml.jar` 在 `src-tauri/assets/` 目录。前端编码内容，Rust 启动 Java 子进程，返回 SVG。

3. **WaveDrom 渲染**：数字时序图渲染，使用纯前端 JavaScript 库。Fence 渲染器将内容包装在 `<div class="wavedrom">` 中，`Preview.vue` 调用 `WaveDrom.renderWaveElement()` 渲染 SVG。PDF 导出时使用 `WaveDrom.renderAny()` 预渲染。

4. **数学公式支持**：
   - 行内：`$公式$`（文本渲染器处理）
   - 块级：`$$公式$$` 或 ```math 代码块
   - 使用 `throwOnError: false` 防止解析失败

5. **Admonition 提示框**：自定义 block 解析器支持 `!!! type title` 语法，12 种类型（note、tip、warning、danger、info 等）。支持缩进内容和显式 `!!!` 结束标记。

6. **YAML Frontmatter**：解析 `---` 分隔的头部元数据：`title`、`author`、`date`、`security level` 及任意自定义字段。用于 PDF 封面页和页眉。

7. **标题编号**：h2-h4 自动层级编号（1.1、1.1.1 等）通过自定义 `heading_open` 渲染器。ID 包含前缀（如 `1-2-introduction`）。

8. **图片属性**：`![alt](src){ width="300" }` 语法通过后处理支持。生成带 style 的 `<img>` 标签。

9. **PDF 样式**：CSS 以字符串形式嵌入在 `usePDF.ts` 中（非导入），因为 PDF 在孤立 iframe 中渲染，无法访问应用样式表。

10. **主题实现**：`<html>` 使用 Tailwind 的 `dark` 类。通过 localStorage 键 `markrefine-theme` 持久化。

## 开发注意事项

- Tauri 需要 Rust 工具链（参见 https://tauri.app/start/prerequisites/）
- PlantUML 需要 Java 8+ 和 `plantuml.jar` 在 `src-tauri/assets/` 目录
- 开发服务器运行在 1420 端口（配置于 `vite.config.ts` 和 `tauri.conf.json`）
- PDF 静默打印仅支持 Windows（WebView2 PrintToPdf API）
- 当前未配置单元测试框架
- 打包时需要将图标放置于 `src-tauri/icons/` 目录