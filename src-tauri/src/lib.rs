// 案情板 CaseBoard · Tauri 2 桌面外壳
//
// 这里只做「平台能力」：窗口、SQLite（含 FTS5 全文检索迁移）、原生对话框与文件读写、
// 素材原件落盘、验收自检出口。全部业务逻辑在前端（React + Zustand + Command 栈），
// Rust 侧不持有案件状态。
//
// 二进制通过 base64 字符串跨 IPC：前端 invoke 走 JSON 序列化，
// Uint8Array 会变成 {"0":137,...} 这种对象，serde 无法直接读成 Vec<u8>，
// 所以统一 base64，换来的是任意路径可读写（不受 fs 插件 scope 限制）。

mod migrations;

use serde::Serialize;
use std::path::{Path, PathBuf};

use tauri::Manager;

/// 启动开关：--selftest 时前端会跑一遍端到端自检并调用 selftest_report 退出。
#[derive(Clone, Serialize)]
pub struct LaunchFlags {
    selftest: bool,
    phase: u32,
}

/// 应用自身信息，前端在「关于」与验收自检里使用。
#[derive(Serialize)]
pub struct AppInfo {
    version: String,
    platform: String,
    data_dir: String,
    db_path: String,
    assets_dir: String,
    selftest: bool,
    selftest_phase: u32,
}

/// 数据目录：默认 `%APPDATA%\<identifier>`。
///
/// 环境变量 `CASEBOARD_DATA_DIR` 可覆盖（便携模式把数据放在 U 盘 / 程序目录，
/// 以及自动化验收时把数据落在可写的工作区内）。
fn data_dir_of(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("CASEBOARD_DATA_DIR") {
        if !dir.is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    app.path()
        .app_data_dir()
        .map_err(|error| format!("无法解析应用数据目录：{error}"))
}

/// 确保数据库文件存在并返回其绝对路径。
///
/// tauri-plugin-sql 的 sqlite 相对路径会解析到 app_config_dir，并且自动建库时会
/// 先 create_dir_all(那个目录)；数据目录被 `CASEBOARD_DATA_DIR` 改到别处时，
/// 就由这里按同一个 data_dir 建好目录与空库文件，前端再用绝对路径连库
/// （绝对路径在 path_mapper 里会整体替换，插件不会再碰 app_config_dir）。
#[tauri::command]
async fn ensure_db_file(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = data_dir_of(&app)?;
    std::fs::create_dir_all(&data_dir).map_err(|error| format!("无法创建数据目录：{error}"))?;
    let db_path = data_dir.join("caseboard.db");
    apply_schema(&db_path).await?;
    Ok(db_path.to_string_lossy().to_string())
}

/// 建表（幂等）：用 sqlx 直连 SQLite 执行 migrations::V1_SQL 里的全部语句。
async fn apply_schema(path: &Path) -> Result<(), String> {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    // 注意：sqlx 的 SqliteConnectOptions 默认 create_if_missing = false，
    // 直接用 "sqlite:<路径>" 连一个不存在的文件会报 (code: 14) unable to open database file。
    // 这里显式打开「文件不存在就创建」，否则首次启动永远建不出库。
    let options = SqliteConnectOptions::new().filename(path).create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| format!("无法打开数据库 {}：{error}", path.display()))?;
    let result = sqlx::raw_sql(migrations::V1_SQL).execute(&pool).await;
    pool.close().await;
    result.map_err(|error| format!("无法初始化数据库结构：{error}"))?;
    Ok(())
}

#[tauri::command]
fn app_info(app: tauri::AppHandle, flags: tauri::State<'_, LaunchFlags>) -> Result<AppInfo, String> {
    let data_dir = data_dir_of(&app)?;
    let db_path = data_dir.join("caseboard.db");
    let assets_dir = data_dir.join("assets");
    if let Err(error) = std::fs::create_dir_all(&assets_dir) {
        return Err(format!("无法创建素材目录：{error}"));
    }
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
        db_path: db_path.to_string_lossy().to_string(),
        assets_dir: assets_dir.to_string_lossy().to_string(),
        selftest: flags.selftest,
        selftest_phase: flags.phase,
    })
}

/// 打开数据目录（供「关于」面板里的「打开数据目录」按钮）。
#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = data_dir_of(&app)?;
    std::fs::create_dir_all(&data_dir).map_err(|error| format!("无法创建数据目录：{error}"))?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&data_dir)
            .spawn()
            .map_err(|error| format!("无法打开数据目录：{error}"))?;
    }
    Ok(())
}

// ---------------------------------------------------------------- base64 ----

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64[(triple >> 18) as usize & 63] as char);
        out.push(B64[(triple >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(triple >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[triple as usize & 63] as char } else { '=' });
    }
    out
}

fn b64_decode(text: &str) -> Result<Vec<u8>, String> {
    let mut rev = [255u8; 128];
    for (index, byte) in B64.iter().enumerate() {
        rev[*byte as usize] = index as u8;
    }
    let bytes: Vec<u8> = text.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if bytes.len() % 4 != 0 {
        return Err("base64 长度不是 4 的倍数".to_string());
    }
    let mut out = Vec::with_capacity(bytes.len() / 4 * 3);
    for group in bytes.chunks(4) {
        let mut values = [0u32; 4];
        for (index, byte) in group.iter().enumerate() {
            if *byte == b'=' {
                values[index] = 0;
                continue;
            }
            let mapped = rev[*byte as usize];
            if mapped == 255 {
                return Err("base64 含非法字符".to_string());
            }
            values[index] = mapped as u32;
        }
        let triple = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
        out.push((triple >> 16) as u8);
        if group[2] != b'=' {
            out.push((triple >> 8) as u8);
        }
        if group[3] != b'=' {
            out.push(triple as u8);
        }
    }
    Ok(out)
}

// ------------------------------------------------------- 文件与素材落盘 ----

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|error| format!("无法读取文件 {path}：{error}"))?;
    Ok(b64_encode(&bytes))
}

#[tauri::command]
fn write_file_base64(path: String, data: String) -> Result<u64, String> {
    let bytes = b64_decode(&data)?;
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("无法创建目录：{error}"))?;
    }
    std::fs::write(&target, &bytes).map_err(|error| format!("无法写入文件 {path}：{error}"))?;
    Ok(bytes.len() as u64)
}

/// 素材文件路径：<assets>/<asset_id>.<ext>；同 id 换扩展名时先清理旧文件。
#[tauri::command]
fn save_asset_base64(app: tauri::AppHandle, asset_id: String, ext: String, data: String) -> Result<String, String> {
    let assets_dir = data_dir_of(&app)?.join("assets");
    std::fs::create_dir_all(&assets_dir).map_err(|error| format!("无法创建素材目录：{error}"))?;
    let clean_ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let path = assets_dir.join(format!("{asset_id}.{}", if clean_ext.is_empty() { "bin".to_string() } else { clean_ext }));
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("无法创建素材目录：{error}"))?;
    }
    let bytes = b64_decode(&data)?;
    std::fs::write(&path, &bytes).map_err(|error| format!("无法写入素材文件：{error}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// 按 id 前缀找素材原件（扩展名未知也能找到）。
fn find_asset(assets_dir: &Path, asset_id: &str, sub: Option<&str>) -> Option<PathBuf> {
    let dir = match sub {
        Some(name) => assets_dir.join(name),
        None => assets_dir.to_path_buf(),
    };
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        if stem == asset_id {
            return Some(path);
        }
    }
    None
}

#[tauri::command]
fn read_asset_base64(app: tauri::AppHandle, asset_id: String) -> Result<String, String> {
    let assets_dir = data_dir_of(&app)?.join("assets");
    let path = find_asset(&assets_dir, &asset_id, None).ok_or_else(|| format!("素材原件不在本机：{asset_id}"))?;
    let bytes = std::fs::read(&path).map_err(|error| format!("无法读取素材：{error}"))?;
    Ok(b64_encode(&bytes))
}

#[tauri::command]
fn asset_file_path(app: tauri::AppHandle, asset_id: String) -> Result<String, String> {
    let assets_dir = data_dir_of(&app)?.join("assets");
    let path = find_asset(&assets_dir, &asset_id, None).ok_or_else(|| format!("素材原件不在本机：{asset_id}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_thumb_base64(app: tauri::AppHandle, asset_id: String, size: u32, ext: String, data: String) -> Result<String, String> {
    let dir = data_dir_of(&app)?.join("assets").join("thumbs");
    std::fs::create_dir_all(&dir).map_err(|error| format!("无法创建缩略图目录：{error}"))?;
    let clean_ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let path = dir.join(format!("{asset_id}-{size}.{}", if clean_ext.is_empty() { "png".to_string() } else { clean_ext }));
    let bytes = b64_decode(&data)?;
    std::fs::write(&path, &bytes).map_err(|error| format!("无法写入缩略图：{error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_thumb_base64(app: tauri::AppHandle, asset_id: String, size: u32) -> Result<String, String> {
    let dir = data_dir_of(&app)?.join("assets").join("thumbs");
    let suffix = format!("-{size}");
    let mut found: Option<PathBuf> = None;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            if stem.starts_with(&asset_id) && stem.ends_with(&suffix) {
                found = Some(path);
                break;
            }
        }
    }
    let path = found.ok_or_else(|| format!("缩略图不存在：{asset_id}-{size}"))?;
    let bytes = std::fs::read(&path).map_err(|error| format!("无法读取缩略图：{error}"))?;
    Ok(b64_encode(&bytes))
}

#[tauri::command]
fn remove_asset(app: tauri::AppHandle, asset_id: String) -> Result<(), String> {
    let assets_dir = data_dir_of(&app)?.join("assets");
    for path in [find_asset(&assets_dir, &asset_id, None), find_asset(&assets_dir, &asset_id, Some("thumbs"))].into_iter().flatten() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

/// sha256 校验（验收：导出文件与原件逐字节一致）。
#[tauri::command]
fn hash_file(path: String) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let bytes = std::fs::read(&path).map_err(|error| format!("无法读取文件 {path}：{error}"))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
}

/// 诊断日志：把一行文本追加到 <data_dir>/debug.log。桌面端没有控制台，
/// 这是排查「界面没跑起来 / 命令被拒」的唯一可观测通道（自检与启动阶段都会写）。
#[tauri::command]
fn debug_log(app: tauri::AppHandle, line: String) -> Result<(), String> {
    use std::io::Write;
    let dir = data_dir_of(&app)?;
    std::fs::create_dir_all(&dir).map_err(|error| format!("无法创建数据目录：{error}"))?;
    let path = dir.join("debug.log");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("无法打开诊断日志：{error}"))?;
    writeln!(file, "{line}").map_err(|error| format!("无法写入诊断日志：{error}"))?;
    Ok(())
}

// ------------------------------------------------------------------ OCR ----

fn run_tesseract(args: &[&str]) -> std::io::Result<std::process::Output> {
    let mut command = std::process::Command::new("tesseract");
    for arg in args {
        command.arg(arg);
    }
    command.output()
}

/// 探测本机 OCR 侧车：返回版本行，未安装返回 None（不报错，界面据此回退手工录入）。
#[tauri::command]
fn ocr_available() -> Result<Option<String>, String> {
    match run_tesseract(&["--version"]) {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            let first = text.lines().next().unwrap_or("tesseract").trim().to_string();
            Ok(Some(first))
        }
        _ => Ok(None),
    }
}

/// 用本机 Tesseract 识别图片文字（M7-3）。只读本地文件，不上传任何数据。
#[tauri::command]
fn ocr_image(path: String) -> Result<String, String> {
    let file = std::path::Path::new(&path);
    if !file.exists() {
        return Err(format!("原件不存在：{path}"));
    }
    let output = run_tesseract(&[&path, "stdout", "-l", "chi_sim+eng", "--psm", "6"]).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "未找到本地 OCR 引擎（Tesseract）：请安装后重启应用。".to_string()
        } else {
            format!("无法启动 OCR 引擎：{error}")
        }
    })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR 引擎返回错误：{}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ------------------------------------------------------------------ 自检 ----

/// 前端自检结束：把报告写到 <data_dir>/selftest.json 并退出应用（供 CI/验收脚本读取）。
#[tauri::command]
fn selftest_report(app: tauri::AppHandle, report: String) -> Result<String, String> {
    let dir = data_dir_of(&app)?;
    let target = dir.join("selftest.json");
    std::fs::write(&target, report).map_err(|error| format!("无法写自检报告：{error}"))?;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        handle.exit(0);
    });
    Ok(target.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // --selftest 或 --selftest=2：分两轮跑，第二轮验证「关掉再打开数据还在」
    // 取最大值而不是第一个匹配：脚本可能同时传 --selftest 与 --selftest=2，
    // 用 find 会命中前者的 phase=1，导致第二轮白跑。
    let phase = std::env::args()
        .filter_map(|arg| {
            if arg == "--selftest" {
                Some(1)
            } else {
                arg.strip_prefix("--selftest=").and_then(|value| value.parse::<u32>().ok())
            }
        })
        .max()
        .unwrap_or(0);
    let selftest = phase > 0;

    tauri::Builder::default()
        .manage(LaunchFlags { selftest, phase })
        // 插件只提供连库/查询能力；建表由 ensure_db_file（apply_schema）负责。
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            if selftest {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
                // 让自检在没有界面的情况下也能跑：不隐藏进程，只隐藏窗口
                println!("[caseboard] selftest 模式启动");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            open_data_dir,
            read_file_base64,
            write_file_base64,
            save_asset_base64,
            read_asset_base64,
            asset_file_path,
            save_thumb_base64,
            read_thumb_base64,
            remove_asset,
            hash_file,
            debug_log,
            ensure_db_file,
            ocr_available,
            ocr_image,
            selftest_report
        ])
        .run(tauri::generate_context!())
        .expect("案情板启动失败");
}
