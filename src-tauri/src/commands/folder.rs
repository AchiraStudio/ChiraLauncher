use crate::state::{AppState, DbWrite, SettingsDbWrite};
use tauri::State;

#[tauri::command]
pub async fn load_folders(state: State<'_, AppState>) -> Result<String, String> {
    let conn = state.read_pool.get().map_err(|e| e.to_string())?;

    let query_result: Result<String, rusqlite::Error> =
        conn.query_row("SELECT data FROM folder_state WHERE id = 1", [], |row| {
            row.get(0)
        });

    match query_result {
        Ok(data) => Ok(data),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Ok(r#"{"customFolders":[],"settings":{"globalBgImage":"","globalBgOpacity":0.6,"globalBgBlur":10}}"#.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_folders(data: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Settings(SettingsDbWrite::UpdateFolders(data)))
        .map_err(|e| e.to_string())
}
