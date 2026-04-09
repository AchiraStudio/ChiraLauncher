use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use futures::stream::{self, StreamExt};
use std::fs;
use reqwest::Client;
use std::pin::Pin;
use std::future::Future;

#[derive(Serialize)]
pub struct FetchResult {
    pub count: usize,
    pub has_global_pcts: bool,
}

#[derive(Serialize)]
pub struct GoldbergAchievement {
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub description: String,
    pub icon: String,
    #[serde(rename = "icongray")]
    pub icon_gray: String,
    pub hidden: i32,
    #[serde(rename = "globalPercent")]
    pub global_percent: Option<f32>,
}

async fn fetch_global_pcts(client: &Client, app_id: &str) -> HashMap<String, f32> {
    let url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={}",
        app_id
    );
    
    let Ok(res) = client.get(&url).send().await else { return HashMap::new(); };
    let Ok(json) = res.json::<serde_json::Value>().await else { return HashMap::new(); };
    
    let mut map = HashMap::new();
    if let Some(stats) = json.get("achievementpercentages")
        .and_then(|a| a.get("achievements"))
        .and_then(|a| a.as_array())
    {
        for stat in stats {
            if let (Some(name), Some(pct)) = (
                stat.get("name").and_then(|n| n.as_str()),
                stat.get("percent").and_then(|p| p.as_f64())
            ) {
                map.insert(name.to_string(), pct as f32);
            }
        }
    }
    map
}

async fn download_icon(client: &Client, url: &str, out_path: &PathBuf) -> Result<(), String> {
    if out_path.exists() { return Ok(()); }
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(out_path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_and_write_achievements(
    app_id: String,
    game_dir: String,
    api_key: String,
) -> Result<FetchResult, String> {
    let client = Client::new();
    
    let schema_url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key={}&appid={}",
        api_key, app_id
    );

    let (schema_res, global_pcts) = tokio::join!(
        client.get(&schema_url).send(),
        fetch_global_pcts(&client, &app_id)
    );

    let schema: serde_json::Value = schema_res
        .map_err(|e| format!("Failed to fetch schema: {}", e))?
        .json().await
        .map_err(|e| format!("Failed to parse schema JSON: {}", e))?;

    let available = schema.get("game")
        .and_then(|g| g.get("availableGameStats"))
        .and_then(|s| s.get("achievements"))
        .and_then(|a| a.as_array())
        .ok_or_else(|| "No achievements found in schema".to_string())?;

    let base_dir = PathBuf::from(&game_dir).join("steam_settings");
    let img_dir = base_dir.join("achievement_images");
    fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;

    let mut download_tasks: Vec<Pin<Box<dyn Future<Output = Result<(), String>> + Send>>> = Vec::new();
    let mut goldberg_achievements = Vec::new();

    for ach in available {
        let name = ach.get("name").and_then(|n| n.as_str()).unwrap_or_default().to_string();
        let display_name = ach.get("displayName").and_then(|n| n.as_str()).unwrap_or_default().to_string();
        let description = ach.get("description").and_then(|n| n.as_str()).unwrap_or_default().to_string();
        let hidden = ach.get("hidden").and_then(|h| h.as_i64()).unwrap_or(0) as i32;
        let icon_url = ach.get("icon").and_then(|u| u.as_str()).unwrap_or_default().to_string();
        let icongray_url = ach.get("icongray").and_then(|u| u.as_str()).unwrap_or_default().to_string();

        let icon_filename = format!("{}.jpg", name);
        let icongray_filename = format!("{}_gray.jpg", name);
        
        let icon_path = img_dir.join(&icon_filename);
        let icongray_path = img_dir.join(&icongray_filename);

        if !icon_url.is_empty() {
            let client_cl = client.clone();
            let url_cl = icon_url.clone();
            let path_cl = icon_path.clone();
            download_tasks.push(Box::pin(async move { download_icon(&client_cl, &url_cl, &path_cl).await }));
        }
        if !icongray_url.is_empty() {
            let client_cl = client.clone();
            let url_cl = icongray_url.clone();
            let path_cl = icongray_path.clone();
            download_tasks.push(Box::pin(async move { download_icon(&client_cl, &url_cl, &path_cl).await }));
        }

        goldberg_achievements.push(GoldbergAchievement {
            name: name.clone(),
            display_name,
            description,
            icon: format!("achievement_images/{}", icon_filename),
            icon_gray: format!("achievement_images/{}", icongray_filename),
            hidden,
            global_percent: global_pcts.get(&name).copied(),
        });
    }

    // Download icons concurrently
    let _ = stream::iter(download_tasks)
        .buffer_unordered(5)
        .collect::<Vec<_>>()
        .await;

    // Write achievements.json
    let json_bytes = serde_json::to_vec_pretty(&goldberg_achievements).map_err(|e| e.to_string())?;
    fs::write(base_dir.join("achievements.json"), json_bytes).map_err(|e| e.to_string())?;

    // Write steam_appid.txt if missing
    let appid_path = base_dir.join("steam_appid.txt");
    if !appid_path.exists() {
        fs::write(appid_path, app_id).ok();
    }

    Ok(FetchResult {
        count: goldberg_achievements.len(),
        has_global_pcts: !global_pcts.is_empty(),
    })
}

#[tauri::command]
pub async fn validate_steam_api_key(api_key: String) -> Result<bool, String> {
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={}&steamids=76561197960435530",
        api_key
    );
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    Ok(res.status().is_success())
}
