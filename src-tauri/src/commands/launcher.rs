use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::queries::get_game_by_id;
use crate::state::{AppState, LaunchSource, ProcessIdentity};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Launch a process elevated using ShellExecuteExW to immediately retrieve its Process ID.
#[cfg(target_os = "windows")]
fn launch_elevated(exe_path: &str, working_dir: &str) -> Result<u32, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError};
    use windows_sys::Win32::System::Threading::GetProcessId;
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let exe_utf16: Vec<u16> = std::ffi::OsStr::new(exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let cwd_utf16: Vec<u16> = std::ffi::OsStr::new(working_dir)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let verb_utf16: Vec<u16> = std::ffi::OsStr::new("runas")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI;
    info.lpVerb = verb_utf16.as_ptr();
    info.lpFile = exe_utf16.as_ptr();
    if !working_dir.is_empty() {
        info.lpDirectory = cwd_utf16.as_ptr();
    }
    info.nShow = SW_SHOWNORMAL as i32;

    log::info!("Launching elevated via ShellExecute: {}", exe_path);

    let res = unsafe { ShellExecuteExW(&mut info) };
    if res == 0 {
        let err = unsafe { GetLastError() };
        return Err(format!("ShellExecuteEx failed with error code: {}", err));
    }

    let h_process = info.hProcess;
    if h_process == 0 {
        return Err("Elevation succeeded but process handle was null".to_string());
    }

    let pid = unsafe { GetProcessId(h_process) };
    unsafe { CloseHandle(h_process) };

    if pid == 0 {
        return Err("Failed to get process ID from handle".to_string());
    }

    Ok(pid)
}

#[cfg(not(target_os = "windows"))]
fn launch_elevated(exe_path: &str, working_dir: &str) -> Result<u32, String> {
    let _ = working_dir;
    let child = Command::new(exe_path)
        .spawn()
        .map_err(|e| format!("Failed to spawn: {e}"))?;
    Ok(child.id())
}

#[tauri::command]
pub async fn launch_game(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let game = get_game_by_id(&state.read_pool, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", id))?;

    log::info!("Launching game '{}' ({})", game.title, id);

    // P1c: Username Patching
    if let Ok(Some(profile)) = crate::profile::get_profile(state.clone()).await {
        if let Some(install_dir) = game.install_dir.as_ref() {
            let path = Path::new(install_dir);
            match crate::patcher::patch_game(path, &profile.username, &profile.steam_id) {
                Ok(files) if !files.is_empty() => {
                    log::info!("Patched {} config files for game {}", files.len(), game.title);
                }
                Ok(_) => log::debug!("No configurations needed patching for game {}", game.title),
                Err(e) => log::error!("Failed to patch configs for game {}: {}", game.title, e),
            }
        }
    }

    let clean_exe_path = game.exe_path.trim().trim_matches('"').trim().to_string();
    let mut working_dir = game
        .install_dir
        .clone()
        .unwrap_or_default()
        .trim()
        .trim_matches('"')
        .trim()
        .to_string();

    let exe_path = Path::new(&clean_exe_path);

    if !exe_path.exists() {
        return Err(format!("Executable not found: {}", clean_exe_path));
    }

    if working_dir.is_empty() {
        working_dir = exe_path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
    }

    /*
    ==========================================
    ELEVATED LAUNCH
    ==========================================
    */

    if game.run_as_admin {
        log::info!("Game '{}' requires admin rights", game.title);

        let pid = launch_elevated(&clean_exe_path, &working_dir)?;

        app.emit(
            "game-started",
            json!({ "game_id": id, "source": "Launcher", "elevated": true, "pid": pid }),
        )
        .ok();

        // Show overlay, trigger toast, and start achievement watcher
        let stop_flag = show_overlay_and_start_watcher(&app, &id, &game.title, game.cover_path.as_ref(), &working_dir, game.steam_app_id, true, &state);

        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]));
        let start_time = crate::process::identity::get_process_start_time(pid, &sys).unwrap_or(0);

        {
            let mut running = state.running_games.lock().unwrap();
            running.insert(
                id.clone(),
                ProcessIdentity {
                    pid,
                    exe_path: clean_exe_path.to_lowercase(),
                    start_time,
                    game_id: id.clone(),
                    launched_by: LaunchSource::Launcher,
                    elevated: true,
                    elevated_stop_flag: stop_flag,
                    achievement_watcher_stop_flag: None,
                },
            );
        }

        log::info!("Elevated game '{}' launched successfully (PID {})", game.title, pid);
        return Ok(());
    }

    /*
    ==========================================
    NORMAL LAUNCH
    ==========================================
    */

    let mut cmd = Command::new(&clean_exe_path);

    if !working_dir.is_empty() {
        cmd.current_dir(&working_dir);
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x00000008); // DETACHED_PROCESS

    let pid = match cmd.spawn() {
        Ok(child) => child.id(),
        Err(e) => {
            if let Some(740) = e.raw_os_error() {
        log::info!("Game requires elevation (OS 740), retrying RunAs");

        let pid = launch_elevated(&clean_exe_path, &working_dir)?;

        app.emit(
            "game-started",
            json!({ "game_id": id, "source": "Launcher", "elevated": true, "pid": pid }),
        )
        .ok();

        let stop_flag = show_overlay_and_start_watcher(&app, &id, &game.title, game.cover_path.as_ref(), &working_dir, game.steam_app_id, true, &state);

        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]));
        let start_time = crate::process::identity::get_process_start_time(pid, &sys).unwrap_or(0);

        {
            let mut running = state.running_games.lock().unwrap();
            running.insert(
                id.clone(),
                ProcessIdentity {
                    pid,
                    exe_path: clean_exe_path.to_lowercase(),
                    start_time,
                    game_id: id.clone(),
                    launched_by: LaunchSource::Launcher,
                    elevated: true,
                    elevated_stop_flag: stop_flag,
                    achievement_watcher_stop_flag: None,
                },
            );
        }

        return Ok(());
    }

            return Err(format!("Failed to launch '{}': {}", clean_exe_path, e));
        }
    };

    /*
    ==========================================
    PROCESS IDENTITY (NORMAL LAUNCH)
    ==========================================
    */

    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(
        pid,
    )]));

    let start_time = crate::process::identity::get_process_start_time(pid, &sys).unwrap_or(0);

    {
        let mut running = state.running_games.lock().unwrap();
        running.insert(
            id.clone(),
            ProcessIdentity {
                pid,
                exe_path: clean_exe_path.to_lowercase(),
                start_time,
                game_id: id.clone(),
                launched_by: LaunchSource::Launcher,
                elevated: false,
                elevated_stop_flag: None,
                achievement_watcher_stop_flag: None,
            },
        );
    }

    app.emit(
        "game-started",
        json!({ "game_id": id, "source": "Launcher", "pid": pid }),
    )
    .ok();

    // Show overlay, trigger toast, and start achievement watcher
    show_overlay_and_start_watcher(&app, &id, &game.title, game.cover_path.as_ref(), &working_dir, game.steam_app_id, false, &state);

    log::info!("Game '{}' launched successfully (PID {})", game.title, pid);

    Ok(())
}

/// Show the overlay window, emit the start toast, and launch the achievement watcher if applicable.
fn show_overlay_and_start_watcher(
    app: &AppHandle, 
    game_id: &str, 
    title: &str, 
    cover_path: Option<&String>, 
    install_dir: &str, 
    db_steam_app_id: Option<u32>,
    is_elevated: bool,
    state: &State<'_, AppState>,
) -> Option<Arc<std::sync::atomic::AtomicBool>> {
    let mut overlay_stop_flag = None;
    // Show overlay and emit "Now Playing" toast
    if let Some(overlay) = app.get_webview_window("achievement-overlay") {
        let _ = overlay.show();
        let _ = overlay.set_always_on_top(true);
        
        // --- ADMIN GAME OVERLAY FIX ---
        // If the game is elevated, our medium-integrity Tauri process can't easily push 
        // its window above the high-integrity game window using standard OS messages.
        // We spawn a dedicated native thread to hammer SetWindowPos.
        if is_elevated {
            if let Ok(hwnd) = overlay.hwnd() {
                let hwnd_isize = hwnd.0 as isize;
                let game_id_clone = game_id.to_string();
                
                let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
                let stop_clone = Arc::clone(&stop);
                overlay_stop_flag = Some(stop);
                
                std::thread::spawn(move || {
                    use std::sync::atomic::Ordering;
                    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE};
                    log::info!("Started elevated overlay persistence thread for game ID: {}", game_id_clone);
                    
                    while !stop_clone.load(Ordering::Relaxed) {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        unsafe {
                            SetWindowPos(hwnd_isize as _, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                        }
                    }
                    log::info!("Game {} stopped, terminating elevated overlay thread.", game_id_clone);
                });
            }
        }
        
        // Encode cover image to Base64 to bypass strict local file restrictions over custom schemes
        let cover_base64 = cover_path.and_then(|p| std::fs::read(p).ok()).map(|bytes| {
            use base64::Engine;
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let ext = std::path::Path::new(cover_path.unwrap())
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("jpg")
                .to_lowercase();
                
            let mime = match ext.as_str() {
                "png" => "image/png",
                "webp" => "image/webp",
                "gif" => "image/gif",
                _ => "image/jpeg",
            };
            format!("data:{};base64,{}", mime, encoded)
        });

        let _ = overlay.emit("game-started-toast", json!({
            "title": title,
            "coverBase64": cover_base64
        }));
    }

    let scan_roots = crate::settings::default_scan_roots();

    // Resolve app_id from file or DB
    let game_path = std::path::Path::new(install_dir);
    let app_id = crate::achievements::resolve_app_id(game_path)
        .or_else(|| db_steam_app_id.map(|id| id.to_string()));

    if let Some(app_id) = app_id {
        // Only start watcher if steam_settings/achievements.json exists
        let meta_path = game_path.join("steam_settings").join("achievements.json");
        let saves_likely_exist = crate::achievements::resolve_save_path(Some(&app_id), game_path, None, &scan_roots, None).is_some();

        if meta_path.exists() || saves_likely_exist {
            if let Err(e) = crate::achievement_watcher::watch_game_achievements(
                app.clone(),
                state.clone(),
                game_id.to_string(),
                install_dir.to_string(),
                app_id.clone(),
            ) {
                log::warn!("Could not start achievement watcher: {}", e);
            } else {
                log::info!("Achievement watcher started for app_id={}", app_id);
            }
        }
    }
    overlay_stop_flag
}

#[tauri::command]
pub async fn toggle_run_as_admin(
    id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db_tx
        .send(crate::state::DbWrite::Game(
            crate::state::GameDbWrite::UpdateRunAsAdmin {
                game_id: id,
                enabled: enabled,
            },
        ))
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn kill_process(pid: u32, is_elevated: bool) -> bool {
    let mut sys = sysinfo::System::new();
    
    // Elevated processes can't easily be gracefully closed from a non-elevated launcher 
    // without popping UAC twice (once for graceful, once for force if it fails).
    // So we just force kill them directly with one UAC prompt.
    if is_elevated {
        log::info!("Elevated game - using force taskkill directly");
        let ps_script = format!("Start-Process taskkill -ArgumentList '/F /T /PID {}' -Verb RunAs -WindowStyle Hidden", pid);
        let result = Command::new("powershell")
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &ps_script,
            ])
            .creation_flags(0x00000008) // DETACHED_PROCESS
            .output();

        match result {
            Ok(output) => {
                let success = output.status.success();
                if !success {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!("taskkill failed for PID {}: {}", pid, stderr.trim());
                }
                success
            }
            Err(e) => {
                log::error!("Failed to run taskkill for PID {}: {}", pid, e);
                false
            }
        }
    } else {
        // For non-elevated games, try graceful close (Alt+F4 behavior) first
        log::info!("Attempting graceful close for PID {}", pid);
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T"])
            .creation_flags(0x00000008)
            .output();

        // Give the game 1.5 seconds to save data and cleanly exit
        std::thread::sleep(std::time::Duration::from_millis(1500));

        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]));
        if sys.process(sysinfo::Pid::from_u32(pid)).is_none() {
            log::info!("Process {} closed gracefully.", pid);
            return true;
        }

        log::info!("Process {} did not close gracefully. Proceeding with force kill.", pid);
        let force_result = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x00000008)
            .output();
            
        match force_result {
            Ok(output) if output.status.success() => true,
            _ => {
                // Fallback to sysinfo kill if taskkill fails
                sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]));
                if let Some(process) = sys.process(sysinfo::Pid::from_u32(pid)) {
                    process.kill();
                    true
                } else {
                    false
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn kill_process(pid: u32, _is_elevated: bool) -> bool {
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]));
    if let Some(process) = sys.process(sysinfo::Pid::from_u32(pid)) {
        process.kill();
        true
    } else {
        false
    }
}

#[tauri::command]
pub async fn force_stop_game(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let identity = {
        let running = state.running_games.lock().unwrap();
        running.get(&id).cloned()
    };

    if let Some(identity) = identity {
        let killed = kill_process(identity.pid, identity.elevated);

        if killed {
            if let Some(flag) = &identity.elevated_stop_flag {
                flag.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            
            log::info!("Force stopped game '{}' (PID {})", id, identity.pid);
            
            // CRITICAL FIX: We do NOT remove the game from `running_games` here anymore!
            // The `monitor` loop will spot that the process has exited on its next 2-second tick.
            // It will then cleanly remove it, save the playtime to DB, and emit the `game-stopped` event.
            // It will then also stop the achievement watcher if it's running.
        } else {
            log::warn!(
                "PID {} for game '{}' could not be killed — it may require elevation or has already exited.",
                identity.pid,
                id
            );
            // Return an error so the frontend knows the kill failed, allowing it to revert the button state to "Running"
            return Err("Failed to force stop the game. The process may require admin privileges or is already closed.".to_string());
        }
    } else {
        log::warn!(
            "force_stop called for '{}' but it's not in running_games",
            id
        );
        return Err("Game is not tracked as running.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn open_path_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("Not supported on this OS".to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshResult {
    pub app_id_updated: bool,
    pub save_path_found: bool,
    pub rawg_refreshed: bool,
}

#[tauri::command]
pub async fn resolve_game_app_id(game_id: String, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let game = get_game_by_id(&state.read_pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    let game_path = PathBuf::from(game.install_dir.as_ref().unwrap_or(&game.exe_path));
    let app_id = crate::achievements::resolve_app_id(&game_path);
    Ok(app_id)
}

#[tauri::command]
pub async fn refresh_game_metadata(game_id: String, state: State<'_, AppState>, app: AppHandle) -> Result<RefreshResult, String> {
    // In-flight guard: prevent concurrent metadata refresh for the same game
    {
        let mut in_flight = state.metadata_refresh_lock.lock().await;
        if !in_flight.insert(game_id.clone()) {
            return Err("Refresh already in progress for this game".into());
        }
    }

    // Wrap the internal logic so we can guarantee the guard is dropped at the end
    let result = refresh_game_metadata_internal(&game_id, &state, &app).await;

    // Guaranteed cleanup runs
    state.metadata_refresh_lock.lock().await.remove(&game_id);

    result
}

async fn refresh_game_metadata_internal(game_id: &str, state: &State<'_, AppState>, app: &AppHandle) -> Result<RefreshResult, String> {
    // 1. Fetch game from DB
    let game = get_game_by_id(&state.read_pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    let install_dir = game.install_dir.clone().unwrap_or_else(|| {
        Path::new(&game.exe_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
    });
    let game_path = PathBuf::from(&install_dir);

    // 2. Scan for app_id
    let found_app_id = crate::achievements::resolve_app_id(&game_path);
    let app_id_changed = found_app_id.is_some() && found_app_id.as_deref() != game.steam_app_id.as_ref().map(|id| id.to_string()).as_deref();

    // 3. Update DB if new app_id found
    if let Some(ref id_str) = found_app_id {
        if app_id_changed {
            if let Ok(app_id_u32) = id_str.parse::<u32>() {
                state.db_tx.send(crate::state::DbWrite::Game(crate::state::GameDbWrite::UpdateSteamAppId {
                    game_id: game_id.to_string(),
                    steam_app_id: Some(app_id_u32),
                })).map_err(|e| e.to_string())?;
            }
        }
    }

    // 4. Resolve save path with new or existing app_id
    let scan_roots = crate::settings::default_scan_roots();
    let effective_app_id = found_app_id.clone().or_else(|| game.steam_app_id.as_ref().map(|id| id.to_string()));
    let save_path = crate::achievements::resolve_save_path(effective_app_id.as_deref(), &game_path, game.manual_achievement_path.as_deref(), &scan_roots, None);

    // 5. Re-fetch RAWG logic removed as we are now offline-first
    let rawg_refreshed = false;

    // 6. Emit event for UI reactivity
    let _ = app.emit("game-metadata-refreshed", &game_id);

    Ok(RefreshResult {
        app_id_updated: app_id_changed,
        save_path_found: save_path.is_some(),
        rawg_refreshed,
    })
}

// ── Force Borderless ──────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod borderless {
    use std::sync::atomic::{AtomicIsize, Ordering};
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, TRUE, FALSE};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible,
        SetWindowLongW, SetWindowPos, GetSystemMetrics,
        GWL_STYLE, HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE,
        WS_POPUP, WS_VISIBLE, SM_CXSCREEN, SM_CYSCREEN,
    };

    static FOUND_HWND: AtomicIsize = AtomicIsize::new(0);

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // Skip invisible windows
        if IsWindowVisible(hwnd) == 0 {
            return TRUE;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == lparam as u32 {
            FOUND_HWND.store(hwnd, Ordering::SeqCst);
            return FALSE; // Stop enumeration — found our window
        }
        TRUE
    }

    pub fn force_borderless_impl(game_pid: u32) -> Result<(), String> {
        unsafe {
            FOUND_HWND.store(0, Ordering::SeqCst);
            EnumWindows(Some(enum_proc), game_pid as LPARAM);
            let hwnd = FOUND_HWND.load(Ordering::SeqCst);
            if hwnd == 0 {
                return Err(format!(
                    "Could not find a visible window for PID {}. The game may use a child window or not be fully loaded yet.",
                    game_pid
                ));
            }

            // Strip caption and thick-frame (title bar + resize border), keep popup + visible
            let new_style = (WS_POPUP | WS_VISIBLE) as i32;
            SetWindowLongW(hwnd, GWL_STYLE, new_style);

            // Move to cover the full screen and make TOPMOST
            let w = GetSystemMetrics(SM_CXSCREEN);
            let h = GetSystemMetrics(SM_CYSCREEN);
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0, 0, w, h,
                SWP_FRAMECHANGED | SWP_NOACTIVATE,
            );

            log::info!("Forced borderless on HWND {:x} for PID {}", hwnd as usize, game_pid);
        }
        Ok(())
    }
}

/// Force a game window into borderless fullscreen so the overlay can sit on top.
/// Finds the game's window by PID using EnumWindows (not FindWindowW, which requires
/// a known title/class). Strips WS_CAPTION and WS_THICKFRAME, resizes to full screen,
/// and marks the window HWND_TOPMOST.
#[tauri::command]
pub fn force_borderless(game_pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        borderless::force_borderless_impl(game_pid)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = game_pid;
        Err("force_borderless is only supported on Windows".to_string())
    }
}
