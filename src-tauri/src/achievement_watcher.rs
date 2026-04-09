use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use base64::{Engine as _, engine::general_purpose};

use crate::commands::scanner::CrackType;
use crate::achievements::{PUBLIC_EMU_DIRS, GOLDBERG_APPDATA_DIRS};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AchievementUnlockedPayload {
    pub api_name: String,
    pub display_name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_gray: Option<String>,
    pub earned_time: u64,
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

pub struct ActiveWatchers(pub Mutex<HashMap<String, RecommendedWatcher>>);
impl Default for ActiveWatchers {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

struct WatchState {
    seen: HashSet<String>,
    meta: HashMap<String, AchievementMeta>,
    meta_path: PathBuf,
    app_id: String,
    active: Option<AchievementCandidate>,
}

// ── Anadius XML helpers ───────────────────────────────────────────────────────

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

/// Parse Anadius achievement XML.
///
/// ```xml
/// <Achievements GameName="EA SPORTS FC 26" ContentId="16425677">
///   <Achievement Id="4" Count="1" Progress="1"
///                Grant="2026-03-06T11:48:17" Name="Expect the Unexpected"/>
/// </Achievements>
/// ```
///
/// Returns `display_name → unix_timestamp`.
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
        let Some(name) = xml_attr(t, "Name") else { continue };
        let Some(grant) = xml_attr(t, "Grant") else { continue };
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
    if ts < 0 { None } else { Some(ts as u64) }
}

// ── Steam API auto-generation ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SteamSchemaResponse {
    game: SteamSchemaGame,
}
#[derive(Debug, Deserialize)]
struct SteamSchemaGame {
    #[serde(rename = "availableGameStats")]
    available_game_stats: Option<SteamGameStats>,
}
#[derive(Debug, Deserialize)]
struct SteamGameStats {
    achievements: Vec<SteamAchievement>,
}
#[derive(Debug, Deserialize)]
struct SteamAchievement {
    name: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    icongray: Option<String>,
    hidden: Option<u8>,
}
#[derive(Debug, Serialize)]
struct GenAchievement {
    description: String,
    #[serde(rename = "displayName")]
    display_name: String,
    hidden: u8,
    icon: String,
    icongray: String,
    name: String,
}

async fn download_image(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    if dest.exists() || url.is_empty() {
        return Ok(());
    }
    let bytes = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    std::fs::write(dest, &bytes).map_err(|e| e.to_string())
}

/// Fetch achievements from the Steam API and write achievements.json into
/// `save_dir`. Never creates `save_dir` — the game must have been launched.
/// Returns Ok(true) if a new file was written.
pub async fn generate_achievements_json(
    api_key: &str,
    app_id: &str,
    save_dir: &Path,
) -> Result<bool, String> {
    let json_path = save_dir.join("achievements.json");
    if json_path.exists() {
        return Ok(false);
    }
    if !save_dir.exists() {
        return Err(format!(
            "Save directory does not exist: {}. Launch the game once first.",
            save_dir.display()
        ));
    }

    let images_dir = save_dir.join("images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key={}&appid={}",
        api_key, app_id
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let resp: SteamSchemaResponse = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Steam API error: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Steam API JSON error: {}", e))?;

    let steam_achs = resp
        .game
        .available_game_stats
        .ok_or_else(|| format!("No achievements on Steam for app_id={}", app_id))?
        .achievements;

    let mut generated: Vec<GenAchievement> = Vec::new();
    for ach in steam_achs {
        let icon_url = ach.icon.unwrap_or_default();
        let gray_url = ach.icongray.unwrap_or_default();
        let icon_file = icon_url.split('/').last().unwrap_or("unknown.jpg").to_string();
        let gray_file = gray_url.split('/').last().unwrap_or("unknown.jpg").to_string();

        if let Err(e) =
            download_image(&client, &icon_url, &images_dir.join(&icon_file)).await
        {
            log::warn!("[AutoGen] Icon failed ({}): {}", icon_url, e);
        }
        if let Err(e) =
            download_image(&client, &gray_url, &images_dir.join(&gray_file)).await
        {
            log::warn!("[AutoGen] Gray icon failed ({}): {}", gray_url, e);
        }

        generated.push(GenAchievement {
            description: ach.description.unwrap_or_default(),
            display_name: ach.display_name.unwrap_or_else(|| ach.name.clone()),
            hidden: ach.hidden.unwrap_or(0),
            icon: if icon_url.is_empty() {
                String::new()
            } else {
                format!("images/{}", icon_file)
            },
            icongray: if gray_url.is_empty() {
                String::new()
            } else {
                format!("images/{}", gray_file)
            },
            name: ach.name,
        });
    }

    let json = serde_json::to_string_pretty(&generated).map_err(|e| e.to_string())?;
    std::fs::write(&json_path, json).map_err(|e| e.to_string())?;
    log::info!(
        "[AutoGen] Wrote {} achievements → {}",
        generated.len(),
        json_path.display()
    );
    Ok(true)
}

// ── Metadata loading ──────────────────────────────────────────────────────────

fn load_meta(
    game_dir: &Path,
    app_id: Option<&str>,
    manual_path: Option<&str>,
    crack_type: Option<&CrackType>,
) -> (HashMap<String, AchievementMeta>, PathBuf) {
    // 1. Manual dir — only if it's a metadata array
    if let Some(p) = manual_path
        .filter(|p| !p.is_empty())
        .map(|p| Path::new(p).join("achievements.json"))
        .filter(|p| p.exists() && is_metadata_json(p))
    {
        return parse_meta_file(p);
    }

    // 2. Anadius: check LSX emu dir for achievements.json
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
        crate::achievements::find_achievements_json(game_dir, app_id, manual_path)
    {
        return parse_meta_file(p);
    }

    let fallback = game_dir.join("steam_settings").join("achievements.json");
    (HashMap::new(), fallback)
}

fn parse_meta_file(path: PathBuf) -> (HashMap<String, AchievementMeta>, PathBuf) {
    let meta = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<AchievementMeta>>(&s).ok())
        .map(|v| v.into_iter().map(|m| (m.name.clone(), m)).collect())
        .unwrap_or_default();
    (meta, path)
}

fn is_metadata_json(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.first()
                .map_or(false, |e| {
                    e.get("name").is_some() || e.get("displayName").is_some()
                })
        })
        .unwrap_or(false)
}

fn looks_like_goldberg_save(path: &Path) -> bool {
    std::fs::read_to_string(path)
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

/// Build reverse map: `display_name.to_lowercase() → api_name`.
fn build_display_map(meta: &HashMap<String, AchievementMeta>) -> HashMap<String, String> {
    meta.values()
        .map(|m| (m.display_name.to_lowercase(), m.name.clone()))
        .collect()
}

// ── Earned readers ────────────────────────────────────────────────────────────

pub fn read_goldberg_earned(path: &Path) -> HashMap<String, u64> {
    let mut unlocked = HashMap::new();
    let data = match std::fs::read_to_string(path) {
        Ok(d) => d,
        Err(_) => return unlocked,
    };
    
    // CPlay logic: Handle both Array (Goldberg) and Object (Custom) formats safely
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
        if let Some(arr) = json.as_array() {
            for item in arr {
                let achieved = item.get("achieved").and_then(|v| v.as_u64()).map(|v| v == 1).unwrap_or(false)
                    || item.get("earned").and_then(|v| v.as_bool()).unwrap_or(false);
                if achieved {
                    if let Some(n) = item.get("name").and_then(|v| v.as_str()) {
                        let earned_time = item.get("earned_time").and_then(|v| v.as_u64()).unwrap_or(0);
                        unlocked.insert(n.to_string(), earned_time);
                    }
                }
            }
        } else if let Some(obj) = json.as_object() {
            // Fallback for legacy dictionary format
            for (k, v) in obj {
                let achieved = v.get("earned").and_then(|e| e.as_bool()).unwrap_or(false);
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

    // CPlay Logic: Manual INI parsing skips broken/malformed headers
    let mut listed: Vec<String> = Vec::new();
    let mut in_steam = false;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            let section = &line[1..line.len() - 1];
            in_steam = section.eq_ignore_ascii_case("SteamAchievements") || section.eq_ignore_ascii_case("Achievements");
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
                if key.eq_ignore_ascii_case("Achieved") && (val == "1" || val.eq_ignore_ascii_case("true")) {
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
                        if key.eq_ignore_ascii_case("Achieved") && (val == "1" || val.eq_ignore_ascii_case("true")) {
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

fn read_dir_earned(dir: &Path) -> HashMap<String, u64> {
    let ini = dir.join("achievements.ini");
    let ini2 = dir.join("achievement.ini");
    let json = dir.join("achievements.json");
    if ini.exists() {
        read_codex_earned(&ini)
    } else if ini2.exists() {
        read_codex_earned(&ini2)
    } else if json.exists() && looks_like_goldberg_save(&json) {
        read_goldberg_earned(&json)
    } else {
        HashMap::new()
    }
}

fn read_candidate_earned(cand: &AchievementCandidate) -> HashMap<String, u64> {
    match cand.format {
        AchievementFormat::GoldbergJson => read_goldberg_earned(&cand.path),
        AchievementFormat::CodExIni => read_codex_earned(&cand.path),
        AchievementFormat::AnadiusXml => read_earned_anadius(&cand.path),
    }
}

// ── Payload builders ──────────────────────────────────────────────────────────

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

/// Build payload using api_name as key (CODEX / Goldberg).
fn payload_api(
    api_name: &str,
    meta: &HashMap<String, AchievementMeta>,
    meta_path: &Path,
    earned_time: u64,
) -> AchievementUnlockedPayload {
    let icon_base = meta_path.parent().unwrap_or(Path::new(""));
    let (display_name, description, icon, icon_gray) = match meta.get(api_name) {
        Some(m) => (
            m.display_name.clone(),
            m.description.clone(),
            resolve_icon(icon_base, &m.icon),
            resolve_icon(icon_base, &m.icon_gray),
        ),
        None => (
            api_name.replace('_', " ").trim().to_string(),
            String::new(),
            None,
            None,
        ),
    };
    AchievementUnlockedPayload {
        api_name: api_name.to_string(),
        display_name,
        description,
        icon,
        icon_gray,
        earned_time,
    }
}

/// Build payload using display_name as key (Anadius XML).
fn payload_display(
    display_name: &str,
    meta: &HashMap<String, AchievementMeta>,
    display_map: &HashMap<String, String>,
    meta_path: &Path,
    earned_time: u64,
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

    let (resolved_display, description, icon, icon_gray) = match found {
        Some(m) => (
            m.display_name.clone(),
            m.description.clone(),
            resolve_icon(icon_base, &m.icon),
            resolve_icon(icon_base, &m.icon_gray),
        ),
        None => (display_name.to_string(), String::new(), None, None),
    };

    AchievementUnlockedPayload {
        api_name,
        display_name: resolved_display,
        description,
        icon,
        icon_gray,
        earned_time,
    }
}

fn fire_overlay(app: &AppHandle, payload: &AchievementUnlockedPayload) {
    if let Some(overlay) = app.get_webview_window("achievement-overlay") {
        overlay.show().ok();
        overlay.set_always_on_top(true).ok();
    }
    let _ = app.emit("achievement-unlocked", payload);
}

// ── Watcher entry point ───────────────────────────────────────────────────────

pub fn start_watching_for_game(
    app: AppHandle,
    game_id: String,
    app_id: String,
    game_path: PathBuf,
    scan_roots: Vec<PathBuf>,
    manual_path: Option<String>,
    crack_type: Option<CrackType>,
) -> Option<RecommendedWatcher> {
    log::info!(
        "[Monitor] start game={} app_id={} crack={:?}",
        game_id, app_id, crack_type
    );

    // Anadius gets its own specialised watcher
    if matches!(crack_type, Some(CrackType::Anadius)) {
        return start_anadius(app, app_id, game_path);
    }

    // Manual path override
    if let Some(ref manual) = manual_path {
        if !manual.is_empty() {
            return start_manual(app, app_id, game_path, manual.clone());
        }
    }

    // CODEX / Goldberg / Unknown
    start_auto(app, app_id, game_path, scan_roots, manual_path, crack_type)
}

// ── Manual path watcher ───────────────────────────────────────────────────────

fn start_manual(
    app: AppHandle,
    app_id: String,
    game_path: PathBuf,
    manual: String,
) -> Option<RecommendedWatcher> {
    let manual_dir = PathBuf::from(&manual);
    let (meta, meta_path) = load_meta(
        &game_path,
        Some(app_id.as_str()),
        Some(manual.as_str()),
        None,
    );
    let meta = Arc::new(meta);
    let meta_path = Arc::new(meta_path);

    let baseline: HashSet<String> = read_dir_earned(&manual_dir).into_keys().collect();
    log::info!(
        "[Watcher] Manual: {} baseline={} meta={}",
        manual_dir.display(),
        baseline.len(),
        meta.len()
    );

    let seen = Arc::new(Mutex::new(baseline));
    let app_c = app.clone();
    let dir_c = manual_dir.clone();

    let mut watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            let Ok(event) = result else { return };
            if !is_ach_file_event(&event) {
                return;
            }
            let now = read_dir_earned(&dir_c);
            let Ok(mut seen_lock) = seen.lock() else { return };

            let new: Vec<(String, u64)> = now
                .iter()
                .filter(|(k, _)| !seen_lock.contains(*k))
                .map(|(k, t)| (k.clone(), *t))
                .take(8)
                .collect();

            for (name, t) in new {
                let p = payload_api(&name, &meta, &meta_path, t);
                fire_overlay(&app_c, &p);
                log::info!("[Watcher] Manual unlock: {}", name);
                seen_lock.insert(name);
            }
            seen_lock.retain(|k| now.contains_key(k));
            seen_lock.extend(now.into_keys());
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )
    .ok()?;

    watch_dir_or_parent(&mut watcher, &manual_dir);
    Some(watcher)
}

// ── CODEX / Goldberg auto watcher ─────────────────────────────────────────────

fn start_auto(
    app: AppHandle,
    app_id: String,
    game_path: PathBuf,
    scan_roots: Vec<PathBuf>,
    manual_path: Option<String>,
    crack_type: Option<CrackType>,
) -> Option<RecommendedWatcher> {
    let existing = find_active_candidate(
        &app_id,
        &game_path,
        &scan_roots,
        manual_path.as_deref(),
        crack_type.as_ref(),
    );
    let baseline: HashSet<String> = existing
        .as_ref()
        .map(|c| read_candidate_earned(c).into_keys().collect())
        .unwrap_or_default();

    let (meta, meta_path) = load_meta(
        &game_path,
        Some(app_id.as_str()),
        manual_path.as_deref(),
        crack_type.as_ref(),
    );

    if let Some(ref c) = existing {
        let _ = app.emit(
            "achievement-save-discovered",
            SaveDiscoveredPayload {
                app_id: app_id.clone(),
                emulator: emulator_label(&c.path),
                path: c.path.to_string_lossy().to_string(),
                format: format!("{:?}", c.format),
            },
        );
    }

    let state = Arc::new(Mutex::new(WatchState {
        seen: baseline,
        meta,
        meta_path,
        app_id: app_id.clone(),
        active: existing,
    }));

    let mut watch_dirs: HashSet<PathBuf> = HashSet::new();
    collect_dirs(&app_id, &game_path, &scan_roots, crack_type.as_ref(), &mut watch_dirs);

    let fmt_map: HashMap<String, AchievementFormat> = [
        ("achievements.json".to_string(), AchievementFormat::GoldbergJson),
        ("achievements.ini".to_string(), AchievementFormat::CodExIni),
        ("achievement.ini".to_string(), AchievementFormat::CodExIni),
    ]
    .into_iter()
    .collect();

    let state_c = state.clone();
    let app_c = app.clone();

    let mut watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            let Ok(event) = result else { return };
            // Text editors use rename/create/remove for atomic writes.
            // Rather than strictly filtering EventKind, accept anything that touches our target files.

            let changed = event.paths.iter().find_map(|p| {
                let name = p.file_name()?.to_string_lossy().to_lowercase();
                let fmt = fmt_map.get(&name)?.clone();
                Some((p.clone(), fmt))
            });
            let Some((changed_path, format)) = changed else { return };

            let Ok(mut st) = state_c.lock() else { return };

            // Auto-discover save file if not yet known
            if st.active.is_none() {
                let accept = match format {
                    AchievementFormat::CodExIni => true,
                    AchievementFormat::GoldbergJson => {
                        looks_like_goldberg_save(&changed_path)
                    }
                    _ => false,
                };
                if accept {
                    st.active = Some(AchievementCandidate {
                        path: changed_path.clone(),
                        format: format.clone(),
                    });
                    let _ = app_c.emit(
                        "achievement-save-discovered",
                        SaveDiscoveredPayload {
                            app_id: st.app_id.clone(),
                            emulator: emulator_label(&changed_path),
                            path: changed_path.to_string_lossy().to_string(),
                            format: format!("{:?}", format),
                        },
                    );
                }
            }

            let Some(ref active) = st.active else { return };
            if norm(&active.path) != norm(&changed_path) {
                return;
            }

            let cand = AchievementCandidate {
                path: changed_path.clone(),
                format: active.format.clone(),
            };
            let now = read_candidate_earned(&cand);

            let new: Vec<(String, u64)> = now
                .iter()
                .filter(|(k, _)| !st.seen.contains(*k))
                .map(|(k, t)| (k.clone(), *t))
                .take(8)
                .collect();

            let mp = st.meta_path.clone();
            for (name, t) in new {
                let p = payload_api(&name, &st.meta, &mp, t);
                fire_overlay(&app_c, &p);
                log::info!("[Watcher] Unlock: {}", name);
                st.seen.insert(name);
            }
            st.seen = now.into_keys().collect();
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )
    .ok()?;

    for dir in watch_dirs {
        watch_dir_or_parent(&mut watcher, &dir);
    }
    Some(watcher)
}

fn collect_dirs(
    app_id: &str,
    game_path: &Path,
    scan_roots: &[PathBuf],
    crack_type: Option<&CrackType>,
    dirs: &mut HashSet<PathBuf>,
) {
    let codex = matches!(crack_type, Some(CrackType::Codex) | None)
        || matches!(crack_type, Some(CrackType::Unknown));
    let goldberg = matches!(crack_type, Some(CrackType::Goldberg) | None)
        || matches!(crack_type, Some(CrackType::Unknown));

    if codex {
        if let Some(sys_drive) = std::env::var_os("SystemDrive") {
            let public_root = PathBuf::from(&sys_drive).join("Users\\Public\\Documents\\Steam");
            let public_codex = public_root.join("CODEX");
            for public in [public_root, public_codex] {
                for sub in PUBLIC_EMU_DIRS {
                    dirs.insert(public.join(sub).join(app_id));
                    dirs.insert(public.join(sub).join(app_id).join("steam_settings"));
                }
                // Direct app_id check
                dirs.insert(public.join(app_id));
                dirs.insert(public.join(app_id).join("steam_settings"));
            }
        }
    }

    if goldberg {
        for var in &["APPDATA", "LOCALAPPDATA"] {
            if let Some(appdata) = std::env::var_os(var) {
                for sub in GOLDBERG_APPDATA_DIRS {
                    dirs.insert(PathBuf::from(&appdata).join(sub).join(app_id));
                }
            }
        }
        dirs.insert(game_path.join("steam_settings"));
        dirs.insert(game_path.join("steam_settings").join("user_stats"));
    }

    for root in scan_roots {
        dirs.insert(root.join(app_id));
        if let Ok(entries) = std::fs::read_dir(root) {
            for e in entries.flatten() {
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    dirs.insert(e.path().join(app_id));
                }
            }
        }
    }

    // If completely unknown, also watch game dir itself
    if crack_type.map_or(true, |ct| matches!(ct, CrackType::Unknown)) {
        dirs.insert(game_path.to_path_buf());
    }
}

// ── Anadius watcher ───────────────────────────────────────────────────────────

fn start_anadius(
    app: AppHandle,
    content_id: String,
    game_path: PathBuf,
) -> Option<RecommendedWatcher> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let emu_base = PathBuf::from(local).join("anadius").join("LSX emu");
    let save_dir = emu_base.join(&content_id);

    let (meta, meta_path) = load_meta(
        &game_path,
        Some(content_id.as_str()),
        None,
        Some(&CrackType::Anadius),
    );
    let display_map = Arc::new(build_display_map(&meta));
    let meta = Arc::new(meta);
    let meta_path = Arc::new(meta_path);

    let xml = find_anadius_xml(&save_dir, &content_id);
    let baseline: HashSet<String> = xml
        .as_ref()
        .map(|p| read_earned_anadius(p).into_keys().collect())
        .unwrap_or_default();

    log::info!(
        "[Anadius] Watching {} (content_id={}, baseline={}, xml={:?})",
        save_dir.display(),
        content_id,
        baseline.len(),
        xml
    );

    if let Some(ref p) = xml {
        let _ = app.emit(
            "achievement-save-discovered",
            SaveDiscoveredPayload {
                app_id: content_id.clone(),
                emulator: "Anadius (LSX)".to_string(),
                path: p.to_string_lossy().to_string(),
                format: "AnadiusXml".to_string(),
            },
        );
    }

    let seen = Arc::new(Mutex::new(baseline));
    let app_c = app.clone();
    let save_dir_c = save_dir.clone();
    let cid = Arc::new(content_id.clone());

    let mut watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            let Ok(event) = result else { return };
            if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                return;
            }

            let xml_changed = event.paths.iter().any(|p| {
                let name = p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                name.starts_with("achievement-") && name.ends_with(".xml")
            });
            if !xml_changed {
                return;
            }

            let Some(xml_path) = find_anadius_xml(&save_dir_c, &cid) else {
                return;
            };
            let now = read_earned_anadius(&xml_path);
            let Ok(mut seen_lock) = seen.lock() else { return };

            let new: Vec<(String, u64)> = now
                .iter()
                .filter(|(dn, _)| !seen_lock.contains(*dn))
                .map(|(k, t)| (k.clone(), *t))
                .take(8)
                .collect();

            for (display_name, t) in new {
                let p = payload_display(
                    &display_name,
                    &meta,
                    &display_map,
                    &meta_path,
                    t,
                );
                fire_overlay(&app_c, &p);
                log::info!(
                    "[Anadius] Unlock: '{}' → api='{}'",
                    display_name, p.api_name
                );
                seen_lock.insert(display_name);
            }

            seen_lock.retain(|k| now.contains_key(k));
            seen_lock.extend(now.into_keys());
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )
    .ok()?;

    watch_dir_or_parent(&mut watcher, &save_dir);
    // Also watch the LSX emu base for XML files
    watch_dir_or_parent(&mut watcher, &emu_base);
    Some(watcher)
}

// ── Path helpers ──────────────────────────────────────────────────────────────

fn find_active_candidate(
    app_id: &str,
    game_dir: &Path,
    scan_roots: &[PathBuf],
    manual_path: Option<&str>,
    crack_type: Option<&CrackType>,
) -> Option<AchievementCandidate> {
    if let Some(manual) = manual_path.filter(|p| !p.is_empty()) {
        if let Some(c) = probe_dir(Path::new(manual)) {
            return Some(c);
        }
    }

    if !matches!(crack_type, Some(CrackType::Goldberg)) {
        if let Some(sys_drive) = std::env::var_os("SystemDrive") {
            let public =
                PathBuf::from(&sys_drive).join("Users\\Public\\Documents\\Steam");
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

    probe_dir(game_dir)
}

fn probe_dir(dir: &Path) -> Option<AchievementCandidate> {
    if !dir.exists() {
        return None;
    }
    // If the path is a direct file, probe it
    if dir.is_file() {
        match dir.extension().and_then(|s| s.to_str()) {
            Some("ini") => return Some(AchievementCandidate { path: dir.to_path_buf(), format: AchievementFormat::CodExIni }),
            Some("json") => return Some(AchievementCandidate { path: dir.to_path_buf(), format: AchievementFormat::GoldbergJson }),
            Some("xml") => return Some(AchievementCandidate { path: dir.to_path_buf(), format: AchievementFormat::AnadiusXml }),
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

fn norm(p: &Path) -> String {
    let s = p.to_string_lossy();
    let s = s.strip_prefix(r"\\?\").unwrap_or(&s);
    s.to_lowercase().replace('/', "\\")
}

fn emulator_label(path: &Path) -> String {
    let s = path.to_string_lossy().to_lowercase();
    if s.contains("lsx emu") { "Anadius (LSX)" }
    else if s.contains("gse saves") || s.contains("goldberg steamemu saves") { "Goldberg (GSE)" }
    else if s.contains("goldberg") { "Goldberg" }
    else if s.contains("codex") { "CODEX" }
    else if s.contains("rld!") { "Skidrow" }
    else if s.contains("ali213") { "ALI213" }
    else if s.contains("user_stats") { "Goldberg (Portable)" }
    else { "Unknown" }
    .to_string()
}

fn watch_dir_or_parent(watcher: &mut RecommendedWatcher, dir: &Path) {
    if dir.exists() {
        watcher.watch(dir, RecursiveMode::NonRecursive).ok();
    } else if let Some(parent) = dir.parent() {
        if parent.exists() {
            watcher.watch(parent, RecursiveMode::NonRecursive).ok();
        }
    }
}

fn is_ach_file_event(event: &Event) -> bool {
    // We accept any event type (creation, modification, deletion, rename) 
    // because text editors often do atomic safe-writes via renames.
    event.paths.iter().any(|p| {
        matches!(
            p.file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .as_deref(),
            Some("achievements.ini")
                | Some("achievements.json")
                | Some("achievement.ini")
        ) || p.extension().and_then(|s| s.to_str()) == Some("xml")
    })
}

// ── Tauri commands ────────────────────────────────────────────────────────────

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

    // Deserialise crack_type stored as a lowercase string in the DB
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
        app_id,
        PathBuf::from(&game_dir),
        crate::settings::default_scan_roots(),
        game.manual_achievement_path,
        crack_type,
    )
    .ok_or_else(|| "Could not start achievement watcher".to_string())?;

    let active: tauri::State<ActiveWatchers> = app.state();
    active.0.lock().unwrap().insert(watcher_key, watcher);
    Ok(())
}

#[tauri::command]
pub fn stop_game_achievement_watch(app: AppHandle, app_id: String) -> Result<(), String> {
    let state: tauri::State<ActiveWatchers> = app.state();
    state.0.lock().unwrap().remove(&app_id);
    Ok(())
}

#[tauri::command]
pub fn debug_fire_achievement(
    app: AppHandle,
    format_type: String,
) -> Result<(), String> {
    let payload = AchievementUnlockedPayload {
        api_name: format!("TEST_{}", format_type.to_uppercase()),
        display_name: format!("Test — {}", format_type),
        description: "Mock achievement for overlay testing.".to_string(),
        icon: None,
        icon_gray: None,
        earned_time: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };
    fire_overlay(&app, &payload);
    if let Some(ov) = app.get_webview_window("achievement-overlay") {
        let _ = ov.emit("achievement-unlocked", &payload);
    }
    Ok(())
}

#[tauri::command]
pub fn debug_fire_custom(
    app: AppHandle,
    payload: AchievementUnlockedPayload,
) -> Result<(), String> {
    fire_overlay(&app, &payload);
    if let Some(ov) = app.get_webview_window("achievement-overlay") {
        let _ = ov.emit("achievement-unlocked", &payload);
    }
    Ok(())
}

#[tauri::command]
pub async fn fetch_and_generate_achievements(
    state: tauri::State<'_, crate::state::AppState>,
    game_id: String,
    api_key: String,
) -> Result<bool, String> {
    let game = crate::db::queries::get_game_by_id(&state.read_pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    let install_dir = game
        .install_dir
        .as_deref()
        .map(PathBuf::from)
        .ok_or("Game has no install directory")?;

    let crack_type: Option<CrackType> = game
        .crack_type
        .as_deref()
        .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

    let app_id = game
        .app_id
        .clone()
        .or_else(|| game.steam_app_id.map(|id| id.to_string()))
        .or_else(|| crate::achievements::resolve_app_id(&install_dir))
        .ok_or("Could not determine app_id")?;

    let save_dir = crate::achievements::find_save_dir(
        &app_id,
        &install_dir,
        crack_type.as_ref(),
    )
    .ok_or_else(|| {
        format!(
            "No existing save directory for app_id={}. Launch the game first.",
            app_id
        )
    })?;

    generate_achievements_json(&api_key, &app_id, &save_dir).await
}