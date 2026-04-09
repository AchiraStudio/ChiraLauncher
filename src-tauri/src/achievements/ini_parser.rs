use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone, Default)]
pub struct AchievementIniState {
    /// api_name → unix timestamp (0 if earned but no timestamp recorded)
    pub unlocked: HashMap<String, u64>,
    /// Total count from [SteamAchievements] Count=N, or derived from sections
    pub count: u32,
    /// Every achievement name seen in the file, earned or not
    pub all_names: HashSet<String>,
}

// ── Public entry points ───────────────────────────────────────────────────────

pub fn parse_achievements_ini(path: &Path) -> std::io::Result<AchievementIniState> {
    let content = std::fs::read_to_string(path)?;
    Ok(parse_ini_content(&content))
}

/// Parse from a string — exposed for unit tests and in-memory use.
pub fn parse_ini_content(content: &str) -> AchievementIniState {
    let lines: Vec<&str> = content.lines().collect();

    // Detect format by scanning for [SteamAchievements] or [Achievements]
    let has_index = lines.iter().any(|l| {
        let t = l.trim();
        t.eq_ignore_ascii_case("[SteamAchievements]")
            || t.eq_ignore_ascii_case("[Achievements]")
    });

    if has_index {
        parse_indexed(&lines)
    } else {
        parse_bare(&lines)
    }
}

// ── Format A: indexed (standard CODEX / Skidrow / RLD!) ──────────────────────
//
// [SteamAchievements]
// Count=2
// 00000=NEW_ACHIEVEMENT_1_1
// 00001=NEW_ACHIEVEMENT_1_2
//
// [NEW_ACHIEVEMENT_1_1]
// Achieved=1
// CurProgress=0
// MaxProgress=0
// UnlockTime=1773296308
//
// [NEW_ACHIEVEMENT_1_2]
// Achieved=0

fn parse_indexed(lines: &[&str]) -> AchievementIniState {
    let mut count = 0u32;
    let mut index_to_name: HashMap<String, String> = HashMap::new();
    let mut in_index = false;

    // Pass 1 — build the name list from [SteamAchievements]
    for line in lines {
        let line = line.trim();
        if line.is_empty() || is_comment(line) {
            continue;
        }
        if line.starts_with('[') {
            let section = strip_brackets(line);
            in_index = section.eq_ignore_ascii_case("SteamAchievements")
                || section.eq_ignore_ascii_case("Achievements");
            continue;
        }
        if !in_index {
            continue;
        }
        if let Some((k, v)) = split_kv(line) {
            if k.eq_ignore_ascii_case("count") {
                count = v.parse().unwrap_or(0);
            } else {
                index_to_name.insert(k.to_string(), v.to_string());
            }
        }
    }

    if count == 0 && !index_to_name.is_empty() {
        count = index_to_name.len() as u32;
    }

    let known_names: HashSet<String> = index_to_name.values().cloned().collect();

    // Pass 2 — parse individual achievement sections
    let unlocked = parse_sections(lines, &known_names, true);
    let all_names = known_names;

    AchievementIniState { unlocked, count, all_names }
}

// ── Format B: bare (no index section) ────────────────────────────────────────
//
// [NEW_ACHIEVEMENT_1_1]
// Achieved=1
// UnlockTime=1773296308
//
// [NEW_ACHIEVEMENT_1_2]
// Achieved=0

fn parse_bare(lines: &[&str]) -> AchievementIniState {
    // Sections that are NOT achievements
    const SKIP: &[&str] = &[
        "General", "Steam", "SteamEmu", "Settings", "Config",
        "User", "Account", "App", "Game", "Interfaces", "DLC", "Crack",
    ];
    let skip_set: HashSet<String> = SKIP.iter().map(|s| s.to_lowercase()).collect();

    let mut all_names: HashSet<String> = HashSet::new();
    let mut unlocked: HashMap<String, u64> = HashMap::new();
    let mut current: Option<String> = None;
    let mut achieved = false;
    let mut ts = 0u64;

    for line in lines {
        let line = line.trim();
        if line.is_empty() || is_comment(line) {
            continue;
        }

        if line.starts_with('[') {
            // Flush previous section
            if let Some(name) = current.take() {
                all_names.insert(name.clone());
                if achieved {
                    unlocked.insert(name, ts);
                }
            }

            let section = strip_brackets(line);
            if skip_set.contains(&section.to_lowercase()) {
                current = None;
            } else {
                current = Some(section.to_string());
                achieved = false;
                ts = 0;
            }
            continue;
        }

        if current.is_some() {
            if let Some((k, v)) = split_kv(line) {
                if is_achieved_key(k) {
                    achieved = v == "1" || v.eq_ignore_ascii_case("true");
                } else if is_time_key(k) {
                    ts = v.parse().unwrap_or(0);
                }
            }
        }
    }

    // Flush final section
    if let Some(name) = current {
        all_names.insert(name.clone());
        if achieved {
            unlocked.insert(name, ts);
        }
    }

    let count = all_names.len() as u32;
    AchievementIniState { unlocked, count, all_names }
}

// ── Shared section parser ─────────────────────────────────────────────────────

fn parse_sections(
    lines: &[&str],
    known_names: &HashSet<String>,
    require_known: bool,
) -> HashMap<String, u64> {
    let mut unlocked: HashMap<String, u64> = HashMap::new();
    let mut current: Option<String> = None;
    let mut achieved = false;
    let mut ts = 0u64;
    let mut in_index = false;

    for line in lines {
        let line = line.trim();
        if line.is_empty() || is_comment(line) {
            continue;
        }

        if line.starts_with('[') {
            // Flush previous
            if let Some(ref name) = current {
                if achieved {
                    unlocked.insert(name.clone(), ts);
                }
            }

            let section = strip_brackets(line);
            in_index = section.eq_ignore_ascii_case("SteamAchievements")
                || section.eq_ignore_ascii_case("Achievements");

            if in_index {
                current = None;
                continue;
            }

            let accept = if require_known {
                known_names.contains(section)
                    || known_names.iter().any(|n| n.eq_ignore_ascii_case(section))
            } else {
                true
            };

            if accept {
                // Use canonical casing from known_names when possible
                let canonical = known_names
                    .iter()
                    .find(|n| n.eq_ignore_ascii_case(section))
                    .cloned()
                    .unwrap_or_else(|| section.to_string());
                current = Some(canonical);
                achieved = false;
                ts = 0;
            } else {
                current = None;
            }
            continue;
        }

        if in_index || current.is_none() {
            continue;
        }

        if let Some((k, v)) = split_kv(line) {
            if is_achieved_key(k) {
                achieved = v == "1" || v.eq_ignore_ascii_case("true");
            } else if is_time_key(k) {
                ts = v.parse().unwrap_or(0);
            }
        }
    }

    // Flush final
    if let Some(name) = current {
        if achieved {
            unlocked.insert(name, ts);
        }
    }

    unlocked
}

// ── Key helpers ───────────────────────────────────────────────────────────────

fn is_comment(line: &str) -> bool {
    line.starts_with(';') || line.starts_with('#') || line.starts_with("//")
}

fn strip_brackets(line: &str) -> &str {
    line.trim_start_matches('[').trim_end_matches(']').trim()
}

fn split_kv(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
        return None;
    }
    let eq = line.find('=')?;
    let k = line[..eq].trim();
    let v = line[eq + 1..].trim().trim_matches('"');
    if k.is_empty() { None } else { Some((k, v)) }
}

fn is_achieved_key(k: &str) -> bool {
    matches!(
        k.to_lowercase().as_str(),
        "achieved" | "unlocked" | "earned" | "done"
    )
}

fn is_time_key(k: &str) -> bool {
    matches!(
        k.to_lowercase().as_str(),
        "unlocktime" | "unlock_time" | "earnedtime" | "earned_time"
            | "timestamp" | "time"
    )
}

// ── Diff helper ───────────────────────────────────────────────────────────────

/// Returns names present in `current` but not in `previous` (newly unlocked).
pub fn diff_unlocked(
    previous: &HashSet<String>,
    current: &HashMap<String, u64>,
) -> Vec<(String, u64)> {
    current
        .iter()
        .filter(|(k, _)| !previous.contains(*k))
        .map(|(k, v)| (k.clone(), *v))
        .collect()
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const INDEXED: &str = r#"
[SteamAchievements]
Count=3
00000=NEW_ACHIEVEMENT_1_1
00001=NEW_ACHIEVEMENT_1_2
00002=NEW_ACHIEVEMENT_1_3

[NEW_ACHIEVEMENT_1_1]
Achieved=1
CurProgress=0
MaxProgress=0
UnlockTime=1773296308

[NEW_ACHIEVEMENT_1_2]
Achieved=0
CurProgress=0
MaxProgress=0
UnlockTime=0

[NEW_ACHIEVEMENT_1_3]
Achieved=1
CurProgress=0
MaxProgress=0
UnlockTime=1773999999
"#;

    const BARE: &str = r#"
[NEW_ACHIEVEMENT_1_1]
Achieved=1
UnlockTime=1773296308

[NEW_ACHIEVEMENT_1_2]
Achieved=0

[NEW_ACHIEVEMENT_1_3]
Achieved=1
UnlockTime=1773999999
"#;

    const WITH_SYSTEM_HEADERS: &str = r#"
[Settings]
Version=1

[Interfaces]
SteamClient=SteamClient017

[NEW_ACHIEVEMENT_1_1]
Achieved=1
UnlockTime=1773296308
"#;

    const MIXED_CASE_KEYS: &str = r#"
[new_achievement_1_1]
achieved=1
unlocktime=1773296308

[NEW_ACHIEVEMENT_1_2]
ACHIEVED=0
"#;

    #[test]
    fn test_indexed_two_earned() {
        let s = parse_ini_content(INDEXED);
        assert_eq!(s.count, 3);
        assert_eq!(s.unlocked.len(), 2);
        assert_eq!(s.unlocked["NEW_ACHIEVEMENT_1_1"], 1773296308);
        assert_eq!(s.unlocked["NEW_ACHIEVEMENT_1_3"], 1773999999);
        assert!(!s.unlocked.contains_key("NEW_ACHIEVEMENT_1_2"));
    }

    #[test]
    fn test_bare_two_earned() {
        let s = parse_ini_content(BARE);
        assert_eq!(s.unlocked.len(), 2);
        assert!(s.unlocked.contains_key("NEW_ACHIEVEMENT_1_1"));
        assert!(s.unlocked.contains_key("NEW_ACHIEVEMENT_1_3"));
        assert_eq!(s.all_names.len(), 3);
    }

    #[test]
    fn test_system_headers_skipped_in_bare() {
        let s = parse_ini_content(WITH_SYSTEM_HEADERS);
        assert!(s.unlocked.contains_key("NEW_ACHIEVEMENT_1_1"));
        assert!(!s.all_names.contains("Settings"));
        assert!(!s.all_names.contains("Interfaces"));
    }

    #[test]
    fn test_mixed_case_keys() {
        let s = parse_ini_content(MIXED_CASE_KEYS);
        // lowercase section name should still produce one unlock
        assert_eq!(s.unlocked.len(), 1);
        let ts = s.unlocked.values().next().copied().unwrap();
        assert_eq!(ts, 1773296308);
    }

    #[test]
    fn test_diff_unlocked() {
        let prev: HashSet<String> = ["A".to_string()].into();
        let curr: HashMap<String, u64> =
            [("A".to_string(), 100), ("B".to_string(), 200)].into();
        let diff = diff_unlocked(&prev, &curr);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].0, "B");
        assert_eq!(diff[0].1, 200);
    }
}
