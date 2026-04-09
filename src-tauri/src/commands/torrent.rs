use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

use crate::torrent::{DownloadStatus, TorrentEngine, TorrentInfo};

/// Shared handle kept in Tauri's managed state
pub type TorrentState = Arc<RwLock<Option<TorrentEngine>>>;

/// Inspect a magnet link and return file listing WITHOUT starting download.
/// Used to populate the TorrentFileModal file tree.
#[tauri::command]
pub async fn inspect_magnet(
    state: State<'_, TorrentState>,
    magnet_url: String,
) -> Result<TorrentInfo, String> {
    let lock = state.read().await;
    let engine = lock.as_ref().ok_or("Torrent engine not initialized")?;
    engine
        .inspect_magnet(magnet_url)
        .await
        .map_err(|e| e.to_string())
}

/// Begin downloading a magnet link. Optionally choose specific file indices
/// and a custom save path.
#[tauri::command]
pub async fn start_download(
    state: State<'_, TorrentState>,
    magnet_url: String,
    selected_files: Option<Vec<usize>>,
    save_path: Option<String>,
) -> Result<usize, String> {
    let lock = state.read().await;
    let engine = lock.as_ref().ok_or("Torrent engine not initialized")?;
    engine
        .start_download(magnet_url, selected_files, save_path.map(PathBuf::from))
        .await
        .map_err(|e| e.to_string())
}

/// Pause a running download.
#[tauri::command]
pub async fn pause_download(
    state: State<'_, TorrentState>,
    id: usize,
) -> Result<(), String> {
    let lock = state.read().await;
    let engine = lock.as_ref().ok_or("Torrent engine not initialized")?;
    engine.pause(id).await.map_err(|e| e.to_string())
}

/// Resume a paused download.
#[tauri::command]
pub async fn resume_download(
    state: State<'_, TorrentState>,
    id: usize,
) -> Result<(), String> {
    let lock = state.read().await;
    let engine = lock.as_ref().ok_or("Torrent engine not initialized")?;
    engine.resume(id).await.map_err(|e| e.to_string())
}

/// Cancel and remove a download entry. Does NOT delete the downloaded files.
#[tauri::command]
pub async fn cancel_download(
    state: State<'_, TorrentState>,
    id: usize,
) -> Result<(), String> {
    let lock = state.read().await;
    let engine = lock.as_ref().ok_or("Torrent engine not initialized")?;
    engine.cancel(id).await.map_err(|e| e.to_string())
}

/// Return a snapshot of all current downloads (active + completed).
/// Called on startup for rehydration (T4b) and polled by the downloads UI.
#[tauri::command]
pub async fn get_downloads(
    state: State<'_, TorrentState>,
) -> Result<Vec<DownloadStatus>, String> {
    let lock = state.read().await;
    let engine = lock.as_ref().ok_or("Torrent engine not initialized")?;
    Ok(engine.list_downloads().await)
}
