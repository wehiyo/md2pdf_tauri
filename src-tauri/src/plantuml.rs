//! PlantUML 图表渲染模块
//!
//! 通过调用本地 Java 和 plantuml.jar 实现 PlantUML 图表渲染

use std::process::{Command, Stdio};
use std::io::Write;
use tauri::{AppHandle, Manager};

// Windows 平台：导入 CommandExt trait 以使用 creation_flags
#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Windows 平台隐藏子进程窗口的标志
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 渲染 PlantUML 内容为 SVG
#[tauri::command]
pub async fn render_plantuml(app: AppHandle, content: String) -> Result<String, String> {
    // 获取 plantuml.jar 路径
    let jar_path = get_plantuml_jar_path(&app)?;

    // 构建 Java 命令
    let mut cmd = Command::new("java");
    cmd.arg("-jar")
        .arg(&jar_path)
        .arg("-tsvg")
        .arg("-pipe")
        .arg("-charset")
        .arg("UTF-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows 平台：隐藏控制台窗口
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    // 启动进程
    let mut child = cmd.spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "未找到 Java 运行时。请安装 Java 8 或更高版本。\n下载地址: https://www.java.com/download/".to_string()
            } else {
                format!("启动 Java 失败: {}", e)
            }
        })?;

    // 写入 PlantUML 内容到 stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(content.as_bytes())
            .map_err(|e| format!("写入 PlantUML 内容失败: {}", e))?;
    }

    // 等待进程完成并获取输出
    let output = child.wait_with_output()
        .map_err(|e| format!("等待 Java 进程失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PlantUML 渲染失败:\n{}", stderr));
    }

    // 返回 SVG 内容
    let svg = String::from_utf8(output.stdout)
        .map_err(|e| format!("SVG 输出解析失败: {}", e))?;

    Ok(svg)
}

/// 获取 plantuml.jar 的路径
fn get_plantuml_jar_path(app: &AppHandle) -> Result<String, String> {
    // 尝试开发模式的路径
    let dev_paths = [
        "src-tauri/assets/plantuml.jar",
        "./assets/plantuml.jar",
    ];

    for path in dev_paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    // 生产模式：使用 resource_dir
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    let jar_path = resource_dir.join("assets/plantuml.jar");
    if jar_path.exists() {
        return Ok(jar_path.to_string_lossy().to_string());
    }

    Err("未找到 plantuml.jar 文件".to_string())
}