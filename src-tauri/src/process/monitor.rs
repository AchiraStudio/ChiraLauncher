use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;

use crate::db::queries::get_game_exe_map;
use crate::process::identity::{get_process_start_time, is_process_alive};
use crate::state::{DbWrite, DbWriteSender, LaunchSource, ProcessIdentity};

pub fn start(
    app: tauri::AppHandle,
    running: Arc<Mutex<HashMap<String, ProcessIdentity>>>,
    db_tx: DbWriteSender,
    read_pool: Pool<SqliteConnectionManager>,
) {
    tauri::async_runtime::spawn(async move {
        let mut sys = sysinfo::System::new();

        let mut process_interval = tokio::time::interval(Duration::from_secs(2));
        let mut last_db_refresh = Instant::now() - Duration::from_secs(60);
        let mut last_overlay_refresh = Instant::now();

        let mut exe_map: HashMap<String, String> = HashMap::new();

        use tauri::Manager;

        loop {
            process_interval.tick().await;

            sys.refresh_processes(sysinfo::ProcessesToUpdate::All);

            if last_db_refresh.elapsed() > Duration::from_secs(20) {
                if let Ok(map) = get_game_exe_map(&read_pool) {
                    exe_map = map;
                }
                last_db_refresh = Instant::now();
            }

            if last_overlay_refresh.elapsed() > Duration::from_secs(4) {
                let has_running_games = {
                    let tracked = running.lock().unwrap();
                    !tracked.is_empty()
                };

                if has_running_games {
                    if let Some(overlay) = app.get_webview_window("achievement-overlay") {
                        if overlay.is_visible().unwrap_or(false) {
                            let _ = overlay.set_always_on_top(true);
                        }
                    }
                }
                last_overlay_refresh = Instant::now();
            }

            // === PHASE A: Tracking Already-Running Games ===
            let mut to_remove_keys = Vec::new();
            let mut stopped_identities = Vec::new();

            {
                let mut tracked = running.lock().unwrap();
                let mut keys_to_drop = Vec::new();

                for (game_id, identity) in tracked.iter_mut() {
                    if !is_process_alive(
                        identity.pid,
                        &identity.exe_path,
                        &identity.install_dir,
                        &sys,
                    ) {
                        keys_to_drop.push(game_id.clone());

                        if let Some(flag) = &identity.elevated_stop_flag {
                            flag.store(true, std::sync::atomic::Ordering::Relaxed);
                        }
                    }
                }

                for k in keys_to_drop {
                    if let Some(id) = tracked.remove(&k) {
                        to_remove_keys.push(k);
                        stopped_identities.push(id);
                    }
                }
            }

            for game_id in &to_remove_keys {
                if let Ok(Some(game)) = crate::db::queries::get_game_by_id(&read_pool, game_id) {
                    let has_manual_path = game
                        .manual_achievement_path
                        .as_deref()
                        .map(|p| !p.is_empty())
                        .unwrap_or(false);

                    if has_manual_path {
                        log::info!(
                            "[Monitor] Preserving persistent achievement prober for game {}",
                            game_id
                        );
                        continue;
                    }

                    if let Some(state) =
                        app.try_state::<crate::achievement_watcher::ActiveWatchers>()
                    {
                        let mut watchers = state.0.lock().unwrap();

                        if let Some(flag) = watchers.remove(game_id) {
                            flag.store(true, std::sync::atomic::Ordering::Relaxed);
                        }

                        if let Some(app_id) = game.steam_app_id.map(|id| id.to_string()) {
                            if let Some(flag) = watchers.remove(&app_id) {
                                flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            }
                        }
                    }
                    log::info!(
                        "[Monitor] Achievement prober task stopped for game {}",
                        game_id
                    );
                }
            }

            if !to_remove_keys.is_empty() {
                let still_running = { running.lock().unwrap().len() };
                if still_running == 0 {
                    if let Some(overlay) = app.get_webview_window("achievement-overlay") {
                        overlay.hide().ok();
                    }
                }
            }

            for identity in stopped_identities {
                let now = chrono::Utc::now().timestamp() as u64;
                let delta = if identity.start_time > 0 && now >= identity.start_time {
                    now - identity.start_time
                } else {
                    0
                };

                let now_str = chrono::Utc::now().to_rfc3339();

                db_tx
                    .send(DbWrite::Game(crate::state::GameDbWrite::UpdatePlaytime {
                        game_id: identity.game_id.clone(),
                        delta_seconds: delta,
                    }))
                    .ok();

                db_tx
                    .send(DbWrite::Game(crate::state::GameDbWrite::SetLastPlayed {
                        game_id: identity.game_id.clone(),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    }))
                    .ok();

                {
                    use crate::stats::{load_game_stats, save_game_stats, GameStats};
                    use chrono::Utc;

                    let mut stats =
                        load_game_stats(&identity.game_id).unwrap_or_else(|| GameStats {
                            game_id: identity.game_id.clone(),
                            first_played: Some(Utc::now()),
                            stats_version: 2,
                            ..Default::default()
                        });

                    if let Ok(Some(game)) =
                        crate::db::queries::get_game_by_id(&read_pool, &identity.game_id)
                    {
                        stats.app_id = game.steam_app_id.map(|id| id.to_string());
                        stats.game_title = game.title.clone();
                    } else {
                        stats.game_title = identity.game_title.clone();
                    }

                    stats.total_playtime_secs += delta;
                    stats.session_count += 1;
                    stats.last_played = Some(Utc::now());

                    if let Err(e) = save_game_stats(&stats) {
                        log::error!(
                            "[Stats] Failed to save stats for {}: {}",
                            identity.game_id,
                            e
                        );
                    }
                }

                app.emit(
                    "game-stopped",
                    json!({
                        "game_id": identity.game_id,
                        "game_title": identity.game_title,
                        "elapsed_seconds": delta,
                        "last_played": now_str,
                    }),
                )
                .ok();

                log::info!("Game stopped tracking: ID {}", identity.game_id);
            }

            // === PHASE B: Auto-Attach to New Processes ===
            for (pid, process) in sys.processes() {
                let pid_u32 = pid.as_u32();

                let is_already_tracked = {
                    let tracked = running.lock().unwrap();
                    tracked.values().any(|identity| identity.pid == pid_u32)
                };
                if is_already_tracked {
                    continue;
                }

                let mut matched_game_id = None;
                let mut matched_game_title = String::new();
                let mut resolved_exe_path = String::new();
                let mut resolved_install_dir = String::new();

                if let Some(p) = process.exe() {
                    let path_str = p.to_string_lossy().to_lowercase();
                    if !path_str.is_empty() {
                        if let Some(id) = exe_map.get(&path_str) {
                            matched_game_id = Some(id.clone());
                            resolved_exe_path = path_str;
                            if let Ok(Some(g)) = crate::db::queries::get_game_by_id(&read_pool, id)
                            {
                                matched_game_title = g.title.clone();
                                resolved_install_dir = g.install_dir.unwrap_or_else(|| {
                                    std::path::Path::new(&g.exe_path)
                                        .parent()
                                        .map(|p| p.to_string_lossy().to_string())
                                        .unwrap_or_default()
                                });
                            }
                        }
                    }
                }

                if matched_game_id.is_none() {
                    let proc_name = process.name().to_string_lossy().to_lowercase();
                    for (mapped_path, id) in &exe_map {
                        let mapped_file_name = std::path::Path::new(mapped_path)
                            .file_name()
                            .map(|n| n.to_string_lossy().to_lowercase())
                            .unwrap_or_default();

                        if proc_name == mapped_file_name
                            || proc_name == format!("{}.exe", mapped_file_name)
                        {
                            matched_game_id = Some(id.clone());
                            resolved_exe_path = mapped_path.clone();
                            if let Ok(Some(g)) = crate::db::queries::get_game_by_id(&read_pool, id)
                            {
                                matched_game_title = g.title.clone();
                                resolved_install_dir = g.install_dir.unwrap_or_else(|| {
                                    std::path::Path::new(&g.exe_path)
                                        .parent()
                                        .map(|p| p.to_string_lossy().to_string())
                                        .unwrap_or_default()
                                });
                            }
                            break;
                        }
                    }
                }

                if let Some(game_id) = matched_game_id {
                    let do_attach = {
                        let tracked = running.lock().unwrap();
                        !tracked.contains_key(&game_id)
                    };

                    if do_attach {
                        let attached_pid = pid.as_u32();
                        let start_time = get_process_start_time(attached_pid, &sys).unwrap_or(0);

                        let identity = ProcessIdentity {
                            pid: attached_pid,
                            exe_path: resolved_exe_path,
                            install_dir: resolved_install_dir,
                            start_time,
                            game_id: game_id.clone(),
                            game_title: matched_game_title.clone(),
                            launched_by: LaunchSource::AutoAttach,
                            elevated: false,
                            elevated_stop_flag: None,
                            achievement_watcher_stop_flag: None,
                        };

                        running.lock().unwrap().insert(game_id.clone(), identity);

                        app.emit(
                            "game-started",
                            json!({
                                "game_id": game_id,
                                "source": "AutoAttach"
                            }),
                        )
                        .ok();

                        log::info!(
                            "Auto-attached to externally launched game: {} (PID {})",
                            game_id,
                            attached_pid
                        );

                        start_achievement_watcher_for_game(&game_id, &read_pool, &app);
                    }
                }
            }
        }
    });
}

fn start_achievement_watcher_for_game(
    game_id: &str,
    read_pool: &Pool<SqliteConnectionManager>,
    app: &tauri::AppHandle,
) {
    use crate::achievement_watcher;
    use tauri::Manager;

    let game = match crate::db::queries::get_game_by_id(read_pool, game_id) {
        Ok(Some(g)) => g,
        Ok(None) => {
            log::warn!(
                "[Monitor] Game {} not found in DB, skipping achievement watcher",
                game_id
            );
            return;
        }
        Err(e) => {
            log::warn!("[Monitor] DB error looking up game {}: {}", game_id, e);
            return;
        }
    };

    let install_dir = match &game.install_dir {
        Some(d) => d.clone(),
        None => {
            log::info!(
                "[Monitor] Game {} has no install_dir, skipping achievement watcher",
                game_id
            );
            return;
        }
    };

    let game_path = PathBuf::from(&install_dir);
    let app_id = crate::achievements::resolve_app_id(&game_path)
        .or_else(|| game.steam_app_id.map(|id| id.to_string()))
        .unwrap_or_default();

    if app_id.is_empty()
        && game
            .manual_achievement_path
            .as_deref()
            .map(|p| p.is_empty())
            .unwrap_or(true)
    {
        log::info!(
            "[Monitor] No app_id and no manual path for game {}, skipping achievement watcher",
            game_id
        );
        return;
    }

    if let Some(overlay) = app.get_webview_window("achievement-overlay") {
        overlay.show().ok();
        overlay.set_always_on_top(true).ok();
    }

    let watcher_key = if app_id.is_empty() {
        game_id.to_string()
    } else {
        app_id.clone()
    };

    if let Some(state) = app.try_state::<achievement_watcher::ActiveWatchers>() {
        let mut watchers = state.0.lock().unwrap();
        if watchers.contains_key(&watcher_key) {
            log::info!(
                "[Monitor] Watcher for {} already exists, skipping",
                watcher_key
            );
            return;
        }

        let crack_type: Option<crate::commands::scanner::CrackType> = game
            .crack_type
            .as_deref()
            .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

        if let Some(stop_flag) = achievement_watcher::start_watching_for_game(
            app.clone(),
            game_id.to_string(),
            game.title,
            app_id.clone(),
            game_path.clone(),
            crate::settings::default_scan_roots(),
            game.manual_achievement_path,
            game.manual_save_path,
            crack_type,
            game.custom_ach_sound_path, // <--- FIXED HERE
        ) {
            watchers.insert(watcher_key, stop_flag);
            log::info!(
                "[Monitor] Achievement prober task started for game {} (app_id={})",
                game_id,
                app_id
            );
        } else {
            log::info!(
                "[Monitor] Could not initialize prober task for game {}",
                game_id
            );
            if let Some(overlay) = app.get_webview_window("achievement-overlay") {
                overlay.hide().ok();
            }
        }
    }
}
