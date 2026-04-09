use anyhow::Context;
use image::imageops::FilterType;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const COVER_WIDTH: u32 = 264;
const COVER_HEIGHT: u32 = 374;

const BG_WIDTH: u32 = 1920;
const BG_HEIGHT: u32 = 1080;

pub struct ImageCache {
    base_dir: PathBuf,
}

impl ImageCache {
    pub fn new(app_dir: &Path) -> Self {
        let base_dir = app_dir.join("images");
        let _ = std::fs::create_dir_all(&base_dir);
        Self { base_dir }
    }

    fn hash_bytes(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    }

    fn process_and_save(&self, bytes: &[u8], width: u32, height: u32) -> anyhow::Result<String> {
        let img = image::load_from_memory(bytes).context("Failed to decode source image")?;
        let resized = img.resize_exact(width, height, FilterType::Lanczos3);

        let mut jpeg_bytes = std::io::Cursor::new(Vec::new());
        resized
            .write_to(&mut jpeg_bytes, image::ImageFormat::Jpeg)
            .context("Failed to re-encode image as clean JPEG")?;

        let final_bytes = jpeg_bytes.into_inner();
        let hash = Self::hash_bytes(&final_bytes);
        let file_name = format!("{}.jpg", hash);
        let save_path = self.base_dir.join(&file_name);

        if !save_path.exists() {
            std::fs::write(&save_path, final_bytes)
                .context("Failed to flush image bytes to disk")?;
        }

        Ok(save_path.to_string_lossy().to_string())
    }

    pub async fn download_cover(&self, url: &str) -> anyhow::Result<String> {
        let client = Client::new();
        let response = client
            .get(url)
            .send()
            .await
            .context("Failed to fetch active cover image")?;
        if !response.status().is_success() {
            anyhow::bail!("Internet cover fetch returned status {}", response.status());
        }
        let bytes = response.bytes().await?;
        self.process_and_save(&bytes, COVER_WIDTH, COVER_HEIGHT)
    }

    pub fn upload_custom_cover(&self, path: &str) -> anyhow::Result<String> {
        let bytes = std::fs::read(path).context("Failed to read user's custom cover blob")?;
        self.process_and_save(&bytes, COVER_WIDTH, COVER_HEIGHT)
    }

    pub fn upload_custom_background(&self, path: &str) -> anyhow::Result<String> {
        let bytes = std::fs::read(path).context("Failed to read user's custom background blob")?;
        self.process_and_save(&bytes, BG_WIDTH, BG_HEIGHT)
    }

    pub fn upload_custom_logo(&self, path: &str) -> anyhow::Result<String> {
        let bytes = std::fs::read(path).context("Failed to read user's custom logo blob")?;
        let hash = Self::hash_bytes(&bytes);
        let file_name = format!("{}.png", hash);
        let save_path = self.base_dir.join(&file_name);
        if !save_path.exists() {
            std::fs::write(&save_path, bytes)?;
        }
        Ok(save_path.to_string_lossy().to_string())
    }

    pub async fn download_url_to_cache(
        &self,
        url: &str,
        image_type: &str,
    ) -> anyhow::Result<String> {
        let bytes = reqwest::get(url).await?.bytes().await?;

        if image_type == "logo" {
            let hash = Self::hash_bytes(&bytes);
            let file_name = format!("{}.png", hash);
            let save_path = self.base_dir.join(&file_name);
            if !save_path.exists() {
                std::fs::write(&save_path, bytes)?;
            }
            Ok(save_path.to_string_lossy().to_string())
        } else {
            let width = if image_type == "background" {
                BG_WIDTH
            } else {
                COVER_WIDTH
            };
            let height = if image_type == "background" {
                BG_HEIGHT
            } else {
                COVER_HEIGHT
            };
            self.process_and_save(&bytes, width, height)
        }
    }
}
