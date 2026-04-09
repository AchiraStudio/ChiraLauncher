use anyhow::Result;
use ini::Ini;
use std::path::Path;
use std::fs;
use encoding_rs::{UTF_16LE, UTF_16BE, UTF_8};

#[derive(Debug, Clone)]
enum ConfigType {
    Ini { section: &'static str, key: &'static str },
    Txt,
}

#[derive(Debug, Clone)]
struct PatcherRule {
    relative_path: &'static str,
    config_type: ConfigType,
    field: PatchField,
}

#[derive(Debug, Clone)]
enum PatchField {
    Username,
    SteamId,
}

const PATCHER_RULES: &[PatcherRule] = &[
    // Goldberg
    PatcherRule { relative_path: "steam_settings/account_name.txt", config_type: ConfigType::Txt, field: PatchField::Username },
    PatcherRule { relative_path: "settings/account_name.txt", config_type: ConfigType::Txt, field: PatchField::Username },
    PatcherRule { relative_path: "steam_settings/user_steam_id.txt", config_type: ConfigType::Txt, field: PatchField::SteamId },
    // CODEX
    PatcherRule { relative_path: "steamclient.ini", config_type: ConfigType::Ini { section: "Settings", key: "UserName" }, field: PatchField::Username },
    // Razor1911
    PatcherRule { relative_path: "steam_api.ini", config_type: ConfigType::Ini { section: "Razor1911", key: "UserName" }, field: PatchField::Username },
    // ALI213
    PatcherRule { relative_path: "ALI213.ini", config_type: ConfigType::Ini { section: "Settings", key: "UserName" }, field: PatchField::Username },
    // 3DM
    PatcherRule { relative_path: "3dmgame.ini", config_type: ConfigType::Ini { section: "Settings", key: "UserName" }, field: PatchField::Username },
    // New pattern: configs.user.ini
    PatcherRule { relative_path: "steam_settings/configs.user.ini", config_type: ConfigType::Ini { section: "user::general", key: "account_name" }, field: PatchField::Username },
];

pub fn patch_game(install_dir: &Path, username: &str, steam_id: &Option<String>) -> Result<Vec<String>> {
    let mut patched_files = Vec::new();

    // 1. Fixed-path rules
    for rule in PATCHER_RULES {
        let full_path = install_dir.join(rule.relative_path);
        if !full_path.exists() {
            continue;
        }

        let value_to_patch = match rule.field {
            PatchField::Username => username,
            PatchField::SteamId => {
                if let Some(sid) = steam_id {
                    sid.as_str()
                } else {
                    continue; // Skip if no steam_id provided but rule requires it
                }
            }
        };

        match &rule.config_type {
            ConfigType::Txt => {
                if let Ok(was_patched) = patch_txt_file(&full_path, value_to_patch) {
                    if was_patched {
                        patched_files.push(rule.relative_path.to_string());
                    }
                }
            }
            ConfigType::Ini { section, key } => {
                if let Ok(was_patched) = patch_ini_file(&full_path, section, key, value_to_patch) {
                    if was_patched {
                        patched_files.push(rule.relative_path.to_string());
                    }
                }
            }
        }
    }

    // 2. Dynamic search for steam_emu.ini (Recursive)
    for entry in walkdir::WalkDir::new(install_dir)
        .max_depth(5) // Don't go too deep for performance
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name() == "steam_emu.ini")
    {
        let full_path = entry.path();
        if let Ok(was_patched) = patch_ini_file(&full_path, "Settings", "UserName", username) {
            if was_patched {
                let rel = full_path.strip_prefix(install_dir).unwrap_or(full_path);
                patched_files.push(rel.to_string_lossy().to_string());
            }
        }
    }

    Ok(patched_files)
}

fn patch_txt_file(path: &Path, new_value: &str) -> Result<bool> {
    let raw_bytes = fs::read(path)?;
    let (content, encoding) = decode_with_bom(&raw_bytes);
    
    let trimmed_content = content.trim();
    if trimmed_content == new_value {
        return Ok(false); // Idempotent
    }

    // Create backup
    create_bak_simple(path)?;

    // Encode and write
    let (encoded_bytes, _, _) = encoding.encode(new_value);
    fs::write(path, encoded_bytes)?;

    Ok(true)
}

fn patch_ini_file(path: &Path, section: &str, key: &str, new_value: &str) -> Result<bool> {
    let raw_bytes = fs::read(path)?;
    let (content, encoding) = decode_with_bom(&raw_bytes);

    // Use ini crate on the decoded string
    let mut conf = Ini::load_from_str(&content)
        .map_err(|e| anyhow::anyhow!("Failed to parse INI: {}", e))?;

    let existing_value = conf.get_from(Some(section), key);
    if existing_value == Some(new_value) {
        return Ok(false); // Idempotent
    }

    // Update
    conf.with_section(Some(section)).set(key, new_value);

    // Create backup
    create_bak_simple(path)?;

    // Serialize back to string
    let mut output = Vec::new();
    conf.write_to(&mut output)?;
    let output_str = String::from_utf8(output)?;

    // Encode with original encoding
    let (encoded_bytes, _, _) = encoding.encode(&output_str);
    fs::write(path, encoded_bytes)?;

    Ok(true)
}

fn decode_with_bom(bytes: &[u8]) -> (String, &'static encoding_rs::Encoding) {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (res, _, _) = UTF_16LE.decode(&bytes[2..]);
        (res.into_owned(), UTF_16LE)
    } else if bytes.starts_with(&[0xFE, 0xFF]) {
        let (res, _, _) = UTF_16BE.decode(&bytes[2..]);
        (res.into_owned(), UTF_16BE)
    } else if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (res, _, _) = UTF_8.decode(&bytes[3..]);
        (res.into_owned(), UTF_8)
    } else {
        // Fallback to UTF-8 without BOM
        let (res, _, _) = UTF_8.decode(bytes);
        (res.into_owned(), UTF_8)
    }
}

fn create_bak_simple(path: &Path) -> Result<()> {
    let mut bak_path = path.to_path_buf();
    let ext = bak_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    bak_path.set_extension(format!("{}.bak", ext));
    
    if !bak_path.exists() {
        fs::copy(path, bak_path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_bom_detection() {
        let utf16le = vec![0xFF, 0xFE, 0x41, 0x00, 0x42, 0x00]; // "AB"
        let (decoded, encoding) = decode_with_bom(&utf16le);
        assert_eq!(decoded.trim(), "AB");
        assert_eq!(encoding.name(), "UTF-16LE");

        let utf8_bom = vec![0xEF, 0xBB, 0xBF, 0x41, 0x42]; // "AB"
        let (decoded, encoding) = decode_with_bom(&utf8_bom);
        assert_eq!(decoded.trim(), "AB");
        assert_eq!(encoding.name(), "UTF-8");
    }

    #[test]
    fn test_txt_patching_idempotency() -> Result<()> {
        let dir = tempdir()?;
        let file_path = dir.path().join("test.txt");
        
        // Initial write
        fs::write(&file_path, "old_name")?;
        
        // First patch
        let changed = patch_txt_file(&file_path, "new_name")?;
        assert!(changed);
        assert_eq!(fs::read_to_string(&file_path)?, "new_name");
        assert!(file_path.with_extension("txt.bak").exists());

        // Second patch (identical)
        let changed = patch_txt_file(&file_path, "new_name")?;
        assert!(!changed); // Should be false
        
        Ok(())
    }

    #[test]
    fn test_recursive_steam_emu_patching() -> Result<()> {
        let dir = tempdir()?;
        let sub_dir = dir.path().join("subdir/engine");
        fs::create_dir_all(&sub_dir)?;
        
        let emu_path = sub_dir.join("steam_emu.ini");
        fs::write(&emu_path, "[Settings]\nUserName=OldName")?;
        
        let patched = patch_game(dir.path(), "NewName", &None)?;
        assert_eq!(patched.len(), 1);
        
        let content = fs::read_to_string(&emu_path)?;
        assert!(content.contains("UserName") && content.contains("NewName"));
        
        Ok(())
    }

    #[test]
    fn test_configs_user_patching() -> Result<()> {
        let dir = tempdir()?;
        let config_dir = dir.path().join("steam_settings");
        fs::create_dir_all(&config_dir)?;
        
        let config_path = config_dir.join("configs.user.ini");
        fs::write(&config_path, "[user::general]\naccount_name=OldUser")?;
        
        let patched = patch_game(dir.path(), "NewUser", &None)?;
        assert_eq!(patched.len(), 1);
        assert!(patched[0].contains("configs.user.ini"));
        
        let content = fs::read_to_string(config_path)?;
        assert!(content.contains("account_name") && content.contains("NewUser"));
        
        Ok(())
    }
}

