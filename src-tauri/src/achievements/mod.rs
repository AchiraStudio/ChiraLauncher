pub mod cache;
pub mod fetcher;

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub use crate::commands::scanner::{CrackType, EmulatorInfo};

// ── Shared location constants ────────────────────────────────────────────────

pub const PUBLIC_EMU_DIRS: &[&str] = &[
    "CODEX",
    "RLD!",
    "Skidrow",
    "PLAZA",
    "CPY",
    "FLT",
    "DARKSiDERS",
];
pub const GOLDBERG_APPDATA_DIRS: &[&str] = &[
    "Goldberg SteamEmu Saves",
    "GSE Saves",
    "steam_settings",
    "Goldberg SteamEmu",
];

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
    #[serde(default)]
    pub xp: u64,
}

// UPGRADED: display_name and description are now dynamic Values to handle localization objects
#[derive(Debug, Deserialize, Clone)]
pub struct AchievementDef {
    pub name: String,
    #[serde(rename = "displayName", default)]
    pub display_name: serde_json::Value,
    #[serde(default)]
    pub description: serde_json::Value,
    #[serde(default)]
    pub icon: String,
    #[serde(rename = "icongray", default)]
    pub icon_gray: String,
    #[serde(default)]
    pub hidden: i32,
    #[serde(rename = "globalPercent", default)]
    pub global_percent: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AchievementDiscovery {
    pub emulator: EmulatorInfo,
    pub metadata_path: Option<PathBuf>,
    pub save_path: Option<PathBuf>,
    pub probe_log: Vec<String>,
}

#[derive(Debug, Default)]
pub struct SyncOptions<'a> {
    pub crack_type: Option<CrackType>,
    pub known_app_id: Option<&'a str>,
    pub manual_metadata_path: Option<&'a str>,
    pub manual_save_path: Option<&'a str>,
    pub scan_roots: &'a [PathBuf],
    pub steam_api_key: Option<&'a str>,
    pub db_tx: Option<&'a crate::state::DbWriteSender>,
}

// ── JSON String Extractor ─────────────────────────────────────────────────────
pub fn extract_localized_string(val: &serde_json::Value) -> String {
    if let Some(s) = val.as_str() {
        return s.to_string();
    }
    if let Some(obj) = val.as_object() {
        if let Some(eng) = obj.get("english").and_then(|s| s.as_str()) {
            return eng.to_string();
        }
        for v in obj.values() {
            if let Some(s) = v.as_str() {
                return s.to_string();
            }
        }
    }
    String::new()
}

// ── XP Calculation ────────────────────────────────────────────────────────────
pub fn calculate_xp(pct: Option<f32>) -> u64 {
    if let Some(p) = pct {
        if p <= 5.0 {
            200
        } else if p <= 10.0 {
            100
        } else if p <= 25.0 {
            50
        } else if p <= 50.0 {
            20
        } else {
            10
        }
    } else {
        15 // Default offline fallback
    }
}

// ── Anadius CFG Parser ────────────────────────────────────────────────────────
pub fn extract_last_quoted_token(line: &str) -> Option<String> {
    let mut last = None;
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

pub fn parse_anadius_cfg(path: &Path) -> (Option<String>, Option<String>, HashMap<String, String>) {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let mut content_id = None;
    let mut ach_set = None;
    let mut names = HashMap::new();
    let mut in_ach_names = false;
    
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("\"ContentId\"") || trimmed.to_lowercase().contains("\"contentid\"") {
            content_id = extract_last_quoted_token(trimmed);
        }
        if trimmed.starts_with("\"AchievementsSet\"") || trimmed.to_lowercase().contains("\"achievementsset\"") {
            ach_set = extract_last_quoted_token(trimmed);
        }
        
        if trimmed.starts_with("\"AchievementNames\"") || trimmed.to_lowercase().contains("\"achievementnames\"") {
            in_ach_names = true;
            continue;
        }
        
        if in_ach_names {
            if trimmed == "}" {
                in_ach_names = false;
            } else if trimmed.starts_with('"') {
                let parts: Vec<&str> = trimmed.split('"').collect();
                if parts.len() >= 4 {
                    let id = parts[1].to_string();
                    let name = parts[3].to_string();
                    names.insert(id, name);
                }
            }
        }
    }
    (content_id, ach_set, names)
}

// ── Phase 1: Discovery ────────────────────────────────────────────────────────

pub fn discover_achievements(
    install_dir: &Path,
    db_app_id: Option<&str>,
    opts: &SyncOptions<'_>,
) -> AchievementDiscovery {
    let mut probe_log = Vec::new();
    probe_log.push(format!("Starting discovery in: {}", install_dir.display()));

    let (crack_type, app_id_detected, crack_dir) = crate::commands::scanner::detect_crack(install_dir);
    let app_id = opts
        .known_app_id
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            if !app_id_detected.is_empty() {
                Some(app_id_detected)
            } else {
                None
            }
        })
        .or_else(|| db_app_id.map(|s| s.to_string()));

    let emu_info = EmulatorInfo {
        crack_type: opts.crack_type.clone().unwrap_or(crack_type),
        app_id: app_id.clone().unwrap_or_default(),
        install_dir: install_dir.to_string_lossy().to_string(),
    };

    probe_log.push(format!(
        "Emulator: {:?}, App ID: {}",
        emu_info.crack_type, emu_info.app_id
    ));

    // Use the crack_dir if it was found deep in the tree (e.g. Engine/Binaries/...)
    let search_base = crack_dir.unwrap_or_else(|| install_dir.to_path_buf());

    let meta_path = find_metadata_path(
        &search_base,
        app_id.as_deref(),
        opts.manual_metadata_path,
        &mut probe_log,
    );

    let save_path = find_save_path(
        app_id.as_deref(),
        &search_base,
        opts.manual_save_path,
        opts.scan_roots,
        Some(&emu_info.crack_type),
        &mut probe_log,
    );

    AchievementDiscovery {
        emulator: emu_info,
        metadata_path: meta_path,
        save_path,
        probe_log,
    }
}

pub fn resolve_app_id(install_dir: &Path) -> Option<String> {
    let (_, app_id, _) = crate::commands::scanner::detect_crack(install_dir);
    if app_id.is_empty() {
        None
    } else {
        Some(app_id)
    }
}

pub fn resolve_save_path(
    app_id: Option<&str>,
    game_dir: &Path,
    manual_save_path: Option<&str>,
    scan_roots: &[PathBuf],
    crack_type: Option<&CrackType>,
) -> Option<PathBuf> {
    let mut log = Vec::new();
    find_save_path(app_id, game_dir, manual_save_path, scan_roots, crack_type, &mut log)
}

pub fn find_achievements_json(
    game_dir: &Path,
    app_id: Option<&str>,
    manual_metadata_path: Option<&str>,
) -> Option<PathBuf> {
    let mut log = Vec::new();
    find_metadata_path(game_dir, app_id, manual_metadata_path, &mut log)
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
            candidates.push(p.to_path_buf());
        } else {
            candidates.push(p.join("achievements.json"));
        }
    }

    let mut steam_settings_dirs = vec![base.join("steam_settings")];
    for entry in walkdir::WalkDir::new(base).max_depth(10).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() && entry.file_name() == "steam_settings" {
            steam_settings_dirs.push(entry.into_path());
        }
    }

    for ss in &steam_settings_dirs {
        candidates.push(ss.join("achievements.json"));
        candidates.push(ss.join("user_stats").join("achievements.json"));
    }

    candidates.extend(vec![
        base.join("OfflineStorage")
            .join("User")
            .join("remote")
            .join("achievements.json"),
        base.join("achievements.json"),
    ]);

    if let Some(id) = app_id {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(&local)
                    .join("anadius")
                    .join("LSX emu")
                    .join(id)
                    .join("achievements.json"),
            );
        }
        for var in &["APPDATA", "LOCALAPPDATA"] {
            if let Some(appdata) = std::env::var_os(var) {
                for sub in GOLDBERG_APPDATA_DIRS {
                    candidates.push(
                        PathBuf::from(&appdata)
                            .join(sub)
                            .join(id)
                            .join("achievements.json"),
                    );
                }
            }
        }
        if let Some(sys_drive) = std::env::var_os("SystemDrive") {
            let drive_root = PathBuf::from(&sys_drive);
            let drive_root = if drive_root.to_string_lossy().ends_with('\\') {
                drive_root
            } else {
                PathBuf::from(format!(r"{}\", sys_drive.to_string_lossy()))
            };
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
                candidates.push(
                    public
                        .join(id)
                        .join("steam_settings")
                        .join("achievements.json"),
                );
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
            candidates.push(p.to_path_buf());
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
    let is_rune = matches!(crack_type, Some(CrackType::Rune));
    let is_voices38 = matches!(crack_type, Some(CrackType::Voices38));
    let try_all = crack_type.is_none() || matches!(crack_type, Some(CrackType::Unknown));

    if let Some(id) = app_id {
        if is_anadius || try_all {
            if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                let emu_base = PathBuf::from(&local).join("anadius").join("LSX emu");
                let search_dirs = [emu_base.clone(), emu_base.join(id)];
                
                let mut anadius_cfg = game_dir.join("anadius.cfg");
                if !anadius_cfg.exists() {
                    for entry in walkdir::WalkDir::new(game_dir).max_depth(10).into_iter().filter_map(|e| e.ok()) {
                        if entry.file_name() == "anadius.cfg" {
                            anadius_cfg = entry.into_path();
                            break;
                        }
                    }
                }
                let (_, ach_set, _) = parse_anadius_cfg(&anadius_cfg);
                
                for dir in search_dirs {
                    if let Ok(entries) = fs::read_dir(&dir) {
                        for entry in entries.flatten() {
                            let p = entry.path();
                            let name = p
                                .file_name()
                                .map(|n| n.to_string_lossy().to_lowercase())
                                .unwrap_or_default();
                            
                            if let Some(ref set_id) = ach_set {
                                if name == format!("achievement-{}.xml", set_id.to_lowercase()) {
                                    candidates.push(p.clone());
                                }
                            }
                            
                            if name.starts_with("achievement-")
                                && name.contains(&id.to_lowercase())
                                && name.ends_with(".xml")
                            {
                                candidates.push(p);
                            }
                        }
                    }
                }
            }
        }

        if is_codex || is_rune || try_all {
            let mut emu_inis = vec![game_dir.join("steam_emu.ini")];
            if is_codex || is_rune {
                for entry in walkdir::WalkDir::new(game_dir).max_depth(10).into_iter().filter_map(|e| e.ok()) {
                    if entry.file_name() == "steam_emu.ini" {
                        emu_inis.push(entry.into_path());
                    }
                }
            }
            for ini in emu_inis {
                if let Some(parsed) = crate::commands::scanner::parse_steam_emu_save_path(&ini) {
                    candidates.push(parsed.join("achievements.ini"));
                    candidates.push(parsed.join("achievements.json"));
                    candidates.push(parsed.join("achievement.ini"));
                }
            }

            if let Some(sys_drive) = std::env::var_os("SystemDrive") {
                let drive_root = PathBuf::from(&sys_drive);
                let drive_root = if drive_root.to_string_lossy().ends_with('\\') {
                    drive_root
                } else {
                    PathBuf::from(format!(r"{}\", sys_drive.to_string_lossy()))
                };
                let public_paths = [
                    drive_root.join("Users\\Public\\Documents\\Steam"),
                    drive_root.join("Users\\Public\\Documents\\Steam\\CODEX"),
                    drive_root.join("Users\\Public\\Documents\\Steam\\RUNE"),
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

        if is_goldberg || is_voices38 || try_all {
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

    let mut steam_settings_dirs = vec![game_dir.join("steam_settings")];
    for entry in walkdir::WalkDir::new(game_dir).max_depth(10).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() && entry.file_name() == "steam_settings" {
            steam_settings_dirs.push(entry.into_path());
        }
    }

    for ss in steam_settings_dirs {
        candidates.push(ss.join("user_stats").join("achievements.json"));
        candidates.push(ss.join("achievements.ini"));
        candidates.push(ss.join("achievements.json"));
    }

    candidates.push(game_dir.join("achievements.ini"));
    candidates.push(game_dir.join("achievements.json"));
    candidates.push(game_dir.join("achievement.ini"));

    for p in candidates {
        if !p.exists() {
            continue;
        }
        match p.extension().and_then(|e| e.to_str()) {
            Some("ini") => {
                log.push(format!("Found save file (INI) at: {}", p.display()));
                return Some(p);
            }
            Some("xml") => {
                log.push(format!("Found save file (XML) at: {}", p.display()));
                return Some(p);
            }
            Some("json") => {
                if looks_like_save_state(&p) {
                    log.push(format!("Found save file (JSON) at: {}", p.display()));
                    return Some(p);
                }
            }
            _ => {}
        }
    }
    log.push("No save file discovered.".to_string());
    None
}

pub fn looks_like_metadata(path: &Path) -> bool {
    let s = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return false,
    };
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
        if let Some(arr) = v.as_array() {
            return arr.first().map_or(false, |e| {
                e.get("name").is_some() || e.get("displayName").is_some()
            });
        }
        if let Some(arr) = v.get("achievements").and_then(|a| a.as_array()) {
            return arr.first().map_or(false, |e| {
                e.get("name").is_some() || e.get("displayName").is_some()
            });
        }
    }
    false
}

pub fn looks_like_save_state(path: &Path) -> bool {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .map(|v| {
            if let Some(arr) = v.as_array() {
                arr.first().map_or(false, |e| {
                    e.get("achieved").is_some() || e.get("earned").is_some()
                })
            } else {
                v.is_object()
            }
        })
        .unwrap_or(false)
}

pub fn load_earned_map(save_path: &Path, game_dir: &Path) -> HashMap<String, u64> {
    match save_path.extension().and_then(|e| e.to_str()) {
        Some("ini") => crate::achievement_watcher::read_codex_earned(save_path),
        Some("json") => crate::achievement_watcher::read_goldberg_earned(save_path),
        Some("xml") => {
            let mut anadius_cfg = game_dir.join("anadius.cfg");
            if !anadius_cfg.exists() {
                for entry in walkdir::WalkDir::new(game_dir).max_depth(10).into_iter().filter_map(|e| e.ok()) {
                    if entry.file_name() == "anadius.cfg" {
                        anadius_cfg = entry.into_path();
                        break;
                    }
                }
            }
            let (_, _, map) = parse_anadius_cfg(&anadius_cfg);
            crate::achievement_watcher::read_earned_anadius(save_path, &map)
        },
        _ => HashMap::new(),
    }
}

fn resolve_icon(base: &Path, relative: &str) -> Option<String> {
    if relative.is_empty() {
        return None;
    }
    let mut full = base.join(relative);
    if !full.exists() {
        let mut steam_settings_dirs = vec![base.join("steam_settings")];
        for entry in walkdir::WalkDir::new(base).max_depth(10).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_dir() && entry.file_name() == "steam_settings" {
                steam_settings_dirs.push(entry.into_path());
            }
        }
        
        let mut found = false;
        for ss in steam_settings_dirs {
            let alt = ss.join(relative);
            if alt.exists() {
                full = alt;
                found = true;
                break;
            }
        }
        
        if !found {
            return None;
        }
    }
    let bytes = fs::read(&full).ok()?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    let mime = if relative.to_lowercase().ends_with(".png") {
        "image/png"
    } else {
        "image/jpeg"
    };
    Some(format!("data:{};base64,{}", mime, b64))
}

fn build_list(
    defs: Vec<AchievementDef>,
    earned_map: &HashMap<String, u64>,
    icon_base: &Path,
    is_anadius: bool,
) -> Vec<Achievement> {
    defs.into_iter()
        .map(|def| {
            let display_name = extract_localized_string(&def.display_name);
            let description = extract_localized_string(&def.description);
            let final_display = if display_name.is_empty() { def.name.clone() } else { display_name };

            let earned_time = if is_anadius {
                earned_map.get(final_display.as_str()).copied()
            } else {
                earned_map.get(&def.name).copied()
            };
            let xp = calculate_xp(def.global_percent);
            Achievement {
                api_name: def.name.clone(),
                display_name: final_display,
                description,
                hidden: def.hidden == 1,
                earned: earned_time.is_some(),
                earned_time,
                icon_path: resolve_icon(icon_base, &def.icon),
                icon_gray_path: resolve_icon(icon_base, &def.icon_gray),
                global_percent: def.global_percent,
                xp,
            }
        })
        .collect()
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

    let mut defs: Vec<AchievementDef> = discovery
        .metadata_path
        .as_ref()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| {
            if let Ok(v) = serde_json::from_str::<Vec<AchievementDef>>(&s) {
                Some(v)
            } else if let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) {
                val.get("achievements")
                    .and_then(|a| serde_json::from_value::<Vec<AchievementDef>>(a.clone()).ok())
            } else {
                None
            }
        })
        .unwrap_or_default();

    if is_anadius && defs.is_empty() {
        let mut anadius_cfg = base.join("anadius.cfg");
        if !anadius_cfg.exists() {
            for entry in walkdir::WalkDir::new(base).max_depth(10).into_iter().filter_map(|e| e.ok()) {
                if entry.file_name() == "anadius.cfg" {
                    anadius_cfg = entry.into_path();
                    break;
                }
            }
        }
        let (_, _, names_map) = parse_anadius_cfg(&anadius_cfg);
        let mut ids: Vec<_> = names_map.keys().collect();
        ids.sort_by_key(|k| k.parse::<u32>().unwrap_or(0));
        
        for id in ids {
            if let Some(name) = names_map.get(id) {
                defs.push(AchievementDef {
                    name: name.clone(),
                    display_name: serde_json::Value::String(name.clone()),
                    description: serde_json::Value::String(String::new()),
                    icon: String::new(),
                    icon_gray: String::new(),
                    hidden: 0,
                    global_percent: Some(0.0),
                });
            }
        }
    }

    let icon_base = discovery
        .metadata_path
        .as_ref()
        .and_then(|p| p.parent())
        .unwrap_or(base);

    let earned_map = discovery
        .save_path
        .as_deref()
        .map(|p| load_earned_map(p, base))
        .unwrap_or_default();

    if let Some(tx) = opts.db_tx {
        if discovery.metadata_path.is_some() || discovery.save_path.is_some() {
            use crate::state::{DbWrite, GameDbWrite};
            let _ = tx.send(DbWrite::Game(GameDbWrite::UpdateDetectedAchievementPaths {
                game_id: game_id.to_string(),
                metadata: discovery
                    .metadata_path
                    .as_ref()
                    .map(|p| p.to_string_lossy().to_string()),
                earned_state: discovery
                    .save_path
                    .as_ref()
                    .map(|p| p.to_string_lossy().to_string()),
            }));
        }
    }

    let mut list = if !defs.is_empty() {
        build_list(defs, &earned_map, icon_base, is_anadius)
    } else if !earned_map.is_empty() {
        earned_map
            .iter()
            .map(|(name, &ts)| Achievement {
                api_name: name.clone(),
                display_name: name.replace('_', " ").trim().to_string(),
                description: String::new(),
                hidden: false,
                earned: true,
                earned_time: Some(ts),
                icon_path: None,
                icon_gray_path: None,
                global_percent: None,
                xp: calculate_xp(None),
            })
            .collect()
    } else {
        vec![]
    };

    if let Some(tx) = opts.db_tx {
        let earned_sync: Vec<crate::state::AchSync> = list
            .iter()
            .filter(|a| a.earned)
            .map(|a| crate::state::AchSync {
                api_name: a.api_name.clone(),
                title: a.display_name.clone(),
                description: a.description.clone(),
                earned_time: a.earned_time.unwrap_or(0),
                xp: a.xp,
            })
            .collect();

        if !earned_sync.is_empty() {
            let _ = tx.send(crate::state::DbWrite::Profile(
                crate::state::ProfileDbWrite::SyncEarnedAchievements {
                    game_id: game_id.to_string(),
                    earned: earned_sync,
                },
            ));
        }
    }

    if !list.is_empty() {
        if let Some(cached) = cache::load_cache(game_id) {
            for c in cached {
                if !list.iter().any(|a| a.api_name == c.api_name) {
                    list.push(Achievement {
                        earned: false,
                        earned_time: None,
                        ..c
                    });
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
    manual_metadata_path: Option<&str>,
    manual_save_path: Option<&str>,
    scan_roots: &[PathBuf],
    crack_type: Option<&CrackType>,
) -> bool {
    let base = Path::new(install_dir);
    let opts = SyncOptions {
        crack_type: crack_type.cloned(),
        known_app_id: db_app_id,
        manual_metadata_path,
        manual_save_path,
        scan_roots,
        ..Default::default()
    };
    let discovery = discover_achievements(base, db_app_id, &opts);
    discovery.metadata_path.is_some() || discovery.save_path.is_some()
}