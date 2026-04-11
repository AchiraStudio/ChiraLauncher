pub mod achievements;
pub mod cleaner;
pub mod folder;
pub mod game;
pub mod import;
pub mod launcher;
pub mod metadata;
pub mod reset;
pub mod scanner;
pub mod torrent;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
