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

    /// Computes the SHA-256 hash of the given byte array and returns a hex lowercase string.
    fn hash_bytes(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    }

    /// Processes an image (resizes, strips metadata, converts to pure JPEG) and saves it if unique.
    /// Returns the absolute path of the saved resulting file.
    fn process_and_save(&self, bytes: &[u8], width: u32, height: u32) -> anyhow::Result<String> {
        let img = image::load_from_memory(bytes).context("Failed to decode source image")?;

        // Resize forcing exact aspect ratio lock safely with native Lanczos3
        let resized = img.resize_exact(width, height, FilterType::Lanczos3);

        // Convert the clean resized image backing buffer to native JPEG bytes
        let mut jpeg_bytes = std::io::Cursor::new(Vec::new());
        resized
            .write_to(&mut jpeg_bytes, image::ImageFormat::Jpeg)
            .context("Failed to re-encode image as clean JPEG")?;

        let final_bytes = jpeg_bytes.into_inner();

        // Hash for deduplication logic
        let hash = Self::hash_bytes(&final_bytes);
        let file_name = format!("{}.jpg", hash);
        let save_path = self.base_dir.join(&file_name);

        if !save_path.exists() {
            std::fs::write(&save_path, final_bytes)
                .context("Failed to flush image bytes to disk")?;
        }

        // Return path representation for SQLite / frontend consumption
        let absolute_path = save_path.to_string_lossy().to_string();
        Ok(absolute_path)
    }

    /// Downloads a cover from a URL, processes it into standard sizes, and returns the local absolute path.
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

    /// Loads and processes a local custom cover given its absolute path on the User's machine safely.
    pub fn upload_custom_cover(&self, path: &str) -> anyhow::Result<String> {
        let bytes = std::fs::read(path).context("Failed to read user's custom cover blob")?;
        self.process_and_save(&bytes, COVER_WIDTH, COVER_HEIGHT)
    }

    /// Loads and processes a local custom background given its absolute path on the User's machine safely.
    pub fn upload_custom_background(&self, path: &str) -> anyhow::Result<String> {
        let bytes = std::fs::read(path).context("Failed to read user's custom background blob")?;
        // For background, we use larger dimensions (1920x1080)
        self.process_and_save(&bytes, BG_WIDTH, BG_HEIGHT)
    }
}
