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
    pub original_url: Option<String>,
    pub save_path: String,
    pub filename: String,
    pub folder_name: Option<String>,
    pub status: String, // "pending", "queued", "downloading", "paused", "completed", "failed", "cancelled"
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResolvedLinkInfo {
    pub title: String,
    pub download_url: String,
    pub file_size: u64,
}

pub struct HttpDownloadEngine {
    pub tasks: RwLock<HashMap<String, DownloadItem>>,
    cancel_txs: RwLock<HashMap<String, broadcast::Sender<()>>>,
    client: Client,
    db_path: PathBuf,
    semaphore: Arc<Semaphore>,
    max_concurrent: Arc<AtomicUsize>,
}

impl HttpDownloadEngine {
    async fn persist_task(&self, task: &DownloadItem) {
        let task = task.clone();
        let db_path = self.db_path.clone();
        let _ = tokio::task::spawn_blocking(move || -> rusqlite::Result<()> {
            let conn = rusqlite::Connection::open(&db_path)?;
            conn.execute(
                "CREATE TABLE IF NOT EXISTS http_downloads (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    original_url TEXT,
                    save_path TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    folder_name TEXT,
                    status TEXT NOT NULL,
                    downloaded_bytes INTEGER NOT NULL,
                    total_bytes INTEGER NOT NULL,
                    error_message TEXT
                )",
                [],
            )?;
            let _ = conn.execute("ALTER TABLE http_downloads ADD COLUMN original_url TEXT", []);
            conn.execute(
                "INSERT OR REPLACE INTO http_downloads
                 (id, url, original_url, save_path, filename, folder_name, status, downloaded_bytes, total_bytes, error_message)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    task.id,
                    task.url,
                    task.original_url,
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

    pub fn load_persisted(db_path: &PathBuf) -> Vec<DownloadItem> {
        let conn = match rusqlite::Connection::open(db_path) {
            Ok(c) => c,
            Err(_) => return vec![],
        };
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS http_downloads (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                original_url TEXT,
                save_path TEXT NOT NULL,
                filename TEXT NOT NULL,
                folder_name TEXT,
                status TEXT NOT NULL,
                downloaded_bytes INTEGER NOT NULL,
                total_bytes INTEGER NOT NULL,
                error_message TEXT
            )",
            [],
        );
        let _ = conn.execute("ALTER TABLE http_downloads ADD COLUMN original_url TEXT", []);
        let mut stmt = match conn.prepare(
            "SELECT id, url, original_url, save_path, filename, folder_name, status, downloaded_bytes, total_bytes, error_message
             FROM http_downloads",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let rows = stmt.query_map([], |row| {
            let status: String = row.get(6)?;
            let status = if status == "downloading" || status == "queued" {
                "paused".to_string()
            } else {
                status
            };
            Ok(DownloadItem {
                id: row.get(0)?,
                url: row.get(1)?,
                original_url: row.get(2)?,
                save_path: row.get(3)?,
                filename: row.get(4)?,
                folder_name: row.get(5)?,
                status,
                downloaded_bytes: row.get::<_, i64>(7)? as u64,
                total_bytes: row.get::<_, i64>(8)? as u64,
                speed_bytes_per_sec: 0,
                error_message: row.get(9)?,
            })
        });
        match rows {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => vec![],
        }
    }

    pub fn new(db_path: PathBuf, initial_concurrent: usize) -> Self {
        let client = Client::builder()
            .build()
            .expect("Failed to build HTTP client");

        let persisted = Self::load_persisted(&db_path);
        let mut tasks = HashMap::new();
        for item in persisted {
            tasks.insert(item.id.clone(), item);
        }

        let concurrent = initial_concurrent.clamp(1, 16);
        Self {
            tasks: RwLock::new(tasks),
            cancel_txs: RwLock::new(HashMap::new()),
            client,
            db_path,
            semaphore: Arc::new(Semaphore::new(concurrent)),
            max_concurrent: Arc::new(AtomicUsize::new(concurrent)),
        }
    }

    pub async fn start_download(engine: Arc<Self>, id: String) {
        let (mut url, save_path, mut downloaded_bytes, total_bytes) = {
            let lock = engine.tasks.read().await;
            let task = match lock.get(&id) {
                Some(t) => t,
                None => return,
            };
            (task.url.clone(), task.save_path.clone(), task.downloaded_bytes, task.total_bytes)
        };

        let file_path = PathBuf::from(&save_path);

        if total_bytes > 0 && file_path.exists() {
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

        let (cancel_tx, mut cancel_rx) = broadcast::channel(1);
        {
            let mut lock = engine.cancel_txs.write().await;
            lock.insert(id.clone(), cancel_tx);
        }

        {
            let mut lock = engine.tasks.write().await;
            if let Some(task) = lock.get_mut(&id) {
                task.status = "queued".to_string();
                task.error_message = None;
                engine.persist_task(task).await;
            }
        }

        let _permit = tokio::select! {
            biased;
            _ = cancel_rx.recv() => {
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
                    Err(_) => return,
                }
            }
        };

        {
            let mut lock = engine.tasks.write().await;
            if let Some(task) = lock.get_mut(&id) {
                task.status = "downloading".to_string();
                engine.persist_task(task).await;
            }
        }

        const MAX_RETRIES: u32 = 50;
        let mut attempt = 0u32;

        'retry: loop {
            attempt += 1;

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
                    if !res.status().is_success() && res.status().as_u16() != 206 {
                        let status_code = res.status().as_u16();

                        if status_code == 403 || status_code == 404 || status_code == 410 {
                            let orig_url = {
                                let lock = engine.tasks.read().await;
                                lock.get(&id).and_then(|t| t.original_url.clone())
                            };
                            if let Some(orig) = orig_url {
                                {
                                    let mut lock = engine.tasks.write().await;
                                    if let Some(task) = lock.get_mut(&id) {
                                        task.error_message = Some("Link expired. Auto-resolving fresh URL...".to_string());
                                        task.speed_bytes_per_sec = 0;
                                    }
                                }
                                if let Ok(info) = resolve_link(orig).await {
                                    url = info.download_url.clone();
                                    let mut lock = engine.tasks.write().await;
                                    if let Some(task) = lock.get_mut(&id) {
                                        task.url = info.download_url;
                                        task.error_message = None;
                                        engine.persist_task(task).await;
                                    }
                                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                    continue 'retry;
                                }
                            }
                        }

                        if status_code >= 500 || status_code == 429 {
                            if attempt >= MAX_RETRIES {
                                engine.set_failed(&id, format!("Server error HTTP {} after {} attempts", status_code, attempt)).await;
                                return;
                            }
                            let delay_secs = (1u64 << (attempt - 1).min(5)).min(30);
                            {
                                let mut lock = engine.tasks.write().await;
                                if let Some(task) = lock.get_mut(&id) {
                                    task.error_message = Some(format!("HTTP {}, retrying in {}s... ({}/{})", status_code, delay_secs, attempt, MAX_RETRIES));
                                    task.speed_bytes_per_sec = 0;
                                }
                            }
                            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                            continue 'retry;
                        }

                        engine.set_failed(&id, format!("Server error HTTP {}", status_code)).await;
                        return;
                    }
                    res
                }
                Err(e) => {
                    if attempt >= MAX_RETRIES {
                        engine.set_failed(&id, format!("Connection failed after {} attempts: {}", attempt, e)).await;
                        return;
                    }
                    let delay_secs = (1u64 << (attempt - 1).min(5)).min(30);
                    {
                        let mut lock = engine.tasks.write().await;
                        if let Some(task) = lock.get_mut(&id) {
                            task.error_message = Some(format!("Retrying in {}s... ({}/{})", delay_secs, attempt, MAX_RETRIES));
                            task.speed_bytes_per_sec = 0;
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                    continue 'retry;
                }
            };

            let content_len = response
                .headers()
                .get(CONTENT_LENGTH)
                .and_then(|ct_len| ct_len.to_str().ok())
                .and_then(|ct_len| ct_len.parse::<u64>().ok())
                .unwrap_or(0);

            let new_total_bytes = if content_len > 0 { content_len + downloaded_bytes } else { total_bytes };

            {
                let mut lock = engine.tasks.write().await;
                if let Some(task) = lock.get_mut(&id) {
                    task.total_bytes = new_total_bytes;
                    task.downloaded_bytes = downloaded_bytes;
                    task.error_message = None;
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
                    engine.set_failed(&id, format!("File open error: {}", e)).await;
                    return;
                }
            };

            let mut last_update = std::time::Instant::now();
            let mut bytes_since_update = 0u64;

            loop {
                tokio::select! {
                    biased;
                    _ = cancel_rx.recv() => {
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
                                let _ = file.flush().await;
                                let mut lock = engine.tasks.write().await;
                                if let Some(task) = lock.get_mut(&id) {
                                    task.status = "completed".to_string();
                                    task.downloaded_bytes = if task.total_bytes > 0 { task.total_bytes } else { downloaded_bytes };
                                    task.speed_bytes_per_sec = 0;
                                    task.error_message = None;
                                    engine.persist_task(task).await;
                                }
                                return;
                            }
                            Err(e) => {
                                drop(file);
                                if attempt >= MAX_RETRIES {
                                    engine.set_failed(&id, format!("Stream interruped after {} attempts: {}", attempt, e)).await;
                                    return;
                                }
                                let delay_secs = (1u64 << (attempt - 1).min(5)).min(30);
                                {
                                    let mut lock = engine.tasks.write().await;
                                    if let Some(task) = lock.get_mut(&id) {
                                        task.error_message = Some(format!("Stream interrupted, retrying in {}s... ({}/{})", delay_secs, attempt, MAX_RETRIES));
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
pub async fn resolve_link(url: String) -> Result<ResolvedLinkInfo, String> {
    let url_trimmed = url.trim();
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    
    // Search for ffresolver.py in cwd, cwd.parent(), or exe directory
    let candidate_paths = vec![
        cwd.join("ffresolver.py"),
        cwd.parent().unwrap_or(&cwd).join("ffresolver.py"),
        std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.join("ffresolver.py"))).unwrap_or_else(|| cwd.join("ffresolver.py")),
        std::env::current_exe().ok().and_then(|p| p.parent().and_then(|p| p.parent()).map(|p| p.join("ffresolver.py"))).unwrap_or_else(|| cwd.join("ffresolver.py")),
    ];

    let script_path = candidate_paths
        .into_iter()
        .find(|p| p.exists())
        .unwrap_or_else(|| cwd.join("ffresolver.py"));

    let python_cmds = ["py", "python", "python3"];
    let mut last_err = String::new();

    for cmd in python_cmds {
        let mut process = tokio::process::Command::new(cmd);
        process.arg(&script_path);
        process.arg(url_trimmed);

        #[cfg(windows)]
        {
            process.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match process.output().await {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stdout_trimmed = stdout.trim();

                if let Some(json_start) = stdout_trimmed.find('{') {
                    if let Some(json_end) = stdout_trimmed.rfind('}') {
                        let json_str = &stdout_trimmed[json_start..=json_end];
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
                            if let Some(err_msg) = json.get("error").and_then(|v| v.as_str()) {
                                return Err(format!("Link resolution error: {}", err_msg));
                            }
                            if let (Some(dl_url), Some(title)) = (
                                json.get("download_url").and_then(|v| v.as_str()),
                                json.get("title").and_then(|v| v.as_str()),
                            ) {
                                let file_size = json.get("file_size").and_then(|v| v.as_u64()).unwrap_or(0);
                                return Ok(ResolvedLinkInfo {
                                    title: title.to_string(),
                                    download_url: dl_url.to_string(),
                                    file_size,
                                });
                            }
                        }
                    }
                }
                last_err = format!("Failed to parse resolver output: {}", stdout_trimmed);
            }
            Err(e) => {
                last_err = format!("Failed to run python ({}) with ffresolver.py: {}", cmd, e);
            }
        }
    }

    Err(last_err)
}

#[tauri::command]
pub async fn add_http_downloads(
    urls: Vec<String>,
    save_paths: Vec<String>,
    folder_name: Option<String>,
    original_urls: Option<Vec<String>>,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    let orig_urls = original_urls.unwrap_or_default();

    for (idx, (url, save_path)) in urls.into_iter().zip(save_paths.into_iter()).enumerate() {
        let id = format!("dl_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
        let filename = std::path::Path::new(&save_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let original_url = orig_urls.get(idx).cloned();

        let task = DownloadItem {
            id: id.clone(),
            url,
            original_url,
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
    if let Some(tx) = engine.cancel_txs.read().await.get(&id) {
        let _ = tx.send(());
    }

    let path_to_delete = {
        let mut lock = engine.tasks.write().await;
        if let Some(task) = lock.remove(&id) {
            task.save_path
        } else {
            return Err("Task not found".to_string());
        }
    };

    engine.remove_task_from_db(&id).await;

    if delete_file {
        let p = PathBuf::from(&path_to_delete);
        let _ = tokio::fs::remove_file(&p).await;
        if let Some(parent) = p.parent() {
            let _ = tokio::fs::remove_dir(parent).await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn retry_http_download(
    id: String,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    if let Some(tx) = engine.cancel_txs.read().await.get(&id) {
        let _ = tx.send(());
    }
    tokio::task::yield_now().await;

    let orig_url = {
        let lock = engine.tasks.read().await;
        lock.get(&id).and_then(|t| t.original_url.clone())
    };

    if let Some(orig) = orig_url {
        if let Ok(info) = resolve_link(orig).await {
            let mut lock = engine.tasks.write().await;
            if let Some(task) = lock.get_mut(&id) {
                task.url = info.download_url;
            }
        }
    }

    {
        let mut lock = engine.tasks.write().await;
        if let Some(task) = lock.get_mut(&id) {
            task.status = "pending".to_string();
            task.error_message = None;
            task.speed_bytes_per_sec = 0;
            engine.persist_task(task).await;
        } else {
            return Err("Task not found".to_string());
        }
    }

    let engine_clone = engine.inner().clone();
    tokio::spawn(async move {
        HttpDownloadEngine::start_download(engine_clone, id).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn get_max_concurrent_downloads(
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<usize, String> {
    Ok(engine.max_concurrent.load(Ordering::Relaxed))
}

#[tauri::command]
pub async fn set_max_concurrent_downloads(
    limit: usize,
    engine: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    let limit = limit.clamp(1, 16);
    let old = engine.max_concurrent.swap(limit, Ordering::Relaxed);

    match limit.cmp(&old) {
        std::cmp::Ordering::Greater => {
            engine.semaphore.add_permits(limit - old);
        }
        std::cmp::Ordering::Less => {
            let to_drain = old - limit;
            for _ in 0..to_drain {
                if let Ok(permit) = engine.semaphore.try_acquire() {
                    permit.forget();
                }
            }
        }
        std::cmp::Ordering::Equal => {}
    }

    Ok(())
}
