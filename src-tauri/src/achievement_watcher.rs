use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

use crate::achievements::{GOLDBERG_APPDATA_DIRS, PUBLIC_EMU_DIRS};
use crate::commands::scanner::CrackType;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AchievementUnlockedPayload {
    pub api_name: String,
    pub display_name: String,
    pub game_title: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_gray: Option<String>,
    pub earned_time: u64,
    pub global_percent: Option<f32>,
    pub xp: u64,
    #[serde(default)]
    pub is_debug: bool,
    pub custom_sound_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SaveDiscoveredPayload {
    pub app_id: String,
    pub emulator: String,
    pub path: String,
    pub format: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AchievementMeta {
    pub name: String,
    #[serde(rename = "displayName", default)]
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(rename = "icongray", default)]
    pub icon_gray: String,
    #[serde(rename = "globalPercent", default)]
    pub global_percent: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum AchievementFormat {
    GoldbergJson,
    CodExIni,
    AnadiusXml,
}

#[derive(Debug, Clone, Serialize)]
pub struct AchievementCandidate {
    pub path: PathBuf,
    pub format: AchievementFormat,
}

pub struct ActiveWatchers(pub Mutex<HashMap<String, Arc<AtomicBool>>>);
impl Default for ActiveWatchers {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

pub fn anadius_save_dir(content_id: &str) -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(
        PathBuf::from(local)
            .join("anadius")
            .join("LSX emu")
            .join(content_id),
    )
}

pub fn find_anadius_xml(save_dir: &Path, content_id: &str) -> Option<PathBuf> {
    if !save_dir.exists() {
        return None;
    }
    std::fs::read_dir(save_dir)
        .ok()?
        .flatten()
        .find(|e| {
            let p = e.path();
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            p.extension().and_then(|x| x.to_str()) == Some("xml")
                && name.starts_with("achievement-")
                && name.contains(content_id)
        })
        .map(|e| e.path())
}

pub fn read_earned_anadius(xml_path: &Path) -> HashMap<String, u64> {
    let text = match std::fs::read_to_string(xml_path) {
        Ok(t) => t,
        Err(e) => {
            log::warn!("[Anadius] Read error {}: {}", xml_path.display(), e);
            return HashMap::new();
        }
    };
    let mut result = HashMap::new();
    for line in text.lines() {
        let t = line.trim();
        if !t.starts_with("<Achievement ") {
            continue;
        }
        let Some(name) = xml_attr(t, "Name") else {
            continue;
        };
        let Some(grant) = xml_attr(t, "Grant") else {
            continue;
        };
        if name.is_empty() {
            continue;
        }
        result.insert(name, parse_iso8601(&grant).unwrap_or(0));
    }
    result
}

fn xml_attr(tag: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = tag.find(&needle)? + needle.len();
    let rest = &tag[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn parse_iso8601(s: &str) -> Option<u64> {
    let s = s.trim();
    if s.len() < 19 {
        return None;
    }
    let y: i64 = s[0..4].parse().ok()?;
    let mo: i64 = s[5..7].parse().ok()?;
    let d: i64 = s[8..10].parse().ok()?;
    let h: i64 = s[11..13].parse().ok()?;
    let mi: i64 = s[14..16].parse().ok()?;
    let sec: i64 = s[17..19].parse().ok()?;
    let dim = [0i64, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let leap = |yr: i64| (yr % 4 == 0 && yr % 100 != 0) || yr % 400 == 0;
    let mut days = 0i64;
    for yr in 1970..y {
        days += if leap(yr) { 366 } else { 365 };
    }
    for m in 1..mo {
        days += dim[m as usize];
        if m == 2 && leap(y) {
            days += 1;
        }
    }
    days += d - 1;
    let ts = days * 86400 + h * 3600 + mi * 60 + sec;
    if ts < 0 {
        None
    } else {
        Some(ts as u64)
    }
}

fn load_meta(
    game_dir: &Path,
    app_id: Option<&str>,
    manual_metadata_path: Option<&str>,
    crack_type: Option<&CrackType>,
) -> (HashMap<String, AchievementMeta>, PathBuf) {
    if let Some(p) = manual_metadata_path
        .filter(|p| !p.is_empty())
        .map(|p| {
            let p = Path::new(p);
            if p.is_file() {
                p.to_path_buf()
            } else {
                p.join("achievements.json")
            }
        })
        .filter(|p| p.exists() && is_metadata_json(p))
    {
        return parse_meta_file(p);
    }

    if matches!(crack_type, Some(CrackType::Anadius)) {
        if let Some(id) = app_id {
            if let Some(dir) = anadius_save_dir(id) {
                let p = dir.join("achievements.json");
                if p.exists() && is_metadata_json(&p) {
                    return parse_meta_file(p);
                }
            }
        }
    }

    if let Some(p) =
        crate::achievements::find_achievements_json(game_dir, app_id, manual_metadata_path)
    {
        return parse_meta_file(p);
    }

    let fallback = game_dir.join("steam_settings").join("achievements.json");
    (HashMap::new(), fallback)
}

fn parse_meta_file(path: PathBuf) -> (HashMap<String, AchievementMeta>, PathBuf) {
    let meta = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| {
            if let Ok(v) = serde_json::from_str::<Vec<AchievementMeta>>(&s) {
                Some(v)
            } else if let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) {
                val.get("achievements")
                    .and_then(|a| serde_json::from_value::<Vec<AchievementMeta>>(a.clone()).ok())
            } else {
                None
            }
        })
        .map(|v| v.into_iter().map(|m| (m.name.clone(), m)).collect())
        .unwrap_or_default();
    (meta, path)
}

fn is_metadata_json(path: &Path) -> bool {
    let s = match std::fs::read_to_string(path) {
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

fn looks_like_goldberg_save(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .map(|v| {
            if let Some(arr) = v.as_array() {
                arr.first().map_or(false, |e| {
                    e.get("achieved").is_some() || e.get("earned").is_some()
                })
            } else if let Some(obj) = v.as_object() {
                obj.values().next().map_or(false, |e| {
                    e.get("earned").is_some() || e.get("achieved").is_some()
                })
            } else {
                false
            }
        })
        .unwrap_or(false)
}

fn build_display_map(meta: &HashMap<String, AchievementMeta>) -> HashMap<String, String> {
    meta.values()
        .map(|m| (m.display_name.to_lowercase(), m.name.clone()))
        .collect()
}

pub fn read_goldberg_earned(path: &Path) -> HashMap<String, u64> {
    let mut unlocked = HashMap::new();
    let data = match std::fs::read_to_string(path) {
        Ok(d) => d,
        Err(_) => return unlocked,
    };

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
        if let Some(arr) = json.as_array() {
            for item in arr {
                let achieved = item
                    .get("achieved")
                    .and_then(|v| v.as_u64())
                    .map(|v| v == 1)
                    .unwrap_or(false)
                    || item
                        .get("earned")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    || item
                        .get("achieved")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                if achieved {
                    if let Some(n) = item.get("name").and_then(|v| v.as_str()) {
                        let earned_time = item
                            .get("earned_time")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0);
                        unlocked.insert(n.to_string(), earned_time);
                    }
                }
            }
        } else if let Some(obj) = json.as_object() {
            for (k, v) in obj {
                let achieved = v.get("earned").and_then(|e| e.as_bool()).unwrap_or(false)
                    || v.get("achieved").and_then(|e| e.as_bool()).unwrap_or(false)
                    || v.get("earned")
                        .and_then(|e| e.as_u64())
                        .map(|u| u == 1)
                        .unwrap_or(false)
                    || v.get("achieved")
                        .and_then(|e| e.as_u64())
                        .map(|u| u == 1)
                        .unwrap_or(false);

                if achieved {
                    let time = v.get("earned_time").and_then(|t| t.as_u64()).unwrap_or(0);
                    unlocked.insert(k.clone(), time);
                }
            }
        }
    }
    unlocked
}

pub fn read_codex_earned(path: &Path) -> HashMap<String, u64> {
    let mut unlocked = HashMap::new();
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return unlocked,
    };

    let mut listed: Vec<String> = Vec::new();
    let mut in_steam = false;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            let section = &line[1..line.len() - 1];
            in_steam = section.eq_ignore_ascii_case("SteamAchievements")
                || section.eq_ignore_ascii_case("Achievements");
            continue;
        }
        if in_steam {
            if let Some(eq) = line.find('=') {
                let key = line[..eq].trim();
                let val = line[eq + 1..].trim();
                if !val.is_empty() && key.chars().all(|c| c.is_ascii_digit()) {
                    listed.push(val.to_string());
                }
            }
        }
    }

    if listed.is_empty() {
        let mut current_section = String::new();
        let mut is_achieved = false;
        let mut unlock_time = 0;

        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('[') && line.ends_with(']') {
                if is_achieved && !current_section.is_empty() {
                    unlocked.insert(current_section.clone(), unlock_time);
                }
                current_section = line[1..line.len() - 1].to_string();
                is_achieved = false;
                unlock_time = 0;
                continue;
            }
            if let Some(eq) = line.find('=') {
                let key = line[..eq].trim();
                let val = line[eq + 1..].trim();
                if key.eq_ignore_ascii_case("Achieved")
                    && (val == "1" || val.eq_ignore_ascii_case("true"))
                {
                    is_achieved = true;
                }
                if key.eq_ignore_ascii_case("UnlockTime") {
                    unlock_time = val.parse().unwrap_or(0);
                }
            }
        }
        if is_achieved && !current_section.is_empty() {
            unlocked.insert(current_section, unlock_time);
        }
    } else {
        for name in &listed {
            let mut is_achieved = false;
            let mut unlock_time = 0;
            let header = format!("[{}]", name);
            let mut in_section = false;

            for line in content.lines() {
                let line = line.trim();
                if line.starts_with('[') && line.ends_with(']') {
                    if line.eq_ignore_ascii_case(&header) {
                        in_section = true;
                    } else if in_section {
                        break;
                    }
                    continue;
                }
                if in_section {
                    if let Some(eq) = line.find('=') {
                        let key = line[..eq].trim();
                        let val = line[eq + 1..].trim();
                        if key.eq_ignore_ascii_case("Achieved")
                            && (val == "1" || val.eq_ignore_ascii_case("true"))
                        {
                            is_achieved = true;
                        }
                        if key.eq_ignore_ascii_case("UnlockTime") {
                            unlock_time = val.parse().unwrap_or(0);
                        }
                    }
                }
            }
            if is_achieved {
                unlocked.insert(name.clone(), unlock_time);
            }
        }
    }
    unlocked
}

fn read_candidate_earned(cand: &AchievementCandidate) -> HashMap<String, u64> {
    match cand.format {
        AchievementFormat::GoldbergJson => read_goldberg_earned(&cand.path),
        AchievementFormat::CodExIni => read_codex_earned(&cand.path),
        AchievementFormat::AnadiusXml => read_earned_anadius(&cand.path),
    }
}

fn resolve_icon(icon_base: &Path, relative: &str) -> Option<String> {
    if relative.is_empty() {
        return None;
    }
    let mut full = icon_base.join(relative);
    if !full.exists() {
        let alt = icon_base
            .parent()
            .unwrap_or(icon_base)
            .join("steam_settings")
            .join(relative);
        if alt.exists() {
            full = alt;
        } else {
            return None;
        }
    }
    let bytes = std::fs::read(&full).ok()?;
    let mime = if relative.to_lowercase().ends_with(".png") {
        "image/png"
    } else {
        "image/jpeg"
    };
    Some(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(&bytes)
    ))
}

fn payload_api(
    api_name: &str,
    game_title: &str,
    meta: &HashMap<String, AchievementMeta>,
    meta_path: &Path,
    earned_time: u64,
    custom_sound_path: Option<String>,
) -> AchievementUnlockedPayload {
    let icon_base = meta_path.parent().unwrap_or(Path::new(""));
    let (display_name, description, icon, icon_gray, global_percent) = match meta.get(api_name) {
        Some(m) => (
            m.display_name.clone(),
            m.description.clone(),
            resolve_icon(icon_base, &m.icon),
            resolve_icon(icon_base, &m.icon_gray),
            m.global_percent,
        ),
        None => (
            api_name.replace('_', " ").trim().to_string(),
            String::new(),
            None,
            None,
            None,
        ),
    };
    AchievementUnlockedPayload {
        api_name: api_name.to_string(),
        display_name,
        game_title: game_title.to_string(),
        description,
        icon,
        icon_gray,
        earned_time,
        global_percent,
        xp: crate::achievements::calculate_xp(global_percent),
        is_debug: false,
        custom_sound_path,
    }
}

fn payload_display(
    display_name: &str,
    game_title: &str,
    meta: &HashMap<String, AchievementMeta>,
    display_map: &HashMap<String, String>,
    meta_path: &Path,
    earned_time: u64,
    custom_sound_path: Option<String>,
) -> AchievementUnlockedPayload {
    let api_name = display_map
        .get(&display_name.to_lowercase())
        .cloned()
        .unwrap_or_else(|| display_name.replace(' ', "_"));

    let icon_base = meta_path.parent().unwrap_or(Path::new(""));
    let found = meta.get(&api_name).or_else(|| {
        meta.values()
            .find(|m| m.display_name.eq_ignore_ascii_case(display_name))
    });

    let (resolved_display, description, icon, icon_gray, global_percent) = match found {
        Some(m) => (
            m.display_name.clone(),
            m.description.clone(),
            resolve_icon(icon_base, &m.icon),
            resolve_icon(icon_base, &m.icon_gray),
            m.global_percent,
        ),
        None => (display_name.to_string(), String::new(), None, None, None),
    };

    AchievementUnlockedPayload {
        api_name,
        display_name: resolved_display,
        game_title: game_title.to_string(),
        description,
        icon,
        icon_gray,
        earned_time,
        global_percent,
        xp: crate::achievements::calculate_xp(global_percent),
        is_debug: false,
        custom_sound_path,
    }
}

fn fire_overlay(app: &AppHandle, payload: &AchievementUnlockedPayload) {
    if let Some(overlay) = app.get_webview_window("achievement-overlay") {
        overlay.show().ok();
        overlay.set_always_on_top(true).ok();
    }
    let _ = app.emit("achievement-unlocked", payload);
}

fn find_active_candidate(
    app_id: &str,
    game_dir: &Path,
    scan_roots: &[PathBuf],
    manual_save_path: Option<&str>,
    crack_type: Option<&CrackType>,
) -> Option<AchievementCandidate> {
    if let Some(manual) = manual_save_path.filter(|p| !p.is_empty()) {
        if let Some(c) = probe_dir(Path::new(manual)) {
            return Some(c);
        }
    }

    if matches!(crack_type, Some(CrackType::Anadius)) {
        if !app_id.is_empty() {
            if let Some(dir) = anadius_save_dir(app_id) {
                if let Some(xml) = find_anadius_xml(&dir, app_id) {
                    return Some(AchievementCandidate {
                        path: xml,
                        format: AchievementFormat::AnadiusXml,
                    });
                }
            }
        }
    }

    if !matches!(
        crack_type,
        Some(CrackType::Goldberg) | Some(CrackType::Voices38)
    ) {
        if let Some(sys_drive) = std::env::var_os("SystemDrive") {
            let public = PathBuf::from(&sys_drive).join("Users\\Public\\Documents\\Steam");
            for sub in PUBLIC_EMU_DIRS {
                if let Some(c) = probe_dir(&public.join(sub).join(app_id)) {
                    return Some(c);
                }
            }
        }
        for root in scan_roots {
            if let Some(c) = probe_dir(&root.join(app_id)) {
                return Some(c);
            }
        }
    }

    if !matches!(crack_type, Some(CrackType::Codex)) {
        for var in &["APPDATA", "LOCALAPPDATA"] {
            if let Some(appdata) = std::env::var_os(var) {
                for sub in GOLDBERG_APPDATA_DIRS {
                    let json = PathBuf::from(&appdata)
                        .join(sub)
                        .join(app_id)
                        .join("achievements.json");
                    if json.exists() && looks_like_goldberg_save(&json) {
                        return Some(AchievementCandidate {
                            path: json,
                            format: AchievementFormat::GoldbergJson,
                        });
                    }
                }
            }
        }
    }

    if !app_id.is_empty() {
        let offline = game_dir.join("OfflineStorage");
        let named_ini = offline.join(format!("{}.ini", app_id));
        if named_ini.exists() {
            return Some(AchievementCandidate {
                path: named_ini,
                format: AchievementFormat::CodExIni,
            });
        }
        let root_named_ini = game_dir.join(format!("{}.ini", app_id));
        if root_named_ini.exists() {
            return Some(AchievementCandidate {
                path: root_named_ini,
                format: AchievementFormat::CodExIni,
            });
        }
    }

    probe_dir(game_dir)
}

fn probe_dir(dir: &Path) -> Option<AchievementCandidate> {
    if !dir.exists() {
        return None;
    }
    if dir.is_file() {
        match dir.extension().and_then(|s| s.to_str()) {
            Some("ini") => {
                return Some(AchievementCandidate {
                    path: dir.to_path_buf(),
                    format: AchievementFormat::CodExIni,
                })
            }
            Some("json") => {
                return Some(AchievementCandidate {
                    path: dir.to_path_buf(),
                    format: AchievementFormat::GoldbergJson,
                })
            }
            Some("xml") => {
                return Some(AchievementCandidate {
                    path: dir.to_path_buf(),
                    format: AchievementFormat::AnadiusXml,
                })
            }
            _ => return None,
        }
    }
    let ini = dir.join("achievements.ini");
    if ini.exists() {
        return Some(AchievementCandidate {
            path: ini,
            format: AchievementFormat::CodExIni,
        });
    }
    let ini2 = dir.join("achievement.ini");
    if ini2.exists() {
        return Some(AchievementCandidate {
            path: ini2,
            format: AchievementFormat::CodExIni,
        });
    }
    let json = dir.join("achievements.json");
    if json.exists() && looks_like_goldberg_save(&json) {
        return Some(AchievementCandidate {
            path: json,
            format: AchievementFormat::GoldbergJson,
        });
    }
    None
}

fn emulator_label(path: &Path, crack_type: Option<&CrackType>) -> String {
    if let Some(CrackType::Voices38) = crack_type {
        return "Voices38".to_string();
    }

    let s = path.to_string_lossy().to_lowercase();
    if s.contains("lsx emu") {
        "Anadius (LSX)"
    } else if s.contains("gse saves") || s.contains("goldberg steamemu saves") {
        "Goldberg (GSE)"
    } else if s.contains("goldberg") {
        "Goldberg"
    } else if s.contains("codex") {
        "CODEX"
    } else if s.contains("rld!") {
        "Skidrow"
    } else if s.contains("ali213") {
        "ALI213"
    } else if s.contains("user_stats") {
        "Goldberg (Portable)"
    } else {
        "Unknown"
    }
    .to_string()
}

pub fn start_watching_for_game(
    app: AppHandle,
    game_id: String,
    game_title: String,
    app_id: String,
    game_path: PathBuf,
    scan_roots: Vec<PathBuf>,
    manual_metadata_path: Option<String>,
    manual_save_path: Option<String>,
    crack_type: Option<CrackType>,
    custom_sound_path: Option<String>,
) -> Option<Arc<AtomicBool>> {
    log::info!(
        "[Prober] Starting background discovery task for game={} app_id={} crack={:?}",
        game_id,
        app_id,
        crack_type
    );

    let stop_flag = Arc::new(AtomicBool::new(false));
    let sf = stop_flag.clone();
    let is_anadius = matches!(crack_type, Some(CrackType::Anadius));

    let db_tx = app.state::<crate::state::AppState>().db_tx.clone();

    tauri::async_runtime::spawn(async move {
        let watcher_start = SystemTime::now();
        let mut active_cand: Option<AchievementCandidate> = None;
        let mut seen: HashSet<String> = HashSet::new();
        let mut last_mtime: Option<SystemTime> = None;
        let mut meta: HashMap<String, AchievementMeta> = HashMap::new();
        let mut meta_path = PathBuf::new();
        let mut display_map: HashMap<String, String> = HashMap::new();

        while !sf.load(Ordering::Relaxed) {
            if meta.is_empty() {
                let (m, p) = load_meta(
                    &game_path,
                    Some(app_id.as_str()),
                    manual_metadata_path.as_deref(),
                    crack_type.as_ref(),
                );
                if !m.is_empty() {
                    meta = m;
                    meta_path = p;
                    if is_anadius {
                        display_map = build_display_map(&meta);
                    }
                    log::info!("[Prober] Metadata discovered for {}", game_id);
                }
            }

            if active_cand.is_none() {
                let cand = find_active_candidate(
                    &app_id,
                    &game_path,
                    &scan_roots,
                    manual_save_path.as_deref(),
                    crack_type.as_ref(),
                );

                if let Some(c) = cand {
                    log::info!(
                        "[Prober] Save file discovered for {}: {:?}",
                        game_id,
                        c.path
                    );

                    let file_mtime = std::fs::metadata(&c.path).and_then(|m| m.modified()).ok();
                    let file_predates_session =
                        file_mtime.map(|mt| mt < watcher_start).unwrap_or(true);

                    if file_predates_session {
                        let baseline = read_candidate_earned(&c);
                        log::info!(
                            "[Prober] Pre-existing save (mtime < session start), snapshotting {} baseline achievements",
                            baseline.len()
                        );
                        seen = baseline.into_keys().collect();
                    } else {
                        log::info!("[Prober] Fresh save file detected (mtime >= session start), treating all as new");
                        seen.clear();
                    }

                    last_mtime = file_mtime;
                    active_cand = Some(c.clone());

                    let _ = app.emit(
                        "achievement-save-discovered",
                        SaveDiscoveredPayload {
                            app_id: app_id.clone(),
                            emulator: emulator_label(&c.path, crack_type.as_ref()),
                            path: c.path.to_string_lossy().to_string(),
                            format: format!("{:?}", c.format),
                        },
                    );
                }
            }

            if let Some(ref cand) = active_cand {
                if !cand.path.exists() {
                    log::warn!("[Prober] Save file was deleted mid-session. Resuming probe...");
                    active_cand = None;
                    last_mtime = None;
                    seen.clear();
                } else {
                    let current_mtime = std::fs::metadata(&cand.path)
                        .and_then(|m| m.modified())
                        .ok();
                    let changed = current_mtime != last_mtime;

                    if changed {
                        last_mtime = current_mtime;
                        let now = read_candidate_earned(cand);
                        let new_unlocks: Vec<(String, u64)> = now
                            .iter()
                            .filter(|(k, _)| !seen.contains(*k))
                            .map(|(k, t)| (k.clone(), *t))
                            .take(8)
                            .collect();

                        for (name, t) in new_unlocks {
                            let p = if is_anadius {
                                payload_display(
                                    &name,
                                    &game_title,
                                    &meta,
                                    &display_map,
                                    &meta_path,
                                    t,
                                    custom_sound_path.clone(),
                                )
                            } else {
                                payload_api(
                                    &name,
                                    &game_title,
                                    &meta,
                                    &meta_path,
                                    t,
                                    custom_sound_path.clone(),
                                )
                            };

                            fire_overlay(&app, &p);

                            let _ = db_tx.send(crate::state::DbWrite::Profile(
                                crate::state::ProfileDbWrite::UnlockAchievement {
                                    game_id: game_id.clone(),
                                    api_name: p.api_name.clone(),
                                    title: p.display_name.clone(),
                                    desc: p.description.clone(),
                                    unlock_time: p.earned_time.to_string(),
                                },
                            ));

                            let _ = db_tx.send(crate::state::DbWrite::Profile(
                                crate::state::ProfileDbWrite::AddXp(p.xp),
                            ));

                            log::info!("[Prober] Unlock detected: {} (+{} XP)", name, p.xp);
                            seen.insert(name.clone());
                        }

                        seen.retain(|k| now.contains_key(k));
                        seen.extend(now.into_keys());
                    }
                }
            }

            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        log::info!("[Prober] Task stopped for game {}", game_id);
    });

    Some(stop_flag)
}

#[tauri::command]
pub fn watch_game_achievements(
    app: AppHandle,
    state: tauri::State<'_, crate::state::AppState>,
    game_id: String,
    game_dir: String,
    app_id: String,
) -> Result<(), String> {
    let game = crate::db::queries::get_game_by_id(&state.read_pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    let crack_type: Option<CrackType> = game
        .crack_type
        .as_deref()
        .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

    let watcher_key = if app_id.is_empty() {
        game_id.clone()
    } else {
        app_id.clone()
    };

    let watcher = start_watching_for_game(
        app.clone(),
        game_id,
        game.title,
        app_id,
        PathBuf::from(&game_dir),
        crate::settings::default_scan_roots(),
        game.manual_achievement_path,
        game.manual_save_path,
        crack_type,
        game.custom_ach_sound_path,
    )
    .ok_or_else(|| "Could not start achievement prober task".to_string())?;

    let active: tauri::State<ActiveWatchers> = app.state();
    active.0.lock().unwrap().insert(watcher_key, watcher);
    Ok(())
}

#[tauri::command]
pub fn stop_game_achievement_watch(app: AppHandle, app_id: String) -> Result<(), String> {
    let state: tauri::State<ActiveWatchers> = app.state();
    if let Some(flag) = state.0.lock().unwrap().remove(&app_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn debug_fire_achievement(app: AppHandle, format_type: String) -> Result<(), String> {
    let payload = AchievementUnlockedPayload {
        api_name: format!("TEST_{}", format_type.to_uppercase()),
        display_name: format!("Test — {}", format_type),
        game_title: "ChiraLauncher Test".to_string(),
        description: "Mock achievement for overlay testing.".to_string(),
        icon: None,
        icon_gray: None,
        earned_time: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        global_percent: Some(2.1),
        xp: 0, // EXTREME SAFETY: Zero XP for tests from the backend
        is_debug: true,
        custom_sound_path: None,
    };
    fire_overlay(&app, &payload);
    Ok(())
}

#[tauri::command]
pub fn debug_fire_custom(
    app: AppHandle,
    mut payload: AchievementUnlockedPayload,
) -> Result<(), String> {
    payload.xp = 0; // EXTREME SAFETY: Zero XP for custom tests from the backend
    payload.is_debug = true;
    fire_overlay(&app, &payload);
    Ok(())
}
