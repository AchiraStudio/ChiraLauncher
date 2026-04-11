use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Game {
    pub id: String,
    pub title: String,
    #[serde(rename = "executable_path")]
    pub exe_path: String,
    pub playtime_seconds: u64,
    pub last_played: Option<String>,
    pub cover_path: Option<String>,
    pub background_path: Option<String>,
    pub logo_path: Option<String>, // NEW
    pub description: Option<String>,
    pub developer: Option<String>,
    pub genre: Option<String>,
    pub rating: Option<f64>,
    pub igdb_id: Option<i64>,
    pub steam_app_id: Option<u32>,
    pub source: String,
    pub added_at: Option<String>,
    pub installed_size: Option<u64>,
    pub install_dir: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub genres: Option<String>,
    pub tags: Option<String>,
    pub metacritic_score: Option<i32>,
    pub platforms: Option<String>,
    pub repack_info: Option<String>,
    pub run_as_admin: bool,
    pub session_count: Option<u32>,
    pub first_played: Option<String>,
    pub achievements_unlocked: Option<u32>,
    pub achievements_total: Option<u32>,
    pub manual_achievement_path: Option<String>,
    pub crack_type: Option<String>,
    pub app_id: Option<String>,
    pub detected_metadata_path: Option<String>,
    pub detected_earned_state_path: Option<String>,
    pub is_favorite: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NewGame {
    pub id: String,
    pub title: String,
    #[serde(rename = "executable_path")]
    pub exe_path: String,
    pub cover_path: Option<String>,
    pub background_path: Option<String>,
    pub logo_path: Option<String>, // NEW
    pub description: Option<String>,
    pub developer: Option<String>,
    pub genre: Option<String>,
    pub source: String,
    pub added_at: String,
    pub installed_size: Option<u64>,
    pub install_dir: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub genres: Option<String>,
    pub tags: Option<String>,
    pub metacritic_score: Option<i32>,
    pub platforms: Option<String>,
    pub repack_info: Option<String>,
    pub run_as_admin: bool,
    pub manual_achievement_path: Option<String>,
    pub steam_app_id: Option<u32>,
    pub crack_type: Option<String>,
    pub app_id: Option<String>,
    pub detected_metadata_path: Option<String>,
    pub detected_earned_state_path: Option<String>,
    pub is_favorite: bool,
}

fn map_game_row(row: &rusqlite::Row) -> rusqlite::Result<Game> {
    Ok(Game {
        id: row.get::<_, String>(0)?,
        title: row.get::<_, String>(1)?,
        exe_path: row.get::<_, String>(2)?,
        playtime_seconds: row.get::<_, i64>(3)? as u64,
        last_played: row.get::<_, Option<String>>(4)?,
        cover_path: row.get::<_, Option<String>>(5)?,
        background_path: row.get::<_, Option<String>>(6)?,
        description: row.get::<_, Option<String>>(7)?,
        developer: row.get::<_, Option<String>>(8)?,
        genre: row.get::<_, Option<String>>(9)?,
        rating: row.get::<_, Option<f64>>(10)?,
        igdb_id: row.get::<_, Option<i64>>(11)?,
        steam_app_id: row.get::<_, Option<i32>>(12)?.map(|x| x as u32),
        source: row
            .get::<_, String>("source")
            .unwrap_or_else(|_| "manual".to_string()),
        added_at: row.get::<_, Option<String>>("added_at").unwrap_or(None),
        installed_size: row
            .get::<_, Option<i64>>("installed_size")
            .unwrap_or(None)
            .map(|x| x as u64),
        install_dir: row.get::<_, Option<String>>("install_dir").unwrap_or(None),
        publisher: row.get::<_, Option<String>>("publisher").unwrap_or(None),
        release_date: row.get::<_, Option<String>>("release_date").unwrap_or(None),
        genres: row.get::<_, Option<String>>("genres").unwrap_or(None),
        tags: row.get::<_, Option<String>>("tags").unwrap_or(None),
        metacritic_score: row
            .get::<_, Option<i32>>("metacritic_score")
            .unwrap_or(None),
        platforms: row.get::<_, Option<String>>("platforms").unwrap_or(None),
        repack_info: row.get::<_, Option<String>>("repack_info").unwrap_or(None),
        run_as_admin: row
            .get::<_, Option<i32>>("run_as_admin")
            .unwrap_or(Some(0))
            .unwrap_or(0)
            != 0,
        session_count: row
            .get::<_, Option<i32>>("session_count")
            .unwrap_or(None)
            .map(|x| x as u32),
        first_played: row.get::<_, Option<String>>("first_played").unwrap_or(None),
        achievements_unlocked: row
            .get::<_, Option<i32>>("achievements_unlocked")
            .unwrap_or(None)
            .map(|x| x as u32),
        achievements_total: row
            .get::<_, Option<i32>>("achievements_total")
            .unwrap_or(None)
            .map(|x| x as u32),
        manual_achievement_path: row
            .get::<_, Option<String>>("manual_achievement_path")
            .unwrap_or(None),
        crack_type: row.get::<_, Option<String>>("crack_type").unwrap_or(None),
        app_id: row.get::<_, Option<String>>("app_id").unwrap_or(None),
        detected_metadata_path: row
            .get::<_, Option<String>>("detected_metadata_path")
            .unwrap_or(None),
        detected_earned_state_path: row
            .get::<_, Option<String>>("detected_earned_state_path")
            .unwrap_or(None),
        logo_path: row.get::<_, Option<String>>("logo_path").unwrap_or(None),
        is_favorite: row.get::<_, Option<i32>>("is_favorite").unwrap_or(Some(0)).unwrap_or(0) != 0,
    })
}

pub fn get_all_games(pool: &Pool<SqliteConnectionManager>) -> anyhow::Result<Vec<Game>> {
    let conn = pool
        .get()
        .map_err(|e| anyhow::anyhow!("Pool error: {}", e))?;
    let mut stmt = conn.prepare("SELECT * FROM games")?;
    let iter = stmt.query_map([], map_game_row)?;
    let mut games = Vec::new();
    for g in iter {
        games.push(g?);
    }
    Ok(games)
}

#[allow(dead_code)]
pub fn get_game_by_id(
    pool: &Pool<SqliteConnectionManager>,
    id: &str,
) -> anyhow::Result<Option<Game>> {
    let conn = pool
        .get()
        .map_err(|e| anyhow::anyhow!("Pool error: {}", e))?;
    let mut stmt = conn.prepare("SELECT * FROM games WHERE id = ?1")?;
    let mut iter = stmt.query_map(params![id], map_game_row)?;
    if let Some(g) = iter.next() {
        return Ok(Some(g?));
    }
    Ok(None)
}

#[allow(dead_code)]
pub fn get_game_exe_map(
    pool: &Pool<SqliteConnectionManager>,
) -> anyhow::Result<HashMap<String, String>> {
    let conn = pool
        .get()
        .map_err(|e| anyhow::anyhow!("Pool error: {}", e))?;
    let mut stmt = conn.prepare("SELECT exe_path, id FROM games")?;
    let iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?.to_lowercase(),
            row.get::<_, String>(1)?,
        ))
    })?;
    let mut map = HashMap::new();
    for item in iter {
        let (path, id) = item?;
        map.insert(path, id);
    }
    Ok(map)
}

pub fn insert_game_conn(conn: &Connection, game: NewGame) -> rusqlite::Result<usize> {
    let title_key: String = game
        .title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();

    let (
        restored_secs, restored_sessions, restored_first, restored_last, restored_ach_unlocked, restored_ach_total,
    ): (i64, i64, Option<String>, Option<String>, i64, i64) = conn
        .query_row(
            "SELECT playtime_seconds, session_count, first_played, last_played, achievements_unlocked, achievements_total FROM playtime_orphans WHERE (steam_app_id = ?1 AND ?1 IS NOT NULL) OR title_key = ?2 ORDER BY playtime_seconds DESC LIMIT 1",
            params![game.steam_app_id.map(|x| x.to_string()), &title_key],
            |row| Ok((row.get::<_, i64>(0).unwrap_or(0), row.get::<_, i64>(1).unwrap_or(0), row.get::<_, Option<String>>(2).unwrap_or(None), row.get::<_, Option<String>>(3).unwrap_or(None), row.get::<_, i64>(4).unwrap_or(0), row.get::<_, i64>(5).unwrap_or(0))),
        )
        .unwrap_or((0, 0, None, None, 0, 0));

    conn.execute(
        "INSERT INTO games (
            id, title, exe_path, cover_path, background_path, description,
            developer, genre, source, added_at, installed_size, install_dir,
            publisher, release_date, genres, tags, metacritic_score, platforms,
            repack_info, run_as_admin, manual_achievement_path, steam_app_id,
            crack_type, app_id, playtime_seconds, session_count, first_played, last_played,
            achievements_unlocked, achievements_total, detected_metadata_path, detected_earned_state_path, logo_path,
            is_favorite
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
            ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34
         )",
        params![
            game.id, game.title, game.exe_path, game.cover_path, game.background_path, game.description,
            game.developer, game.genre, game.source, game.added_at, game.installed_size.map(|x| x as i64), game.install_dir,
            game.publisher, game.release_date, game.genres, game.tags, game.metacritic_score, game.platforms,
            game.repack_info, game.run_as_admin as i32, game.manual_achievement_path, game.steam_app_id,
            game.crack_type, game.app_id, restored_secs, restored_sessions, restored_first, restored_last,
            restored_ach_unlocked, restored_ach_total, game.detected_metadata_path, game.detected_earned_state_path, game.logo_path,
            game.is_favorite as i32
        ],
    )
}

pub fn delete_game_conn(conn: &Connection, id: &str) -> rusqlite::Result<usize> {
    let _ = conn.execute(
        "INSERT INTO playtime_orphans (steam_app_id, title_key, playtime_seconds, session_count, first_played, last_played, achievements_unlocked, achievements_total)
         SELECT CAST(steam_app_id AS TEXT), LOWER(REPLACE(REPLACE(REPLACE(title, ' ', '_'), '-', '_'), '.', '_')), COALESCE(playtime_seconds, 0), COALESCE(session_count, 0), first_played, last_played, COALESCE(achievements_unlocked, 0), COALESCE(achievements_total, 0)
         FROM games WHERE id = ?1
         ON CONFLICT(steam_app_id, title_key) DO UPDATE SET
             playtime_seconds = MAX(excluded.playtime_seconds, playtime_orphans.playtime_seconds),
             session_count = MAX(excluded.session_count, playtime_orphans.session_count),
             first_played = COALESCE(playtime_orphans.first_played, excluded.first_played),
             last_played = COALESCE(excluded.last_played, playtime_orphans.last_played),
             achievements_unlocked = MAX(excluded.achievements_unlocked, playtime_orphans.achievements_unlocked),
             achievements_total = MAX(excluded.achievements_total, playtime_orphans.achievements_total)",
        params![id],
    );
    conn.execute("DELETE FROM games WHERE id = ?1", params![id])
}

pub fn update_game_conn(conn: &Connection, game: Game) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE games SET 
            title = ?1, exe_path = ?2, cover_path = ?3, background_path = ?4, developer = ?5, 
            publisher = ?6, release_date = ?7, description = ?8, genre = ?9, steam_app_id = ?10,
            run_as_admin = ?11, manual_achievement_path = ?12, logo_path = ?13, is_favorite = ?14
         WHERE id = ?15",
        params![
            game.title,
            game.exe_path,
            game.cover_path,
            game.background_path,
            game.developer,
            game.publisher,
            game.release_date,
            game.description,
            game.genre,
            game.steam_app_id,
            game.run_as_admin as i32,
            game.manual_achievement_path,
            game.logo_path,
            game.is_favorite as i32,
            game.id
        ],
    )?;
    Ok(1)
}

pub fn update_assets_conn(
    conn: &Connection,
    id: &str,
    cover_path: Option<String>,
    background_path: Option<String>,
    logo_path: Option<String>,
) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE games SET cover_path = COALESCE(?1, cover_path), background_path = COALESCE(?2, background_path), logo_path = COALESCE(?3, logo_path) WHERE id = ?4",
        params![cover_path, background_path, logo_path, id],
    )
}

pub fn update_detected_achievement_paths_conn(
    conn: &Connection,
    game_id: &str,
    metadata_path: Option<String>,
    earned_state_path: Option<String>,
) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE games SET detected_metadata_path = ?1, detected_earned_state_path = ?2 WHERE id = ?3",
        params![metadata_path, earned_state_path, game_id],
    )
}

pub fn toggle_favorite_conn(conn: &Connection, id: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE games SET is_favorite = 1 - is_favorite WHERE id = ?1",
        params![id],
    )
}
