# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供本代码库的工作指导。

## 构建与测试命令

```bash
# 开发模式 - 启动 Vite 开发服务器和 Tauri 应用
npm run tauri:dev

# 仅启动前端开发服务器（Vite，端口 5173）
npm run dev

# 仅构建前端（生产环境）
npm run build

# 构建完整的 Tauri 应用（生产环境）
npm run tauri:build

# 预览生产构建
npm run preview

# 运行测试
npm run test              # 交互式测试
npm run test:run          # 单次运行
npm run test:coverage     # 带覆盖率报告
```

测试使用 Vitest + happy-dom，覆盖 `src/composables/**` 和 `src/utils/**`。Vitest 已启用 `globals: true`（`describe`/`it`/`expect` 无需导入），`@` 路径别名映射到 `src/`。

## 架构概览

这是一个 **Tauri 2.x** 桌面应用，前端使用 **Vue 3** —— 支持导出 HTML 和 PDF 的 Markdown 编辑器。核心功能包括 MkDocs 项目导出和静态站点生成。

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
- 文件读取支持自动编码检测（UTF-8/GB18030）：`read_file_with_encoding`
- 字体管理：`get_font_path`、`get_font_base64`、`scan_fonts_dir`

#### Markdown 渲染管道（`src/composables/useMarkdown.ts`）
markdown-it 实例配置为单例，包含：
- 自定义 fence 渲染器处理 `mermaid`、`plantuml`、`wavedrom` 和 `math`/`latex` 代码块
- 自定义 block 解析器处理 `$$...$$` 块级公式和 admonition 提示框（`!!! type title`）
- 文本渲染器覆盖处理行内数学公式（`$...$`）
- KaTeX 在解析时渲染，而非浏览器中
- h2-h4 自动标题编号，层级格式如 "1.2.3"
- MkDocs 模式标题 ID 生成（使用 `slugifyForMkdocs`）
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

#### MkDocs 导出流程（`src/composables/useMkdocsExport.ts`）
将 MkDocs 项目导出为单一 PDF，支持多章节合并：
1. **解析 nav 配置**：从 mkdocs.yml 的 `nav` 部分提取章节结构
2. **收集章节**：`collectNavChapters` 递归遍历 nav，生成章节编号（1、1.1、1.1.1）
3. **加载内容**：`loadAllMdFiles` 异步读取所有 Markdown 文件
4. **调整标题层级**：`renumberHeadings` 根据 nav 层级调整 h2-h6 层级和编号
5. **合并渲染**：`combineChaptersToHtml` 将所有章节合并为单一 HTML，处理跨文件锚点链接
6. **生成书签树**：`BookmarkTreeNode` 结构用于 PDF 书签和 UI 展示

关键特性：
- nav 第 1 层（level 0）标题作为 h1，nav 第 2 层（level 1）标题作为 h2
- 文件内 h2-h6 相对于 nav 标题保持原有层级差
- 跨文件链接（`data.md#xxx`）自动转换为内部锚点（`#xxx`）

#### 静态站点导出（`src/composables/useStaticSiteExport.ts`）
将 MkDocs 项目导出为 MkDocs Material 风格的静态站点：
- Material 风格 CSS（顶部导航栏、左侧边栏、响应式设计）
- 搜索索引嵌入每个页面（JSON 格式）
- 页面导航（上一篇/下一篇）
- 图片自动复制到 `assets/images/`

#### 配置管理（`src/composables/useConfig.ts`）
字体和排版配置持久化到 `config.json`：
- 中文字体、英文字体、代码字体（内置 + 自定义）
- 正文字号（12-22px）、行间距（1.4-2.0）、段落间距（0.5-1.5em）
- 预览宽度（600-1200px）、预览背景色
- 内置字体：思源黑体、思源宋体、Source Code Pro

#### 状态管理
- 不使用 Vuex/Pinia —— 使用普通 ref 和 composables
- 配置持久化到 Tauri app_config_dir
- 主题持久化到 localStorage（`markrefine-theme`）
- 编辑器内容作为 App.vue 中的响应式 ref，通过 v-model 向下传递
- 导出进度通过 `useExportProgress` composable 跟踪，带步骤 UI

### 文件组织

```
src/
  components/
    Editor.vue              # 文本编辑器（v-model 模式）
    Preview.vue             # HTML 预览 + Mermaid/PlantUML 异步初始化
    Toolbar.vue             # 操作按钮
    ExportProgress.vue      # PDF 导出进度覆盖层
    LeftSidebar.vue         # 左侧边栏（文件树/大纲）
    FileTreeItem.vue        # 文件树节点组件
    OutlinePanel.vue        # 大纲面板
    SettingsDialog.vue      # 设置对话框（字体/排版）
    MkdocsPreviewDialog.vue # MkDocs 预览对话框
    BookmarkTreeItem.vue    # 书签树节点组件
    PreviewToolbar.vue      # 预览区工具栏
  composables/
    useMarkdown.ts          # markdown-it 配置、YAML 解析、渲染
    usePDF.ts               # PDF 导出与书签
    useMkdocsExport.ts      # MkDocs 项目导出
    useStaticSiteExport.ts  # 静态站点导出
    useConfig.ts            # 配置管理（字体/排版）
    useFonts.ts             # 字体加载与 CSS 变量设置
    useExportProgress.ts    # 导出状态跟踪
    useTheme.ts             # 深色/浅色主题
    useErrorHandling.ts     # 错误处理
    useScrollSync.ts        # 编辑器/预览滚动同步
  utils/
    normalizePath.ts        # 路径规范化
  styles/
    markdown.css            # GitHub 风格样式
    pdf.css                 # @media print 优化
    index.css               # Tailwind 入口

src-tauri/src/
  main.rs                   # Tauri 入口，注册所有命令
  print.rs                  # WebView2 PrintToPdf（仅 Windows）、书签位置提取
  bookmark.rs               # PDF 书签注入（通过 lopdf）
  pdf_extract.rs            # 标记文本提取（通过 pdf-extract crate）
  plantuml.rs               # PlantUML 渲染（通过 Java 子进程）
  font_subset.rs            # 字体子集化（用于 PDF 页码字体）
```

### Rust 依赖映射

| Crate | 用途 |
|-------|------|
| `lopdf` 0.38 | PDF 书签注入，直接操作 PDF 对象树 |
| `pdf-extract` 0.10 | 从 PDF 提取文本位置，用于书签定位 |
| `pdf-lib` + `@pdf-lib/fontkit` | 前端侧 PDF 页码/页眉/页脚（JS） |
| `fontcull` 2.0 | 中文大字体文件子集化，仅保留 PDF 所需的少量字符 |
| `ttf-parser` 0.24 | 从字体文件提取字体家族名称 |
| `encoding_rs` 0.8 | GB18030 编码支持（文件读取） |
| `base64` 0.22 | 字体文件 base64 编码（供前端 PDF 使用） |
| `webview2-com` 0.38 | Windows WebView2 PrintToPdf API（仅 Windows） |

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

7. **标题编号**：
   - 单文件模式：h2-h4 自动层级编号（1.1、1.1.1 等）
   - MkDocs 模式：根据 nav 层级和文件内标题联合编号
   - ID 生成：单文件模式带编号前缀，MkDocs 模式使用 slugify（无编号）

8. **图片属性**：`![alt](src){ width="300" }` 语法通过后处理支持。生成带 style 的 `<img>` 标签。

9. **PDF 样式**：CSS 以字符串形式嵌入在 `usePDF.ts` 中（非导入），因为 PDF 在孤立 iframe 中渲染，无法访问应用样式表。

10. **主题实现**：`<html>` 使用 Tailwind 的 `dark` 类。通过 localStorage 键 `markrefine-theme` 持久化。

11. **字体加载**：自定义字体通过 `@font-face` 动态注入，使用 Tauri `convertFileSrc` 转换为 asset URL。内置思源字体从 `src-tauri/assets/fonts/` 加载。

12. **跨文件锚点链接**：MkDocs 导出时，`data.md#数据库` 自动转换为 `#数据库`（使用 slugify 生成 ID）。

## 应用生命周期

- **启动流程**：先显示 splash 窗口（透明无边框），前端加载完成后调用 `close_splash_window` Rust 命令关闭 splash 并显示主窗口
- **关闭流程**：主窗口的 `CloseRequested` 被 Rust 端阻止（`api.prevent_close()`），改为向前端发送 `close-requested` 事件，由 Vue 处理关闭逻辑（如保存确认）
- **打印窗口**：PDF 导出时创建隐藏的 `print-window` WebView2 窗口，关闭主窗口时自动销毁

## 开发注意事项

- Tauri 需要 Rust 工具链（参见 https://tauri.app/start/prerequisites/）
- PlantUML 需要 Java 8+ 和 `plantuml.jar` 在 `src-tauri/assets/` 目录
- 开发服务器运行在 5173 端口（配置于 `vite.config.ts` 和 `tauri.conf.json`）
- PDF 静默打印仅支持 Windows（WebView2 PrintToPdf API）
- 自定义字体放置于 `src-tauri/assets/fonts/` 目录，应用自动扫描
- 打包时需要将图标放置于 `src-tauri/icons/` 目录
- 前端 `@` 路径别名映射到 `src/` 目录