//! PlantUML 图表渲染模块
//!
//! 通过调用本地 Java 和 plantuml.jar 实现 PlantUML 图表渲染

use std::process::{Command, Stdio};
use std::io::{Write, Read};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use anyhow::Context;

// Windows 平台：导入 CommandExt trait 以使用 creation_flags
#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Windows 平台隐藏子进程窗口的标志
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 渲染 PlantUML 内容为 SVG
#[tauri::command]
pub async fn render_plantuml(app: AppHandle, content: String) -> Result<String, String> {
    render_plantuml_inner(app, content).await.map_err(|e| format!("{:#}", e))
}

async fn render_plantuml_inner(app: AppHandle, content: String) -> anyhow::Result<String> {
    let jar_path = get_plantuml_jar_path(&app)?;
    let java_path = get_java_path();

    let mut cmd = Command::new(&java_path);
    cmd.arg("-jar")
        .arg(&jar_path)
        .arg("-tsvg")
        .arg("-pipe")
        .arg("-charset")
        .arg("UTF-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                if java_path != "java" {
                    anyhow::anyhow!("未找到 Java 运行时。JAVA_HOME 配置的路径无效: {}\n请检查 JAVA_HOME 环境变量或安装 Java 8+。\n下载地址: https://www.java.com/download/", java_path)
                } else {
                    anyhow::anyhow!("未找到 Java 运行时。请安装 Java 8 或更高版本，或设置 JAVA_HOME 环境变量。\n下载地址: https://www.java.com/download/")
                }
            } else {
                anyhow::anyhow!("启动 Java 失败: {}", e)
            }
        })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(content.as_bytes())
            .context("写入 PlantUML 内容失败")?;
    }

    const PLANTUML_TIMEOUT: Duration = Duration::from_secs(30);
    let start = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = child.stdout.take()
                    .map(|mut out| {
                        let mut buf = Vec::new();
                        out.read_to_end(&mut buf).unwrap_or_default();
                        buf
                    })
                    .unwrap_or_default();

                let stderr = child.stderr.take()
                    .map(|mut err| {
                        let mut buf = Vec::new();
                        err.read_to_end(&mut buf).unwrap_or_default();
                        buf
                    })
                    .unwrap_or_default();

                if !status.success() {
                    anyhow::bail!("PlantUML 渲染失败:\n{}", String::from_utf8_lossy(&stderr));
                }

                let svg = String::from_utf8(stdout)
                    .context("SVG 输出解析失败")?;
                return Ok(svg);
            }
            Ok(None) => {
                if start.elapsed() >= PLANTUML_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    anyhow::bail!("PlantUML 渲染超时（30秒）。请检查图表复杂度或 Java 环境。");
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                let _ = child.kill();
                anyhow::bail!("等待 Java 进程失败: {}", e);
            }
        }
    }
}

/// 查找 Java 可执行文件路径
fn get_java_path() -> String {
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let java_bin = if java_home.ends_with('/') || java_home.ends_with('\\') {
            format!("{}bin/java", java_home)
        } else {
            format!("{}/bin/java", java_home)
        };
        #[cfg(windows)]
        let java_bin = format!("{}.exe", java_bin);
        if std::path::Path::new(&java_bin).exists() {
            println!("使用 JAVA_HOME: {} -> {}", java_home, java_bin);
            return java_bin;
        }
        println!("JAVA_HOME 设置但未找到 java: {}", java_bin);
    }
    println!("使用系统 PATH 查找 java");
    "java".to_string()
}

/// 获取 plantuml.jar 的路径
fn get_plantuml_jar_path(app: &AppHandle) -> anyhow::Result<String> {
    const JAR_PATH: &str = "assets/plantuml.jar";
    if cfg!(debug_assertions) {
        for dev_path in &[JAR_PATH, &format!("src-tauri/{}", JAR_PATH)] {
            if std::path::Path::new(dev_path).exists() {
                return Ok(dev_path.to_string());
            }
        }
    }
    let path = crate::resolve_asset_path(app, JAR_PATH)?;
    if path.exists() {
        return Ok(path.to_string_lossy().to_string());
    }
    anyhow::bail!("未找到 plantuml.jar 文件")
}
