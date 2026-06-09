use crate::db::queries::{self, Game, NewGame};
use crate::state::{AppState, DbWrite, GameDbWrite};
use tauri::State;

#[tauri::command]
pub async fn get_all_games(state: State<'_, AppState>) -> Result<Vec<Game>, String> {
    queries::get_all_games(&state.read_pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_game(state: State<'_, AppState>, game: NewGame) -> Result<(), String> {
    use crate::stats::load_game_stats;
    let game_id = game.id.clone();

    // Check for existing local stats using the strict game_id
    let saved_stats = load_game_stats(&game.id);

    if let Some(saved) = &saved_stats {
        log::info!(
            "[Library] Restoring {} secs playtime for re-added game {}",
            saved.total_playtime_secs,
            game.id
        );
    }

    state
        .db_tx
        .send(DbWrite::Game(GameDbWrite::InsertGame(game.clone())))
        .map_err(|e| e.to_string())?;


    // Restore the found playtime into the database
    if let Some(saved) = saved_stats {
        state
            .db_tx
            .send(DbWrite::Game(GameDbWrite::UpdatePlaytime {
                game_id: game_id.clone(),
                delta_seconds: saved.total_playtime_secs,
            }))
            .ok();
        if let Some(last) = saved.last_played {
            state
                .db_tx
                .send(DbWrite::Game(GameDbWrite::SetLastPlayed {
                    game_id: game_id.clone(),
                    timestamp: last.to_rfc3339(),
                }))
                .ok();
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn overwrite_playtime(
    state: State<'_, AppState>,
    game_id: String,
    playtime_seconds: u64,
    last_played: Option<String>,
) -> Result<(), String> {
    let pool = state.read_pool.clone();
    
    // 1. Update SQLite
    state.db_tx.send(DbWrite::Game(GameDbWrite::OverwritePlaytime {
        game_id: game_id.clone(),
        playtime_seconds,
        last_played: last_played.clone(),
    })).map_err(|e| e.to_string())?;

    // 2. Update JSON Backup
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(Some(game)) = crate::db::queries::get_game_by_id(&pool, &game_id) {
            use crate::stats::{load_game_stats, save_game_stats, GameStats};
            let mut stats = load_game_stats(&game_id).unwrap_or_else(|| GameStats {
                game_id: game_id.clone(),
                app_id: game.steam_app_id.map(|id| id.to_string()),
                game_title: game.title.clone(),
                ..Default::default()
            });
            
            stats.total_playtime_secs = playtime_seconds;
            if let Some(lp) = last_played {
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&lp) {
                    stats.last_played = Some(dt.with_timezone(&chrono::Utc));
                }
            }
            let _ = save_game_stats(&stats);
        }
    });

    Ok(())
}


#[tauri::command]
pub async fn delete_game(state: State<'_, AppState>, id: String) -> Result<(), String> {
    crate::os_integration::cleanup_game_icon_cache(&id);
    state
        .db_tx
        .send(DbWrite::Game(GameDbWrite::DeleteGame { game_id: id }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_game(
    state: State<'_, AppState>,
    game: crate::db::queries::Game,
) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Game(GameDbWrite::UpdateGame { game }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_manual_achievement_path(
    state: State<'_, AppState>,
    game_id: String,
    path: Option<String>,
) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Game(GameDbWrite::UpdateManualAchievementPath {
            game_id: game_id.clone(),
            path: path.clone(),
        }))
        .map_err(|e| e.to_string())?;

    if path.is_none() {
        let pool = state.read_pool.clone();
        let db_tx = state.db_tx.clone();
        let game_id_clone = game_id.clone();

        tauri::async_runtime::spawn(async move {
            if let Ok(Some(game)) = crate::db::queries::get_game_by_id(&pool, &game_id_clone) {
                if let Some(install_dir) = game.install_dir {
                    let db_app_id = game.steam_app_id.map(|id| id.to_string());
                    let crack_type: Option<crate::achievements::CrackType> = game
                        .crack_type
                        .as_deref()
                        .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

                    let opts = crate::achievements::SyncOptions {
                        crack_type,
                        known_app_id: db_app_id.as_deref(),
                        manual_metadata_path: None,
                        manual_save_path: game.manual_save_path.as_deref(),
                        scan_roots: &crate::settings::default_scan_roots(),
                        steam_api_key: None,
                        db_tx: Some(&db_tx),
                    };

                    crate::achievements::sync_achievements(
                        &game_id_clone,
                        &install_dir,
                        db_app_id.as_deref(),
                        &opts,
                    );
                }
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn set_manual_save_path(
    state: State<'_, AppState>,
    game_id: String,
    path: Option<String>,
) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Game(GameDbWrite::UpdateManualSavePath {
            game_id: game_id.clone(),
            path: path.clone(),
        }))
        .map_err(|e| e.to_string())?;

    if path.is_none() {
        let pool = state.read_pool.clone();
        let db_tx = state.db_tx.clone();
        let game_id_clone = game_id.clone();

        tauri::async_runtime::spawn(async move {
            if let Ok(Some(game)) = crate::db::queries::get_game_by_id(&pool, &game_id_clone) {
                if let Some(install_dir) = game.install_dir {
                    let db_app_id = game.steam_app_id.map(|id| id.to_string());
                    let crack_type: Option<crate::achievements::CrackType> = game
                        .crack_type
                        .as_deref()
                        .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

                    let opts = crate::achievements::SyncOptions {
                        crack_type,
                        known_app_id: db_app_id.as_deref(),
                        manual_metadata_path: game.manual_achievement_path.as_deref(),
                        manual_save_path: None,
                        scan_roots: &crate::settings::default_scan_roots(),
                        steam_api_key: None,
                        db_tx: Some(&db_tx),
                    };

                    crate::achievements::sync_achievements(
                        &game_id_clone,
                        &install_dir,
                        db_app_id.as_deref(),
                        &opts,
                    );
                }
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn update_game_assets(
    state: State<'_, AppState>,
    game_id: String,
    cover_path: Option<String>,
    background_path: Option<String>,
    logo_path: Option<String>,
) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Game(GameDbWrite::UpdateAssets {
            game_id,
            cover_path,
            background_path,
            logo_path,
        }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_favorite(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Game(GameDbWrite::ToggleFavorite { game_id: id }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_game_orders(
    state: State<'_, AppState>,
    orders: Vec<(String, i32)>,
) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Game(GameDbWrite::UpdateGameOrders { orders }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_steam_achievements(
    id: String,
    steam_app_id: String,
    install_dir: String,
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<(), String> {
    use crate::steamworks_sync::SteamworksClient;
    use crate::state::{DbWrite, ProfileDbWrite, AchSync};
    use crate::achievements::cache;
    use walkdir::WalkDir;

    let mut dll_path = None;
    for entry in WalkDir::new(&install_dir).max_depth(10).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name == "steam_api64.dll" || name == "steam_api.dll" {
                dll_path = Some(entry.into_path());
                break;
            }
        }
    }

    let path = dll_path.ok_or_else(|| format!("Could not find steam_api64.dll in {}", install_dir))?;

    // Load cached achievements as the baseline
    let mut cached = cache::load_cache(&id).ok_or_else(|| "No achievements metadata found".to_string())?;

    // Connect to Steam
    let client = SteamworksClient::init(&path, &steam_app_id)?;
    client.fetch_stats().await?;

    let mut earned = Vec::new();
    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut updated_cache = false;

    for ach in cached.iter_mut() {
        if client.is_achievement_unlocked(&ach.api_name) {
            if !ach.earned {
                ach.earned = true;
                ach.earned_time = Some(current_time);
                updated_cache = true;
            }
            earned.push(AchSync {
                api_name: ach.api_name.clone(),
                title: ach.display_name.clone(),
                description: ach.description.clone(),
                earned_time: ach.earned_time.unwrap_or(current_time),
                xp: ach.xp,
            });
        }
    }

    if !earned.is_empty() {
        let _ = state.db_tx.send(DbWrite::Profile(ProfileDbWrite::SyncEarnedAchievements {
            game_id: id.clone(),
            earned,
        }));
    }

    if updated_cache {
        cache::save_cache(&id, &cached);
    }

    Ok(())
}