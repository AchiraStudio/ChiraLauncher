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
    pub achievements_unlocked: u32,
    pub achievements_total: u32,
    pub achievements_source_path: Option<String>,
    pub stats_version: u8,
}

fn stats_dir() -> PathBuf {
    let drive = std::env::var("SYSTEMDRIVE").unwrap_or_else(|_| "C:".into());
    PathBuf::from(format!(r"{}\Users\Public\Documents\ChiraLauncher\stats", drive))
}

/// Save stats indexed by game_id (primary key).
/// Also writes an app_id alias file so playtime survives game re-adds.
pub fn save_game_stats(stats: &GameStats) -> std::io::Result<()> {
    let dir = stats_dir();
    std::fs::create_dir_all(&dir)?;

    // Primary: keyed by game_id
    let json = serde_json::to_string_pretty(stats)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(dir.join(format!("{}.json", &stats.game_id)), &json)?;

    // Secondary alias: keyed by app_id for cross-add persistence
    if let Some(ref aid) = stats.app_id {
        if !aid.is_empty() {
            std::fs::write(dir.join(format!("appid_{}.json", aid)), &json)?;
        }
    }

    // Secondary alias: keyed by sanitised title for cross-add persistence
    let safe_title: String = stats.game_title.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect::<String>()
        .to_lowercase();
    if !safe_title.is_empty() {
        std::fs::write(dir.join(format!("title_{}.json", &safe_title[..safe_title.len().min(80)])), &json)?;
    }

    Ok(())
}

/// Load stats by game_id first, then fall back to app_id alias, then title alias.
/// This lets re-added games recover their playtime automatically.
pub fn load_game_stats(game_id: &str) -> Option<GameStats> {
    let dir = stats_dir();
    let path = dir.join(format!("{}.json", game_id));
    std::fs::read_to_string(path).ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

/// Try to find saved stats for a game by its steam app_id.
/// Returns the stats with the game_id field updated to the new game_id.
pub fn load_stats_by_app_id(new_game_id: &str, app_id: &str) -> Option<GameStats> {
    if app_id.is_empty() { return None; }
    let dir = stats_dir();
    let path = dir.join(format!("appid_{}.json", app_id));
    std::fs::read_to_string(path).ok()
        .and_then(|s| serde_json::from_str::<GameStats>(&s).ok())
        .map(|mut s| { s.game_id = new_game_id.to_string(); s })
}

/// Try to find saved stats for a game by its title.
/// Returns the stats with the game_id field updated to the new game_id.
pub fn load_stats_by_title(new_game_id: &str, title: &str) -> Option<GameStats> {
    if title.is_empty() { return None; }
    let safe_title: String = title.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect::<String>()
        .to_lowercase();
    let dir = stats_dir();
    let path = dir.join(format!("title_{}.json", &safe_title[..safe_title.len().min(80)]));
    std::fs::read_to_string(path).ok()
        .and_then(|s| serde_json::from_str::<GameStats>(&s).ok())
        .map(|mut s| { s.game_id = new_game_id.to_string(); s })
}

/// NOT called on library deletion. Only call for explicit "wipe" user action.
pub fn delete_game_stats(game_id: &str) {
    let path = stats_dir().join(format!("{}.json", game_id));
    std::fs::remove_file(path).ok();
}
