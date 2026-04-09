pub mod achievement_watcher;
pub mod achievements;
mod commands;
pub mod db;
pub mod extensions;
pub mod metadata;
pub mod os_integration;
pub mod patcher;
mod process;
pub mod profile;
pub mod settings;
mod state;
pub mod stats;
pub mod torrent;
mod tray;

use crate::commands::torrent::TorrentState;
use crate::state::{AppState, DbWrite};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();

    let args: Vec<String> = std::env::args().collect();
    if let Some(id) = args.iter().skip_while(|a| *a != "--remove-game").nth(1) {
        println!("Remove game requested for ID: {}", id);
        let app_dir = dirs::data_dir()
            .map(|d| d.join("com.achira.chira-launcher"))
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        let db_path = app_dir.join("data.db");
        if let Ok(conn) = rusqlite::Connection::open(&db_path) {
            match os_integration::remove_os_integration_by_id(&conn, id) {
                Ok(_) => println!("OS integration removed for game {}", id),
                Err(e) => eprintln!("Failed to remove OS integration: {}", e),
            }
            os_integration::cleanup_game_icon_cache(id);
        }
        std::process::exit(0);
    }

    #[cfg(windows)]
    os_integration::set_launcher_aumid();

    #[cfg(windows)]
    {
        if let Ok(pd) = std::env::var("ProgramData") {
            let udf = format!("{}\\ChiraLauncher\\WebView2", pd);
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", udf);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(id) = args.iter().skip_while(|a| *a != "--launch-game").nth(1) {
                let _ = app.emit("launch-game-requested", id);
            }
            let _ = app.emit("single-instance", &args);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(windows)]
            {
                use std::os::windows::ffi::OsStrExt;
                use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

                let id: Vec<u16> = std::ffi::OsStr::new("com.achira.chira-launcher")
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                unsafe {
                    SetCurrentProcessExplicitAppUserModelID(id.as_ptr());
                }
            }

            let app_dir = app.path().app_data_dir()?;
            let db_path = app_dir.join("data.db");

            db::initialize(app)?;

            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register("magnet")?;
            }

            let read_pool = db::create_read_pool(&db_path);
            let app_settings = crate::settings::get_settings(&read_pool).unwrap_or_default();

            let (db_tx, db_rx) = tokio::sync::mpsc::unbounded_channel::<DbWrite>();
            let running_games = Arc::new(Mutex::new(HashMap::new()));

            let provider: Arc<dyn metadata::MetadataProvider> =
                { Arc::new(metadata::OfflineProvider::new()) };

            let app_state = AppState {
                running_games: running_games.clone(),
                db_tx: db_tx.clone(),
                read_pool: read_pool.clone(),
                metadata_provider: provider,
                image_cache: Arc::new(metadata::ImageCache::new(&app_dir)),
                metadata_refresh_lock: tokio::sync::Mutex::new(std::collections::HashSet::new()),
            };

            app.manage(app_state);
            app.manage(achievement_watcher::ActiveWatchers::default());

            {
                use crate::achievement_watcher::{start_watching_for_game, ActiveWatchers};
                use tauri::Manager;

                let app_handle_for_watchers = app.handle().clone();
                let read_pool_for_watchers = read_pool.clone();

                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                    let games = match crate::db::queries::get_all_games(&read_pool_for_watchers) {
                        Ok(g) => g,
                        Err(e) => {
                            log::error!(
                                "[Startup] Failed to load games for achievement watchers: {}",
                                e
                            );
                            return;
                        }
                    };

                    let active_watchers: tauri::State<ActiveWatchers> =
                        app_handle_for_watchers.state();

                    for game in games {
                        let has_manual_path = game
                            .manual_achievement_path
                            .as_deref()
                            .map(|p| !p.is_empty())
                            .unwrap_or(false);

                        if !has_manual_path {
                            let game_id = game.id.clone();
                            let install_dir = game.install_dir.clone().unwrap_or_default();
                            let db_tx = app_handle_for_watchers
                                .state::<crate::state::AppState>()
                                .db_tx
                                .clone();

                            tauri::async_runtime::spawn(async move {
                                let db_app_id = game.steam_app_id.map(|id| id.to_string());
                                let crack_type: Option<crate::achievements::CrackType> = game
                                    .crack_type
                                    .as_deref()
                                    .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

                                let default_roots = crate::settings::default_scan_roots();
                                let opts = crate::achievements::SyncOptions {
                                    crack_type,
                                    known_app_id: db_app_id.as_deref(),
                                    manual_path: None,
                                    scan_roots: &default_roots,
                                    steam_api_key: None,
                                    db_tx: Some(&db_tx),
                                };

                                crate::achievements::sync_achievements(
                                    &game_id,
                                    &install_dir,
                                    db_app_id.as_deref(),
                                    &opts,
                                );
                            });
                            continue;
                        }

                        let game_dir =
                            std::path::PathBuf::from(game.install_dir.as_deref().unwrap_or(""));
                        let app_id = game
                            .steam_app_id
                            .map(|id| id.to_string())
                            .unwrap_or_default();

                        let watcher_key = if app_id.is_empty() {
                            game.id.clone()
                        } else {
                            app_id.clone()
                        };

                        let crack_type: Option<crate::commands::scanner::CrackType> = game
                            .crack_type
                            .as_deref()
                            .and_then(|s| serde_json::from_str(&format!("\"{}\"", s)).ok());

                        {
                            let mut watchers = active_watchers.0.lock().unwrap();
                            if watchers.contains_key(&watcher_key) {
                                continue;
                            }

                            if let Some(watcher) = start_watching_for_game(
                                app_handle_for_watchers.clone(),
                                game.id.clone(),
                                app_id,
                                game_dir,
                                crate::settings::default_scan_roots(),
                                game.manual_achievement_path,
                                crack_type,
                            ) {
                                watchers.insert(watcher_key, watcher);
                            }
                        }
                    }
                });
            }

            let session_dir = app_dir.join("rqbit_session");
            let download_dir = std::path::PathBuf::from(&app_settings.download_path);

            let torrent_state: TorrentState = Arc::new(RwLock::new(None));
            let torrent_state_clone = torrent_state.clone();
            let torrent_state_clone_for_events = torrent_state.clone();

            app.manage(torrent_state);
            let app_handle_for_events = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                match crate::torrent::TorrentEngine::new(session_dir, download_dir).await {
                    Ok(engine) => {
                        let mut lock = torrent_state_clone.write().await;
                        *lock = Some(engine);
                    }
                    Err(e) => log::error!("[TorrentEngine] Failed to initialize: {e:#}"),
                }
            });

            let app_handle_for_args = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let args: Vec<String> = std::env::args().collect();
                if let Some(id) = args.iter().skip_while(|a| *a != "--launch-game").nth(1) {
                    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
                    let _ = app_handle_for_args.emit("launch-game-requested", id);
                }
            });

            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
                loop {
                    interval.tick().await;

                    let downloads = {
                        let lock = torrent_state_clone_for_events.read().await;
                        if let Some(engine) = lock.as_ref() {
                            Some(engine.list_downloads().await)
                        } else {
                            None
                        }
                    };

                    if let Some(list) = downloads {
                        if let Err(e) = app_handle_for_events.emit("download-progress", list) {
                            log::warn!("Failed to emit download progress: {e:#}");
                        }
                    }
                }
            });

            // FIXED: Fully qualified path to guarantee the compiler finds it
            tauri::async_runtime::spawn(crate::db::writer::run_db_writer(db_path, db_rx));

            process::monitor::start(
                app.handle().clone(),
                running_games.clone(),
                db_tx.clone(),
                read_pool.clone(),
            );

            #[cfg(desktop)]
            {
                let monitor = app.primary_monitor().ok().flatten();

                let (width, height, x, y) = if let Some(m) = monitor {
                    let scale = m.scale_factor();
                    let size = m.size();
                    let pos = m.position();
                    (
                        size.width as f64 / scale,
                        size.height as f64 / scale,
                        pos.x as f64,
                        pos.y as f64,
                    )
                } else {
                    (1920.0_f64, 1080.0_f64, 0.0_f64, 0.0_f64)
                };

                let overlay = tauri::WebviewWindowBuilder::new(
                    app,
                    "achievement-overlay",
                    tauri::WebviewUrl::App("overlay.html".into()),
                )
                .title("ChiraLauncher Overlay")
                .inner_size(width, height)
                .position(x, y)
                .transparent(true)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
                .focused(false)
                .build();

                if let Ok(overlay_window) = overlay {
                    let _ = overlay_window.set_ignore_cursor_events(true);
                }
            }

            tray::create_tray(app.handle())?;
            extensions::start_watcher(app.handle().clone())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::game::get_all_games,
            commands::game::add_game,
            commands::game::delete_game,
            commands::game::update_game,
            commands::game::update_game_assets,
            commands::launcher::launch_game,
            commands::launcher::force_stop_game,
            commands::launcher::force_borderless,
            commands::launcher::toggle_run_as_admin,
            commands::launcher::open_path_in_explorer,
            commands::launcher::resolve_game_app_id,
            commands::launcher::refresh_game_metadata,
            commands::metadata::upload_custom_cover,
            commands::metadata::upload_custom_background,
            commands::metadata::get_fitgirl_repacks,
            commands::metadata::read_image_base64,
            commands::metadata::fetch_steam_app_details,
            commands::metadata::fetch_steam_reviews,
            commands::metadata::fetch_global_achievement_percentages,
            commands::achievements::get_achievements,
            commands::achievements::sync_game_achievements,
            commands::achievements::check_local_achievements,
            commands::achievements::get_achievement_diagnostics,
            commands::achievements::patch_achievement_percentages,
            achievements::fetcher::fetch_and_write_achievements,
            achievements::fetcher::validate_steam_api_key,
            commands::cleaner::clean_title,
            commands::scanner::scan_directory,
            commands::scanner::scan_single_game,
            settings::commands::get_app_settings,
            settings::commands::update_app_settings,
            commands::repacks::load_repacks,
            commands::repacks::refresh_repacks,
            commands::folder::load_folders,
            commands::folder::save_folders,
            tray::update_tray,
            commands::torrent::inspect_magnet,
            commands::torrent::start_download,
            commands::torrent::pause_download,
            commands::torrent::resume_download,
            commands::torrent::cancel_download,
            commands::torrent::get_downloads,
            profile::get_profile,
            profile::update_profile,
            profile::is_first_launch,
            os_integration::get_os_integration,
            os_integration::toggle_os_integration,
            achievement_watcher::watch_game_achievements,
            achievement_watcher::stop_game_achievement_watch,
            achievement_watcher::debug_fire_achievement,
            achievement_watcher::debug_fire_custom,
            commands::game::set_manual_achievement_path,
            extensions::get_extensions,
            extensions::install_extension,
            extensions::toggle_extension,
            extensions::read_extension_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
