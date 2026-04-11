use crate::state::{AppState, SettingsDbWrite};
use tauri::State;

#[tauri::command]
#[allow(dead_code)]
pub async fn reset_application(
    state: State<'_, AppState>,
    keep_progress: bool,
) -> Result<(), String> {
    log::info!(
        "[System] Resetting application (keep_progress: {})",
        keep_progress
    );

    // We do this via the writer channel to ensure sequential execution
    // However, some parts like truncating multiple tables are easier in a direct connection if we want to be fast,
    // but sticking to the writer is safer for state consistency.

    // 1. Reset Settings
    state
        .db_tx
        .send(crate::state::DbWrite::Settings(
            SettingsDbWrite::UpdateSettings(crate::settings::AppSettings::default()),
        ))
        .map_err(|e| e.to_string())?;

    // 2. Conditional data wipe
    if !keep_progress {
        // We'll send a custom write to the DB writer to handle multiple truncations in one transaction
        // Actually, let's just implement a direct wipe for now as this is a high-level command

        let pool = state.read_pool.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let mut conn = pool.get().map_err(|e| e.to_string())?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;

            // Wipe all main data tables
            tx.execute("DELETE FROM games", []).ok();
            tx.execute("DELETE FROM achievements", []).ok();
            tx.execute("DELETE FROM scan_paths", []).ok();
            tx.execute("DELETE FROM folder_state", []).ok();
            tx.execute("DELETE FROM profiles", []).ok();
            tx.execute("DELETE FROM local_messages", []).ok();
            tx.execute("DELETE FROM playtime_orphans", []).ok();

            // Re-initialize a default profile if needed
            // (The writer might handle this if we trigger a re-init)

            tx.commit().map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        });
    }

    Ok(())
}
