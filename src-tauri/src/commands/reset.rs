use crate::state::AppState;
use std::fs;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn reset_application(
    app: AppHandle,
    state: State<'_, AppState>,
    keep_progress: bool,
) -> Result<(), String> {
    log::warn!(
        "[System] CRITICAL: Factory Reset Initiated (keep_progress: {})",
        keep_progress
    );

    let pool = state.read_pool.clone();

    // 1. Wipe Database Tables
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        tx.execute("DELETE FROM games", []).ok();
        tx.execute("DELETE FROM os_integration", []).ok();

        if !keep_progress {
            tx.execute("DELETE FROM achievements", []).ok();
            tx.execute("DELETE FROM playtime_orphans", []).ok();
            tx.execute("DELETE FROM folder_state", []).ok();
            tx.execute("DELETE FROM profiles", []).ok();
            tx.execute("DELETE FROM local_messages", []).ok();
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .unwrap()?;

    // 2. Wipe Physical Caches
    if let Ok(app_dir) = app.path().app_data_dir() {
        // Clear cached images
        let images_dir = app_dir.join("images");
        if images_dir.exists() {
            let _ = fs::remove_dir_all(&images_dir);
        }

        // Clear cached local achievements JSONs
        let ach_cache_dir = app_dir.join("achievements");
        if ach_cache_dir.exists() {
            let _ = fs::remove_dir_all(&ach_cache_dir);
        }

        // Clear torrent session states
        let torrent_dir = app_dir.join("rqbit_session");
        if torrent_dir.exists() {
            let _ = fs::remove_dir_all(&torrent_dir);
        }
    }

    // 3. Restart Application natively
    app.restart();

    #[allow(unreachable_code)]
    Ok(())
}
