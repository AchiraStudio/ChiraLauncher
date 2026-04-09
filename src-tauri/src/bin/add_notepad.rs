use rusqlite::Connection;

fn main() {
    // Windows roaming app data path
    let app_data = std::env::var("APPDATA").unwrap();
    let db_path = format!(r"{}\com.achira.chira-launcher\data.db", app_data);

    let conn = Connection::open(&db_path).unwrap();

    conn.execute(
        "INSERT OR REPLACE INTO games (id, title, exe_path, playtime_seconds) VALUES (?1, ?2, ?3, 0)",
        ["mock-test", "Mock Game", r"e:\Codes\Rust\ChiraLauncher\ChiraLauncher\src-tauri\target\debug\mock_game.exe"],
    )
    .unwrap();

    println!("Inserted Mock Game into database.");
}
