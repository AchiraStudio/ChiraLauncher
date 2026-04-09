use crate::settings::{get_settings, AppSettings};
use crate::state::{AppState, DbWrite, SettingsDbWrite};
use tauri::State;

#[tauri::command]
pub async fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    get_settings(&state.read_pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Settings(SettingsDbWrite::UpdateSettings(settings)))
        .map_err(|e| e.to_string())
}


