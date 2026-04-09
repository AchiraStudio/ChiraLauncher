pub mod commands;
pub mod store;

pub use store::{get_settings, init_table, update_settings};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub download_path: String,
    pub auto_launch_on_boot: bool,
    pub minimize_to_tray: bool,
    pub enable_notifications: bool,
    pub volume_sfx: u32,
    pub volume_bgm: u32,
    pub developer_mode: bool,
    pub max_download_speed_kbps: u32,
    pub max_upload_speed_kbps: u32,
    pub max_concurrent_downloads: u32,
    pub auto_add_to_library: bool,
    pub sequential_download: bool,
    pub steam_api_key: String,
    pub auto_fetch_achievements: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            language: "en".to_string(),
            download_path: "C:\\Downloads\\ChiraLauncher".to_string(),
            auto_launch_on_boot: false,
            minimize_to_tray: true,
            enable_notifications: true,
            volume_sfx: 80,
            volume_bgm: 50,
            developer_mode: false,
            max_download_speed_kbps: 0,
            max_upload_speed_kbps: 0,
            max_concurrent_downloads: 3,
            auto_add_to_library: true,
            sequential_download: false,
            steam_api_key: String::new(),
            auto_fetch_achievements: true,
        }
    }
}

pub fn default_scan_roots() -> Vec<std::path::PathBuf> {
    let drive = std::env::var("SYSTEMDRIVE").unwrap_or_else(|_| "C:".into());
    let drive_root = if drive.ends_with('\\') { drive.clone() } else { format!("{}\\", drive) };

    let appdata = std::env::var("APPDATA")
        .unwrap_or_else(|_| format!(r"{}Users\Default\AppData\Roaming", drive_root));

    vec![
        std::path::PathBuf::from(format!(r"{}\GSE Saves", appdata)),                          // Priority 1: Goldberg GSE (flat pattern)
        std::path::PathBuf::from(format!(r"{}Users\Public\Documents\Steam", drive_root)),         // Priority 2: CODEX, RLD!, Skidrow
        std::path::PathBuf::from(format!(r"{}Users\Public\Documents", drive_root)),               // Priority 3: catch-all
    ]
}
