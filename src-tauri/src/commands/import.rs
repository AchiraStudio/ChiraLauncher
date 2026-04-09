#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct RepackScrapedGame {
    pub entry_title: String,
    pub source: String,
    pub url: String,
    pub size_compressed: String,
    pub size_installed: String,
    pub included: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct GameImportResult {
    pub title: String,
    pub success: bool,
    pub cover_url: String,
    pub developer: String,
    pub description: String,
    pub error: Option<String>,
}
