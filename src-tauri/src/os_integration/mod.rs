use std::path::PathBuf;
use std::fs;
use mslnk::ShellLink;
use winreg::enums::*;
use winreg::RegKey;
use anyhow::{Result, anyhow};
use rusqlite::Connection;
use windows_sys::Win32::UI::Shell::ExtractIconExW;
use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON};
use windows_sys::Win32::Graphics::Gdi::{GetObjectW, BITMAP, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, CreateCompatibleDC, DeleteDC};

const UNINSTALL_REG_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";

pub struct OsIntegrationInfo {
    pub game_id: String,
    pub title: String,
    pub exe_path: String,
    pub install_dir: String,
    pub icon_path: Option<String>,
    pub size_kb: u64,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn sanitize_filename(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ':' => ' ',
            '\\' | '/' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect()
}

fn get_start_menu_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|mut d| {
        d.push("Microsoft\\Windows\\Start Menu\\Programs\\Chira Launcher");
        d
    })
}

fn get_desktop_dir() -> Option<PathBuf> {
    dirs::desktop_dir()
}

// ── Create ────────────────────────────────────────────────────────────────────

pub fn create_os_integration(info: &OsIntegrationInfo) -> Result<()> {
    create_desktop_lnk(info)?; 
    create_start_menu_entry(info)?;
    register_uninstall_info(info)?;
    Ok(())
}

fn create_desktop_lnk(info: &OsIntegrationInfo) -> Result<()> {
    let desktop = get_desktop_dir().ok_or_else(|| anyhow!("Could not find desktop directory"))?;
    let lnk_path = desktop.join(format!("{}.lnk", sanitize_filename(&info.title)));
    write_shortcut(&lnk_path, info)
}

fn create_start_menu_entry(info: &OsIntegrationInfo) -> Result<()> {
    let path = get_start_menu_dir().ok_or_else(|| anyhow!("Could not find appdata directory"))?;

    if !path.exists() {
        fs::create_dir_all(&path)?;
    }

    let lnk_path = path.join(format!("{}.lnk", sanitize_filename(&info.title)));
    write_shortcut(&lnk_path, info)
}

fn write_shortcut(lnk_path: &PathBuf, info: &OsIntegrationInfo) -> Result<()> {
    let current_exe = std::env::current_exe()?;
    let current_exe_str = current_exe.to_string_lossy();

    let mut sl = ShellLink::new(current_exe_str.as_ref())?;
    sl.set_arguments(Some(format!("--launch-game {}", info.game_id)));
    sl.set_working_dir(Some(info.install_dir.clone()));

    if let Some(icon_path) = &info.icon_path {
        sl.set_icon_location(Some(icon_path.clone()));
    } else {
        sl.set_icon_location(Some(info.exe_path.clone()));
    }

    sl.create_lnk(lnk_path)?;
    Ok(())
}

fn register_uninstall_info(info: &OsIntegrationInfo) -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key_name = format!("ChiraLauncher_{}", info.game_id);
    let subkey_path = format!("{}\\{}", UNINSTALL_REG_PATH, key_name);

    let (key, _) = hkcu.create_subkey(&subkey_path)?;

    let current_exe = std::env::current_exe()?;
    let uninstall_cmd = format!("\"{}\" --remove-game {}", current_exe.to_string_lossy(), info.game_id);

    key.set_value("DisplayName", &info.title)?;
    key.set_value("UninstallString", &uninstall_cmd)?;
    key.set_value("DisplayIcon", &current_exe.to_string_lossy().to_string())?;
    key.set_value("Publisher", &"ChiraLauncher")?;
    key.set_value("EstimatedSize", &(info.size_kb as u32))?;
    key.set_value("NoModify", &1u32)?;
    key.set_value("NoRepair", &1u32)?;
    key.set_value("DisplayVersion", &"1.0.0")?;
    key.set_value("URLInfoAbout", &"https://github.com/achirastudios/Chira-Launcher")?;

    Ok(())
}

// ── Remove ────────────────────────────────────────────────────────────────────

pub fn remove_os_integration(game_id: &str, title: &str) -> Result<()> {
    let safe_title = sanitize_filename(title);

    if let Some(desktop) = get_desktop_dir() {
        let by_title = desktop.join(format!("{}.lnk", safe_title));
        if by_title.exists() {
            fs::remove_file(&by_title).ok();
        }
        let url_title = desktop.join(format!("{}.url", safe_title));
        if url_title.exists() {
            fs::remove_file(&url_title).ok();
        }
        let by_id = desktop.join(format!("chiralauncher_{}.lnk", game_id));
        if by_id.exists() {
            fs::remove_file(&by_id).ok();
        }
    }

    if let Some(start_menu) = get_start_menu_dir() {
        let by_title = start_menu.join(format!("{}.lnk", safe_title));
        if by_title.exists() {
            fs::remove_file(&by_title).ok();
        }
        if let Ok(mut entries) = fs::read_dir(&start_menu) as std::io::Result<std::fs::ReadDir> {
            if entries.next().is_none() {
                fs::remove_dir(&start_menu).ok();
            }
        }
    }

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key_name = format!("ChiraLauncher_{}", game_id);
    let uninstall_key_path = format!("{}\\{}", UNINSTALL_REG_PATH, key_name);
    hkcu.delete_subkey_all(&uninstall_key_path).ok();

    Ok(())
}

pub fn remove_os_integration_by_id(conn: &Connection, game_id: &str) -> Result<()> {
    let title: String = conn
        .query_row("SELECT title FROM games WHERE id = ?1", [game_id], |row| row.get(0))
        .map_err(|_| anyhow!("Game '{}' not found in DB for cleanup", game_id))?;

    remove_os_integration(game_id, &title)
}

// ── Toggle Single ─────────────────────────────────────────────────────────────

fn remove_os_integration_single(info: &OsIntegrationInfo, integration_type: &str) -> Result<()> {
    match integration_type {
        "desktop" => {
            if let Some(desktop) = get_desktop_dir() {
                let path = desktop.join(format!("{}.lnk", sanitize_filename(&info.title)));
                if path.exists() { let _ = fs::remove_file(path); }
                let url_path = desktop.join(format!("{}.url", sanitize_filename(&info.title)));
                if url_path.exists() { let _ = fs::remove_file(url_path); }
                let by_id = desktop.join(format!("chiralauncher_{}.lnk", info.game_id));
                if by_id.exists() { let _ = fs::remove_file(by_id); }
            }
        },
        "start_menu" => {
            if let Some(start_menu) = get_start_menu_dir() {
                let path = start_menu.join(format!("{}.lnk", sanitize_filename(&info.title)));
                if path.exists() { let _ = fs::remove_file(path); }
            }
        },
        "registry" => {
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let key_name = format!("ChiraLauncher_{}", info.game_id);
            let path = format!("{}\\{}", UNINSTALL_REG_PATH, key_name);
            if let Ok(uninstall_key) = hkcu.open_subkey_with_flags(UNINSTALL_REG_PATH, KEY_ALL_ACCESS) {
                let _ = uninstall_key.delete_subkey(&key_name);
            }
            hkcu.delete_subkey_all(&path).ok();
        },
        _ => {}
    }
    Ok(())
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_os_integration(
    game_id: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<crate::state::OsIntegration, String> {
    let pool = state.read_pool.clone();
    let conn = pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT game_id, has_desktop_shortcut, has_start_menu_shortcut, has_registry_entry FROM os_integration WHERE game_id = ?")
        .map_err(|e| e.to_string())?;

    let integration = stmt.query_row([&game_id], |row| {
        Ok(crate::state::OsIntegration {
            game_id: row.get(0)?,
            has_desktop_shortcut: row.get::<_, i32>(1)? != 0,
            has_start_menu_shortcut: row.get::<_, i32>(2)? != 0,
            has_registry_entry: row.get::<_, i32>(3)? != 0,
        })
    }).unwrap_or(crate::state::OsIntegration {
        game_id: game_id.clone(),
        has_desktop_shortcut: false,
        has_start_menu_shortcut: false,
        has_registry_entry: false,
    });

    Ok(integration)
}

#[tauri::command]
pub async fn toggle_os_integration(
    game_id: String,
    integration_type: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<crate::state::OsIntegration, String> {
    let mut current = get_os_integration(game_id.clone(), state.clone()).await?;

    let pool = state.read_pool.clone();
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT title, exe_path, install_dir, installed_size FROM games WHERE id = ?")
        .map_err(|e| e.to_string())?;

    let (title, exe_path, install_dir, size_kb): (String, String, Option<String>, Option<u64>) =
        stmt.query_row([&game_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?.map(|s| (s.max(0) as u64) / 1024),
            ))
        })
        .map_err(|e| format!("Game not found: {}", e))?;

    let install_dir = install_dir.unwrap_or_else(|| {
        std::path::Path::new(&exe_path)
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .to_string_lossy()
            .to_string()
    });

    let icon_path = find_game_icon(&exe_path, &install_dir, &game_id);

    let info = OsIntegrationInfo {
        game_id: game_id.clone(),
        title: title.clone(),
        exe_path: exe_path.clone(),
        install_dir,
        icon_path,
        size_kb: size_kb.unwrap_or(0),
    };

    match integration_type.as_str() {
        "desktop" => {
            if current.has_desktop_shortcut {
                remove_os_integration_single(&info, "desktop").map_err(|e| e.to_string())?;
                current.has_desktop_shortcut = false;
            } else {
                create_desktop_lnk(&info).map_err(|e| e.to_string())?;
                current.has_desktop_shortcut = true;
            }
        },
        "start_menu" => {
            if current.has_start_menu_shortcut {
                remove_os_integration_single(&info, "start_menu").map_err(|e| e.to_string())?;
                current.has_start_menu_shortcut = false;
            } else {
                create_start_menu_entry(&info).map_err(|e| e.to_string())?;
                current.has_start_menu_shortcut = true;
            }
        },
        "registry" => {
            if current.has_registry_entry {
                remove_os_integration_single(&info, "registry").map_err(|e| e.to_string())?;
                current.has_registry_entry = false;
            } else {
                register_uninstall_info(&info).map_err(|e| e.to_string())?;
                current.has_registry_entry = true;
            }
        },
        _ => return Err("Invalid integration type".to_string()),
    }

    state.db_tx.send(crate::state::DbWrite::Os(
        crate::state::OsDbWrite::UpdateIntegration(current.clone()),
    )).ok();

    Ok(current)
}

fn find_game_icon(exe_path: &str, install_dir: &str, game_id: &str) -> Option<String> {
    let install = std::path::Path::new(install_dir);
    if let Ok(entries) = fs::read_dir(install) as std::io::Result<std::fs::ReadDir> {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e: &std::ffi::OsStr| e.to_str()) == Some("ico") {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }
    
    if std::path::Path::new(exe_path).exists() {
        if let Some(app_data) = dirs::data_local_dir() {
            let icon_dir = app_data.join("ChiraLauncher").join("Icons");
            if fs::create_dir_all(&icon_dir).is_ok() {
                let cached_icon = icon_dir.join(format!("{}.ico", game_id));
                if cached_icon.exists() {
                    return Some(cached_icon.to_string_lossy().to_string());
                }
                if let Ok(_) = extract_game_icon_to_file(exe_path, &cached_icon) {
                    return Some(cached_icon.to_string_lossy().to_string());
                }
            }
        }
        Some(exe_path.to_string())
    } else {
        None
    }
}

fn extract_game_icon_to_file(exe_path: &str, out_path: &std::path::Path) -> anyhow::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    let wide_path: Vec<u16> = std::ffi::OsStr::new(exe_path).encode_wide().chain(std::iter::once(0)).collect();
    
    let mut icon_large: HICON = 0;
    
    unsafe {
        let count = ExtractIconExW(wide_path.as_ptr(), 0, &mut icon_large, std::ptr::null_mut(), 1);
        if count == 0 || icon_large == 0 {
            return Err(anyhow::anyhow!("No icons found or failed to extract from executable."));
        }
        let result = save_hicon_to_ico_file(icon_large, out_path);
        DestroyIcon(icon_large);
        result
    }
}

unsafe fn save_hicon_to_ico_file(hicon: HICON, out_path: &std::path::Path) -> anyhow::Result<()> {
    use std::io::Write;
    use windows_sys::Win32::UI::WindowsAndMessaging::ICONINFO;

    let mut info: ICONINFO = std::mem::zeroed();
    if GetIconInfo(hicon, &mut info) == 0 {
        return Err(anyhow::anyhow!("GetIconInfo failed"));
    }

    let hdc = CreateCompatibleDC(0);
    
    let get_dib_bits = |hbitmap| -> Option<(Vec<u8>, BITMAPINFOHEADER)> {
        let mut bitmap: BITMAP = std::mem::zeroed();
        if GetObjectW(hbitmap as _, std::mem::size_of::<BITMAP>() as i32, &mut bitmap as *mut _ as *mut _) == 0 {
            return None;
        }

        let mut header: BITMAPINFOHEADER = std::mem::zeroed();
        header.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        header.biWidth = bitmap.bmWidth;
        header.biHeight = bitmap.bmHeight;
        header.biPlanes = 1;
        header.biBitCount = bitmap.bmBitsPixel as u16;
        if header.biBitCount < 24 { header.biBitCount = 32; }
        header.biCompression = BI_RGB as u32;

        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader = header;

        GetDIBits(hdc, hbitmap, 0, bitmap.bmHeight as u32, std::ptr::null_mut(), &mut bmi, DIB_RGB_COLORS);
        let mut pixels: Vec<u8> = vec![0; bmi.bmiHeader.biSizeImage as usize];
        if GetDIBits(hdc, hbitmap, 0, bitmap.bmHeight as u32, pixels.as_mut_ptr() as *mut _, &mut bmi, DIB_RGB_COLORS) == 0 {
            return None;
        }
        Some((pixels, bmi.bmiHeader))
    };

    let color_data = get_dib_bits(info.hbmColor);
    let mask_data = get_dib_bits(info.hbmMask);

    DeleteDC(hdc);
    if info.hbmColor != 0 { windows_sys::Win32::Graphics::Gdi::DeleteObject(info.hbmColor as _); }
    if info.hbmMask != 0 { windows_sys::Win32::Graphics::Gdi::DeleteObject(info.hbmMask as _); }

    let (pixels, mut header) = color_data.ok_or_else(|| anyhow::anyhow!("Failed to read color bits"))?;
    header.biHeight *= 2; 

    let mask_len = mask_data.as_ref().map(|(m, _)| m.len()).unwrap_or(0);
    
    let mut file = std::fs::File::create(out_path)?;
    file.write_all(&[0, 0, 1, 0, 1, 0])?;
    file.write_all(&[header.biWidth as u8])?;
    file.write_all(&[(header.biHeight / 2) as u8])?;
    file.write_all(&[0, 0, 1, 0])?;
    file.write_all(&[header.biBitCount as u8, 0])?;
    
    let bytes_in_res = std::mem::size_of::<BITMAPINFOHEADER>() + pixels.len() + mask_len;
    file.write_all(&(bytes_in_res as u32).to_le_bytes())?;
    file.write_all(&22u32.to_le_bytes())?;

    file.write_all(unsafe { std::slice::from_raw_parts(&header as *const _ as *const u8, std::mem::size_of::<BITMAPINFOHEADER>()) })?;
    file.write_all(&pixels)?;
    if let Some((mask_bytes, _)) = mask_data {
        file.write_all(&mask_bytes)?;
    }
    
    Ok(())
}

pub fn cleanup_game_icon_cache(game_id: &str) {
    if let Some(dir) = dirs::data_local_dir() {
        let ico = dir.join("ChiraLauncher").join("Icons").join(format!("{}.ico", game_id));
        if ico.exists() { std::fs::remove_file(ico).ok(); }
    }
}

#[cfg(windows)]
pub fn set_launcher_aumid() {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
    
    let wide: Vec<u16> = std::ffi::OsStr::new("ChiraLauncher.Host")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
        
    unsafe {
        SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
    }
}

#[tauri::command]
pub fn create_all_shortcuts(game_id: String, title: String, exe_path: String, install_dir: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let safe_title = sanitize_filename(&title);

        // 1. Create Desktop Shortcut (.url using our custom URI and native icon)
        if let Some(desktop) = get_desktop_dir() {
            let desktop_shortcut_path = desktop.join(format!("{}.url", safe_title));
            // Fixed escaping of curly braces for the format! macro
            let content = format!(
                "[{{000214A0-0000-0000-C000-000000000046}}]\n\
                Prop3=19,11\n\
                [InternetShortcut]\n\
                IDList=\n\
                URL=chiralauncher://launch/{}\n\
                IconIndex=0\n\
                IconFile={}\n",
                game_id, exe_path
            );
            let _ = std::fs::write(&desktop_shortcut_path, content);
        }

        // 2. Create Start Menu Shortcut (.lnk in "Chira Launcher" folder using native icon)
        if let Some(mut start_menu) = dirs::data_dir() {
            start_menu.push("Microsoft\\Windows\\Start Menu\\Programs\\Chira Launcher");
            if !start_menu.exists() {
                let _ = std::fs::create_dir_all(&start_menu);
            }
            let lnk_path = start_menu.join(format!("{}.lnk", safe_title));

            if let Ok(current_exe) = std::env::current_exe() {
                if let Ok(mut sl) = mslnk::ShellLink::new(current_exe.to_string_lossy().as_ref()) {
                    sl.set_arguments(Some(format!("--launch-game {}", game_id)));
                    sl.set_working_dir(Some(install_dir));
                    sl.set_icon_location(Some(exe_path)); // Forces Windows to extract the icon from the game's EXE
                    let _ = sl.create_lnk(lnk_path);
                }
            }
        }
        
        Ok(())
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("Shortcuts are currently only supported on Windows.".to_string())
    }
}

// Companion command to instantly strip the shortcuts away
#[tauri::command]
pub fn remove_all_shortcuts(game_id: String, title: String) -> Result<(), String> {
    remove_os_integration(&game_id, &title).map_err(|e| e.to_string())
}