#![allow(dead_code)]

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn upload_custom_cover(
    _game_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state
        .image_cache
        .upload_custom_cover(&file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upload_custom_background(
    _game_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state
        .image_cache
        .upload_custom_background(&file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_fitgirl_repacks() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!([]))
}

#[tauri::command]
pub async fn read_image_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("jpg")
        .to_lowercase();

    let mime = match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// NEW: Steam Metadata Fetchers
#[tauri::command]
pub async fn fetch_steam_app_details(app_id: String) -> Result<serde_json::Value, String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}",
        app_id
    );
    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
pub async fn fetch_steam_reviews(app_id: String) -> Result<serde_json::Value, String> {
    let url = format!(
        "https://store.steampowered.com/appreviews/{}?json=1",
        app_id
    );
    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
pub async fn fetch_global_achievement_percentages(app_id: String) -> Result<serde_json::Value, String> {
    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={}",
        app_id
    );
    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}
