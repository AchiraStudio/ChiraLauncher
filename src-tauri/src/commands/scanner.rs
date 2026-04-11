use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;
use tokio::sync::Semaphore;
use walkdir::WalkDir;

// ── Ignore lists ──────────────────────────────────────────────────────────────

const IGNORE_DIRS: &[&str] = &[
    "windows",
    "temp",
    "node_modules",
    "appdata",
    "$recycle.bin",
    "program files",
    "program files (x86)",
    "unity",
    "unrealengine",
    "__pycache__",
    "directx",
    "dotnetfx",
    "vcredist",
    "_commonredist",
    "commonredist",
];

const IGNORE_FILES: &[&str] = &[
    "setup",
    "install",
    "unins",
    "uninstall",
    "crashreporter",
    "dxsetup",
    "vcredist",
    "benchmark",
    "updater",
    "helper",
    "crash",
    "report",
    "redist",
    "prereq",
];

// ── Types ─────────────────────────────────────────────────────────────────────

/// Which emulator/crack was detected in the game directory.
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CrackType {
    Codex,
    Goldberg,
    Anadius,
    Voices38,
    Unknown,
}

#[derive(serde::Serialize, Clone)]
pub struct ScannerProgress {
    pub files_scanned: usize,
    pub candidates_found: usize,
    pub percentage: u8,
}

#[derive(serde::Serialize, Clone)]
pub struct ScannedGame {
    pub executable_path: String,
    pub guessed_title: String,
    pub install_dir: String,
    pub crack_type: CrackType,
    pub app_id: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, Eq)]
pub struct EmulatorInfo {
    pub crack_type: CrackType,
    pub app_id: String,
    pub install_dir: String,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct PythonScannerResult {
    #[serde(default)]
    best_exe: Option<String>,
    #[serde(default)]
    emulator: String,
    #[serde(default)]
    app_id: Option<String>,
    #[serde(default)]
    save_folder: Option<String>,
    #[serde(default)]
    achievements_ini: Option<String>,
    #[serde(default)]
    achievements_json: Option<String>,
    #[serde(default)]
    achievements_xml: Option<String>,
}

// ── Crack detection ───────────────────────────────────────────────────────────

fn has_v38_file(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|entries| {
            entries.flatten().any(|e| {
                e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|x| x.eq_ignore_ascii_case("v38"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Detect emulator type and app_id from a game directory.
/// Only reads a few small files — never does a recursive walk.
pub fn detect_crack(dir: &Path) -> (CrackType, String) {
    // Anadius: anadius.cfg in the game root
    let anadius_cfg = dir.join("anadius.cfg");
    if anadius_cfg.exists() {
        let id = parse_anadius_content_id(&anadius_cfg).unwrap_or_default();
        log::info!("[Crack] Anadius at {} (content_id={})", dir.display(), id);
        return (CrackType::Anadius, id);
    }

    // Voices38: .v38 file in the game root
    if has_v38_file(dir) {
        let steam_settings = dir.join("steam_settings");
        let id = if steam_settings.exists() && steam_settings.is_dir() {
            read_goldberg_app_id(&steam_settings)
                .or_else(|| read_plain_app_id(dir))
                .unwrap_or_default()
        } else {
            read_plain_app_id(dir).unwrap_or_default()
        };
        log::info!("[Crack] Voices38 via .v38 at {} (app_id={})", dir.display(), id);
        return (CrackType::Voices38, id);
    }

    // CODEX: steam_emu.ini
    let steam_emu = dir.join("steam_emu.ini");
    if steam_emu.exists() {
        let id = parse_steam_emu_app_id(&steam_emu).unwrap_or_default();
        log::info!("[Crack] CODEX via steam_emu.ini at {} (app_id={})", dir.display(), id);
        return (CrackType::Codex, id);
    }

    // CODEX: any *.cdx file
    if has_cdx_file(dir) {
        let id = read_plain_app_id(dir).unwrap_or_default();
        log::info!("[Crack] CODEX via .cdx at {} (app_id={})", dir.display(), id);
        return (CrackType::Codex, id);
    }

    // Goldberg: steam_settings/ folder is the canonical marker
    let steam_settings = dir.join("steam_settings");
    if steam_settings.exists() && steam_settings.is_dir() {
        let id = read_goldberg_app_id(&steam_settings)
            .or_else(|| read_plain_app_id(dir))
            .unwrap_or_default();
        log::info!("[Crack] Goldberg at {} (app_id={})", dir.display(), id);
        return (CrackType::Goldberg, id);
    }

    // Goldberg fallback: any steam_api.dll or steam_api64.dll without an ini
    // might be a Goldberg wrapper or an emu with missing configs.
    if dir.join("steam_api64.dll").exists() || dir.join("steam_api.dll").exists() {
        let id = read_plain_app_id(dir).unwrap_or_default();
        log::info!("[Crack] Likely Goldberg fallback at {} (app_id={})", dir.display(), id);
        return (CrackType::Goldberg, id);
    }

    // steam_appid.txt with no other marker
    if let Some(id) = read_plain_app_id(dir) {
        log::info!("[Crack] steam_appid.txt at {} (app_id={})", dir.display(), id);
        return (CrackType::Unknown, id);
    }

    (CrackType::Unknown, String::new())
}

/// Walk UP from the exe to find the real game root (the folder containing
/// crack markers). Handles games whose exe lives in bin/win64 subfolders.
pub fn infer_install_dir(exe_path: &Path) -> PathBuf {
    let immediate = exe_path.parent().unwrap_or(exe_path);

    const BIN_DIRS: &[&str] = &[
        "bin", "binaries", "win64", "win32", "x64", "x86",
        "game", "shipping", "retail",
    ];

    let mut current = immediate;
    for _ in 0..3 {
        if has_crack_marker(current) {
            return current.to_path_buf();
        }
        let name = current
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if BIN_DIRS.iter().any(|d| name == *d) {
            if let Some(parent) = current.parent() {
                if has_crack_marker(parent) {
                    return parent.to_path_buf();
                }
                // Even if no marker, if we're clearly in a bin dir go up one
                return parent.to_path_buf();
            }
        }
        match current.parent() {
            Some(p) => current = p,
            None => break,
        }
    }

    immediate.to_path_buf()
}

fn has_crack_marker(dir: &Path) -> bool {
    dir.join("steam_emu.ini").exists()
        || dir.join("anadius.cfg").exists()
        || dir.join("steam_settings").exists()
        || dir.join("steam_appid.txt").exists()
        || dir.join("steam_api64.dll").exists()
        || dir.join("steam_api.dll").exists()
        || has_cdx_file(dir)
        || has_v38_file(dir)
}

fn has_cdx_file(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|entries| {
            entries.flatten().any(|e| {
                e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|x| x.eq_ignore_ascii_case("cdx"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

// ── App ID / Content ID parsers ───────────────────────────────────────────────

/// Parse `AppId=` from a CODEX `steam_emu.ini`.
///
/// The real CODEX steam_emu.ini looks like this:
///
/// ```
/// ### ÜÛÛÛÛÛ  Ü ...CODEX ASCII art...
/// ### Game data stored at %SystemDrive%\Users\Public\Documents\Steam\CODEX\883710
/// ###
/// [Settings]
/// ###
/// ### Game identifier ([http://store.steampowered.com/app/883710](http://store.steampowered.com/app/883710))
/// ###
/// AppId=883710
/// UserName=Achira
/// ...
/// ```
///
/// We skip all `###` art/comment lines and read `AppId=` inside `[Settings]`.
pub fn parse_steam_emu_app_id(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let mut in_settings = false;

    for line in content.lines() {
        let line = line.trim();

        // Skip CODEX art and comment lines
        if line.starts_with("###") || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.is_empty() {
            continue;
        }

        if line.starts_with('[') {
            let section = line.trim_start_matches('[').trim_end_matches(']').trim();
            in_settings = section.eq_ignore_ascii_case("Settings");
            continue;
        }

        if !in_settings {
            continue;
        }

        if let Some((key, val)) = line.split_once('=') {
            let key = key.trim();
            let val = val.trim().trim_matches('"');
            if key.eq_ignore_ascii_case("AppId")
                && !val.is_empty()
                && val.chars().all(|c| c.is_ascii_digit())
            {
                return Some(val.to_string());
            }
        }
    }
    None
}

/// Parse `ContentId` from an Anadius `anadius.cfg` (Valve KeyValues format).
///
/// The file looks like:
/// ```
/// properties
/// "Config2"
/// {
///     "Game"
///     {
///         "ContentId"             "16425677"
///         ...
///     }
/// }
/// ```
pub fn parse_anadius_content_id(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    for line in text.lines() {
        let trimmed = line.trim();
        // Look for "ContentId" (case-insensitive) at start of quoted token
        if trimmed.starts_with("\"ContentId\"") || trimmed.to_lowercase().contains("\"contentid\"") {
            if let Some(val) = extract_last_quoted_token(trimmed) {
                if !val.is_empty() && val.chars().all(|c| c.is_ascii_digit()) {
                    return Some(val);
                }
            }
        }
    }
    None
}

/// Extract the value of the last `"..."` token on a line.
fn extract_last_quoted_token(line: &str) -> Option<String> {
    let mut last: Option<String> = None;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '"' {
            let mut token = String::new();
            for inner in chars.by_ref() {
                if inner == '"' {
                    break;
                }
                token.push(inner);
            }
            last = Some(token);
        }
    }
    last
}

fn read_goldberg_app_id(steam_settings: &Path) -> Option<String> {
    let id = fs::read_to_string(steam_settings.join("steam_appid.txt")).ok()?;
    let id = id.trim().to_string();
    if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
        Some(id)
    } else {
        None
    }
}

fn read_plain_app_id(dir: &Path) -> Option<String> {
    let id = fs::read_to_string(dir.join("steam_appid.txt")).ok()?;
    let id = id.trim().to_string();
    if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
        Some(id)
    } else {
        None
    }
}

#[tauri::command]
pub async fn scan_directory(
    path: String,
    app: AppHandle,
) -> Result<Vec<ScannedGame>, String> {
    let root = PathBuf::from(&path);
    if !root.exists() || !root.is_dir() {
        return Err("Invalid directory path".to_string());
    }

    let _ = app.emit("scan_progress", ScannerProgress { files_scanned: 0, candidates_found: 0, percentage: 0 });

    // Step 1: Rust filesystem traversal to find game candidate directories
    let (dirs, total_files) = tauri::async_runtime::spawn_blocking(move || {
        let mut install_dirs = HashSet::new();
        let mut count = 0;
        for entry in WalkDir::new(&root).into_iter().filter_entry(|e| !is_ignored_dir(e)).filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                count += 1;
                let pth = entry.into_path();
                if is_candidate_executable(&pth) {
                    install_dirs.insert(infer_install_dir(&pth));
                }
            }
        }
        (install_dirs, count)
    }).await.map_err(|e| e.to_string())?;

    if dirs.is_empty() {
        return Ok(Vec::new());
    }

    // Step 2: Spawn python processes using Tokio Semaphore
    let scanner_script = app.path()
        .resolve("scanner/scanner.py", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    let semaphore = Arc::new(Semaphore::new(10)); // max 10 concurrent python processes
    let scanned_count = Arc::new(AtomicUsize::new(0));
    let total_dirs = dirs.len();
    let mut tasks = Vec::new();

    for dir in dirs {
        let sem = semaphore.clone();
        let script = scanner_script.clone();
        let app_handle = app.clone();
        let counter = scanned_count.clone();

        let task = tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();

            let c = counter.fetch_add(1, Ordering::Relaxed) + 1;
            let pct = ((c as f32 / total_dirs as f32) * 100.0) as u8;
            let _ = app_handle.emit("scan_progress", ScannerProgress {
                files_scanned: total_files,
                candidates_found: c,
                percentage: pct,
            });

            log::info!("Running python scanner on {:?}", dir);
            let mut cmd = Command::new("python");
            #[cfg(windows)] // Hide command prompt window on Windows
            {
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            
            let output = cmd
                .arg(&script)
                .arg(&dir)
                .output()
                .await;

            let mut parsed: Option<PythonScannerResult> = None;
            if let Ok(out) = output {
                if out.status.success() {
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    parsed = serde_json::from_str(&stdout).ok();
                } else {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    log::warn!("Python scanner failed for {:?}: {}", dir, stderr);
                }
            }

            (dir, parsed)
        });
        tasks.push(task);
    }

    let mut results = Vec::new();
    for task in tasks {
        if let Ok((dir, Some(py_res))) = task.await {
            let crack_type = match py_res.emulator.as_str() {
                "codex" => CrackType::Codex,
                "goldberg" => CrackType::Goldberg,
                "anadius" => CrackType::Anadius,
                "voices38" => CrackType::Voices38,
                _ => CrackType::Unknown,
            };

            let exe_path = py_res.best_exe.unwrap_or_default();
            
            let mut guessed_title = if !exe_path.is_empty() {
                let filename = Path::new(&exe_path).file_name().unwrap_or_default().to_string_lossy().to_string();
                crate::commands::cleaner::clean_title(&filename)
            } else {
                crate::commands::cleaner::clean_title(&dir.file_name().unwrap_or_default().to_string_lossy())
            };

            if is_generic_title(&guessed_title) {
                if let Some(parent) = Path::new(&exe_path).parent() {
                    if let Some(pn) = parent.file_name() {
                        guessed_title = crate::commands::cleaner::clean_title(&pn.to_string_lossy().to_string());
                    }
                }
            }

            if is_generic_title(&guessed_title) {
                guessed_title = crate::commands::cleaner::clean_title(&dir.file_name().unwrap_or_default().to_string_lossy());
            }

            results.push(ScannedGame {
                executable_path: exe_path,
                guessed_title,
                install_dir: dir.to_string_lossy().to_string(),
                crack_type,
                app_id: py_res.app_id.unwrap_or_default(),
            });
        }
    }

    results.sort_by(|a, b| a.guessed_title.cmp(&b.guessed_title));
    Ok(results)
}

#[derive(serde::Serialize)]
pub struct SingleScanResult {
    pub executable_path: String,
    pub guessed_title: String,
    pub install_dir: String,
    pub crack_type: CrackType,
    pub app_id: String,
    pub achievements_ini: Option<String>,
    pub achievements_json: Option<String>,
    pub achievements_xml: Option<String>,
}

#[tauri::command]
pub async fn scan_single_game(
    path: String,
    app: AppHandle,
) -> Result<SingleScanResult, String> {
    let exe_path = PathBuf::from(&path);
    if !exe_path.exists() || !exe_path.is_file() {
        return Err("Invalid executable path".to_string());
    }

    let install_dir = infer_install_dir(&exe_path);
    
    let scanner_script = app.path()
        .resolve("scanner/scanner.py", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    log::info!("Running single python scanner on {:?}", install_dir);
    let mut cmd = Command::new("python");
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let output = cmd
        .arg(&scanner_script)
        .arg(&install_dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python scanner failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let py_res: PythonScannerResult = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse scanner output: {}", e))?;

    let crack_type = match py_res.emulator.as_str() {
        "codex" => CrackType::Codex,
        "goldberg" => CrackType::Goldberg,
        "anadius" => CrackType::Anadius,
        "voices38" => CrackType::Voices38,
        _ => CrackType::Unknown,
    };

    let exe_str = py_res.best_exe.unwrap_or_else(|| path.clone());
    let filename = Path::new(&exe_str).file_name().unwrap_or_default().to_string_lossy().to_string();
    let guessed_title = crate::commands::cleaner::clean_title(&filename);

    let app_id = py_res.app_id.unwrap_or_default();

    // Collect achievement paths from Python
    let mut achievements_ini  = py_res.achievements_ini;
    let mut achievements_json = py_res.achievements_json;
    let mut achievements_xml  = py_res.achievements_xml;

    // ── Rust-native fallback ─────────────────────────────────────────────────
    // If Python found nothing (common when save dir doesn't exist yet, or paths
    // differ from Python's limited set), run Rust's comprehensive discovery.
    if achievements_ini.is_none() && achievements_json.is_none() && achievements_xml.is_none() {
        let app_id_ref = if app_id.is_empty() { None } else { Some(app_id.as_str()) };
        let default_roots = crate::settings::default_scan_roots();
        let opts = crate::achievements::SyncOptions {
            crack_type: Some(crack_type.clone()),
            known_app_id: app_id_ref,
            manual_path: None,
            scan_roots: &default_roots,
            ..Default::default()
        };
        let discovery = crate::achievements::discover_achievements(&install_dir, app_id_ref, &opts);
        if let Some(save_path) = discovery.save_path {
            log::info!("[Scanner] Rust fallback found save: {}", save_path.display());
            match save_path.extension().and_then(|e| e.to_str()) {
                Some("ini") => achievements_ini  = Some(save_path.to_string_lossy().to_string()),
                Some("json") => achievements_json = Some(save_path.to_string_lossy().to_string()),
                Some("xml")  => achievements_xml  = Some(save_path.to_string_lossy().to_string()),
                _ => {}
            }
        }
    }

    Ok(SingleScanResult {
        executable_path: exe_str,
        guessed_title,
        install_dir: install_dir.to_string_lossy().to_string(),
        crack_type,
        app_id,
        achievements_ini,
        achievements_json,
        achievements_xml,
    })

}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_generic_title(t: &str) -> bool {
    t.len() < 2
        || t.eq_ignore_ascii_case("game")
        || t.eq_ignore_ascii_case("bin")
        || t.eq_ignore_ascii_case("win64")
        || t.eq_ignore_ascii_case("win32")
        || t.eq_ignore_ascii_case("launcher")
        || t.eq_ignore_ascii_case("start")
        || t.eq_ignore_ascii_case("play")
}

#[allow(dead_code)]
fn score_executable(path_lower: &str, title_lower: &str) -> i32 {
    let mut score = 0i32;
    if path_lower.contains(&title_lower.to_lowercase()) {
        score += 10;
    }
    if path_lower.contains("64") || path_lower.contains("x64") {
        score += 10;
    }
    if path_lower.contains("dx12") || path_lower.contains("dx11") {
        score += 10;
    }
    if path_lower.contains("shipping") || path_lower.contains("retail") || path_lower.contains("final") {
        score += 15;
    }
    // Penalise depth but give a free pass for first 4 levels
    let depth =
        path_lower.matches('\\').count() + path_lower.matches('/').count();
    score -= (depth as i32).saturating_sub(4);
    score
}

fn is_ignored_dir(entry: &walkdir::DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }
    let name = entry.file_name().to_string_lossy().to_lowercase();
    IGNORE_DIRS.iter().any(|&ig| name == ig)
}

fn is_candidate_executable(path: &Path) -> bool {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    #[cfg(windows)]
    let valid_ext = ext.eq_ignore_ascii_case("exe");
    #[cfg(not(windows))]
    let valid_ext = ext.is_empty();

    if !valid_ext {
        return false;
    }
    if IGNORE_FILES.iter().any(|&bl| name.contains(bl)) {
        return false;
    }
    fs::metadata(path)
        .map(|m| m.len() >= 1024 * 1024)
        .unwrap_or(false)
}

// #[tauri::command]
// pub async fn detect_game_emulator(path: String) -> Result<EmulatorInfo, String> {
//     tauri::async_runtime::spawn_blocking(move || {
//         let p = Path::new(&path);
//         if !p.exists() {
//             return Err("Path does not exist".to_string());
//         }
//
//         let install_dir = if p.is_file() {
//             infer_install_dir(p)
//         } else {
//             p.to_path_buf()
//         };
//
//         match detect_crack(&install_dir) {
//             (crack_type, app_id) => Ok(EmulatorInfo {
//                 crack_type,
//                 app_id,
//                 install_dir: install_dir.to_string_lossy().to_string(),
//             }),
//         }
//     })
//     .await
//     .map_err(|e| e.to_string())?
// }

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_parse_steam_emu_app_id_real_format() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("steam_emu.ini");
        fs::write(
            &path,
            "### CODEX art line\n### another art line\n\n[Settings]\n### comment\nAppId=883710\nUserName=Achira\n",
        )
        .unwrap();
        assert_eq!(parse_steam_emu_app_id(&path), Some("883710".to_string()));
    }

    #[test]
    fn test_parse_anadius_content_id() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("anadius.cfg");
        fs::write(
            &path,
            "properties\n\"Config2\"\n{\n    \"Game\"\n    {\n        \"ContentId\"\t\t\"16425677\"\n    }\n}\n",
        )
        .unwrap();
        assert_eq!(
            parse_anadius_content_id(&path),
            Some("16425677".to_string())
        );
    }

    #[test]
    fn test_detect_crack_codex() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("steam_emu.ini"), "[Settings]\nAppId=12345\n").unwrap();
        let (ct, id) = detect_crack(dir.path());
        assert_eq!(ct, CrackType::Codex);
        assert_eq!(id, "12345");
    }

    #[test]
    fn test_detect_crack_anadius() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("anadius.cfg"), "\"ContentId\"\t\"16425677\"\n").unwrap();
        let (ct, id) = detect_crack(dir.path());
        assert_eq!(ct, CrackType::Anadius);
        assert_eq!(id, "16425677");
    }

    #[test]
    fn test_detect_crack_goldberg() {
        let dir = tempdir().unwrap();
        let ss = dir.path().join("steam_settings");
        fs::create_dir(&ss).unwrap();
        fs::write(ss.join("steam_appid.txt"), "99999").unwrap();
        let (ct, id) = detect_crack(dir.path());
        assert_eq!(ct, CrackType::Goldberg);
        assert_eq!(id, "99999");
    }

    #[test]
    fn test_infer_install_dir_walks_up_from_bin() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("steam_appid.txt"), "11111").unwrap();
        let bin = root.join("bin").join("win64");
        fs::create_dir_all(&bin).unwrap();
        let exe = bin.join("game.exe");
        fs::write(&exe, vec![0u8; 2 * 1024 * 1024]).unwrap();
        assert_eq!(infer_install_dir(&exe), root);
    }
}