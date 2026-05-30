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
    pub accent_color: String,

    // Playlist and Background Play Settings
    pub launcher_bgm_paths: Vec<String>,
    pub bgm_play_unfocused: bool,
    pub bgm_play_in_tray: bool,
    pub bgm_shuffle: bool,
    pub default_launcher_path: String,
    pub auto_close_launcher: bool, // NEW

    // Legacy fields
    pub launcher_bgm_path: String,
    pub default_ach_sound_path: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            language: "en".to_string(),
            download_path: std::env::var_os("USERPROFILE")
                .map(|h| std::path::PathBuf::from(h).join("Downloads").join("ChiraLauncher").to_string_lossy().into_owned())
                .unwrap_or_else(|| "Downloads\\ChiraLauncher".to_string()),
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
            accent_color: "#22d3ee".to_string(),

            launcher_bgm_paths: Vec::new(),
            bgm_play_unfocused: false,
            bgm_play_in_tray: false,
            bgm_shuffle: false,
            default_launcher_path: String::new(),
            auto_close_launcher: false,

            launcher_bgm_path: String::new(),
            default_ach_sound_path: String::new(),
        }
    }
}

pub fn default_scan_roots() -> Vec<std::path::PathBuf> {
    let mut roots = Vec::new();

    // Goldberg GSE saves – always under %APPDATA%
    if let Some(appdata) = std::env::var_os("APPDATA") {
        roots.push(std::path::PathBuf::from(appdata).join("GSE Saves"));
    }

    // Public Steam / Documents folders – look up via %PUBLIC% which Windows always sets
    if let Some(public) = std::env::var_os("PUBLIC") {
        let public = std::path::PathBuf::from(public);
        roots.push(public.join("Documents").join("Steam"));
        roots.push(public.join("Documents"));
    }

    roots
}
