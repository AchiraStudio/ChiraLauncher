use notify::{Watcher, RecursiveMode, Config, Event};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{Emitter, Manager};
use std::fs;
use std::path::Path;
use sha2::{Sha256, Digest};
use serde::{Serialize, Deserialize};
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExtensionKind {
    Theme,
    Plugin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PluginPermission {
    ReadLibrary,
    LaunchGame,
    Notifications,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionManifest {
    pub id: String,          
    pub name: String,
    pub version: String,
    pub author: String,
    pub kind: ExtensionKind,
    pub entry: String,       
    pub permissions: Vec<PluginPermission>,
    pub checksum: String,    
}

pub fn start_watcher(app: tauri::AppHandle) -> Result<()> {
    let app_dir = app.path().app_data_dir()?;
    let extensions_dir = app_dir.join("extensions");
    if !extensions_dir.exists() {
        fs::create_dir_all(&extensions_dir)?;
    }

    let (tx, rx) = mpsc::channel();
    let mut watcher = notify::RecommendedWatcher::new(tx, Config::default())?;
    watcher.watch(&extensions_dir, RecursiveMode::Recursive)?;

    std::thread::spawn(move || {
        let mut last_emit = std::time::Instant::now();
        for res in rx {
            match res {
                Ok(event) => {
                    // 300ms Debounce
                    if last_emit.elapsed() < Duration::from_millis(300) { continue; }
                    
                    if is_relevant_event(&event) {
                        for path in event.paths {
                            if let Some(ext) = path.extension() {
                                if ext == "css" {
                                    if let Ok(content) = fs::read_to_string(&path) {
                                        if validate_css(&content) {
                                            let _ = app.emit("theme-changed", content);
                                            last_emit = std::time::Instant::now();
                                        } else {
                                            let _ = app.emit("theme-error", "Invalid CSS: Unbalanced braces");
                                        }
                                    }
                                } else if ext == "js" {
                                    let _ = app.emit("plugin-changed", path.to_string_lossy());
                                    last_emit = std::time::Instant::now();
                                }
                            }
                        }
                    }
                }
                Err(e) => log::error!("Watcher error: {:?}", e),
            }
        }
    });

    Ok(())
}

fn is_relevant_event(event: &Event) -> bool {
    event.kind.is_modify() || event.kind.is_create()
}

fn validate_css(css: &str) -> bool {
    let mut open = 0;
    for c in css.chars() {
        if c == '{' { open += 1; }
        else if c == '}' { open -= 1; }
        if open < 0 { return false; }
    }
    open == 0
}

#[tauri::command]
pub async fn install_extension(
    app: tauri::AppHandle,
    source_path: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<crate::state::ExtensionInfo, String> {
    let source = Path::new(&source_path);
    let manifest_path = source.join("manifest.json");
    if !manifest_path.exists() {
        return Err("manifest.json not found in source directory".to_string());
    }

    let content = fs::read_to_string(manifest_path).map_err(|e| e.to_string())?;
    let manifest: ExtensionManifest = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target_dir = app_dir.join("extensions").join(&manifest.id);
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    // Copy directory content
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dest = target_dir.join(entry.file_name());
        fs::copy(entry.path(), dest).map_err(|e| e.to_string())?;
    }

    // Verify checksum of entry file
    let entry_file = target_dir.join(&manifest.entry);
    let bytes = fs::read(entry_file).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual_checksum = hex::encode(hasher.finalize());

    if actual_checksum != manifest.checksum {
        return Err(format!("Checksum mismatch! Manifest expects {}, but file has {}. Potential tampering.", manifest.checksum, actual_checksum));
    }

    let info = crate::state::ExtensionInfo {
        id: manifest.id.clone(),
        name: manifest.name.clone(),
        version: manifest.version.clone(),
        kind: match manifest.kind {
            ExtensionKind::Theme => "theme".to_string(),
            ExtensionKind::Plugin => "plugin".to_string(),
        },
        checksum: actual_checksum,
        enabled: false,
        consent_given: false,
        permissions: manifest.permissions,
    };

    state.db_tx.send(crate::state::DbWrite::Extensions(crate::state::ExtensionDbWrite::UpdateExtension(info.clone()))).ok();

    Ok(info)
}

#[tauri::command]
pub async fn get_extensions(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<Vec<crate::state::ExtensionInfo>, String> {
    let pool = state.read_pool.clone();
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT id, name, version, kind, checksum, enabled, consent_given, permissions FROM extensions")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(crate::state::ExtensionInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            version: row.get(2)?,
            kind: row.get(3)?,
            checksum: row.get(4)?,
            enabled: row.get::<_, i32>(5)? != 0,
            consent_given: row.get::<_, i32>(6)? != 0,
            permissions: row.get::<_, Option<String>>(7)?
                .map(|p| serde_json::from_str(&p).unwrap_or_default())
                .unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn toggle_extension(
    extension_id: String,
    enabled: bool,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<(), String> {
    let pool = state.read_pool.clone();
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    // Fetch current info to update
    let mut stmt = conn
        .prepare("SELECT id, name, version, kind, checksum, enabled, consent_given, permissions FROM extensions WHERE id = ?")
        .map_err(|e| e.to_string())?;
    
    let mut info = stmt.query_row([&extension_id], |row| {
        Ok(crate::state::ExtensionInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            version: row.get(2)?,
            kind: row.get(3)?,
            checksum: row.get(4)?,
            enabled: row.get::<_, i32>(5)? != 0,
            consent_given: row.get::<_, i32>(6)? != 0,
            permissions: row.get::<_, Option<String>>(7)?
                .map(|p| serde_json::from_str(&p).unwrap_or_default())
                .unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?;

    info.enabled = enabled;
    state.db_tx.send(crate::state::DbWrite::Extensions(crate::state::ExtensionDbWrite::UpdateExtension(info))).ok();
    
    Ok(())
}

#[tauri::command]
pub async fn read_extension_file(
    app: tauri::AppHandle,
    extension_id: String,
    file_name: String,
) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = app_dir.join("extensions").join(&extension_id).join(&file_name);
    
    if !file_path.exists() {
        return Err("File not found".to_string());
    }

    fs::read_to_string(file_path).map_err(|e| e.to_string())
}
