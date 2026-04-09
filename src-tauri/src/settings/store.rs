use crate::settings::AppSettings;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::OptionalExtension;
use rusqlite::params;

// Initialize the settings table
pub fn init_table(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    // 1. Base table creation (only oldest columns)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            theme TEXT NOT NULL DEFAULT 'dark',
            language TEXT NOT NULL DEFAULT 'en',
            download_path TEXT NOT NULL DEFAULT 'C:\\Downloads\\ChiraLauncher',
            auto_launch_on_boot BOOLEAN NOT NULL DEFAULT 0,
            minimize_to_tray BOOLEAN NOT NULL DEFAULT 1,
            enable_notifications BOOLEAN NOT NULL DEFAULT 1,
            volume_sfx INTEGER NOT NULL DEFAULT 80,
            volume_bgm INTEGER NOT NULL DEFAULT 50
        )",
        [],
    )?;

    // 2. Migrate: safely add all newer columns (fails silently if they already exist)
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN rawg_api_key TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN developer_mode BOOLEAN NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN max_download_speed_kbps INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN max_upload_speed_kbps INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN max_concurrent_downloads INTEGER NOT NULL DEFAULT 3", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN auto_add_to_library BOOLEAN NOT NULL DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN sequential_download BOOLEAN NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN steam_api_key TEXT NOT NULL DEFAULT ''", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN auto_fetch_achievements BOOLEAN NOT NULL DEFAULT 1", []);

    // 3. Now that schema is guaranteed fully up to date, insert default row
    conn.execute(
        "INSERT OR IGNORE INTO settings (
            id, theme, language, download_path, auto_launch_on_boot, 
            minimize_to_tray, enable_notifications, volume_sfx, volume_bgm,
            rawg_api_key, developer_mode, max_download_speed_kbps, max_upload_speed_kbps,
            max_concurrent_downloads, auto_add_to_library, sequential_download,
            steam_api_key, auto_fetch_achievements
        ) VALUES (1, 'dark', 'en', 'C:\\Downloads\\ChiraLauncher', 0, 1, 1, 80, 50, '', 0, 0, 0, 3, 1, 0, '', 1)",
        [],
    )?;

    Ok(())
}

pub fn get_settings(pool: &Pool<SqliteConnectionManager>) -> Result<AppSettings, rusqlite::Error> {
    let conn = pool.get().unwrap();

    let mut stmt = conn.prepare(
        "SELECT theme, language, download_path, auto_launch_on_boot, 
         minimize_to_tray, enable_notifications, volume_sfx, volume_bgm,
         developer_mode, max_download_speed_kbps, max_upload_speed_kbps,
         max_concurrent_downloads, auto_add_to_library, sequential_download,
         steam_api_key, auto_fetch_achievements
         FROM settings WHERE id = 1",
    )?;

    let settings = stmt
        .query_row([], |row| {
            Ok(AppSettings {
                theme: row.get(0)?,
                language: row.get(1)?,
                download_path: row.get(2)?,
                auto_launch_on_boot: row.get(3)?,
                minimize_to_tray: row.get(4)?,
                enable_notifications: row.get(5)?,
                volume_sfx: row.get(6)?,
                volume_bgm: row.get(7)?,
                developer_mode: row.get(8).unwrap_or_default(),
                max_download_speed_kbps: row.get(9).unwrap_or(0),
                max_upload_speed_kbps: row.get(10).unwrap_or(0),
                max_concurrent_downloads: row.get(11).unwrap_or(3),
                auto_add_to_library: row.get(12).unwrap_or(true),
                sequential_download: row.get(13).unwrap_or(false),
                steam_api_key: row.get(14).unwrap_or_default(),
                auto_fetch_achievements: row.get(15).unwrap_or(true),
            })
        })
        .optional()?
        .unwrap_or_default();

    Ok(settings)
}

pub fn update_settings(
    conn: &mut rusqlite::Connection,
    settings: &AppSettings,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE settings SET 
            theme = ?1, 
            language = ?2, 
            download_path = ?3, 
            auto_launch_on_boot = ?4, 
            minimize_to_tray = ?5, 
            enable_notifications = ?6, 
            volume_sfx = ?7, 
            volume_bgm = ?8,
            developer_mode = ?9,
            max_download_speed_kbps = ?10,
            max_upload_speed_kbps = ?11,
            max_concurrent_downloads = ?12,
            auto_add_to_library = ?13,
            sequential_download = ?14,
            steam_api_key = ?15,
            auto_fetch_achievements = ?16
         WHERE id = 1",
        params![
            &settings.theme,
            &settings.language,
            &settings.download_path,
            settings.auto_launch_on_boot,
            settings.minimize_to_tray,
            settings.enable_notifications,
            settings.volume_sfx,
            settings.volume_bgm,
            settings.developer_mode,
            settings.max_download_speed_kbps,
            settings.max_upload_speed_kbps,
            settings.max_concurrent_downloads,
            settings.auto_add_to_library,
            settings.sequential_download,
            &settings.steam_api_key,
            settings.auto_fetch_achievements,
        ],
    )?;
    tx.commit()?;
    Ok(())
}
