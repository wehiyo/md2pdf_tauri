//! PlantUML 图表渲染模块
//!
//! 通过调用本地 Java 和 plantuml.jar 实现 PlantUML 图表渲染

use std::process::{Command, Stdio};
use std::io::{Write, Read};
use std::time::{Duration, Instant};
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

    // 查找 Java 可执行文件路径
    // 优先使用 JAVA_HOME 环境变量，否则使用系统 PATH
    let java_path = get_java_path();

    // 构建 Java 命令
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

    // Windows 平台：隐藏控制台窗口
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    // 启动进程
    let mut child = cmd.spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                if java_path != "java" {
                    format!("未找到 Java 运行时。JAVA_HOME 配置的路径无效: {}\n请检查 JAVA_HOME 环境变量或安装 Java 8+。\n下载地址: https://www.java.com/download/", java_path)
                } else {
                    "未找到 Java 运行时。请安装 Java 8 或更高版本，或设置 JAVA_HOME 环境变量。\n下载地址: https://www.java.com/download/".to_string()
                }
            } else {
                format!("启动 Java 失败: {}", e)
            }
        })?;

    // 写入 PlantUML 内容到 stdin（drop 会关闭管道）
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(content.as_bytes())
            .map_err(|e| format!("写入 PlantUML 内容失败: {}", e))?;
    }

    // 带超时的等待，使用 try_wait 避免永久阻塞
    const PLANTUML_TIMEOUT: Duration = Duration::from_secs(30);
    let start = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // 进程已退出，读取 stdout/stderr
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
                    return Err(format!("PlantUML 渲染失败:\n{}", String::from_utf8_lossy(&stderr)));
                }

                let svg = String::from_utf8(stdout)
                    .map_err(|e| format!("SVG 输出解析失败: {}", e))?;

                return Ok(svg);
            }
            Ok(None) => {
                if start.elapsed() >= PLANTUML_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(
                        "PlantUML 渲染超时（30秒）。请检查图表复杂度或 Java 环境。".to_string()
                    );
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                let _ = child.kill();
                return Err(format!("等待 Java 进程失败: {}", e));
            }
        }
    }
}

/// 查找 Java 可执行文件路径
/// 优先使用 JAVA_HOME 环境变量，否则使用系统 PATH
fn get_java_path() -> String {
    // 尝试从 JAVA_HOME 环境变量获取
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        // 构建完整路径
        let java_bin = if java_home.ends_with('/') || java_home.ends_with('\\') {
            format!("{}bin/java", java_home)
        } else {
            format!("{}/bin/java", java_home)
        };

        // Windows 平台添加 .exe 后缀
        #[cfg(windows)]
        let java_bin = format!("{}.exe", java_bin);

        // 检查文件是否存在
        if std::path::Path::new(&java_bin).exists() {
            println!("使用 JAVA_HOME: {} -> {}", java_home, java_bin);
            return java_bin;
        }

        println!("JAVA_HOME 设置但未找到 java: {}", java_bin);
    }

    // 使用系统 PATH
    println!("使用系统 PATH 查找 java");
    "java".to_string()
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