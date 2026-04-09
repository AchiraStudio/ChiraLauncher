pub mod cache;
pub mod fetcher;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use base64::{Engine as _, engine::general_purpose};

pub use crate::commands::scanner::{CrackType, EmulatorInfo};

// ── Shared location constants ────────────────────────────────────────────────

pub const PUBLIC_EMU_DIRS: &[&str] = &[
    "CODEX", "RLD!", "Skidrow", "PLAZA", "CPY", "FLT", "DARKSiDERS",
];
pub const GOLDBERG_APPDATA_DIRS: &[&str] =
    &["Goldberg SteamEmu Saves", "GSE Saves", "steam_settings", "Goldberg SteamEmu"];

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Achievement {
    pub api_name: String,
    pub display_name: String,
    pub description: String,
    pub hidden: bool,
    pub earned: bool,
    pub earned_time: Option<u64>,
    pub icon_path: Option<String>,
    pub icon_gray_path: Option<String>,
    pub global_percent: Option<f32>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AchievementDef {
    pub name: String,
    #[serde(rename = "displayName", default)]
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(rename = "icongray", default)]
    pub icon_gray: String,
    #[serde(default)]
    pub hidden: i32,
    #[serde(rename = "globalPercent", default)]
    pub global_percent: Option<f32>,
}



/// The result of the discovery phase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AchievementDiscovery {
    pub emulator: EmulatorInfo,
    pub metadata_path: Option<PathBuf>,
    pub save_path: Option<PathBuf>,
    pub probe_log: Vec<String>,
}

/// Options for `sync_achievements`.
#[derive(Debug, Default)]
pub struct SyncOptions<'a> {
    pub crack_type: Option<CrackType>,
    pub known_app_id: Option<&'a str>,
    pub manual_path: Option<&'a str>,
    pub scan_roots: &'a [PathBuf],
    pub steam_api_key: Option<&'a str>,
    pub db_tx: Option<&'a crate::state::DbWriteSender>,
}

// ── Phase 1: Discovery ────────────────────────────────────────────────────────

/// Run the full discovery pipeline for a game.
pub fn discover_achievements(
    install_dir: &Path,
    db_app_id: Option<&str>,
    opts: &SyncOptions<'_>,
) -> AchievementDiscovery {
    let mut probe_log = Vec::new();
    probe_log.push(format!("Starting discovery in: {}", install_dir.display()));

    // 1. Detect Emulator & App ID
    let (crack_type, app_id_detected) = crate::commands::scanner::detect_crack(install_dir);
    let app_id = opts.known_app_id
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| if !app_id_detected.is_empty() { Some(app_id_detected) } else { None })
        .or_else(|| db_app_id.map(|s| s.to_string()));

    let emu_info = EmulatorInfo {
        crack_type: opts.crack_type.clone().unwrap_or(crack_type),
        app_id: app_id.clone().unwrap_or_default(),
        install_dir: install_dir.to_string_lossy().to_string(),
    };

    probe_log.push(format!("Emulator: {:?}, App ID: {}", emu_info.crack_type, emu_info.app_id));

    // 2. Discover Metadata (achievements.json)
    let meta_path = find_metadata_path(install_dir, app_id.as_deref(), opts.manual_path, &mut probe_log);

    // 3. Discover Save Path (.ini, .json, .xml)
    let save_path = find_save_path(
        app_id.as_deref(),
        install_dir,
        opts.manual_path,
        opts.scan_roots,
        Some(&emu_info.crack_type),
        &mut probe_log
    );

    AchievementDiscovery {
        emulator: emu_info,
        metadata_path: meta_path,
        save_path,
        probe_log,
    }
}

pub fn resolve_app_id(install_dir: &Path) -> Option<String> {
    let (_, app_id) = crate::commands::scanner::detect_crack(install_dir);
    if app_id.is_empty() { None } else { Some(app_id) }
}

pub fn resolve_save_path(
    app_id: Option<&str>,
    game_dir: &Path,
    manual_path: Option<&str>,
    scan_roots: &[PathBuf],
    crack_type: Option<&CrackType>,
) -> Option<PathBuf> {
    let opts = SyncOptions {
        crack_type: crack_type.cloned(),
        known_app_id: app_id,
        manual_path,
        scan_roots,
        ..Default::default()
    };
    discover_achievements(game_dir, app_id, &opts).save_path
}

pub fn find_achievements_json(
    game_dir: &Path,
    app_id: Option<&str>,
    manual_path: Option<&str>,
) -> Option<PathBuf> {
    let opts = SyncOptions {
        known_app_id: app_id,
        manual_path,
        ..Default::default()
    };
    discover_achievements(game_dir, app_id, &opts).metadata_path
}

fn find_metadata_path(
    base: &Path,
    app_id: Option<&str>,
    manual_path: Option<&str>,
    log: &mut Vec<String>,
) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(manual) = manual_path.filter(|p| !p.is_empty()) {
        let p = Path::new(manual);
        if p.is_file() {
            candidates.push(p.to_path_buf()); // Accept exact file
        } else {
            candidates.push(p.join("achievements.json"));
        }
    }

    candidates.extend(vec![
        base.join("steam_settings").join("achievements.json"),
        base.join("OfflineStorage").join("User").join("remote").join("achievements.json"),
        base.join("achievements.json"),
        base.join("steam_settings").join("user_stats").join("achievements.json"),
    ]);

    if let Some(id) = app_id {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            candidates.push(PathBuf::from(&local).join("anadius").join("LSX emu").join(id).join("achievements.json"));
        }
        for var in &["APPDATA", "LOCALAPPDATA"] {
            if let Some(appdata) = std::env::var_os(var) {
                for sub in GOLDBERG_APPDATA_DIRS {
                    candidates.push(PathBuf::from(&appdata).join(sub).join(id).join("achievements.json"));
                }
            }
        }
        if let Some(sys_drive) = std::env::var_os("SystemDrive") {
            let drive_root = PathBuf::from(&sys_drive);
            let drive_root = if drive_root.to_string_lossy().ends_with('\\') { drive_root } else { PathBuf::from(format!(r"{}\", sys_drive.to_string_lossy())) };
            let public_paths = [
                drive_root.join("Users\\Public\\Documents\\Steam"),
                drive_root.join("Users\\Public\\Documents\\Steam\\CODEX"),
            ];
            for public in public_paths {
                for sub in PUBLIC_EMU_DIRS {
                    let dir = public.join(sub).join(id);
                    candidates.push(dir.join("achievements.json"));
                    candidates.push(dir.join("steam_settings").join("achievements.json"));
                }
                candidates.push(public.join(id).join("achievements.json"));
                candidates.push(public.join(id).join("steam_settings").join("achievements.json"));
            }
        }
    }

    for p in candidates {
        if p.exists() && looks_like_metadata(&p) {
            log.push(format!("Found metadata at: {}", p.display()));
            return Some(p);
        }
    }
    log.push("No metadata file found.".to_string());
    None
}

fn find_save_path(
    app_id: Option<&str>,
    game_dir: &Path,
    manual_path: Option<&str>,
    scan_roots: &[PathBuf],
    crack_type: Option<&CrackType>,
    log: &mut Vec<String>,
) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(manual) = manual_path.filter(|p| !p.is_empty()) {
        let p = Path::new(manual);
        if p.is_file() {
            candidates.push(p.to_path_buf()); // Accept exact file
        } else {
            candidates.push(p.join("achievements.ini"));
            candidates.push(p.join("achievements.json"));
            candidates.push(p.join("achievement.ini"));
            if let Ok(entries) = std::fs::read_dir(p) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|s| s.to_str()) == Some("xml") {
                        candidates.push(path);
                    }
                }
            }
        }
    }

    let is_anadius = matches!(crack_type, Some(CrackType::Anadius));
    let is_goldberg = matches!(crack_type, Some(CrackType::Goldberg));
    let is_codex = matches!(crack_type, Some(CrackType::Codex));
    let try_all = crack_type.is_none() || matches!(crack_type, Some(CrackType::Unknown));

    if let Some(id) = app_id {
        if is_anadius || try_all {
            if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                let emu_base = PathBuf::from(&local).join("anadius").join("LSX emu");
                let search_dirs = [emu_base.clone(), emu_base.join(id)];
                for dir in search_dirs {
                    if let Ok(entries) = fs::read_dir(&dir) {
                        for entry in entries.flatten() {
                            let p = entry.path();
                            let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                            if name.starts_with("achievement-") && name.contains(id) && name.ends_with(".xml") {
                                candidates.push(p);
                            }
                        }
                    }
                }
            }
        }

        if is_codex || try_all {
            if let Some(sys_drive) = std::env::var_os("SystemDrive") {
                let drive_root = PathBuf::from(&sys_drive);
                let drive_root = if drive_root.to_string_lossy().ends_with('\\') { drive_root } else { PathBuf::from(format!(r"{}\", sys_drive.to_string_lossy())) };
                let public_paths = [
                    drive_root.join("Users\\Public\\Documents\\Steam"),
                    drive_root.join("Users\\Public\\Documents\\Steam\\CODEX"),
                ];
                for public in public_paths {
                    for sub in PUBLIC_EMU_DIRS {
                        let dir = public.join(sub).join(id);
                        candidates.push(dir.join("achievements.ini"));
                        candidates.push(dir.join("achievements.json"));
                        candidates.push(dir.join("steam_settings").join("achievements.ini"));
                        candidates.push(dir.join("steam_settings").join("achievements.json"));
                    }
                    let direct = public.join(id);
                    candidates.push(direct.join("achievements.ini"));
                    candidates.push(direct.join("achievements.json"));
                    candidates.push(direct.join("achievement.ini"));
                    candidates.push(direct.join("steam_settings").join("achievements.ini"));
                }
            }
        }

        if is_goldberg || try_all {
            for var in &["APPDATA", "LOCALAPPDATA"] {
                if let Some(appdata) = std::env::var_os(var) {
                    let base = PathBuf::from(&appdata);
                    for sub in GOLDBERG_APPDATA_DIRS {
                        let dir = base.join(sub).join(id);
                        candidates.push(dir.join("achievements.json"));
                        candidates.push(dir.join("achievements.ini"));
                    }
                    candidates.push(base.join("ALI213").join(id).join("achievements.json"));
                }
            }
        }

        for root in scan_roots {
            let dir = root.join(id);
            candidates.push(dir.join("achievements.ini"));
            candidates.push(dir.join("achievements.json"));
            if let Ok(entries) = fs::read_dir(root) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let sub = entry.path().join(id);
                        candidates.push(sub.join("achievements.ini"));
                        candidates.push(sub.join("achievements.json"));
                    }
                }
            }
        }
    }

    candidates.push(game_dir.join("steam_settings").join("user_stats").join("achievements.json"));
    candidates.push(game_dir.join("steam_settings").join("achievements.ini"));
    candidates.push(game_dir.join("steam_settings").join("achievements.json"));
    candidates.push(game_dir.join("achievements.ini"));
    candidates.push(game_dir.join("achievements.json"));
    candidates.push(game_dir.join("achievement.ini"));

    for p in candidates {
        if !p.exists() { continue; }
        match p.extension().and_then(|e| e.to_str()) {
            Some("ini") => {
                log.push(format!("Found save file (INI) at: {}", p.display()));
                return Some(p);
            },
            Some("xml") => {
                log.push(format!("Found save file (XML) at: {}", p.display()));
                return Some(p);
            },
            Some("json") => {
                if looks_like_save_state(&p) {
                    log.push(format!("Found save file (JSON) at: {}", p.display()));
                    return Some(p);
                }
            },
            _ => {}
        }
    }
    log.push("No save file discovered.".to_string());
    None
}

// ── Phase 2: Metadata Discovery (Helper) ───────────────────────────────────────

pub fn looks_like_metadata(path: &Path) -> bool {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.first().map_or(false, |e| {
                e.get("name").is_some() || e.get("displayName").is_some()
            })
        })
        .unwrap_or(false)
}

pub fn looks_like_save_state(path: &Path) -> bool {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .map(|v| {
            if let Some(arr) = v.as_array() {
                arr.first().map_or(false, |e| e.get("achieved").is_some() || e.get("earned").is_some())
            } else {
                v.is_object()
            }
        })
        .unwrap_or(false)
}

// ── Phase 3: Earned State Parsing (Helper) ─────────────────────────────────────

pub fn load_earned_map(save_path: &Path) -> HashMap<String, u64> {
    match save_path.extension().and_then(|e| e.to_str()) {
        Some("ini") => crate::achievement_watcher::read_codex_earned(save_path),
        Some("json") => crate::achievement_watcher::read_goldberg_earned(save_path),
        Some("xml") => crate::achievement_watcher::read_earned_anadius(save_path),
        _ => HashMap::new(),
    }
}

// ── Phase 4: Icon resolution ───────────────────────────────────────────────────

fn resolve_icon(base: &Path, relative: &str) -> Option<String> {
    if relative.is_empty() { return None; }
    let mut full = base.join(relative);
    if !full.exists() {
        let alt = base.join("steam_settings").join(relative);
        if alt.exists() { full = alt; } else { return None; }
    }
    let bytes = fs::read(&full).ok()?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    let mime = if relative.to_lowercase().ends_with(".png") { "image/png" } else { "image/jpeg" };
    Some(format!("data:{};base64,{}", mime, b64))
}

// ── Phase 5: Build Result List ───────────────────────────────────────────────

fn build_list(
    defs: Vec<AchievementDef>,
    earned_map: &HashMap<String, u64>,
    icon_base: &Path,
    is_anadius: bool,
) -> Vec<Achievement> {
    defs.into_iter()
        .map(|def| {
            let earned_time = if is_anadius {
                let display = if def.display_name.is_empty() { &def.name } else { &def.display_name };
                earned_map.get(display.as_str()).copied()
            } else {
                earned_map.get(&def.name).copied()
            };
            Achievement {
                api_name: def.name.clone(),
                display_name: if def.display_name.is_empty() { def.name.clone() } else { def.display_name },
                description: def.description,
                hidden: def.hidden == 1,
                earned: earned_time.is_some(),
                earned_time,
                icon_path: resolve_icon(icon_base, &def.icon),
                icon_gray_path: resolve_icon(icon_base, &def.icon_gray),
                global_percent: def.global_percent,
            }
        })
        .collect()
}

// ── Shared Functionality & Main Sync ─────────────────────────────────────────

pub async fn try_auto_generate(
    app_id: &str,
    game_dir: &Path,
    crack_type: Option<&CrackType>,
    steam_api_key: Option<&str>,
) -> bool {
    let Some(key) = steam_api_key.filter(|k| !k.is_empty()) else { return false; };
    
    // Use the discovery logic to find where to put the generated file
    let _log: Vec<String> = Vec::new();
    let save_dir = find_save_dir(app_id, game_dir, crack_type);
    
    let Some(dest_dir) = save_dir else {
        log::info!("[AutoGen] No existing save dir for app_id={}", app_id);
        return false;
    };

    if dest_dir.join("achievements.json").exists() { return false; }

    log::info!("[AutoGen] Generating for app_id={} → {}", app_id, dest_dir.display());

    match crate::achievement_watcher::generate_achievements_json(key, app_id, &dest_dir).await {
        Ok(true) => {
            log::info!("[AutoGen] Done for app_id={}", app_id);
            true
        }
        _ => false
    }
}

pub fn find_save_dir(
    app_id: &str,
    game_dir: &Path,
    crack_type: Option<&CrackType>,
) -> Option<PathBuf> {
    if matches!(crack_type, Some(CrackType::Anadius)) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let dir = PathBuf::from(&local).join("anadius").join("LSX emu").join(app_id);
            if dir.exists() { return Some(dir); }
        }
    }
    if matches!(crack_type, Some(CrackType::Goldberg)) {
        for var in &["APPDATA", "LOCALAPPDATA"] {
            if let Some(appdata) = std::env::var_os(var) {
                for sub in GOLDBERG_APPDATA_DIRS {
                    let dir = PathBuf::from(&appdata).join(sub).join(app_id);
                    if dir.exists() { return Some(dir); }
                }
            }
        }
    }
    if let Some(sys_drive) = std::env::var_os("SystemDrive") {
        let drive_root = PathBuf::from(&sys_drive);
        let drive_root = if drive_root.to_string_lossy().ends_with('\\') { drive_root } else { PathBuf::from(format!(r"{}\", sys_drive.to_string_lossy())) };
        let public = drive_root.join("Users\\Public\\Documents\\Steam");
        for sub in PUBLIC_EMU_DIRS {
            let dir = public.join(sub).join(app_id);
            if dir.exists() { return Some(dir); }
        }
    }
    let local = game_dir.join("steam_settings");
    if local.exists() { return Some(local); }
    None
}

pub fn sync_achievements(
    game_id: &str,
    install_dir: &str,
    db_app_id: Option<&str>,
    opts: &SyncOptions<'_>,
) -> (Vec<Achievement>, bool) {
    let base = Path::new(install_dir);
    let discovery = discover_achievements(base, db_app_id, opts);

    let is_anadius = matches!(discovery.emulator.crack_type, CrackType::Anadius);

    // 1. Load definitions
    let defs: Vec<AchievementDef> = discovery.metadata_path.as_ref()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let icon_base = discovery.metadata_path.as_ref()
        .and_then(|p| p.parent())
        .unwrap_or(base);

    // 2. Load earned state
    let earned_map = discovery.save_path.as_deref()
        .map(load_earned_map)
        .unwrap_or_default();

    // 3. Persist discovered paths
    if let Some(tx) = opts.db_tx {
        if discovery.metadata_path.is_some() || discovery.save_path.is_some() {
            use crate::state::{DbWrite, GameDbWrite};
            let _ = tx.send(DbWrite::Game(GameDbWrite::UpdateDetectedAchievementPaths {
                game_id: game_id.to_string(),
                metadata: discovery.metadata_path.as_ref().map(|p| p.to_string_lossy().to_string()),
                earned_state: discovery.save_path.as_ref().map(|p| p.to_string_lossy().to_string()),
            }));
        }
    }

    // 4. Construct final list
    let mut list = if !defs.is_empty() {
        build_list(defs, &earned_map, icon_base, is_anadius)
    } else if !earned_map.is_empty() {
        earned_map.iter().map(|(name, &ts)| Achievement {
            api_name: name.clone(),
            display_name: name.replace('_', " ").trim().to_string(),
            description: String::new(),
            hidden: false,
            earned: true,
            earned_time: Some(ts),
            icon_path: None,
            icon_gray_path: None,
            global_percent: None,
        }).collect()
    } else {
        vec![]
    };

    // 5. Cache & return
    if !list.is_empty() {
        // Merge with existing cache for metadata if available
        if let Some(cached) = cache::load_cache(game_id) {
            for c in cached {
                if !list.iter().any(|a| a.api_name == c.api_name) {
                    list.push(Achievement { earned: false, earned_time: None, ..c });
                }
            }
        }
        cache::save_cache(game_id, &list);
        return (list, false);
    }

    if let Some(cached) = cache::load_cache(game_id) {
        return (cached, true);
    }

    (vec![], false)
}

pub fn has_local_achievements(
    install_dir: &str,
    db_app_id: Option<&str>,
    manual_path: Option<&str>,
    scan_roots: &[PathBuf],
    crack_type: Option<&CrackType>,
) -> bool {
    let base = Path::new(install_dir);
    let opts = SyncOptions {
        crack_type: crack_type.cloned(),
        known_app_id: db_app_id,
        manual_path,
        scan_roots,
        ..Default::default()
    };
    let discovery = discover_achievements(base, db_app_id, &opts);
    discovery.metadata_path.is_some() || discovery.save_path.is_some()
}