use crate::settings::AppSettings;
use crate::state::AppState;
use tauri::State;

#[cfg(target_os = "windows")]
use winreg::{enums::*, RegKey};

#[cfg(target_os = "windows")]
fn apply_windows_autostart(enable: bool) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        KEY_SET_VALUE | KEY_READ,
    ) {
        let app_name = "ChiraLauncher";
        if enable {
            if let Ok(exe_path) = std::env::current_exe() {
                // Ensure quotes wrap the path in case of spaces
                let launch_cmd = format!("\"{}\" --hidden", exe_path.to_string_lossy());
                let _: std::io::Result<()> = key.set_value(app_name, &launch_cmd);
                log::info!("Added ChiraLauncher to Windows Startup: {}", launch_cmd);
            }
        } else {
            let _: std::io::Result<()> = key.delete_value(app_name);
            log::info!("Removed ChiraLauncher from Windows Startup");
        }
    }
}

#[tauri::command]
pub async fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    crate::settings::get_settings(&state.read_pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db_tx
        .send(crate::state::DbWrite::Settings(
            crate::state::SettingsDbWrite::UpdateSettings(settings.clone()),
        ))
        .map_err(|_| "Failed to send settings to database thread".to_string())?;

    #[cfg(target_os = "windows")]
    apply_windows_autostart(settings.auto_launch_on_boot);

    Ok(())
}
