use reqwest::header::{CONTENT_LENGTH, RANGE};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub url: String,
    pub save_path: String,
    pub filename: String,
    pub status: String, // "pending", "downloading", "paused", "completed", "failed", "cancelled"
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub error_message: Option<String>,
}

pub struct HttpDownloadEngine {
    pub tasks: RwLock<HashMap<String, DownloadItem>>,
    cancel_txs: RwLock<HashMap<String, broadcast::Sender<()>>>,
    client: Client,
}

impl HttpDownloadEngine {
    pub fn new() -> Self {
        Self {
            tasks: RwLock::new(HashMap::new()),
            cancel_txs: RwLock::new(HashMap::new()),
            client: Client::new(),
        }
    }

    pub async fn start_download(engine: Arc<Self>, id: String) {
        let (url, save_path, mut downloaded_bytes) = {
            let lock = engine.tasks.read().await;
            let task = match lock.get(&id) {
                Some(t) => t,
                None => return,
            };
            (task.url.clone(), task.save_path.clone(), task.downloaded_bytes)
        };

        // Create a unique cancellation channel for this specific stream
        let (cancel_tx, mut cancel_rx) = broadcast::channel(1);
        {
            let mut lock = engine.cancel_txs.write().await;
            lock.insert(id.clone(), cancel_tx);
        }

        {
            let mut lock = engine.tasks.write().await;
            if let Some(task) = lock.get_mut(&id) {
                task.status = "downloading".to_string();
                task.error_message = None;
            }
        }

        let file_path = PathBuf::from(&save_path);
        
        // Smart Resumption: Check if file already exists to append
        if file_path.exists() {
            if let Ok(meta) = fs::metadata(&file_path).await {
                downloaded_bytes = meta.len();
            }
        } else {
            downloaded_bytes = 0;
        }

        let req = if downloaded_bytes > 0 {
            engine.client.get(&url).header(RANGE, format!("bytes={}-", downloaded_bytes))
        } else {
            engine.client.get(&url)
        };

        let mut response = match req.send().await {
            Ok(res) => {
                if !res.status().is_success() {
                    engine.set_failed(&id, format!("Server error: {}", res.status())).await;
                    return;
                }
                res
            }
            Err(e) => {
                engine.set_failed(&id, format!("Connection failed: {}", e)).await;
                return;
            }
        };

        let total_bytes = response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|ct_len| ct_len.to_str().ok())
            .and_then(|ct_len| ct_len.parse::<u64>().ok())
            .unwrap_or(0) + downloaded_bytes;

        {
            let mut lock = engine.tasks.write().await;
            if let Some(task) = lock.get_mut(&id) {
                task.total_bytes = total_bytes;
                task.downloaded_bytes = downloaded_bytes;
            }
        }

        if let Some(parent) = file_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        let mut file = match OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
            .await
        {
            Ok(f) => f,
            Err(e) => {
                engine.set_failed(&id, format!("File lock error: {}", e)).await;
                return;
            }
        };

        let mut last_update = std::time::Instant::now();
        let mut bytes_since_update = 0;

        loop {
            tokio::select! {
                chunk = response.chunk() => {
                    match chunk {
                        Ok(Some(data)) => {
                            if let Err(e) = file.write_all(&data).await {
                                engine.set_failed(&id, format!("Disk write error: {}", e)).await;
                                return;
                            }
                            downloaded_bytes += data.len() as u64;
                            bytes_since_update += data.len() as u64;

                            // Throttle UI updates to twice a second to prevent React re-render lag
                            if last_update.elapsed().as_millis() >= 500 {
                                let speed = (bytes_since_update as f64 / last_update.elapsed().as_secs_f64()) as u64;
                                last_update = std::time::Instant::now();
                                bytes_since_update = 0;

                                let mut lock = engine.tasks.write().await;
                                if let Some(task) = lock.get_mut(&id) {
                                    task.downloaded_bytes = downloaded_bytes;
                                    task.speed_bytes_per_sec = speed;
                                }
                            }
                        }
                        Ok(None) => {
                            // Stream Finished
                            let mut lock = engine.tasks.write().await;
                            if let Some(task) = lock.get_mut(&id) {
                                task.status = "completed".to_string();
                                task.downloaded_bytes = task.total_bytes;
                                task.speed_bytes_per_sec = 0;
                            }
                            break;
                        }
                        Err(e) => {
                            engine.set_failed(&id, format!("Network stream dropped: {}", e)).await;
                            return;
                        }
                    }
                }
                _ = cancel_rx.recv() => {
                    // Instantly aborts the chunk stream and drops the file lock
                    let mut lock = engine.tasks.write().await;
                    if let Some(task) = lock.get_mut(&id) {
                        task.speed_bytes_per_sec = 0;
                    }
                    break;
                }
            }
        }
    }

    async fn set_failed(&self, id: &str, error: String) {
        let mut lock = self.tasks.write().await;
        if let Some(task) = lock.get_mut(id) {
            task.status = "failed".to_string();
            task.error_message = Some(error);
            task.speed_bytes_per_sec = 0;
        }
    }
}

// ── TAURI COMMANDS ──

#[tauri::command]
pub async fn add_http_downloads(
    urls: Vec<String>,
    save_paths: Vec<String>,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    for (url, save_path) in urls.into_iter().zip(save_paths.into_iter()) {
        let id = format!("dl_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
        let filename = std::path::Path::new(&save_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let task = DownloadItem {
            id: id.clone(),
            url,
            save_path,
            filename,
            status: "pending".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_bytes_per_sec: 0,
            error_message: None,
        };

        engine.tasks.write().await.insert(id.clone(), task);
        ids.push(id.clone());

        let engine_clone = engine.inner().clone();
        tokio::spawn(async move {
            HttpDownloadEngine::start_download(engine_clone, id).await;
        });
    }
    Ok(ids)
}

#[tauri::command]
pub async fn get_http_downloads(
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<Vec<DownloadItem>, String> {
    let lock = engine.tasks.read().await;
    Ok(lock.values().cloned().collect())
}

#[tauri::command]
pub async fn pause_http_download(
    id: String,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    // Abort the active stream
    if let Some(tx) = engine.cancel_txs.read().await.get(&id) {
        let _ = tx.send(());
    }
    let mut lock = engine.tasks.write().await;
    if let Some(task) = lock.get_mut(&id) {
        task.status = "paused".to_string();
        task.speed_bytes_per_sec = 0;
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_http_download(
    id: String,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    let engine_clone = engine.inner().clone();
    tokio::spawn(async move {
        HttpDownloadEngine::start_download(engine_clone, id).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn cancel_http_download(
    id: String,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    if let Some(tx) = engine.cancel_txs.read().await.get(&id) {
        let _ = tx.send(());
    }
    let mut lock = engine.tasks.write().await;
    if let Some(task) = lock.get_mut(&id) {
        task.status = "cancelled".to_string();
        task.speed_bytes_per_sec = 0;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_http_download(
    id: String,
    delete_file: bool,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    // Force abort if it's currently running
    if let Some(tx) = engine.cancel_txs.read().await.get(&id) {
        let _ = tx.send(());
    }
    
    // Remove from active tasks and get the path
    let path_to_delete = {
        let mut lock = engine.tasks.write().await;
        if let Some(task) = lock.remove(&id) {
            task.save_path
        } else {
            return Err("Task not found".to_string());
        }
    };

    // Wipe the corrupted/unwanted file off the disk
    if delete_file {
        let _ = tokio::fs::remove_file(path_to_delete).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn retry_http_download(
    id: String,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    // 1. Ensure the stream is totally dead
    if let Some(tx) = engine.cancel_txs.read().await.get(&id) {
        let _ = tx.send(());
    }

    // 2. Wipe the corrupted file to start fresh, and reset state
    {
        let mut lock = engine.tasks.write().await;
        if let Some(task) = lock.get_mut(&id) {
            task.status = "pending".to_string();
            task.error_message = None;
            task.downloaded_bytes = 0;
            task.speed_bytes_per_sec = 0;
            
            let _ = std::fs::remove_file(&task.save_path);
        }
    }

    // 3. Respawn the download
    let engine_clone = engine.inner().clone();
    tokio::spawn(async move {
        HttpDownloadEngine::start_download(engine_clone, id).await;
    });

    Ok(())
}