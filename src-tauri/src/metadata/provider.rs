use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataResult {
    pub id: String, // String representation of the ID from the provider
    pub title: String,
    pub cover_url: Option<String>,
    pub release_year: Option<u32>,
    pub summary: Option<String>,
    pub developer: Option<String>,
    pub rating: Option<f32>,
    pub steam_app_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameMetadata {
    pub id: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub background_url: Option<String>,
    pub summary: Option<String>,
    pub release_date: Option<String>, // ISO8601 or similar String format
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub rating: Option<f32>,
    pub genres: Option<Vec<String>>,
    pub themes: Option<Vec<String>>,
    pub platforms: Option<Vec<String>>,
    pub game_modes: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub metacritic_score: Option<i32>,
    pub steam_app_id: Option<String>,
}

#[async_trait::async_trait]
pub trait MetadataProvider: Send + Sync {
    /// Search the system by raw title
    async fn search(&self, title: &str) -> anyhow::Result<Vec<MetadataResult>>;

    /// Fetch full, detailed metadata based on the distinct provider ID
    async fn fetch_full(&self, id: &str) -> anyhow::Result<GameMetadata>;

    /// Human-readable name of the provider (e.g., "IGDB", "Offline")
    fn name(&self) -> &'static str;
}
