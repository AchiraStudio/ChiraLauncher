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

    // Run migrations
    schema::run_migrations(&conn)?;

    Ok(())
}

pub fn create_read_pool(db_path: &Path) -> Pool<SqliteConnectionManager> {
    let manager = SqliteConnectionManager::file(db_path).with_flags(
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_FULL_MUTEX,
    );
    Pool::builder()
        .max_size(4)
        .build(manager)
        .expect("Failed to create read pool")
}
