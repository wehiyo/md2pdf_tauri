# MarkRefine 项目改进建议

基于代码分析，以下是按优先级分类的改进建议。

---

## 🔴 高优先级改进

### 1. 缺少单元测试

项目完全没有测试覆盖。建议添加：

```bash
npm install -D vitest @vue/test-utils
```

创建 `vitest.config.ts` 并为核心 composables 编写测试。

**目标文件：**
- `src/composables/useMarkdown.ts` - Markdown 解析测试
- `src/composables/usePDF.ts` - PDF 导出流程测试
- `src/composables/useScrollSync.ts` - 滚动同步测试

### 2. TypeScript 类型安全问题

**问题位置：**
- `App.vue:69-72` - 使用 `@ts-ignore` 导入 CSS
- `usePDF.ts:135` - 使用 `new Function()` 有安全风险

**建议改进：**

```typescript
// 添加类型声明文件 src/vite-env.d.ts
declare module '*.css?raw' {
  const content: string
  export default content
}

// 或创建 src/types/vite.d.ts
```

对于 WaveDrom 解析，考虑使用更安全的解析方式：

```typescript
// 替代 new Function('return ' + code)()
import json5 from 'json5'
const data = json5.parse(code)
```

### 3. 错误处理不完善

**问题位置：**
- `useMarkdown.ts:62-66` - highlight 失败时静默忽略
- 多处 `catch` 只打印 console.error，未向用户反馈

**建议添加全局错误处理 composable：**

```typescript
// src/composables/useErrorHandling.ts
import { message } from '@tauri-apps/plugin-dialog'

export function useErrorHandling() {
  async function handleError(error: unknown, context: string) {
    console.error(`[${context}]`, error)
    await message(`${context}失败：${String(error)}`, { title: '错误', kind: 'error' })
  }

  function handleWarning(warning: unknown, context: string) {
    console.warn(`[${context}]`, warning)
  }

  return { handleError, handleWarning }
}
```

---

## 🟡 中优先级改进

### 4. 模块状态管理问题

**问题位置：** `useMarkdown.ts:384-387`

模块级计数器在多次渲染间可能污染：

```typescript
// 当前问题代码：
const headingCounters = { h2: 0, h3: 0, h4: 0 }
const headingIdMap = new Map<string, string>()
```

**建议改进：**

```typescript
// 方案 1：每次渲染时重置（已部分实现）
function renderBody(body: string): string {
  headingCounters.h2 = 0
  headingCounters.h3 = 0
  headingCounters.h4 = 0
  headingIdMap.clear()
  // ...
}

// 方案 2：移入函数内部使用闭包
export function useMarkdown() {
  let counters = { h2: 0, h3: 0, h4: 0 }
  let idMap = new Map<string, string>()

  function render(content: string) {
    counters = { h2: 0, h3: 0, h4: 0 }
    idMap = new Map()
    // ...
  }
}
```

### 5. PDF 导出代码拆分

**问题位置：** `usePDF.ts` - 653 行过长

**建议拆分结构：**

```
src/composables/
  usePDFExport.ts        # 主导出流程（协调器）
  usePDFStyles.ts        # PDF 样式生成
  usePDFPageNumbers.ts   # 页码、页眉处理
  usePDFBookmarks.ts     # 书签数据处理
  usePDFDiagrams.ts      # 图表预渲染
```

### 6. 缺少跨平台支持

**问题位置：** `src-tauri/src/print.rs:71`

仅支持 Windows：

```rust
#[cfg(not(windows))]
{
    Err("PDF silent print is only supported on Windows".to_string())
}
```

**建议改进：**

为 macOS/Linux 提供替代方案：

```rust
#[cfg(target_os = "macos")]
async fn print_on_macos(html: &str, save_path: &str) -> Result<PrintResult, String> {
    // 使用 wkhtmltopdf 或调用系统打印
}

#[cfg(target_os = "linux")]
async fn print_on_linux(html: &str, save_path: &str) -> Result<PrintResult, String> {
    // 使用 wkhtmltopdf
}
```

### 7. 性能优化机会

**问题位置：** `Preview.vue:254-263`

每次 HTML 变化都渲染所有图表：

```typescript
watch(() => props.html, async () => {
  await renderMermaid()
  await renderPlantuml()
  renderWavedrom()
  fixImagePaths()
  // ...
}, { immediate: true })
```

**建议改进：**

```typescript
import { debounce } from 'lodash-es'

// 添加防抖
const debouncedRender = debounce(async () => {
  await renderMermaid()
  await renderPlantuml()
  renderWavedrom()
}, 300)

watch(() => props.html, () => {
  debouncedRender()
  fixImagePaths()  // 图片路径需要立即修复
}, { immediate: true })

// 或增量渲染：只处理新增的图表
async function renderNewDiagrams() {
  const unprocessed = previewRef.value?.querySelectorAll('[data-processed!="true"]')
  // 只处理未处理的元素
}
```

---

## 🟢 低优先级改进

### 8. 代码重复

**问题：**
- `escapeHtml` 在 `useMarkdown.ts:374` 和 `usePDF.ts:505` 重复定义
- PDF 样式字符串嵌入 `usePDF.ts`，难以维护

**建议改进：**

```typescript
// 创建 src/utils/string.ts
export function escapeHtml(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// PDF 样式移到 src/assets/pdf-styles.css
// 或创建 src/styles/pdf-styles.ts 导出样式字符串
```

### 9. 缺少类型导出

**问题位置：** `useMarkdown.ts:29-32`

多个接口未导出：

```typescript
// 当前：ParseResult 未导出
export interface Metadata { ... }
interface ParseResult { ... }  // 缺少 export
```

**建议改进：**

```typescript
export interface ParseResult {
  metadata: Metadata
  body: string
}
```

### 10. 依赖版本管理

**问题位置：** `package.json`

建议更新依赖并锁定版本：

```json
{
  "dependencies": {
    "vue": "3.4.21",  // 锁定版本
    "mermaid": "10.9.0"
  },
  "devDependencies": {
    "typescript": "5.4.5",
    "vite": "5.2.8"
  }
}
```

添加依赖更新检查脚本：

```bash
npm install -D npm-check-updates
npx ncu -u  # 检查并更新
```

### 11. Rust 代码改进

**问题位置：**
- `print.rs` 使用大量 `unsafe` 代码块
- `bookmark.rs` 错误信息不够详细

**建议改进：**

```rust
// 添加更多安全检查和边界验证
fn validate_bookmark_data(bookmarks: &[BookmarkInput]) -> Result<(), String> {
    for bm in bookmarks {
        if bm.page < 0 {
            return Err(format!("无效页码: {}", bm.page));
        }
        if bm.level < 1 || bm.level > 4 {
            return Err(format!("无效标题层级: {}", bm.level));
        }
    }
    Ok(())
}

// 使用 typed error 替代 String
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PdfError {
    #[error("无法加载 PDF: {0}")]
    LoadError(String),
    #[error("无法保存 PDF: {0}")]
    SaveError(String),
}
```

### 12. 文档和注释

**问题：**
- TypeScript 代码缺少 JSDoc
- Composables 缺少使用说明

**建议改进：**

```typescript
/**
 * Markdown 渲染 composable
 *
 * 提供完整的 Markdown 解析和渲染功能，支持：
 * - YAML frontmatter 解析
 * - KaTeX 数学公式
 * - Mermaid/PlantUML/WaveDrom 图表
 * - 自定义 admonition 提示框
 * - 自动标题编号
 *
 * @example
 * ```ts
 * const { render, parse } = useMarkdown()
 * const { html, metadata } = render(markdownContent)
 * ```
 */
export function useMarkdown() {
  // ...
}
```

---

## 📋 架构建议

### 状态管理重构

当前使用分散的 ref，建议引入 Pinia 用于复杂状态：

```typescript
// src/stores/document.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Metadata } from '@/composables/useMarkdown'

export const useDocumentStore = defineStore('document', () => {
  const content = ref('')
  const currentPath = ref<string | null>(null)
  const savedContent = ref('')
  const metadata = ref<Metadata>({})

  const hasUnsavedChanges = computed(() => content.value !== savedContent.value)

  function setContent(newContent: string) {
    content.value = newContent
  }

  function markSaved() {
    savedContent.value = content.value
  }

  return {
    content,
    currentPath,
    savedContent,
    metadata,
    hasUnsavedChanges,
    setContent,
    markSaved
  }
})
```

### 配置管理

建议添加配置文件支持：

```typescript
// src/stores/settings.ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const zoomLevel = ref(100)
  const editorWidth = ref(50)
  const theme = ref<'light' | 'dark'>('light')
  const fileTreeWidth = ref(200)

  // 持久化到 localStorage
  watch(
    [zoomLevel, editorWidth, theme, fileTreeWidth],
    () => {
      localStorage.setItem('markrefine-settings', JSON.stringify({
        zoomLevel: zoomLevel.value,
        editorWidth: editorWidth.value,
        theme: theme.value,
        fileTreeWidth: fileTreeWidth.value
      }))
    },
    { deep: true }
  )

  // 初始化时从 localStorage 加载
  function loadFromStorage() {
    const saved = localStorage.getItem('markrefine-settings')
    if (saved) {
      const data = JSON.parse(saved)
      zoomLevel.value = data.zoomLevel ?? 100
      editorWidth.value = data.editorWidth ?? 50
      theme.value = data.theme ?? 'light'
      fileTreeWidth.value = data.fileTreeWidth ?? 200
    }
  }

  return {
    zoomLevel,
    editorWidth,
    theme,
    fileTreeWidth,
    loadFromStorage
  }
})
```

---

## 实施优先级总结

| 优先级 | 任务 | 预估工时 |
|--------|------|----------|
| 🔴 高 | 添加单元测试框架 | 2-3h |
| 🔴 高 | 修复 TypeScript 类型问题 | 1h |
| 🔴 高 | 改进错误处理机制 | 2h |
| 🟡 中 | 重构模块状态管理 | 1h |
| 🟡 中 | 拆分 PDF 导出代码 | 3-4h |
| 🟡 中 | 添加跨平台支持 | 4-6h |
| 🟡 中 | 性能优化（防抖渲染） | 2h |
| 🟢 低 | 消除代码重复 | 1h |
| 🟢 低 | 导出类型定义 | 0.5h |
| 🟢 低 | 更新依赖版本 | 1h |
| 🟢 低 | Rust 代码改进 | 2-3h |
| 🟢 低 | 添加代码文档 | 2h |

---

*生成日期：2026/04/10*