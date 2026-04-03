# 方案C：Rust实现静默打印到PDF

## 目标

通过 Tauri Rust 后端直接访问 WebView2 底层 API，实现静默生成 PDF（无对话框）。

---

## 实现状态

**✅ 已完成编译和构建**

### 已完成
- [x] Tauri 2.x `with_webview` API 可访问底层 `ICoreWebView2Controller`
- [x] `webview2-com` crate 依赖已添加 (v0.38.2)
- [x] `windows-core` crate 依赖已添加 (v0.61)
- [x] `print_to_pdf` Rust command 已实现
- [x] `check_print_support` Rust command 已实现
- [x] 使用 `PrintToPdfCompletedHandler::wait_for_async_operation` 处理异步回调
- [x] 使用 `NavigateToString` 加载 HTML 内容
- [x] 使用 `NavigationCompletedEventHandler` 等待渲染完成
- [x] 前端 `usePDF.ts` 已更新支持静默打印
- [x] 编译成功，MSI 和 NSIS 安装包已生成

### 待测试
- [ ] 验证静默打印功能是否正常工作
- [ ] 测试不同 HTML 内容的打印效果
- [ ] 测试书签和页码添加

---

## 技术发现

### Handler 创建模式

webview2-com 使用宏 `#[completed_callback]` 生成 Handler：

```rust
// 宏展开后的结构
pub struct PrintToPdfCompletedHandler(::std::cell::UnsafeCell<Option<PrintToPdfCompletedHandlerClosure>>);

impl PrintToPdfCompletedHandler {
    pub fn create(closure: PrintToPdfCompletedHandlerClosure) -> ICoreWebView2PrintToPdfCompletedHandler {
        Self(Some(closure).into()).into()
    }

    pub fn wait_for_async_operation(
        operation_closure: Box<dyn FnOnce(ICoreWebView2PrintToPdfCompletedHandler) -> webview2_com::Result<()>>,
        completed_closure: PrintToPdfCompletedHandlerClosure,
    ) -> webview2_com::Result<()> {
        // 内部使用 mpsc::channel 和消息泵等待完成
    }
}

// 闭包签名
type PrintToPdfCompletedHandlerClosure = Box<
    dyn FnOnce(core::result::Result<(), windows_core::Error>, bool) -> core::result::Result<(), windows_core::Error>
>;
```

### Tauri 2.x 关键API

```rust
// 从 WebviewWindow 访问底层 webview
webview_window.with_webview(|webview| {
    let platform_webview: PlatformWebview = webview;
    // Windows 上可以获取:
    let controller: ICoreWebView2Controller = platform_webview.controller();
    let environment: ICoreWebView2Environment = platform_webview.environment();
});
```

### PlatformWebview 结构

```rust
pub struct PlatformWebview { /* private fields */ }

impl PlatformWebview {
    /// 返回 WebView2 controller
    pub fn controller(&self) -> ICoreWebView2Controller

    /// 返回 WebView2 environment
    pub fn environment(&self) -> ICoreWebView2Environment
}
```

### WebView2 PrintToPdf API

根据 [Microsoft WebView2 文档](https://learn.microsoft.com/microsoft-edge/webview2/how-to/print)，WebView2 提供：

| API | 说明 |
|-----|------|
| `PrintToPdf` | 静默打印到指定路径的 PDF 文件 |
| `PrintToPdfStream` | 静默打印到 PDF 流 |
| `PrintSettings` | 打印设置（页面大小、方向、边距等） |

### webview2-com crate

项目已依赖 `webview2-com = "0.39.1"`，提供：

- `PrintToPdfCompletedHandler` - PrintToPdf 完成回调
- `PrintToPdfStreamCompletedHandler` - PrintToPdfStream 完成回调
- `ICoreWebView2PrintSettings` - 打印设置接口

---

## 剩余问题

### 问题1：如何加载自定义HTML到 Webview？

WebView2 的 `PrintToPdf` 打印的是当前 webview 的内容。需要：

**方案A：NavigateToString（推荐）**
```rust
// 使用 NavigateToString 加载 HTML
core_webview_2
    .NavigateToString(&HSTRING::from(html.as_str()))
    .map_err(|e| format!("NavigateToString failed: {}", e))?;

// 等待导航完成 - 监听 NavigationCompleted 事件
```

**方案B：创建临时隐藏 Webview（复杂）**
```rust
// 需要创建新的 webview window 用于打印
// Tauri 2.x 的 WebviewWindowBuilder 可以创建隐藏窗口
```

### 问题2：前端集成

当前前端仍使用传统打印对话框方式。需要修改流程：

1. 用户点击"导出PDF"
2. 前端准备 HTML 内容
3. 前端调用 `invoke('print_to_pdf', { html, savePath })`
4. Rust 后端：
   - 使用 `NavigateToString` 加载 HTML
   - 等待 `NavigationCompleted`
   - 调用 `PrintToPdf`
   - 返回 PDF 路径
5. 前端使用 pdf-lib 添加页码和书签
6. 完成

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (TypeScript)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  exportPDF() → invoke('print_to_pdf', { html, title })  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Tauri Command (Rust)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  #[tauri::command]                                       │   │
│  │  async fn print_to_pdf(                                  │   │
│  │      window: WebviewWindow,                              │   │
│  │      html: String,                                       │   │
│  │      title: String,                                      │   │
│  │      path: String                                        │   │
│  │  ) -> Result<String, String>                             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WebView2 API (Rust/COM)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. 创建隐藏 Webview 或使用现有 Webview                   │   │
│  │  2. 加载 HTML 内容                                       │   │
│  │  3. 等待内容渲染完成                                      │   │
│  │  4. 调用 PrintToPdf(path, settings, handler)            │   │
│  │  5. 等待回调完成                                         │   │
│  │  6. 返回生成的 PDF 路径                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   后处理 (pdf-lib)                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  使用现有 enhancePDF 函数添加页码和书签                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 实现代码

### 1. Rust Command 定义

```rust
// src-tauri/src/commands/print.rs

use tauri::{WebviewWindow, Manager};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use windows::core::HSTRING;

/// 静默打印到 PDF
#[tauri::command]
pub async fn print_to_pdf(
    window: WebviewWindow,
    html: String,
    title: String,
    save_path: String,
) -> Result<String, String> {
    // 使用现有 webview 打印
    let result = window
        .with_webview(|webview| {
            let controller = webview.controller();

            // 获取 ICoreWebView2
            let core_webview: ICoreWebView2 = controller
                .get_CoreWebView2()
                .map_err(|e| format!("Failed to get CoreWebView2: {}", e))?;

            // 转换为 ICoreWebView2_7 (支持 PrintToPdf)
            let webview_7: ICoreWebView2_7 = core_webview
                .cast()
                .map_err(|e| format!("Failed to cast to ICoreWebView2_7: {}", e))?;

            // 创建打印设置
            let settings = webview_7
                .create_print_settings()
                .map_err(|e| format!("Failed to create print settings: {}", e))?;

            // 设置 A4 页面
            settings
                .put_PageSize(CoreWebView2PrintPageSize::A4)
                .map_err(|e| format!("Failed to set page size: {}", e))?;

            // 设置边距
            settings
                .put_MarginKind(CoreWebView2PrintMarginKind::Default)
                .map_err(|e| format!("Failed to set margin: {}", e))?;

            // 设置方向
            settings
                .put_Orientation(CoreWebView2PrintOrientation::Portrait)
                .map_err(|e| format!("Failed to set orientation: {}", e))?;

            // 执行 PrintToPdf
            let path_hstring = HSTRING::from(save_path.as_str());

            // 创建完成事件
            let (tx, rx) = std::sync::mpsc::channel();
            let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, success| {
                let _ = tx.send((result, success));
                Ok(())
            }));

            webview_7
                .PrintToPdf(&path_hstring, &settings, &handler)
                .map_err(|e| format!("PrintToPdf failed: {}", e))?;

            // 等待完成（带超时）
            let (result, success) = rx
                .recv_timeout(std::time::Duration::from_secs(60))
                .map_err(|_| "PrintToPdf timeout".to_string())?;

            if success {
                Ok(save_path)
            } else {
                Err(format!("PrintToPdf returned false: {:?}", result))
            }
        })
        .await;

    result.map_err(|e| format!("WebView error: {}", e))?.map(|p| p.clone())
}
```

### 2. 注册 Command

```rust
// src-tauri/src/main.rs

mod commands;

use commands::print::print_to_pdf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![print_to_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3. 前端调用

```typescript
// src/composables/usePDF.ts

import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

export function usePDF() {
  async function exportToPDF(htmlContent: string, title: string = '文档'): Promise<void> {
    // Step 1: 获取保存路径
    const savePath = await save({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: `${title}.pdf`
    })

    if (!savePath) return

    try {
      // Step 2: 调用 Rust command 静默生成 PDF
      const pdfPath = await invoke<string>('print_to_pdf', {
        html: htmlContent,
        title,
        savePath
      })

      // Step 3: 后处理（添加页码和书签）
      const pdfBytes = await readFile(pdfPath)
      const enhancedPdf = await enhancePDF(pdfBytes, bookmarkData)
      await writeFile(pdfPath, enhancedPdf)

      await message(`PDF 已保存：${pdfPath}`, { title: '成功', kind: 'info' })
    } catch (error) {
      await message('导出失败：' + String(error), { title: '错误', kind: 'error' })
    }
  }

  return { exportToPDF }
}
```

---

## 实现细节

### 问题1：如何加载自定义HTML？

WebView2 的 `PrintToPdf` 打印的是当前 webview 的内容。需要：

**方案A：使用 NavigateToString**
```rust
// 使用 NavigateToString 加载 HTML
core_webview_2
    .NavigateToString(&HSTRING::from(html.as_str()))
    .map_err(|e| format!("NavigateToString failed: {}", e))?;

// 等待导航完成
// 监听 NavigationCompleted 事件
```

**方案B：使用虚拟 URL + Custom Protocol**
```rust
// 注册自定义协议
webview.bind("print-content", |request, responder| {
    responder.respond(Response::new(html_content, "text/html", StatusCode::OK));
});

// 导航到自定义协议 URL
webview.navigate("print-content://document.html");
```

**方案C：创建临时隐藏 Webview**
```rust
// 创建新的隐藏 webview 用于打印
let print_webview = Webview::new(
    app_handle,
    "print-webview",
    WebviewUrl::External("about:blank".into()),
    WebviewOptions {
        visible: false,
        ..Default::default()
    }
)?;
```

### 问题2：等待渲染完成

```rust
// 监听 NavigationCompleted 事件
let (tx, rx) = std::sync::mpsc::channel();

let handler = NavigationCompletedEventHandler::create(Box::new(move |_sender, _args| {
    let _ = tx.send(());
    Ok(())
}));

core_webview_2
    .add_NavigationCompleted(&handler)
    .map_err(|e| format!("Failed to add handler: {}", e))?;

// 加载 HTML
core_webview_2.NavigateToString(&HSTRING::from(html))?;

// 等待导航完成
rx.recv_timeout(Duration::from_secs(10))?;
```

### 问题3：异步回调处理

WebView2 的 `PrintToPdf` 是异步的，需要在 Tauri command 中正确处理：

```rust
// 使用消息通道等待回调
let (tx, rx) = tokio::sync::oneshot::channel();

let tx_clone = tx.clone();
let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, success| {
    let _ = tx_clone.send((result, success));
    Ok(())
}));

// 执行打印
webview_7.PrintToPdf(&path, &settings, &handler)?;

// 等待回调（异步）
let (result, success) = rx.await?;
```

---

## 完整实现流程

```
用户点击"导出PDF"
        │
        ▼
┌───────────────────────────┐
│  前端: save对话框获取路径   │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  前端: invoke('print_to_pdf',│
│         {html, title, path})│
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Rust: 获取 WebviewWindow  │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Rust: with_webview 获取   │
│        ICoreWebView2_7    │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Rust: NavigateToString   │
│        加载 HTML 内容      │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Rust: 等待渲染完成        │
│  (NavigationCompleted)    │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Rust: PrintToPdf 静默生成 │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  Rust: 返回 PDF 路径       │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  前端: pdf-lib 后处理      │
│  (添加页码和书签)          │
└───────────────────────────┘
        │
        ▼
┌───────────────────────────┐
│  完成: 显示成功提示        │
└───────────────────────────┘
```

---

## 依赖配置

### Cargo.toml

```toml
[dependencies]
tauri = { version = "2", features = [] }
webview2-com = "0.39"
windows = { version = "0.58", features = [
    "Win32_Foundation",
    "Win32_System_Com",
    "Win32_System_WinRT",
] }
```

### tauri.conf.json

```json
{
  "permissions": [
    "core:default",
    "dialog:allow-save",
    "fs:allow-read-file",
    "fs:allow-write-file"
  ]
}
```

---

## 风险与限制

### 技术风险

| 风险 | 说明 | 缓解措施 |
|------|------|----------|
| API 版本兼容 | WebView2 PrintToPdf 需要 ICoreWebView2_7 | 运行时检查 API 可用性 |
| 异步处理复杂 | WebView2 使用 COM 异步回调 | 使用 Tokio channel 正确处理 |
| 跨平台问题 | 此方案仅限 Windows | 使用条件编译，其他平台 fallback |
| 内存泄漏 | COM 对象需要正确释放 | 使用 RAII 包装器 |

### 限制

1. **仅支持 Windows**：WebView2 是 Windows 特有的
2. **需要 WebView2 Runtime**：用户必须安装 WebView2
3. **内容渲染时机**：需要等待 HTML 渲染完成才能打印

---

## 测试计划

1. **单元测试**
   - 测试 ICoreWebView2_7 获取
   - 测试 PrintToPdf API 调用
   - 测试异步回调处理

2. **集成测试**
   - 测试完整导出流程
   - 测试不同 HTML 内容
   - 测试大文档性能

3. **边界测试**
   - WebView2 未安装场景
   - API 不支持场景（旧版 WebView2）
   - 超时处理

---

## 参考资料

- [WebView2 PrintToPdf 文档](https://learn.microsoft.com/microsoft-edge/webview2/reference/win32/icorewebview2_7#printtopdf)
- [Tauri WebviewWindow 文档](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindow.html)
- [webview2-com crate](https://docs.rs/webview2-com/latest/webview2_com/)
- [windows-rs 文档](https://microsoft.github.io/windows-docs-rs/)

---

## 总结

方案C 技术上完全可行：

1. **Tauri 2.x 已暴露必要接口**：`with_webview` → `PlatformWebview` → `ICoreWebView2Controller`
2. **WebView2 API 支持**：`PrintToPdf` 可静默生成 PDF
3. **依赖已就绪**：项目已包含 `webview2-com` crate

主要工作量：
- 实现 Rust command 和 WebView2 API 调用
- 处理异步回调和渲染等待
- 前端调用集成

**用户体验改进**：从 3 次交互 → 1 次交互（仅需选择保存路径）