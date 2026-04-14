use anyhow::Context;
use image::imageops::FilterType;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const COVER_WIDTH: u32 = 600;
const COVER_HEIGHT: u32 = 900;
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

    fn hash_string(input: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn process_and_save(
        &self,
        bytes: &[u8],
        width: u32,
        height: u32,
        save_path: &Path,
    ) -> anyhow::Result<()> {
        let img = image::load_from_memory(bytes).context("Failed to decode source image")?;

        let resized = img.resize(width, height, FilterType::Lanczos3);

        let mut jpeg_bytes = std::io::Cursor::new(Vec::new());
        resized
            .write_to(&mut jpeg_bytes, image::ImageFormat::Jpeg)
            .context("Failed to re-encode image as clean JPEG")?;

        std::fs::write(save_path, jpeg_bytes.into_inner())
            .context("Failed to flush image bytes to disk")?;

        Ok(())
    }

    pub async fn download_cover(&self, url: &str) -> anyhow::Result<String> {
        self.download_url_to_cache(url, "cover").await
    }

    pub fn upload_custom_cover(&self, path: &str) -> anyhow::Result<String> {
        let bytes = std::fs::read(path).context("Failed to read custom cover")?;
        let hash = Self::hash_string(path); // Hash original path to avoid duplicates
        let file_name = format!("{}.jpg", hash);
        let save_path = self.base_dir.join(&file_name);

        if !save_path.exists() {
            self.process_and_save(&bytes, COVER_WIDTH, COVER_HEIGHT, &save_path)?;
        }
        Ok(save_path.to_string_lossy().to_string())
    }

    pub fn upload_custom_background(&self, path: &str) -> anyhow::Result<String> {
        let bytes = std::fs::read(path).context("Failed to read custom bg")?;
        let hash = Self::hash_string(path);
        let file_name = format!("{}.jpg", hash);
        let save_path = self.base_dir.join(&file_name);

        if !save_path.exists() {
            self.process_and_save(&bytes, BG_WIDTH, BG_HEIGHT, &save_path)?;
        }
        Ok(save_path.to_string_lossy().to_string())
    }

    pub fn upload_custom_logo(&self, path: &str) -> anyhow::Result<String> {
        let bytes = std::fs::read(path).context("Failed to read custom logo")?;
        let hash = Self::hash_string(path);
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
        // Hash the URL directly. This allows us to check if the file exists on disk
        // BEFORE making any network calls. Critical for offline mode and speed!
        let url_hash = Self::hash_string(url);
        let ext = if image_type == "logo" { "png" } else { "jpg" };
        let file_name = format!("{}.{}", url_hash, ext);
        let save_path = self.base_dir.join(&file_name);

        // Instant offline cache hit
        if save_path.exists() {
            return Ok(save_path.to_string_lossy().to_string());
        }

        // Cache miss -> Download
        let bytes = reqwest::get(url).await?.bytes().await?;

        if image_type == "logo" {
            std::fs::write(&save_path, bytes)?;
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
            self.process_and_save(&bytes, width, height, &save_path)?;
        }

        Ok(save_path.to_string_lossy().to_string())
    }
}
