use crate::settings::AppSettings;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use rusqlite::OptionalExtension;

pub fn init_table(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
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

    // Safe schema migrations (Ignores errors if columns already exist)
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN rawg_api_key TEXT NOT NULL DEFAULT ''",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN developer_mode BOOLEAN NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN max_download_speed_kbps INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN max_upload_speed_kbps INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN max_concurrent_downloads INTEGER NOT NULL DEFAULT 3",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN auto_add_to_library BOOLEAN NOT NULL DEFAULT 1",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN sequential_download BOOLEAN NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN steam_api_key TEXT NOT NULL DEFAULT ''",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN auto_fetch_achievements BOOLEAN NOT NULL DEFAULT 1",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#22d3ee'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN launcher_bgm_path TEXT NOT NULL DEFAULT ''",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE settings ADD COLUMN default_ach_sound_path TEXT NOT NULL DEFAULT ''",
        [],
    );

    conn.execute(
        "INSERT OR IGNORE INTO settings (
            id, theme, language, download_path, auto_launch_on_boot, 
            minimize_to_tray, enable_notifications, volume_sfx, volume_bgm
        ) VALUES (1, 'dark', 'en', 'C:\\Downloads\\ChiraLauncher', 0, 1, 1, 80, 50)",
        [],
    )?;

    Ok(())
}

pub fn get_settings(pool: &Pool<SqliteConnectionManager>) -> Result<AppSettings, rusqlite::Error> {
    let conn = pool.get().unwrap();

    let _ = init_table(&conn);

    let mut stmt = conn.prepare("SELECT * FROM settings WHERE id = 1")?;

    let settings = stmt
        .query_row([], |row| {
            Ok(AppSettings {
                theme: row
                    .get::<&str, String>("theme")
                    .unwrap_or_else(|_| "dark".to_string()),
                language: row
                    .get::<&str, String>("language")
                    .unwrap_or_else(|_| "en".to_string()),
                download_path: row
                    .get::<&str, String>("download_path")
                    .unwrap_or_else(|_| "C:\\Downloads\\ChiraLauncher".to_string()),
                auto_launch_on_boot: row
                    .get::<&str, bool>("auto_launch_on_boot")
                    .unwrap_or(false),
                minimize_to_tray: row.get::<&str, bool>("minimize_to_tray").unwrap_or(true),
                enable_notifications: row
                    .get::<&str, bool>("enable_notifications")
                    .unwrap_or(true),
                volume_sfx: row.get::<&str, u32>("volume_sfx").unwrap_or(80),
                volume_bgm: row.get::<&str, u32>("volume_bgm").unwrap_or(50),
                developer_mode: row.get::<&str, bool>("developer_mode").unwrap_or(false),
                max_download_speed_kbps: row
                    .get::<&str, u32>("max_download_speed_kbps")
                    .unwrap_or(0),
                max_upload_speed_kbps: row.get::<&str, u32>("max_upload_speed_kbps").unwrap_or(0),
                max_concurrent_downloads: row
                    .get::<&str, u32>("max_concurrent_downloads")
                    .unwrap_or(3),
                auto_add_to_library: row.get::<&str, bool>("auto_add_to_library").unwrap_or(true),
                sequential_download: row
                    .get::<&str, bool>("sequential_download")
                    .unwrap_or(false),
                steam_api_key: row.get::<&str, String>("steam_api_key").unwrap_or_default(),
                auto_fetch_achievements: row
                    .get::<&str, bool>("auto_fetch_achievements")
                    .unwrap_or(true),
                accent_color: row
                    .get::<&str, String>("accent_color")
                    .unwrap_or_else(|_| "#22d3ee".to_string()),
                launcher_bgm_path: row
                    .get::<&str, String>("launcher_bgm_path")
                    .unwrap_or_default(),
                default_ach_sound_path: row
                    .get::<&str, String>("default_ach_sound_path")
                    .unwrap_or_default(),
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
            theme = ?1, language = ?2, download_path = ?3, auto_launch_on_boot = ?4, 
            minimize_to_tray = ?5, enable_notifications = ?6, volume_sfx = ?7, volume_bgm = ?8,
            developer_mode = ?9, max_download_speed_kbps = ?10, max_upload_speed_kbps = ?11,
            max_concurrent_downloads = ?12, auto_add_to_library = ?13, sequential_download = ?14,
            steam_api_key = ?15, auto_fetch_achievements = ?16, accent_color = ?17,
            launcher_bgm_path = ?18, default_ach_sound_path = ?19
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
            &settings.accent_color,
            &settings.launcher_bgm_path,
            &settings.default_ach_sound_path
        ],
    )?;
    tx.commit()?;
    Ok(())
}
