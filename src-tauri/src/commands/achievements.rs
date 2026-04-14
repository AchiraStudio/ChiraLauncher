use crate::achievements::{
    discover_achievements, has_local_achievements, looks_like_metadata, sync_achievements,
    Achievement, CrackType, SyncOptions,
};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[derive(serde::Serialize)]
pub struct SyncedAchievements {
    pub achievements: Vec<Achievement>,
    pub from_cache: bool,
}

#[derive(serde::Serialize)]
pub struct AchievementDiagnostics {
    pub emulator: String,
    pub app_id: Option<String>,
    pub metadata_path: Option<String>,
    pub metadata_valid: bool,
    pub metadata_count: usize,
    pub earned_state_path: Option<String>,
    pub earned_state_format: Option<String>,
    pub earned_count: usize,
    pub probe_log: Vec<String>,
}

#[tauri::command]
pub async fn get_achievements(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<Vec<Achievement>, String> {
    let pool = &state.read_pool;
    let game = crate::db::queries::get_game_by_id(pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    if let Some(install_dir) = game.install_dir {
        let settings = crate::settings::get_settings(pool).unwrap_or_default();
        let db_app_id = game.steam_app_id.map(|id| id.to_string());

        let crack_type: Option<CrackType> = game
            .crack_type
            .as_deref()
            .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

        let default_roots = crate::settings::default_scan_roots();
        let opts = SyncOptions {
            crack_type,
            known_app_id: db_app_id.as_deref(),
            manual_metadata_path: game.manual_achievement_path.as_deref(),
            manual_save_path: game.manual_save_path.as_deref(),
            scan_roots: &default_roots,
            steam_api_key: Some(&settings.steam_api_key),
            db_tx: Some(&state.db_tx),
        };

        let (achievements, _) =
            sync_achievements(&game_id, &install_dir, db_app_id.as_deref(), &opts);
        Ok(achievements)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn sync_game_achievements(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<SyncedAchievements, String> {
    let pool = &state.read_pool;
    let game = crate::db::queries::get_game_by_id(pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    if let Some(install_dir) = game.install_dir {
        let settings = crate::settings::get_settings(pool).unwrap_or_default();
        let db_app_id = game.steam_app_id.map(|id| id.to_string());

        let crack_type: Option<CrackType> = game
            .crack_type
            .as_deref()
            .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

        let default_roots = crate::settings::default_scan_roots();
        let opts = SyncOptions {
            crack_type,
            known_app_id: db_app_id.as_deref(),
            manual_metadata_path: game.manual_achievement_path.as_deref(),
            manual_save_path: game.manual_save_path.as_deref(),
            scan_roots: &default_roots,
            steam_api_key: Some(&settings.steam_api_key),
            db_tx: Some(&state.db_tx),
        };

        let (achievements, from_cache) =
            sync_achievements(&game_id, &install_dir, db_app_id.as_deref(), &opts);
        Ok(SyncedAchievements {
            achievements,
            from_cache,
        })
    } else {
        Ok(SyncedAchievements {
            achievements: vec![],
            from_cache: false,
        })
    }
}

#[tauri::command]
pub async fn check_local_achievements(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<bool, String> {
    let pool = &state.read_pool;
    let game = crate::db::queries::get_game_by_id(pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    let crack_type: Option<CrackType> = game
        .crack_type
        .as_deref()
        .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

    Ok(game
        .install_dir
        .map(|dir| {
            has_local_achievements(
                &dir,
                game.steam_app_id.map(|id| id.to_string()).as_deref(),
                game.manual_achievement_path.as_deref(),
                game.manual_save_path.as_deref(),
                &crate::settings::default_scan_roots(),
                crack_type.as_ref(),
            )
        })
        .unwrap_or(false))
}

#[tauri::command]
pub async fn get_achievement_diagnostics(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<AchievementDiagnostics, String> {
    let pool = &state.read_pool;
    let game = crate::db::queries::get_game_by_id(pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    let mut log: Vec<String> = Vec::new();

    let install_dir = match &game.install_dir {
        Some(d) => PathBuf::from(d),
        None => {
            log.push("No install directory stored for this game.".to_string());
            return Ok(AchievementDiagnostics {
                emulator: "Unknown".to_string(),
                app_id: None,
                metadata_path: None,
                metadata_valid: false,
                metadata_count: 0,
                earned_state_path: None,
                earned_state_format: None,
                earned_count: 0,
                probe_log: log,
            });
        }
    };

    let db_app_id = game.steam_app_id.map(|id| id.to_string());

    let crack_type_db: Option<CrackType> = game
        .crack_type
        .as_deref()
        .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

    let opts = SyncOptions {
        crack_type: crack_type_db,
        known_app_id: db_app_id.as_deref(),
        manual_metadata_path: game.manual_achievement_path.as_deref(),
        manual_save_path: game.manual_save_path.as_deref(),
        scan_roots: &crate::settings::default_scan_roots(),
        ..Default::default()
    };

    let discovery = discover_achievements(&install_dir, db_app_id.as_deref(), &opts);
    let crack_label = format!("{:?}", discovery.emulator.crack_type);
    let app_id = Some(discovery.emulator.app_id.clone());

    let meta_valid = discovery
        .metadata_path
        .as_ref()
        .map(|p| looks_like_metadata(p))
        .unwrap_or(false);

    let meta_count = discovery
        .metadata_path
        .as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s: String| {
            if let Ok(v) = serde_json::from_str::<Vec<crate::achievements::AchievementDef>>(&s) {
                Some(v.len())
            } else if let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) {
                val.get("achievements")
                    .and_then(|a| a.as_array())
                    .map(|a| a.len())
            } else {
                None
            }
        })
        .unwrap_or(0);

    let mut log = discovery.probe_log.clone();
    if let Some(ref p) = discovery.metadata_path {
        log.push(format!(
            "Metadata: {} ({} achievements)",
            p.display(),
            meta_count
        ));
    } else {
        log.push("Metadata: not found. You may need to fetch it via the Steam API.".to_string());
    }

    let (earned_path_str, earned_format, earned_count) = if let Some(ref p) = discovery.save_path {
        let earned_map = crate::achievements::load_earned_map(p);
        let count = earned_map.len();
        log.push(format!(
            "Save file: Found at {} ({} achievements unlocked)",
            p.display(),
            count
        ));
        (
            Some(p.to_string_lossy().to_string()),
            Some(
                p.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("unknown")
                    .to_string(),
            ),
            count,
        )
    } else {
        log.push("Save file: NOT FOUND. Checked automatic paths and scan roots.".to_string());
        (None, None, 0)
    };

    Ok(AchievementDiagnostics {
        emulator: crack_label,
        app_id,
        metadata_path: discovery
            .metadata_path
            .map(|p| p.to_string_lossy().to_string()),
        metadata_valid: meta_valid,
        metadata_count: meta_count,
        earned_state_path: earned_path_str,
        earned_state_format: earned_format,
        earned_count,
        probe_log: log,
    })
}

#[tauri::command]
pub async fn patch_achievement_percentages(
    state: State<'_, AppState>,
    game_id: String,
    percentages: std::collections::HashMap<String, f32>,
) -> Result<bool, String> {
    let pool = &state.read_pool;
    let game = crate::db::queries::get_game_by_id(pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    let install_dir = match &game.install_dir {
        Some(d) => PathBuf::from(d),
        None => return Ok(false),
    };
    let db_app_id = game.steam_app_id.map(|id| id.to_string());

    let crack_type_db: Option<CrackType> = game
        .crack_type
        .as_deref()
        .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

    let opts = SyncOptions {
        crack_type: crack_type_db,
        known_app_id: db_app_id.as_deref(),
        manual_metadata_path: game.manual_achievement_path.as_deref(),
        manual_save_path: game.manual_save_path.as_deref(),
        scan_roots: &crate::settings::default_scan_roots(),
        ..Default::default()
    };

    let discovery = discover_achievements(&install_dir, db_app_id.as_deref(), &opts);

    if let Some(path) = discovery.metadata_path {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(arr) = json.as_array_mut() {
                    let mut modified = false;
                    for item in arr.iter_mut() {
                        if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                            if let Some(pct) = percentages.get(name) {
                                item["globalPercent"] = serde_json::json!(pct);
                                modified = true;
                            }
                        }
                    }
                    if modified {
                        if let Ok(new_content) = serde_json::to_string_pretty(&json) {
                            let _ = std::fs::write(&path, new_content);
                            crate::achievements::cache::clear_cache(&game_id);
                            return Ok(true);
                        }
                    }
                }
            }
        }
    }
    Ok(false)
}
