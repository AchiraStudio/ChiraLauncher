use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::Path;
use tauri::Manager;

pub mod queries;
pub mod schema;
pub mod writer;

pub fn initialize(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("data.db");
    let conn = Connection::open(&db_path)?;

    // WAL before anything else opens the file: readers and the writer then never block each other
    // (previously WAL was only switched on later by the writer task, after the read pool existed).
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;

    // Run migrations
    schema::run_migrations(&conn)?;

    Ok(())
}

pub fn create_read_pool(db_path: &Path) -> Pool<SqliteConnectionManager> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_flags(rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_FULL_MUTEX)
        // Wait instead of failing with SQLITE_BUSY while the writer checkpoints; keep temp data in RAM.
        .with_init(|conn| conn.execute_batch("PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -8000;"));
    Pool::builder()
        .max_size(4)
        .build(manager)
        .expect("Failed to create read pool")
}
