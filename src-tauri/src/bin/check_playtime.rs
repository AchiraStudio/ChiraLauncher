use rusqlite::Connection;

fn main() {
    let app_data = std::env::var("APPDATA").unwrap();
    let db_path = format!(r"{}\com.achira.chira-launcher\data.db", app_data);

    let conn = Connection::open(&db_path).unwrap();

    let mut stmt = conn
        .prepare("SELECT title, playtime_seconds, last_played FROM games WHERE id = 'mock-test'")
        .unwrap();
    let iter = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .unwrap();

    for row in iter {
        let (title, playtime, last_played) = row.unwrap();
        println!(
            "Game: {} | Playtime: {}s | Last Played: {:?}",
            title, playtime, last_played
        );
    }
}
