use crate::db::queries;
use crate::state::{DbWrite, ExtensionDbWrite, GameDbWrite, OsDbWrite, ProfileDbWrite, SettingsDbWrite};
use rusqlite::Connection;
use std::path::PathBuf;
use tokio::sync::mpsc;

pub async fn run_db_writer(db_path: PathBuf, mut rx: mpsc::UnboundedReceiver<DbWrite>) {
    let mut conn = Connection::open(&db_path).expect("DB writer failed to open connection");

    // WAL mode: readers never block on this writer
    conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();

    while let Some(write) = rx.recv().await {
        let result = match write {
            DbWrite::Game(GameDbWrite::UpdatePlaytime { game_id, delta_seconds }) => conn.execute(
                "UPDATE games SET playtime_seconds = playtime_seconds + ?1 WHERE id = ?2",
                rusqlite::params![delta_seconds, game_id],
            ),
            DbWrite::Game(GameDbWrite::SetLastPlayed { game_id, timestamp }) => conn.execute(
                "UPDATE games SET last_played = ?1 WHERE id = ?2",
                rusqlite::params![timestamp, game_id],
            ),
            DbWrite::Game(GameDbWrite::InsertGame(game)) => queries::insert_game_conn(&conn, game),
            DbWrite::Game(GameDbWrite::DeleteGame { game_id }) => queries::delete_game_conn(&conn, &game_id),
            DbWrite::Game(GameDbWrite::UpdateGame { game }) => queries::update_game_conn(&conn, game),
            DbWrite::Game(GameDbWrite::UpdateAssets { game_id, cover_path, background_path }) => queries::update_assets_conn(&conn, &game_id, cover_path, background_path),
            DbWrite::Game(GameDbWrite::UpdateSteamAppId { game_id, steam_app_id }) => conn.execute(
                "UPDATE games SET steam_app_id = ?1 WHERE id = ?2",
                rusqlite::params![steam_app_id, game_id],
            ),
            DbWrite::Game(GameDbWrite::UpdateRunAsAdmin { game_id, enabled }) => conn.execute(
                "UPDATE games SET run_as_admin = ?1 WHERE id = ?2",
                rusqlite::params![enabled as i32, game_id],
            ),
            DbWrite::Game(GameDbWrite::UpdateStats { game_id, session_count, first_played, achievements_unlocked, achievements_total }) => conn.execute(
                "UPDATE games SET session_count = ?1, first_played = IFNULL(?2, first_played), achievements_unlocked = ?3, achievements_total = ?4 WHERE id = ?5",
                rusqlite::params![session_count as i32, first_played, achievements_unlocked as i32, achievements_total as i32, game_id],
            ),
            DbWrite::Game(GameDbWrite::UpdateManualAchievementPath { game_id, path }) => conn.execute(
                "UPDATE games SET manual_achievement_path = ?1 WHERE id = ?2",
                rusqlite::params![path, game_id],
            ),
            DbWrite::Game(GameDbWrite::UpdateDetectedAchievementPaths { game_id, metadata, earned_state }) => 
                queries::update_detected_achievement_paths_conn(&conn, &game_id, metadata, earned_state),
            DbWrite::Profile(ProfileDbWrite::UnlockAchievement { game_id, api_name, unlock_time }) => conn.execute(
                "UPDATE achievements SET unlocked = 1, unlock_time = ?1 WHERE game_id = ?2 AND api_name = ?3",
                rusqlite::params![unlock_time, game_id, api_name],
            ),
            DbWrite::Profile(ProfileDbWrite::UpdateProfile(profile)) => conn.execute(
                "INSERT INTO profiles (id, username, steam_id, avatar_url, is_default) VALUES (?1, ?2, ?3, ?4, ?5) 
                 ON CONFLICT(id) DO UPDATE SET username = excluded.username, steam_id = excluded.steam_id, avatar_url = excluded.avatar_url, is_default = excluded.is_default",
                rusqlite::params![profile.id, profile.username, profile.steam_id, profile.avatar_url, 1],
            ),
            DbWrite::Settings(SettingsDbWrite::UpdateSettings(settings)) => {
                crate::settings::update_settings(&mut conn, &settings).map(|_| 0)
            }
            DbWrite::Settings(SettingsDbWrite::UpdateFolders(data)) => conn.execute(
                "INSERT INTO folder_state (id, data) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                rusqlite::params![data],
            ).map(|_| 0),
            DbWrite::Os(OsDbWrite::UpdateIntegration(integration)) => conn.execute(
                "INSERT INTO os_integration (game_id, has_desktop_shortcut, has_start_menu_shortcut, has_registry_entry) 
                 VALUES (?1, ?2, ?3, ?4) 
                 ON CONFLICT(game_id) DO UPDATE SET 
                 has_desktop_shortcut = excluded.has_desktop_shortcut, 
                 has_start_menu_shortcut = excluded.has_start_menu_shortcut, 
                 has_registry_entry = excluded.has_registry_entry",
                rusqlite::params![
                    integration.game_id, 
                    integration.has_desktop_shortcut as i32, 
                    integration.has_start_menu_shortcut as i32, 
                    integration.has_registry_entry as i32
                ],
            ),
            DbWrite::Extensions(ExtensionDbWrite::UpdateExtension(ext)) => conn.execute(
                "INSERT INTO extensions (id, name, version, kind, checksum, enabled, consent_given, permissions) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) 
                 ON CONFLICT(id) DO UPDATE SET 
                 name = excluded.name, 
                 version = excluded.version, 
                 checksum = excluded.checksum, 
                 enabled = excluded.enabled, 
                 consent_given = excluded.consent_given, 
                 permissions = excluded.permissions",
                rusqlite::params![
                    ext.id, ext.name, ext.version, ext.kind, ext.checksum, 
                    ext.enabled as i32, ext.consent_given as i32, 
                    serde_json::to_string(&ext.permissions).unwrap_or_default()
                ],
            ),
        };

        if let Err(e) = result {
            log::error!("DB write error: {}", e);
        }
    }
}
