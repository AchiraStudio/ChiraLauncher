pub mod achievements;
pub mod cleaner;
pub mod folder;
pub mod game;
pub mod http_dl;
pub mod import;
pub mod launcher;
pub mod metadata;
pub mod reset;
pub mod scanner;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}