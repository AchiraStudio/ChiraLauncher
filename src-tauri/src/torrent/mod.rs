use std::path::PathBuf;
use std::sync::Arc;
use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};

use librqbit::{
    AddTorrent, AddTorrentOptions, Session, SessionOptions,
    api::{Api, TorrentIdOrHash},
};

pub struct TorrentEngine {
    pub session: Arc<Session>,
    pub api: Api,
    pub default_download_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorrentFileEntry {
    pub index: usize,
    pub name: String,
    pub length: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TorrentInfo {
    pub id: usize,
    pub name: String,
    pub files: Vec<TorrentFileEntry>,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]  // ✅ added Clone
pub struct DownloadStatus {
    pub id: usize,
    pub name: String,
    pub progress_percent: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub download_speed: u64,
    pub upload_speed: u64,
    pub peers: u32,
    pub state: String,
}

impl TorrentEngine {
    pub async fn new(session_dir: PathBuf, default_download_dir: PathBuf) -> Result<Self> {
        if !session_dir.exists() {
            std::fs::create_dir_all(&session_dir)?;
        }
        if !default_download_dir.exists() {
            std::fs::create_dir_all(&default_download_dir)?;
        }

        let opts = SessionOptions {
            persistence: Some(librqbit::SessionPersistenceConfig::Json {
                folder: Some(session_dir.clone()),
            }),
            ..Default::default()
        };

        let session = Session::new_with_opts(default_download_dir.clone(), opts)
            .await
            .context("Failed to initialize librqbit session")?;

        let api = Api::new(session.clone(), None);

        log::info!("[TorrentEngine] Session started. Session dir: {:?}", session_dir);

        Ok(Self {
            session,
            api,
            default_download_dir,
        })
    }

    pub async fn inspect_magnet(&self, magnet_url: String) -> Result<TorrentInfo> {
        let response = self.session
            .add_torrent(
                AddTorrent::from_url(&magnet_url),
                Some(AddTorrentOptions {
                    paused: true,
                    ..Default::default()
                }),
            )
            .await
            .context("Failed to add magnet")?;

        let handle = response.into_handle().context("No handle generated")?;
        
        // Wait for metadata to be fetched by polling
        let mut attempts = 0;
        let mut metadata_ready = false;
        while attempts < 60 {
            if handle.with_metadata(|_| ()).is_ok() {
                metadata_ready = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            attempts += 1;
        }

        if !metadata_ready {
            return Err(anyhow::anyhow!("Timed out waiting for torrent metadata. Please ensure you have peers."));
        }
        
        let id = handle.id();
        let details = self.api.api_torrent_details(TorrentIdOrHash::Id(id))
            .context("Failed to get torrent details")?;

        let name = details.name.unwrap_or_else(|| format!("torrent_{id}"));
        let mut total_bytes = 0u64;
        let files: Vec<TorrentFileEntry> = details.files.unwrap_or_default().into_iter().enumerate().map(|(i, f)| {
            total_bytes += f.length;
            TorrentFileEntry {
                index: i,
                name: f.name,
                length: f.length,
            }
        }).collect();

        Ok(TorrentInfo { id, name, files, total_bytes })
    }

    pub async fn start_download(
        &self,
        magnet_url: String,
        selected_files: Option<Vec<usize>>,
        save_path: Option<PathBuf>,
    ) -> Result<usize> {
        let output_folder = save_path.unwrap_or_else(|| self.default_download_dir.clone());
        let output_folder_str = output_folder.to_string_lossy().to_string();

        let response = self.session
            .add_torrent(
                AddTorrent::from_url(&magnet_url),
                Some(AddTorrentOptions {
                    output_folder: Some(output_folder_str),
                    only_files: selected_files,
                    ..Default::default()
                }),
            )
            .await
            .context("Failed to add torrent")?;

        let handle = response.into_handle().context("No handle generated")?;
        self.session.unpause(&handle).await.context("failed to unpause torrent")?;

        Ok(handle.id())
    }

    pub async fn pause(&self, id: usize) -> Result<()> {
        let handle = self.session.get(TorrentIdOrHash::Id(id)).context("Not found")?;
        self.session.pause(&handle).await.context("failed to pause")?;
        Ok(())
    }

    pub async fn resume(&self, id: usize) -> Result<()> {
        let handle = self.session.get(TorrentIdOrHash::Id(id)).context("Not found")?;
        self.session.unpause(&handle).await.context("failed to unpause")?;
        Ok(())
    }

    pub async fn cancel(&self, id: usize) -> Result<()> {
        self.session.delete(TorrentIdOrHash::Id(id), false).await.context("failed to delete")?;
        Ok(())
    }

    pub async fn list_downloads(&self) -> Vec<DownloadStatus> {
        let list = self.api.api_torrent_list();

        list.torrents.into_iter().map(|t| {
            let id = t.id.unwrap_or(0);

            let stats = t.stats.as_ref();

            let total_bytes    = stats.map(|s| s.total_bytes).unwrap_or(0);
            let progress_bytes = stats.map(|s| s.progress_bytes).unwrap_or(0);

            let progress = if total_bytes > 0 {
                (progress_bytes as f64 / total_bytes as f64 * 100.0) as f32
            } else {
                0.0
            };

            let live = stats.and_then(|s| s.live.as_ref());

            DownloadStatus {
                id,
                name:             t.name.unwrap_or_else(|| format!("torrent_{id}")),
                progress_percent: progress,
                downloaded_bytes: progress_bytes,
                total_bytes,
                download_speed:   live.map(|l| l.download_speed.mbps as u64).unwrap_or(0),
                upload_speed:     live.map(|l| l.upload_speed.mbps as u64).unwrap_or(0),
                peers:            live.map(|l| l.snapshot.peer_stats.live as u32).unwrap_or(0),
                state:            stats
                                      .map(|s| format!("{:?}", s.state))
                                      .unwrap_or_else(|| "unknown".to_string()),
            }
        }).collect()
    }
}
