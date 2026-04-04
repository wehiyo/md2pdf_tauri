//! PlantUML 图表渲染模块
//!
//! 通过调用本地 Java 和 plantuml.jar 实现 PlantUML 图表渲染

use std::process::{Command, Stdio};
use std::io::Write;

/// 渲染 PlantUML 内容为 SVG
#[tauri::command]
pub async fn render_plantuml(content: String) -> Result<String, String> {
    // 获取 plantuml.jar 路径
    // 在开发模式下，jar 文件在 src-tauri/assets/ 目录
    // 在生产模式下，jar 文件在应用的资源目录
    let jar_path = get_plantuml_jar_path()?;

    // 调用 Java 渲染 PlantUML
    let mut child = Command::new("java")
        .arg("-jar")
        .arg(&jar_path)
        .arg("-tsvg")        // 输出 SVG 格式
        .arg("-pipe")        // 从 stdin 读取内容
        .arg("-charset")
        .arg("UTF-8")        // 支持 UTF-8 编码
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
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
fn get_plantuml_jar_path() -> Result<String, String> {
    // 尝试多个可能的路径
    let possible_paths = vec![
        // 开发模式：相对于当前工作目录
        "src-tauri/assets/plantuml.jar".to_string(),
        // 开发模式：相对于可执行文件
        "./assets/plantuml.jar".to_string(),
    ];

    for path in possible_paths {
        if std::path::Path::new(&path).exists() {
            return Ok(path);
        }
    }

    Err("未找到 plantuml.jar 文件".to_string())
}