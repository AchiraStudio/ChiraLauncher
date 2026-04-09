use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    // 0. Ensure migration table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY
        )",
        [],
    )?;

    // Get current version
    let current_version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;

    // Migration 1: Initial schema
    if current_version < 1 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE games (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                exe_path TEXT NOT NULL,
                playtime_seconds INTEGER DEFAULT 0,
                last_played TEXT,
                cover_path TEXT,
                background_path TEXT,
                description TEXT,
                developer TEXT,
                genre TEXT,
                rating REAL,
                igdb_id INTEGER,
                steam_app_id INTEGER,
                custom_cover INTEGER DEFAULT 0,
                launch_args TEXT,
                install_dir TEXT
            )",
            [],
        )?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (1)", [])?;
        tx.commit()?;
    }

    // Migration 2: Achievements
    if current_version < 2 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE achievements (
                game_id TEXT NOT NULL,
                api_name TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                unlocked INTEGER DEFAULT 0,
                unlock_time TEXT,
                PRIMARY KEY (game_id, api_name)
            )",
            [],
        )?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (2)", [])?;
        tx.commit()?;
    }

    // Migration 3: Scan paths
    if current_version < 3 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE scan_paths (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                enabled INTEGER DEFAULT 1
            )",
            [],
        )?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (3)", [])?;
        tx.commit()?;
    }

    // Migration 4: Scanner tracking fields
    if current_version < 4 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "ALTER TABLE games ADD COLUMN source TEXT DEFAULT 'manual'",
            [],
        )?;
        tx.execute("ALTER TABLE games ADD COLUMN added_at TEXT", [])?;
        tx.execute("ALTER TABLE games ADD COLUMN installed_size INTEGER", [])?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (4)", [])?;
        tx.commit()?;
    }

    // Migration 5: Settings
    if current_version < 5 {
        crate::settings::init_table(conn)?;
        let tx = conn.unchecked_transaction()?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (5)", [])?;
        tx.commit()?;
    }

    // Migration 6: Update Settings Columns
    if current_version < 6 {
        crate::settings::init_table(conn)?;
        let tx = conn.unchecked_transaction()?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (6)", [])?;
        tx.commit()?;
    }

    // Migration 7: Add RAWG API Key
    if current_version < 7 {
        crate::settings::init_table(conn)?;
        let tx = conn.unchecked_transaction()?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (7)", [])?;
        tx.commit()?;
    }

    // Migration 8: RAWG Override & Metadata Cache
    if current_version < 8 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE IF NOT EXISTS metadata_cache (
                game_title TEXT PRIMARY KEY,
                rawg_id INTEGER NOT NULL,
                cover_url TEXT NOT NULL,
                description TEXT,
                developer TEXT,
                publisher TEXT,
                release_date TEXT,
                genres TEXT,
                tags TEXT,
                metacritic_score INTEGER,
                background_image TEXT,
                platforms TEXT,
                rating REAL,
                cached_at INTEGER NOT NULL
            )",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_game_title ON metadata_cache(game_title)",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_rawg_id ON metadata_cache(rawg_id)",
            [],
        )?;

        // Expand games table with RAWG metadata fields
        let _ = tx.execute("ALTER TABLE games ADD COLUMN publisher TEXT", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN release_date TEXT", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN genres TEXT", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN tags TEXT", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN metacritic_score INTEGER", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN platforms TEXT", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN repack_info TEXT", []);

        tx.execute("INSERT INTO schema_migrations (version) VALUES (8)", [])?;
        tx.commit()?;
    }

    // Migration 9: run_as_admin flag per game
    if current_version < 9 {
        let tx = conn.unchecked_transaction()?;
        let _ = tx.execute(
            "ALTER TABLE games ADD COLUMN run_as_admin INTEGER DEFAULT 0",
            [],
        );
        tx.execute("INSERT INTO schema_migrations (version) VALUES (9)", [])?;
        tx.commit()?;
    }

    // Migration 10: Folders
    if current_version < 10 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE IF NOT EXISTS folder_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL
            )",
            [],
        )?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (10)", [])?;
        tx.commit()?;
    }

    // Migration 11: Profiles
    if current_version < 11 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                steam_id TEXT,
                avatar_url TEXT,
                is_default INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (11)", [])?;
        tx.commit()?;
    }

    // Migration 12: OS Integration
    if current_version < 12 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE IF NOT EXISTS os_integration (
                game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
                has_desktop_shortcut INTEGER DEFAULT 0,
                has_start_menu_shortcut INTEGER DEFAULT 0,
                has_registry_entry INTEGER DEFAULT 0
            )",
            [],
        )?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (12)", [])?;
        tx.commit()?;
    }

    // Migration 13: Extensions (Themes & Plugins)
    if current_version < 13 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE IF NOT EXISTS extensions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                kind TEXT NOT NULL, -- 'theme' | 'plugin'
                checksum TEXT NOT NULL,
                enabled INTEGER DEFAULT 0,
                consent_given INTEGER DEFAULT 0,
                permissions TEXT -- JSON array of PluginPermission
            )",
            [],
        )?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (13)", [])?;
        tx.commit()?;
    }

    // Migration 14: Settings - Steam API and Achievement Toggles
    if current_version < 14 {
        crate::settings::init_table(conn)?;
        let tx = conn.unchecked_transaction()?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (14)", [])?;
        tx.commit()?;
    }

    // Migration 15: Game Stats columns
    if current_version < 15 {
        let tx = conn.unchecked_transaction()?;
        let _ = tx.execute("ALTER TABLE games ADD COLUMN session_count INTEGER DEFAULT 0", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN first_played TEXT", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN achievements_unlocked INTEGER DEFAULT 0", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN achievements_total INTEGER DEFAULT 0", []);
        
        tx.execute("INSERT INTO schema_migrations (version) VALUES (15)", [])?;
        tx.commit()?;
    }

    // Migration 16: Settings - Achievement Scan Roots
    if current_version < 16 {
        crate::settings::init_table(conn)?;
        let tx = conn.unchecked_transaction()?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (16)", [])?;
        tx.commit()?;
    }

    // Migration 17: Manual Achievement Path
    if current_version < 17 {
        let tx = conn.unchecked_transaction()?;
        let _ = tx.execute("ALTER TABLE games ADD COLUMN manual_achievement_path TEXT", []);
        tx.execute("INSERT INTO schema_migrations (version) VALUES (17)", [])?;
        tx.commit()?;
    }

    // Migration 18: Playtime orphans — preserve playtime when a game is deleted
    // so re-adding the same game by steam_app_id or title restores its history.
    if current_version < 18 {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "CREATE TABLE IF NOT EXISTS playtime_orphans (
                steam_app_id TEXT,
                title_key    TEXT,
                playtime_seconds INTEGER NOT NULL DEFAULT 0,
                session_count    INTEGER NOT NULL DEFAULT 0,
                first_played     TEXT,
                last_played      TEXT,
                PRIMARY KEY (steam_app_id, title_key)
            )",
            [],
        )?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (18)", [])?;
        tx.commit()?;
    }

    // Migration 19: Add achievement counts to playtime_orphans
    if current_version < 19 {
        let tx = conn.unchecked_transaction()?;
        let _ = tx.execute("ALTER TABLE playtime_orphans ADD COLUMN achievements_unlocked INTEGER NOT NULL DEFAULT 0", []);
        let _ = tx.execute("ALTER TABLE playtime_orphans ADD COLUMN achievements_total INTEGER NOT NULL DEFAULT 0", []);
        tx.execute("INSERT INTO schema_migrations (version) VALUES (19)", [])?;
        tx.commit()?;
    }

    // Migration 20: Crack detection fields (crack_type, app_id)
    if current_version < 20 {
        let tx = conn.unchecked_transaction()?;
        let _ = tx.execute("ALTER TABLE games ADD COLUMN crack_type TEXT", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN app_id     TEXT", []);
        tx.execute("INSERT INTO schema_migrations (version) VALUES (20)", [])?;
        tx.commit()?;
    }

    // Migration 21: Persistent detected achievement paths
    if current_version < 21 {
        let tx = conn.unchecked_transaction()?;
        let _ = tx.execute("ALTER TABLE games ADD COLUMN detected_metadata_path TEXT", []);
        let _ = tx.execute("ALTER TABLE games ADD COLUMN detected_earned_state_path TEXT", []);
        tx.execute("INSERT INTO schema_migrations (version) VALUES (21)", [])?;
        tx.commit()?;
    }

    Ok(())
}
