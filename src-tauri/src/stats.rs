use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameStats {
    pub game_id: String,
    pub app_id: Option<String>,
    pub game_title: String,
    pub total_playtime_secs: u64,
    pub session_count: u32,
    pub first_played: Option<DateTime<Utc>>,
    pub last_played: Option<DateTime<Utc>>,
    pub stats_version: u8,
}

fn stats_dir() -> PathBuf {
    let drive = std::env::var("SYSTEMDRIVE").unwrap_or_else(|_| "C:".into());
    PathBuf::from(format!(r"{}\Users\Public\Documents\ChiraLauncher\stats", drive))
}

/// Save stats strictly indexed by game_id to a single file.
pub fn save_game_stats(stats: &GameStats) -> std::io::Result<()> {
    let dir = stats_dir();
    std::fs::create_dir_all(&dir)?;

    let json = serde_json::to_string_pretty(stats)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        
    std::fs::write(dir.join(format!("app_{}.json", &stats.game_id)), &json)?;

    Ok(())
}

/// Load stats directly from the single app_{game_id}.json file.
pub fn load_game_stats(game_id: &str) -> Option<GameStats> {
    let dir = stats_dir();
    let path = dir.join(format!("app_{}.json", game_id));
    std::fs::read_to_string(path).ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

/// NOT called on library deletion. Only call for explicit "wipe" user action.
pub fn delete_game_stats(game_id: &str) {
    let path = stats_dir().join(format!("app_{}.json", game_id));
    std::fs::remove_file(path).ok();
}