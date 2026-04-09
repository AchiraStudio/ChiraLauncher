/// Persistent achievement cache stored in the launcher's app data directory.
///
/// File layout:
///   {app_data}/ChiraLauncher/achievements/{game_id}.json
///
/// The cache stores the full `Achievement` list so the launcher can show
/// correct unlock state even when the game-side INI has not been generated yet.
use super::Achievement;
use std::path::PathBuf;

fn cache_dir() -> PathBuf {
    // Use APPDATA on Windows (%AppData%/ChiraLauncher/achievements/)
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ChiraLauncher")
        .join("achievements")
}

fn cache_path(game_id: &str) -> PathBuf {
    // Sanitize game_id for use as a filename
    let safe_id: String = game_id
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    cache_dir().join(format!("{}.json", safe_id))
}

/// Load the cached achievement list for a game.
/// Returns `None` if no cache exists or if it can't be parsed.
pub fn load_cache(game_id: &str) -> Option<Vec<Achievement>> {
    let path = cache_path(game_id);
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Save the current achievement list for a game to the persistent cache.
pub fn save_cache(game_id: &str, achievements: &[Achievement]) {
    let path = cache_path(game_id);

    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!("[AchCache] Could not create cache dir: {}", e);
            return;
        }
    }

    match serde_json::to_string_pretty(achievements) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                log::warn!("[AchCache] Failed to write cache for {}: {}", game_id, e);
            } else {
                log::debug!("[AchCache] Saved {} achievements for game {}", achievements.len(), game_id);
            }
        }
        Err(e) => log::warn!("[AchCache] Serialization error for {}: {}", game_id, e),
    }
}

/// Remove the cached achievement list for a game, forcing a fresh load.
pub fn clear_cache(game_id: &str) {
    let path = cache_path(game_id);
    let _ = std::fs::remove_file(path);
}
