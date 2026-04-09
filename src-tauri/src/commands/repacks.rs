use std::fs;
use tauri::{AppHandle, Manager};

/// Load fitgirl repack data from app_data_dir.
/// On first run (or if deleted), seeds the file from the bundled resource.
#[tauri::command]
pub async fn load_repacks(app: AppHandle) -> Result<serde_json::Value, String> {
    let filename = "repacks-fitgirl-enriched.json";
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dest = data_dir.join(filename);

    // If the file doesn't exist in app_data_dir, seed it from the bundled resource
    if !dest.exists() {
        // First try the bundled resource directory
        let resource_path = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join(filename);

        if resource_path.exists() {
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            fs::copy(&resource_path, &dest).map_err(|e| e.to_string())?;
            log::info!("Seeded {} from resources to app_data_dir", filename);
        } else {
            // Dev fallback: try to read from the public dir (sibling to src-tauri)
            let dev_path = std::env::current_dir()
                .ok()
                .map(|d| {
                    // Walk up from src-tauri to game-launcher, then into public/
                    d.parent()
                        .map(|p| p.join("public").join(filename))
                        .or_else(|| Some(d.join("../public").join(filename)))
                })
                .flatten();

            if let Some(p) = dev_path.filter(|p| p.exists()) {
                fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
                fs::copy(&p, &dest).map_err(|e| e.to_string())?;
                log::info!("Dev: Seeded {} from public/ to app_data_dir", filename);
            } else {
                log::warn!("Repack JSON not found in resource_dir or public/. Returning empty.");
                return Ok(serde_json::json!([]));
            }
        }
    }

    let contents = fs::read_to_string(&dest).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

/// Fetch a fresh JSON from a remote URL and overwrite the local copy.
#[tauri::command]
pub async fn refresh_repacks(app: AppHandle, url: String) -> Result<(), String> {
    let filename = "repacks-fitgirl-enriched.json";
    let dest = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(filename);

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = res.text().await.map_err(|e| e.to_string())?;

    // Validate JSON before overwriting
    let _parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid JSON: {}", e))?;

    fs::write(&dest, text).map_err(|e| e.to_string())?;
    log::info!("Refreshed {} from remote URL", filename);
    Ok(())
}
