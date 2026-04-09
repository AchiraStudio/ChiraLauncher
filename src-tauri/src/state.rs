use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

#[derive(Clone, Debug, PartialEq)]
#[allow(dead_code)]
pub enum LaunchSource {
    Launcher,
    AutoAttach,
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct ProcessIdentity {
    pub pid: u32,
    pub exe_path: String,
    pub start_time: u64,
    pub game_id: String,
    pub launched_by: LaunchSource,
    pub elevated: bool,
    pub elevated_stop_flag: Option<Arc<std::sync::atomic::AtomicBool>>,
    pub achievement_watcher_stop_flag: Option<Arc<std::sync::atomic::AtomicBool>>,
}

#[derive(Debug)]
pub enum GameDbWrite {
    UpdatePlaytime {
        game_id: String,
        delta_seconds: u64,
    },
    SetLastPlayed {
        game_id: String,
        timestamp: String,
    },
    InsertGame(crate::db::queries::NewGame),
    DeleteGame {
        game_id: String,
    },
    UpdateGame {
        game: crate::db::queries::Game,
    },
    UpdateAssets {
        game_id: String,
        cover_path: Option<String>,
        background_path: Option<String>,
    },
    UpdateRunAsAdmin {
        game_id: String,
        enabled: bool,
    },
    UpdateSteamAppId {
        game_id: String,
        steam_app_id: Option<u32>,
    },
    UpdateStats {
        game_id: String,
        session_count: u32,
        first_played: Option<String>,
        achievements_unlocked: u32,
        achievements_total: u32,
    },
    UpdateManualAchievementPath {
        game_id: String,
        path: Option<String>,
    },
    UpdateDetectedAchievementPaths {
        game_id: String,
        metadata: Option<String>,
        earned_state: Option<String>,
    },
}

#[derive(Debug)]
pub enum SettingsDbWrite {
    UpdateSettings(crate::settings::AppSettings),
    UpdateFolders(String),
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct UserProfile {
    pub id: String,
    pub username: String,
    pub steam_id: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug)]
pub enum ProfileDbWrite {
    UnlockAchievement {
        game_id: String,
        api_name: String,
        unlock_time: String,
    },
    UpdateProfile(UserProfile),
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct OsIntegration {
    pub game_id: String,
    pub has_desktop_shortcut: bool,
    pub has_start_menu_shortcut: bool,
    pub has_registry_entry: bool,
}

#[derive(Debug)]
pub enum OsDbWrite {
    UpdateIntegration(OsIntegration),
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct ExtensionInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: String, // "theme" | "plugin"
    pub checksum: String,
    pub enabled: bool,
    pub consent_given: bool,
    pub permissions: Vec<crate::extensions::PluginPermission>,
}

#[derive(Debug)]
pub enum ExtensionDbWrite {
    UpdateExtension(ExtensionInfo),
}

#[derive(Debug)]
#[allow(dead_code)]
pub enum DbWrite {
    Game(GameDbWrite),
    Settings(SettingsDbWrite),
    Profile(ProfileDbWrite),
    Os(OsDbWrite),
    Extensions(ExtensionDbWrite),
}

pub type DbWriteSender = mpsc::UnboundedSender<DbWrite>;

#[allow(dead_code)]
pub struct AppState {
    pub running_games: Arc<Mutex<HashMap<String, ProcessIdentity>>>,
    pub db_tx: DbWriteSender,
    pub read_pool: Pool<SqliteConnectionManager>,
    pub metadata_provider: Arc<dyn crate::metadata::MetadataProvider>,
    pub image_cache: Arc<crate::metadata::ImageCache>,
    pub metadata_refresh_lock: tokio::sync::Mutex<std::collections::HashSet<String>>,
}
