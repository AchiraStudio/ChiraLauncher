use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref VERSION_REGEX: Regex = Regex::new(r"(?i)v?\d+(\.\d+)+").unwrap();
    static ref NOISE_REGEX: Regex = Regex::new(r"(?i)[-\[\(]?(CODEX|SKIDROW|EMPRESS|FLT|RELOADED|CPY|DODI|FITGIRL|GOG|RUNE|TENOKE|PLAZA)[-\]\)]?").unwrap();
    static ref YEAR_ABBREV_REGEX: Regex = Regex::new(r"\b([0-9]{2})$").unwrap();
}

#[tauri::command]
pub fn clean_title(filename: &str) -> String {
    // 1. Remove extension
    let name = if let Some(dot_idx) = filename.rfind('.') {
        &filename[..dot_idx]
    } else {
        filename
    };

    // 2. Remove version patterns
    let mut cleaned = VERSION_REGEX.replace_all(name, "").into_owned();

    // 3. Remove crack/scene tags
    cleaned = NOISE_REGEX.replace_all(&cleaned, "").into_owned();

    // 4. Replace separators
    cleaned = cleaned.replace('_', " ").replace('.', " ");

    // 4.5. Expand trailing 2-digit years (e.g. " 24" -> " 2024", " 98" -> " 1998")
    cleaned = YEAR_ABBREV_REGEX
        .replace_all(&cleaned, |caps: &regex::Captures| {
            let year: u32 = caps[1].parse().unwrap_or(0);
            if year >= 50 {
                format!(" 19{}", caps[1].to_string())
            } else {
                format!(" 20{}", caps[1].to_string())
            }
        })
        .into_owned();

    // 5. Trim extra spaces and normalize
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_title() {
        assert_eq!(clean_title("Hades.v1.382-SKIDROW.exe"), "Hades");
        assert_eq!(clean_title("GTA_V_v1.0.2845-CODEX.exe"), "GTA V");
        assert_eq!(clean_title("ELDEN.RING-EMPRESS.exe"), "ELDEN RING");
        assert_eq!(
            clean_title("The_Witcher_3_Wild_Hunt_v1.32_GOG.exe"),
            "The Witcher 3 Wild Hunt"
        );
    }
}
