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

这是一个 **Tauri 2.x** 桌面应用，前端使用 **Vue 3** —— 一个支持导出 HTML 和 PDF 的 Markdown 编辑器。

### 技术栈
- **GUI 框架**: Tauri 2.x（Rust 后端 + WebView 前端）
- **前端**: Vue 3 + TypeScript + Vite
- **样式**: Tailwind CSS
- **Markdown**: markdown-it 及插件（footnote、task-lists、anchor、toc 等）
- **数学公式**: KaTeX（离线渲染）
- **图表**: Mermaid
- **代码高亮**: highlight.js

### 关键架构模式

#### 前后端通信
- 使用 Tauri 插件实现原生功能：`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`
- PDF 导出使用 `getCurrentWindow().printToFile()` API（见 `src/composables/usePDF.ts`）
- 文件 I/O 通过 Tauri 插件 API，而非直接使用 Node.js fs

#### Markdown 渲染管道（`src/composables/useMarkdown.ts`）
markdown-it 实例配置为单例，包含：
- 自定义 fence 渲染器处理 `mermaid` 和 `math`/`latex` 代码块
- 文本渲染器覆盖处理行内数学公式（`$...$` 和 `$$...$$`）
- KaTeX 渲染在 Markdown 解析时完成，而非浏览器中

```
Markdown 输入 → markdown-it → 嵌入 KaTeX/Mermaid 的 HTML
                              ↓
                         预览（DOM）
                              ↓
                    Mermaid.render()（异步）
```

#### PDF 导出流程（`src/composables/usePDF.ts`）
1. 创建 A4 尺寸的隐藏 iframe
2. 注入编译后的 Markdown HTML + CSS + KaTeX 样式
3. 调用 Tauri 的 `printToFile()` 生成 PDF
4. 使用 `@page` CSS 规则实现专业分页

#### 状态管理
- 不使用 Vuex/Pinia —— 使用普通 ref 和 composables
- 主题状态持久化到 localStorage（`src/composables/useTheme.ts`）
- 编辑器内容作为 App.vue 中的响应式 ref，通过 v-model 向下传递

### 文件组织

```
src/
  components/          # Vue 组件
    Editor.vue         # 文本编辑器（v-model 模式）
    Preview.vue        # 渲染后的 HTML 预览 + Mermaid 初始化
    Toolbar.vue        # 操作按钮
  composables/         # Vue 组合式函数
    useMarkdown.ts     # markdown-it 配置和渲染
    usePDF.ts          # 通过 Tauri 导出 PDF 的逻辑
    useTheme.ts        # 深色/浅色主题管理
  styles/
    markdown.css       # GitHub 风格的 Markdown 渲染样式
    pdf.css            # @media print 优化
```

### 安全配置
见 `src-tauri/tauri.conf.json` —— 权限显式声明：
- `dialog:allow-open`、`dialog:allow-save` 用于文件选择
- `fs:allow-read-text-file`、`fs:allow-write-text-file` 用于文件读写
- 限定于标准目录（home、desktop、downloads、documents）

### 关键实现细节

1. **Mermaid 渲染**: 在 `Preview.vue` 中通过 `onUpdated` 生命周期 + `renderMermaid()` 完成。markdown-it 的 fence 渲染器仅将内容包装在 `<div class="mermaid">` 中。

2. **数学公式支持**:
   - 行内：`$公式$`（在文本渲染器中处理）
   - 块级：`$$公式$$` 或 ```math 代码块
   - 使用 `throwOnError: false` 防止解析失败

3. **PDF 样式**: CSS 以字符串形式嵌入在 `usePDF.ts` 中（非导入），因为 PDF 在孤立的 iframe 中渲染，无法访问应用的样式表。

4. **主题实现**: 在 `<html>` 上使用 Tailwind 的 `dark` 类，通过 localStorage 键 `md2pdf-theme` 持久化。

## 开发注意事项

- Tauri 需要 Rust 工具链（参见 https://tauri.app/start/prerequisites/）
- Tauri 开发服务器运行在 1420 端口（配置于 `vite.config.ts` 和 `tauri.conf.json`）
- 当前未配置单元测试框架
- 打包时需要将图标放置于 `src-tauri/icons/` 目录
