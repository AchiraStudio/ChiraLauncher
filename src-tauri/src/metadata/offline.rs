use crate::metadata::provider::{GameMetadata, MetadataProvider, MetadataResult};
use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    // Captures: optional leading separator + release group tag word
    static ref GROUP_RE: Regex = Regex::new(
        r"(?i)[._\-]?(CODEX|SKIDROW|RELOADED|FLT|RUNE|TENOKE|EMPRESS|PLAZA|HOODLUM|RAZORDOX|DARKSiDERS|CPY|GOG|MULTI\d*)\b"
    ).unwrap();

    // Captures version markers like v1.0, v2.4.1
    static ref VERSION_RE: Regex = Regex::new(
        r"(?i)[._\-]?v\d+(\.\d+)*"
    ).unwrap();

    // Captures bracket/paren blocks like [MULTI5] or (x64)
    static ref BRACKET_RE: Regex = Regex::new(
        r"[\[(][^\]\)]*[\])]"
    ).unwrap();

    // Collapses multiple whitespace into one
    static ref SPACE_RE: Regex = Regex::new(r"\s+").unwrap();
}

pub struct OfflineProvider;

impl OfflineProvider {
    pub fn new() -> Self {
        Self
    }

    /// Cleans release group tags, versions, and generic markers from the filename.
    pub fn clean_filename(filename: &str) -> String {
        // Pass 1: Strip [MULTI5], (x64), etc.
        let s = BRACKET_RE.replace_all(filename, "");
        // Pass 2: Strip version markers like -v1.0.4
        let s = VERSION_RE.replace_all(&s, "");
        // Pass 3: Strip release group tags including the leading separator
        let s = GROUP_RE.replace_all(&s, "");
        // Normalize: dots/underscores → spaces, collapse whitespace, trim
        let s = s.replace('.', " ").replace('_', " ");
        let s = SPACE_RE.replace_all(s.trim(), " ");
        s.into_owned()
    }
}

#[async_trait::async_trait]
impl MetadataProvider for OfflineProvider {
    async fn search(&self, title: &str) -> anyhow::Result<Vec<MetadataResult>> {
        let clean_title = Self::clean_filename(title);

        // Offline provider returns the cleaned title as the only local result
        Ok(vec![MetadataResult {
            id: clean_title.clone(),
            title: clean_title,
            cover_url: None,
            release_year: None,
            summary: None,
            developer: None,
            rating: None,
            steam_app_id: None,
        }])
    }

    async fn fetch_full(&self, id: &str) -> anyhow::Result<GameMetadata> {
        // For Offline, the ID is just the cleaned title itself
        Ok(GameMetadata {
            id: id.to_string(),
            title: id.to_string(),
            cover_url: None,
            background_url: None,
            summary: None,
            release_date: None,
            developer: None,
            publisher: None,
            rating: None,
            genres: None,
            themes: None,
            platforms: None,
            game_modes: None,
            tags: None,
            metacritic_score: None,
            steam_app_id: None,
        })
    }

    fn name(&self) -> &'static str {
        "Offline"
    }
}
