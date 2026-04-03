# 方案D：优化PDF导出流程 - 减少交互步骤

## 目标

将PDF导出流程从3次用户交互减少到2次，通过文件监控实现自动后处理。

---

## 流程对比

### 当前流程（3次交互）

| 步骤 | 操作 | 用户动作 |
|------|------|----------|
| 1 | 消息提示框 | 点击"确定" |
| 2 | 打印对话框 | 选择"Microsoft Print to PDF"，选择保存路径 |
| 3 | 文件选择对话框 | 选择刚才保存的PDF文件 |

### 优化后流程（2次交互）

| 步骤 | 操作 | 用户动作 |
|------|------|----------|
| 1 | 保存对话框 | 选择目标保存路径 |
| 2 | 打印对话框 | 选择"Microsoft Print to PDF"，保存到目标路径 |
| - | 自动后处理 | 无需用户操作（文件监控触发） |

---

## 技术方案

### 核心技术

1. **Tauri fs.watch API** - 监控文件系统事件
2. **save对话框** - 提前确定目标路径
3. **文件稳定性检测** - 确保PDF完全写入后再处理

### 关键API

```typescript
import { save } from '@tauri-apps/plugin-dialog'
import { watch, readFile, writeFile, stat } from '@tauri-apps/plugin-fs'

// 保存对话框
const targetPath = await save({
  filters: [{ name: 'PDF', extensions: ['pdf'] }],
  defaultPath: `${title}.pdf`
})

// 文件监控
const unwatch = await watch(parentDir, (event) => {
  // event.type: 'any' | { create: { kind: 'file' } } | { modify: ... }
  // event.paths: string[]
})

// 文件状态检测
const fileInfo = await stat(path)
// fileInfo.size: number
```

---

## 流程图

```
用户点击"导出PDF"
        │
        ▼
┌───────────────────────────┐
│  Step 1: save对话框弹出    │
│  - 用户选择保存路径        │
│  - 程序记录目标路径        │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Step 2: 启动文件监控      │
│  - watch(parentDirectory) │
│  - 监控 create/file 事件   │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Step 3: 创建iframe打印    │
│  - 打印对话框弹出          │
│  - 用户选择PDF打印机       │
│  - 保存到目标路径          │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Step 4: watch检测到创建   │
│  - 等待文件写入完成        │
│  - 自动添加页码和书签      │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Step 5: 完成提示          │
│  - 停止监控                │
│  - 提示用户PDF已完成       │
└───────────────────────────┘
```

---

## 实现代码草案

### generatePDF 函数重写

```typescript
async function generatePDF(
  contentWithoutToc: string,
  headings: Array<{ level: number; text: string; id: string }>,
  title: string
): Promise<void> {
  const contentWithPageAnchors = addPageAnchors(contentWithoutToc, headings)
  const bookmarkData: Array<{ level: number; text: string; pageNumber: number }> = []

  // Step 1: 先获取保存路径
  const targetPath = await save({
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: `${title}.pdf`,
    title: '保存 PDF 文件'
  })

  if (!targetPath) {
    // 用户取消保存
    return
  }

  // 获取父目录路径
  const parentDir = targetPath.substring(0, targetPath.lastIndexOf('\\'))
  const targetFileName = targetPath.substring(targetPath.lastIndexOf('\\') + 1)

  // Step 2: 启动文件监控
  let unwatch: (() => void) | null = null
  let processing = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  unwatch = await watch(parentDir, async (event) => {
    // 检测PDF文件创建或修改
    const isCreate = typeof event.type === 'object' && 'create' in event.type
    const isModify = typeof event.type === 'object' && 'modify' in event.type

    if (isCreate || isModify) {
      for (const path of event.paths) {
        if (path.endsWith('.pdf') && !processing) {
          processing = true

          // 清除超时计时器
          if (timeoutId) clearTimeout(timeoutId)

          try {
            // 等待文件写入完成
            await waitForFileStable(path)

            // 读取并处理PDF
            const pdfBytes = await readFile(path)
            const enhancedPdf = await enhancePDF(pdfBytes, bookmarkData)
            await writeFile(path, enhancedPdf)

            // 停止监控
            if (unwatch) unwatch()

            await message(`PDF 已保存并添加页码书签：${path}`, {
              title: '导出成功',
              kind: 'info'
            })
          } catch (e) {
            await message('PDF 后处理失败：' + String(e), {
              title: '错误',
              kind: 'error'
            })
          }
        }
      }
    }
  })

  // Step 3: 创建iframe并打印
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.width = '210mm'
  iframe.style.height = 'auto'
  iframe.style.border = 'none'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc) {
    if (unwatch) unwatch()
    document.body.removeChild(iframe)
    await message('无法创建打印文档', { title: '错误', kind: 'error' })
    return
  }

  // 写入HTML内容
  iframeDoc.open()
  iframeDoc.write(fullHtml)
  iframeDoc.close()

  // 等待渲染并计算书签页码
  await new Promise(r => setTimeout(r, 2000))
  bookmarkData = calculateBookmarkPages(iframeDoc, headings)

  // 打开打印对话框
  iframe.contentWindow?.focus()
  iframe.contentWindow?.print()

  // 清理iframe
  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe)
  }, 5000)

  // Step 4: 超时处理
  timeoutId = setTimeout(async () => {
    if (!processing && unwatch) {
      unwatch()
      const result = await ask('PDF 导出超时。\n\n是否手动选择已保存的PDF文件进行后处理？', {
        title: '超时提示',
        kind: 'warning'
      })
      if (result) {
        await manualSelectAndProcess(bookmarkData)
      }
    }
  }, 60000) // 60秒超时
}
```

### 文件稳定性检测函数

```typescript
/**
 * 等待文件写入完成（通过检测文件大小稳定）
 */
async function waitForFileStable(path: string): Promise<void> {
  let lastSize = 0
  let stableCount = 0
  const maxWaitTime = 10000 // 最大等待10秒
  const startTime = Date.now()

  while (stableCount < 3 && Date.now() - startTime < maxWaitTime) {
    try {
      const fileInfo = await stat(path)
      if (fileInfo.size === lastSize && lastSize > 0) {
        stableCount++
      } else {
        stableCount = 0
        lastSize = fileInfo.size
      }
    } catch {
      // 文件可能还未完全创建，继续等待
      stableCount = 0
    }
    await new Promise(r => setTimeout(r, 500))
  }

  // 最后等待一小段时间确保写入完成
  await new Promise(r => setTimeout(r, 1000))
}
```

### 手动选择备用函数

```typescript
/**
 * 超时后的手动选择备用方案
 */
async function manualSelectAndProcess(
  bookmarkData: Array<{ level: number; text: string; pageNumber: number }>
): Promise<void> {
  const selectedPdf = await open({
    multiple: false,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    title: '选择已保存的 PDF 文件'
  })

  if (!selectedPdf || typeof selectedPdf !== 'string') {
    return
  }

  try {
    const pdfBytes = await readFile(selectedPdf)
    const enhancedPdf = await enhancePDF(pdfBytes, bookmarkData)
    await writeFile(selectedPdf, enhancedPdf)
    await message(`PDF 已添加页码和书签：${selectedPdf}`, {
      title: '处理完成',
      kind: 'info'
    })
  } catch (e) {
    await message('处理失败：' + String(e), { title: '错误', kind: 'error' })
  }
}
```

---

## 配置修改

### tauri.conf.json 权限添加

```json
{
  "permissions": [
    "core:default",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "dialog:allow-message",
    "dialog:allow-ask",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-dir",
    "fs:allow-write-file",
    "fs:allow-remove",
    "fs:allow-temp-write",
    "fs:allow-temp-read",
    "fs:allow-watch",      // 新增：文件监控权限
    "fs:allow-stat"        // 新增：文件状态查询权限
  ]
}
```

---

## 边界情况处理

| 情况 | 处理方案 |
|------|----------|
| 用户取消保存对话框 | 直接返回，不启动监控和打印 |
| 用户保存到不同路径 | 监控父目录，检测任何PDF文件创建 |
| 用户长时间未操作 | 60秒超时后弹出询问，提供手动选择备用方案 |
| 文件写入未完成 | 轮询文件大小，等待稳定3次后才开始处理 |
| 用户覆盖已有文件 | watch同时检测modify事件 |
| 监控目录下有其他PDF | 检测任何PDF创建，不限定特定文件名 |
| 处理过程中出错 | 显示错误消息，保留原始PDF文件 |

---

## 用户体验改进

### 改进点

1. **交互次数减少**：从3次点击 → 2次点击
2. **流程更直观**：先选路径，再打印，符合用户直觉
3. **自动化后处理**：无需手动选择已保存文件
4. **超时友好提示**：长时间未操作提供备用方案

### 用户操作流程

```
用户视角：
1. 点击"导出PDF"按钮
2. 弹出保存对话框 → 选择保存位置和文件名
3. 弹出打印对话框 → 选择"Microsoft Print to PDF" → 点击打印
4. 等待几秒 → 自动弹出"导出成功"提示

（整个过程只需2次交互，无需再次选择文件）
```

---

## 实现步骤

1. **修改 tauri.conf.json**
   - 添加 `fs:allow-watch` 和 `fs:allow-stat` 权限

2. **修改 usePDF.ts**
   - 引入 `watch`, `stat`, `save`, `ask` API
   - 重写 `generatePDF` 函数
   - 添加 `waitForFileStable` 函数
   - 添加 `manualSelectAndProcess` 备用函数

3. **测试验证**
   - 测试正常流程
   - 测试取消保存场景
   - 测试超时场景
   - 测试覆盖已有文件场景

---

## 风险与限制

1. **文件监控范围**：需要权限配置正确，可能影响安全性
2. **跨平台兼容**：watch API在不同操作系统行为可能有差异
3. **超时判断**：60秒超时可能在复杂文档场景不够
4. **多PDF检测**：如果目录下同时有多个PDF创建可能误判

---

## 后续优化方向

1. **精确文件名匹配**：只监控目标文件名的创建
2. **进度指示**：添加处理进度动画
3. **取消机制**：提供取消导出按钮
4. **路径记忆**：保存上次使用的路径作为默认值