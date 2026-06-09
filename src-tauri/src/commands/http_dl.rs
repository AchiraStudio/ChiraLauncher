use reqwest::header::{CONTENT_LENGTH, RANGE};
use reqwest::Client;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::State;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::{broadcast, RwLock, Semaphore};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub url: String,
    pub save_path: String,
    pub filename: String,
    pub folder_name: Option<String>,
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
    db_path: PathBuf,
    /// Limits how many downloads run simultaneously — prevents CDN rate-limiting
    /// when the user queues a large batch (e.g. 112 links at once).
    semaphore: Arc<Semaphore>,
    /// The raw permit count, stored separately so we can read/change it.
    max_concurrent: Arc<AtomicUsize>,
}

// ── Persistence helpers ───────────────────────────────────────────────────────

impl HttpDownloadEngine {
    /// Upsert one task to the `http_downloads` table (runs on a blocking thread).
    async fn persist_task(&self, task: &DownloadItem) {
        let task = task.clone();
        let db_path = self.db_path.clone();
        let _ = tokio::task::spawn_blocking(move || -> rusqlite::Result<()> {
            let conn = rusqlite::Connection::open(&db_path)?;
            conn.execute(
                "INSERT OR REPLACE INTO http_downloads
                 (id, url, save_path, filename, folder_name,
                  status, downloaded_bytes, total_bytes, error_message)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    task.id,
                    task.url,
                    task.save_path,
                    task.filename,
                    task.folder_name,
                    task.status,
                    task.downloaded_bytes as i64,
                    task.total_bytes as i64,
                    task.error_message,
                ],
            )?;
            Ok(())
        })
        .await;
    }

    /// Remove one task row from the DB (runs on a blocking thread).
    async fn remove_task_from_db(&self, id: &str) {
        let id = id.to_string();
        let db_path = self.db_path.clone();
        let _ = tokio::task::spawn_blocking(move || -> rusqlite::Result<()> {
            let conn = rusqlite::Connection::open(&db_path)?;
            conn.execute("DELETE FROM http_downloads WHERE id = ?1", params![id])?;
            Ok(())
        })
        .await;
    }

    /// Load all persisted tasks from DB.  Any task that was mid-download when
    /// the app last closed is reset to "paused" so the user can resume it.
    pub fn load_persisted(db_path: &PathBuf) -> Vec<DownloadItem> {
        let conn = match rusqlite::Connection::open(db_path) {
            Ok(c) => c,
            Err(_) => return vec![],
        };
        let mut stmt = match conn.prepare(
            "SELECT id, url, save_path, filename, folder_name,
                    status, downloaded_bytes, total_bytes, error_message
             FROM http_downloads",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let rows = stmt.query_map([], |row| {
            let status: String = row.get(5)?;
            // If the app crashed / was updated mid-download, treat as paused
            let status = if status == "downloading" {
                "paused".to_string()
            } else {
                status
            };
            Ok(DownloadItem {
                id: row.get(0)?,
                url: row.get(1)?,
                save_path: row.get(2)?,
                filename: row.get(3)?,
                folder_name: row.get(4)?,
                status,
                downloaded_bytes: row.get::<_, i64>(6)? as u64,
                total_bytes: row.get::<_, i64>(7)? as u64,
                speed_bytes_per_sec: 0,
                error_message: row.get(8)?,
            })
        });
        match rows {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => vec![],
        }
    }
}

// ── Engine core ───────────────────────────────────────────────────────────────

impl HttpDownloadEngine {
    pub fn new(db_path: PathBuf) -> Self {
        // reqwest 0.12 does not enable gzip/deflate/brotli decompression by default,
        // so binary game archives are streamed raw — no Content-Encoding decode errors.
        let client = Client::builder()
            .build()
            .expect("Failed to build HTTP client");

        // Restore tasks that were in-flight when the app last closed
        let persisted = Self::load_persisted(&db_path);
        let mut tasks = HashMap::new();
        for item in persisted {
            tasks.insert(item.id.clone(), item);
        }

        // Default: 4 concurrent downloads — enough throughput without triggering
        // CDN rate-limits or flooding the connection pool when batching many links.
        const DEFAULT_CONCURRENT: usize = 4;

        Self {
            tasks: RwLock::new(tasks),
            cancel_txs: RwLock::new(HashMap::new()),
            client,
            db_path,
            semaphore: Arc::new(Semaphore::new(DEFAULT_CONCURRENT)),
            max_concurrent: Arc::new(AtomicUsize::new(DEFAULT_CONCURRENT)),
        }
    }

    pub async fn start_download(engine: Arc<Self>, id: String) {
        let (url, save_path, mut downloaded_bytes, total_bytes) = {
            let lock = engine.tasks.read().await;
            let task = match lock.get(&id) {
                Some(t) => t,
                None => return,
            };
            (task.url.clone(), task.save_path.clone(), task.downloaded_bytes, task.total_bytes)
        };

        let file_path = PathBuf::from(&save_path);

        // FAST-PATH: If we already have the complete file on disk, bypass queue and networking
        if total_bytes > 0 {
            if file_path.exists() {
                if let Ok(meta) = fs::metadata(&file_path).await {
                    if meta.len() >= total_bytes {
                        let mut lock = engine.tasks.write().await;
                        if let Some(task) = lock.get_mut(&id) {
                            task.status = "completed".to_string();
                            task.downloaded_bytes = task.total_bytes;
                            task.speed_bytes_per_sec = 0;
                            task.error_message = None;
                            engine.persist_task(task).await;
                        }
                        return;
                    }
                }
            }
        }

        // Create a unique cancellation channel for this specific stream
        let (cancel_tx, mut cancel_rx) = broadcast::channel(1);
        {
            let mut lock = engine.cancel_txs.write().await;
            lock.insert(id.clone(), cancel_tx);
        }

        // Mark as queued while waiting for a concurrency slot
        {
            let mut lock = engine.tasks.write().await;
            if let Some(task) = lock.get_mut(&id) {
                task.status = "queued".to_string();
                task.error_message = None;
                engine.persist_task(task).await;
            }
        }

        // ── Wait for a concurrency slot (respects cancellation) ──────────────
        let _permit = tokio::select! {
            biased;
            _ = cancel_rx.recv() => {
                // Cancelled while still in the queue — just stop cleanly
                let mut lock = engine.tasks.write().await;
                if let Some(task) = lock.get_mut(&id) {
                    task.speed_bytes_per_sec = 0;
                    engine.persist_task(task).await;
                }
                return;
            }
            permit = engine.semaphore.acquire() => {
                match permit {
                    Ok(p) => p,
                    Err(_) => return, // semaphore closed (app shutting down)
                }
            }
        };
        // _permit is held until this function returns — releases the slot automatically

        // We now own a concurrency slot — transition to active downloading
        {
            let mut lock = engine.tasks.write().await;
            if let Some(task) = lock.get_mut(&id) {
                task.status = "downloading".to_string();
                engine.persist_task(task).await;
            }
        }

        let file_path = PathBuf::from(&save_path);

        // Auto-retry loop: transparently handles transient CDN/network blips
        // (e.g. "error decoding response body" at high speeds) without user intervention.
        const MAX_RETRIES: u32 = 50;
        let mut attempt = 0u32;

        'retry: loop {
            attempt += 1;

            // Smart Resumption: always base the Range header on what's actually on disk
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

            // Check for cancellation before starting the network request
            if cancel_rx.try_recv().is_ok() {
                let mut lock = engine.tasks.write().await;
                if let Some(task) = lock.get_mut(&id) {
                    task.speed_bytes_per_sec = 0;
                    engine.persist_task(task).await;
                }
                return;
            }

            let mut response = match req.send().await {
                Ok(res) => {
                    // 206 Partial Content is success when we sent a Range header
                    if !res.status().is_success() && res.status().as_u16() != 206 {
                        let status_code = res.status().as_u16();
                        
                        if status_code == 416 {
                            // 416 Range Not Satisfiable: we might already have the full file
                            let mut lock = engine.tasks.write().await;
                            if let Some(task) = lock.get_mut(&id) {
                                if task.total_bytes > 0 && downloaded_bytes >= task.total_bytes {
                                    task.status = "completed".to_string();
                                    task.downloaded_bytes = task.total_bytes;
                                    task.speed_bytes_per_sec = 0;
                                    task.error_message = None;
                                    engine.persist_task(task).await;
                                    return;
                                }
                            }
                        }
                        
                        // If it's a 5xx server error or 429 Too Many Requests, auto-retry!
                        if status_code >= 500 || status_code == 429 {
                            if attempt >= MAX_RETRIES {
                                engine.set_failed(&id, format!("Server returned {} after {} attempts", status_code, attempt)).await;
                                return;
                            }
                            let delay_secs = (1u64 << (attempt - 1).min(5)).min(30);
                            {
                                let mut lock = engine.tasks.write().await;
                                if let Some(task) = lock.get_mut(&id) {
                                    task.error_message = Some(format!("HTTP {}, retrying in {}s… ({}/{})", status_code, delay_secs, attempt, MAX_RETRIES));
                                    task.speed_bytes_per_sec = 0;
                                }
                            }
                            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                            continue 'retry;
                        }

                        engine.set_failed(&id, format!("Server error: {}", res.status())).await;
                        return;
                    }
                    res
                }
                Err(e) => {
                    if attempt >= MAX_RETRIES {
                        engine.set_failed(&id, format!("Connection failed after {} attempts: {}", attempt, e)).await;
                        return;
                    }
                    // Exponential back-off before next attempt (capped at 30s)
                    let delay_secs = (1u64 << (attempt - 1).min(5)).min(30); // 1, 2, 4, 8, 16, 32... capped to 30s
                    {
                        let mut lock = engine.tasks.write().await;
                        if let Some(task) = lock.get_mut(&id) {
                            task.error_message = Some(format!("Retrying in {}s… (attempt {}/{})", delay_secs, attempt, MAX_RETRIES));
                            task.speed_bytes_per_sec = 0;
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                    continue 'retry;
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
                    task.error_message = None; // clear any "Retrying…" message
                    engine.persist_task(task).await;
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
            let mut bytes_since_update = 0u64;

            loop {
                tokio::select! {
                    biased;
                    _ = cancel_rx.recv() => {
                        // User requested pause/cancel — flush, stop cleanly
                        let _ = file.flush().await;
                        let mut lock = engine.tasks.write().await;
                        if let Some(task) = lock.get_mut(&id) {
                            task.speed_bytes_per_sec = 0;
                            task.downloaded_bytes = downloaded_bytes;
                            engine.persist_task(task).await;
                        }
                        return;
                    }
                    chunk = response.chunk() => {
                        match chunk {
                            Ok(Some(data)) => {
                                if let Err(e) = file.write_all(&data).await {
                                    engine.set_failed(&id, format!("Disk write error: {}", e)).await;
                                    return;
                                }
                                downloaded_bytes += data.len() as u64;
                                bytes_since_update += data.len() as u64;

                                // Throttle UI + DB updates to twice a second
                                if last_update.elapsed().as_millis() >= 500 {
                                    let speed = (bytes_since_update as f64 / last_update.elapsed().as_secs_f64()) as u64;
                                    last_update = std::time::Instant::now();
                                    bytes_since_update = 0;

                                    let mut lock = engine.tasks.write().await;
                                    if let Some(task) = lock.get_mut(&id) {
                                        task.downloaded_bytes = downloaded_bytes;
                                        task.speed_bytes_per_sec = speed;
                                        engine.persist_task(task).await;
                                    }
                                }
                            }
                            Ok(None) => {
                                // Stream finished successfully
                                let _ = file.flush().await;
                                let mut lock = engine.tasks.write().await;
                                if let Some(task) = lock.get_mut(&id) {
                                    task.status = "completed".to_string();
                                    task.downloaded_bytes = task.total_bytes;
                                    task.speed_bytes_per_sec = 0;
                                    task.error_message = None;
                                    engine.persist_task(task).await;
                                }
                                return; // fully done — exit the 'retry loop too
                            }
                            Err(e) => {
                                // Transient stream error — drop the file handle and retry
                                drop(file);
                                if attempt >= MAX_RETRIES {
                                    engine.set_failed(&id, format!("Network stream dropped after {} attempts: {}", attempt, e)).await;
                                    return;
                                }
                                let delay_secs = (1u64 << (attempt - 1).min(5)).min(30);
                                {
                                    let mut lock = engine.tasks.write().await;
                                    if let Some(task) = lock.get_mut(&id) {
                                        task.error_message = Some(format!("Stream interrupted, retrying in {}s… ({}/{})", delay_secs, attempt, MAX_RETRIES));
                                        task.speed_bytes_per_sec = 0;
                                    }
                                }
                                tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                                continue 'retry;
                            }
                        }
                    }
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
            self.persist_task(task).await;
        }
    }
}

// ── TAURI COMMANDS ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_http_downloads(
    urls: Vec<String>,
    save_paths: Vec<String>,
    folder_name: Option<String>,
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
            folder_name: folder_name.clone(),
            status: "pending".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_bytes_per_sec: 0,
            error_message: None,
        };

        engine.persist_task(&task).await;
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
        engine.persist_task(task).await;
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
        engine.persist_task(task).await;
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

    // Erase from DB
    engine.remove_task_from_db(&id).await;

    // Wipe the file off disk if requested
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
    // 1. Kill the old stream if it somehow still lives
    if let Some(tx) = engine.cancel_txs.read().await.get(&id) {
        let _ = tx.send(());
    }
    // Yield briefly so the old task's select! branch can fire before we reset state
    tokio::task::yield_now().await;

    // 2. Reset state to pending so it can queue/resume
    {
        let mut lock = engine.tasks.write().await;
        if let Some(task) = lock.get_mut(&id) {
            task.status = "pending".to_string();
            task.error_message = None;
            task.speed_bytes_per_sec = 0;
            // WE DO NOT RESET downloaded_bytes TO 0 HERE!
            // This allows the start_download function to read the existing file size and resume.
            engine.persist_task(task).await;
        } else {
            return Err("Task not found".to_string());
        }
    }

    // 3. Respawn the download with a fresh attempt counter
    let engine_clone = engine.inner().clone();
    tokio::spawn(async move {
        HttpDownloadEngine::start_download(engine_clone, id).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn resolve_premium_link(url: String) -> Result<(String, String), String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = res.text().await.map_err(|e| e.to_string())?;

    let mut title = String::new();
    if let Some(start) = html.find("<meta name=\"title\" content=\"") {
        let content_start = start + 28;
        if let Some(end) = html[content_start..].find('"') {
            title = html[content_start..content_start + end].to_string();
        }
    } else if let Some(start) = html.find("<meta name='title' content='") {
        let content_start = start + 28;
        if let Some(end) = html[content_start..].find('\'') {
            title = html[content_start..content_start + end].to_string();
        }
    }
    
    title = title.replace(&['\\', '/', '*', '?', ':', '"', '<', '>', '|'][..], "");
    if title.is_empty() {
        if let Some(last_seg) = url.split('/').last() {
            title = last_seg.to_string();
        }
    }

    let mut download_url = String::new();
    if let Some(func_start) = html.find("function download") {
        let chunk = &html[func_start..];
        if let Some(open_start) = chunk.find("window.open(\"") {
            let url_start = open_start + 13;
            if let Some(end) = chunk[url_start..].find('"') {
                download_url = chunk[url_start..url_start + end].to_string();
            }
        } else if let Some(open_start) = chunk.find("window.open('") {
            let url_start = open_start + 13;
            if let Some(end) = chunk[url_start..].find('\'') {
                download_url = chunk[url_start..url_start + end].to_string();
            }
        }
    }

    if download_url.is_empty() {
        return Err("Download URL not found in premium link".to_string());
    }

    Ok((title, download_url))
}

#[tauri::command]
pub async fn get_max_concurrent_downloads(
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<usize, String> {
    Ok(engine.max_concurrent.load(Ordering::Relaxed))
}

/// Change how many downloads can run at the same time.
/// Valid range: 1–16. Takes effect immediately for newly-unblocked tasks.
#[tauri::command]
pub async fn set_max_concurrent_downloads(
    limit: usize,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    let limit = limit.clamp(1, 16);
    let old = engine.max_concurrent.swap(limit, Ordering::Relaxed);

    match limit.cmp(&old) {
        std::cmp::Ordering::Greater => {
            // Add permits so more tasks can start immediately
            engine.semaphore.add_permits(limit - old);
        }
        std::cmp::Ordering::Less => {
            // Drain excess permits (only affects idle slots, not running downloads)
            let to_drain = old - limit;
            for _ in 0..to_drain {
                // try_acquire returns a permit that we immediately forget (drop = release,
                // but we acquired AND dropped without adding back, so the pool shrinks)
                if let Ok(permit) = engine.semaphore.try_acquire() {
                    permit.forget();
                }
            }
        }
        std::cmp::Ordering::Equal => {}
    }

    Ok(())
}