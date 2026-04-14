use futures::StreamExt;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpDownloadStatus {
    pub id: String,
    pub name: String,
    pub folder_name: Option<String>, // NEW
    pub state: String,
    pub progress_percent: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub download_speed: u64,
    pub error_msg: Option<String>,
}

pub struct HttpDownloadEngine {
    pub tasks: Arc<RwLock<HashMap<String, HttpTask>>>,
    pub client: reqwest::Client,
}

pub struct HttpTask {
    pub status: HttpDownloadStatus,
    pub cancel_token: Arc<tokio::sync::Notify>,
    pub pause_token: Arc<tokio::sync::Notify>,
    pub is_paused: Arc<std::sync::atomic::AtomicBool>,
}

impl HttpDownloadEngine {
    pub fn new() -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"));
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.5"));
        headers.insert(
            REFERER,
            HeaderValue::from_static("https://fitgirl-repacks.site/"),
        );
        headers.insert(USER_AGENT, HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .unwrap();

        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            client,
        }
    }
}

async fn resolve_direct_link(
    client: &reqwest::Client,
    url: &str,
) -> Result<(String, String), String> {
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    let text = res.text().await.map_err(|e| e.to_string())?;

    let title_re = Regex::new(r#"<meta name="title" content="([^"]+)"#).unwrap();
    let file_name = if let Some(caps) = title_re.captures(&text) {
        let name = caps.get(1).unwrap().as_str().to_string();
        name.replace(|c: char| r#"\/*?:"<>|"#.contains(c), "")
    } else {
        url.split('/').last().unwrap_or("download").to_string()
    };

    let link_re = Regex::new(r#"window\.open\(['"](https?://[^\s"'()]+)['"]"#).unwrap();
    if let Some(caps) = link_re.captures(&text) {
        return Ok((file_name, caps.get(1).unwrap().as_str().to_string()));
    }

    Ok((file_name, url.to_string()))
}

#[tauri::command]
pub async fn add_http_downloads(
    links: Vec<String>,
    save_path: String,
    folder_name: Option<String>,
    _app: AppHandle,
    state: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    let engine = state.inner().clone();

    // Create the final directory path immediately
    let final_dir = if let Some(ref sub) = folder_name {
        let p = PathBuf::from(&save_path).join(sub);
        let _ = std::fs::create_dir_all(&p);
        p
    } else {
        PathBuf::from(&save_path)
    };

    tauri::async_runtime::spawn(async move {
        for link in links {
            let engine_ref = engine.clone();
            let save_dir = final_dir.clone();
            let folder_display = folder_name.clone();

            let id = uuid::Uuid::new_v4().to_string();

            {
                let mut tasks = engine_ref.tasks.write().await;
                tasks.insert(
                    id.clone(),
                    HttpTask {
                        status: HttpDownloadStatus {
                            id: id.clone(),
                            name: "Resolving Link...".to_string(),
                            folder_name: folder_display.clone(),
                            state: "Initializing".to_string(),
                            progress_percent: 0.0,
                            downloaded_bytes: 0,
                            total_bytes: 0,
                            download_speed: 0,
                            error_msg: None,
                        },
                        cancel_token: Arc::new(tokio::sync::Notify::new()),
                        pause_token: Arc::new(tokio::sync::Notify::new()),
                        is_paused: Arc::new(std::sync::atomic::AtomicBool::new(false)),
                    },
                );
            }

            tokio::spawn(async move {
                match resolve_direct_link(&engine_ref.client, &link).await {
                    Ok((name, direct_url)) => {
                        let path = save_dir.join(&name);

                        {
                            let mut tasks = engine_ref.tasks.write().await;
                            if let Some(task) = tasks.get_mut(&id) {
                                task.status.name = name.clone();
                                task.status.state = "Downloading".to_string();
                            }
                        }

                        if let Err(e) = execute_download(&engine_ref, &id, &direct_url, path).await
                        {
                            let mut tasks = engine_ref.tasks.write().await;
                            if let Some(task) = tasks.get_mut(&id) {
                                task.status.state = "Error".to_string();
                                task.status.error_msg = Some(e);
                            }
                        }
                    }
                    Err(e) => {
                        let mut tasks = engine_ref.tasks.write().await;
                        if let Some(task) = tasks.get_mut(&id) {
                            task.status.state = "Error".to_string();
                            task.status.error_msg = Some(format!("Failed to resolve link: {}", e));
                        }
                    }
                }
            });
        }
    });

    Ok(())
}

async fn execute_download(
    engine: &Arc<HttpDownloadEngine>,
    id: &str,
    url: &str,
    path: PathBuf,
) -> Result<(), String> {
    let res = engine
        .client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let total_size = res.content_length().unwrap_or(0);

    {
        let mut tasks = engine.tasks.write().await;
        if let Some(task) = tasks.get_mut(id) {
            task.status.total_bytes = total_size;
        }
    }

    let mut file = tokio::fs::File::create(&path)
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();

    let mut downloaded: u64 = 0;
    let mut last_update = std::time::Instant::now();
    let mut bytes_since_update: u64 = 0;

    let (cancel, pause, is_paused) = {
        let tasks = engine.tasks.read().await;
        let t = tasks.get(id).unwrap();
        (
            t.cancel_token.clone(),
            t.pause_token.clone(),
            t.is_paused.clone(),
        )
    };

    loop {
        tokio::select! {
            _ = cancel.notified() => {
                let _ = tokio::fs::remove_file(path).await;
                let mut tasks = engine.tasks.write().await;
                tasks.remove(id);
                return Ok(());
            }
            chunk_opt = stream.next() => {
                match chunk_opt {
                    Some(Ok(bytes)) => {
                        if is_paused.load(std::sync::atomic::Ordering::Relaxed) {
                            pause.notified().await;
                        }

                        file.write_all(&bytes).await.map_err(|e| e.to_string())?;
                        downloaded += bytes.len() as u64;
                        bytes_since_update += bytes.len() as u64;

                        if last_update.elapsed().as_millis() > 200 {
                            let speed = (bytes_since_update as f64 / last_update.elapsed().as_secs_f64()) as u64;
                            let mut tasks = engine.tasks.write().await;
                            if let Some(task) = tasks.get_mut(id) {
                                task.status.downloaded_bytes = downloaded;
                                task.status.progress_percent = if total_size > 0 { (downloaded as f32 / total_size as f32) * 100.0 } else { 0.0 };
                                task.status.download_speed = speed;
                            }
                            last_update = std::time::Instant::now();
                            bytes_since_update = 0;
                        }
                    }
                    Some(Err(e)) => return Err(e.to_string()),
                    None => break,
                }
            }
        }
    }

    let mut tasks = engine.tasks.write().await;
    if let Some(task) = tasks.get_mut(id) {
        task.status.state = "Finished".to_string();
        task.status.progress_percent = 100.0;
        task.status.download_speed = 0;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_http_downloads(
    state: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<Vec<HttpDownloadStatus>, String> {
    let tasks = state.tasks.read().await;
    let mut out: Vec<HttpDownloadStatus> = tasks.values().map(|t| t.status.clone()).collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub async fn cancel_http_download(
    id: String,
    state: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    let tasks = state.tasks.read().await;
    if let Some(task) = tasks.get(&id) {
        task.cancel_token.notify_one();
    }
    Ok(())
}

#[tauri::command]
pub async fn pause_http_download(
    id: String,
    state: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    let mut tasks = state.tasks.write().await;
    if let Some(task) = tasks.get_mut(&id) {
        task.is_paused
            .store(true, std::sync::atomic::Ordering::Relaxed);
        task.status.state = "Paused".to_string();
        task.status.download_speed = 0;
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_http_download(
    id: String,
    state: State<'_, Arc<HttpDownloadEngine>>,
) -> Result<(), String> {
    let mut tasks = state.tasks.write().await;
    if let Some(task) = tasks.get_mut(&id) {
        task.is_paused
            .store(false, std::sync::atomic::Ordering::Relaxed);
        task.pause_token.notify_one();
        task.status.state = "Downloading".to_string();
    }
    Ok(())
}
