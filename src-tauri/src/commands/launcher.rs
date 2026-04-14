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
    use windows_sys::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
    };
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

    if let Ok(Some(profile)) = crate::profile::get_profile(state.clone()).await {
        if let Some(install_dir) = game.install_dir.as_ref() {
            let path = Path::new(install_dir);
            match crate::patcher::patch_game(path, &profile.username, &profile.steam_id) {
                Ok(files) if !files.is_empty() => {
                    log::info!(
                        "Patched {} config files for game {}",
                        files.len(),
                        game.title
                    );
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

    if game.run_as_admin {
        log::info!("Game '{}' requires admin rights", game.title);

        let pid = launch_elevated(&clean_exe_path, &working_dir)?;

        app.emit(
            "game-started",
            json!({ "game_id": id, "source": "Launcher", "elevated": true, "pid": pid }),
        )
        .ok();

        let stop_flag = show_overlay_and_start_watcher(
            &app,
            &id,
            &game.title,
            game.cover_path.as_ref(),
            &working_dir,
            game.steam_app_id,
            true,
            &state,
        );

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
                    install_dir: working_dir.clone(),
                    start_time,
                    game_id: id.clone(),
                    game_title: game.title.clone(),
                    launched_by: LaunchSource::Launcher,
                    elevated: true,
                    elevated_stop_flag: stop_flag,
                    achievement_watcher_stop_flag: None,
                },
            );
        }

        log::info!(
            "Elevated game '{}' launched successfully (PID {})",
            game.title,
            pid
        );
        return Ok(());
    }

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

                let stop_flag = show_overlay_and_start_watcher(
                    &app,
                    &id,
                    &game.title,
                    game.cover_path.as_ref(),
                    &working_dir,
                    game.steam_app_id,
                    true,
                    &state,
                );

                let mut sys = sysinfo::System::new();
                sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(
                    pid,
                )]));
                let start_time =
                    crate::process::identity::get_process_start_time(pid, &sys).unwrap_or(0);

                {
                    let mut running = state.running_games.lock().unwrap();
                    running.insert(
                        id.clone(),
                        ProcessIdentity {
                            pid,
                            exe_path: clean_exe_path.to_lowercase(),
                            install_dir: working_dir.clone(),
                            start_time,
                            game_id: id.clone(),
                            game_title: game.title.clone(),
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
                install_dir: working_dir.clone(),
                start_time,
                game_id: id.clone(),
                game_title: game.title.clone(),
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

    show_overlay_and_start_watcher(
        &app,
        &id,
        &game.title,
        game.cover_path.as_ref(),
        &working_dir,
        game.steam_app_id,
        false,
        &state,
    );

    log::info!("Game '{}' launched successfully (PID {})", game.title, pid);

    Ok(())
}

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

    if let Some(overlay) = app.get_webview_window("achievement-overlay") {
        let _ = overlay.show();
        let _ = overlay.set_always_on_top(true);

        if is_elevated {
            if let Ok(hwnd) = overlay.hwnd() {
                let hwnd_isize = hwnd.0 as isize;
                let game_id_clone = game_id.to_string();

                let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
                let stop_clone = Arc::clone(&stop);
                overlay_stop_flag = Some(stop);

                std::thread::spawn(move || {
                    use std::sync::atomic::Ordering;
                    use windows_sys::Win32::UI::WindowsAndMessaging::{
                        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
                    };
                    log::info!(
                        "Started elevated overlay persistence thread for game ID: {}",
                        game_id_clone
                    );

                    while !stop_clone.load(Ordering::Relaxed) {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        unsafe {
                            SetWindowPos(
                                hwnd_isize as _,
                                HWND_TOPMOST,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                            );
                        }
                    }
                    log::info!(
                        "Game {} stopped, terminating elevated overlay thread.",
                        game_id_clone
                    );
                });
            }
        }

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

        let _ = overlay.emit(
            "game-started-toast",
            json!({
                "title": title,
                "coverBase64": cover_base64
            }),
        );
    }

    let scan_roots = crate::settings::default_scan_roots();
    let game_path = std::path::Path::new(install_dir);
    let app_id = crate::achievements::resolve_app_id(game_path)
        .or_else(|| db_steam_app_id.map(|id| id.to_string()));

    if let Some(app_id) = app_id {
        let meta_path = game_path.join("steam_settings").join("achievements.json");
        let saves_likely_exist = crate::achievements::resolve_save_path(
            Some(&app_id),
            game_path,
            None,
            &scan_roots,
            None,
        )
        .is_some();

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

// ── AGGRESSIVE PROCESS KILLER ──
#[cfg(target_os = "windows")]
async fn kill_process(pid: u32, exe_path: &str, install_dir: &str, is_elevated: bool) -> bool {
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All);

    let target_dir = std::path::Path::new(install_dir);
    let mut pids_to_kill = vec![pid];

    let exe_file_name = std::path::Path::new(exe_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // 1. Gather PIDs: Any process running from within the game folder, OR matching the exe name exactly
    for (p, proc) in sys.processes() {
        let pid_val = p.as_u32();
        if pid_val == pid { continue; }

        let mut should_kill = false;
        
        if let Some(exe) = proc.exe() {
            if !target_dir.as_os_str().is_empty() && exe.starts_with(target_dir) {
                should_kill = true;
            }
        }
        
        if !should_kill && !exe_file_name.is_empty() {
            let proc_name = proc.name().to_string_lossy().to_lowercase();
            if proc_name == exe_file_name || proc_name == format!("{}.exe", exe_file_name) {
                should_kill = true;
            }
        }

        if should_kill {
            pids_to_kill.push(pid_val);
        }
    }

    log::info!("Aggressive Kill: Terminating PIDs {:?}", pids_to_kill);

    // 2. Execute Kills
    if is_elevated {
        // Build an elevated PowerShell command to nuke everything
        let mut ps_args = String::from("Start-Process cmd -ArgumentList '/C ");
        for p in &pids_to_kill {
            ps_args.push_str(&format!("taskkill /F /T /PID {} & ", p));
        }
        if !exe_file_name.is_empty() {
            ps_args.push_str(&format!("taskkill /F /T /IM \"{}\" & ", exe_file_name));
        }
        ps_args.push_str("echo done' -Verb RunAs -WindowStyle Hidden");

        let _ = Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_args])
            .creation_flags(0x08000000)
            .output();

        // Give Windows a second to process the elevated kills
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
        return true;
    }

    // Standard loop kill
    for p in &pids_to_kill {
        if let Some(proc) = sys.process(sysinfo::Pid::from_u32(*p)) {
            proc.kill();
        }
        // Fallback: forcefully wipe them out
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &p.to_string()])
            .creation_flags(0x08000000)
            .output();
    }

    // Broad sweep just in case
    if !exe_file_name.is_empty() {
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/IM", &exe_file_name])
            .creation_flags(0x08000000)
            .output();
    }

    true
}

#[cfg(not(target_os = "windows"))]
async fn kill_process(pid: u32, _exe_path: &str, _install_dir: &str, _is_elevated: bool) -> bool {
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
        let killed = kill_process(identity.pid, &identity.exe_path, &identity.install_dir, identity.elevated).await;

        if killed {
            if let Some(flag) = &identity.elevated_stop_flag {
                flag.store(true, std::sync::atomic::Ordering::Relaxed);
            }

            log::info!("Force stopped game '{}' (PID {})", id, identity.pid);
        } else {
            log::warn!(
                "PID {} for game '{}' could not be killed — it may require elevation or has already exited.",
                identity.pid,
                id
            );
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

// ... remaining commands (open_path_in_explorer, etc.)
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
pub async fn resolve_game_app_id(
    game_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let game = get_game_by_id(&state.read_pool, &game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    let game_path = PathBuf::from(game.install_dir.as_ref().unwrap_or(&game.exe_path));
    let app_id = crate::achievements::resolve_app_id(&game_path);
    Ok(app_id)
}

#[tauri::command]
pub async fn refresh_game_metadata(
    game_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<RefreshResult, String> {
    {
        let mut in_flight = state.metadata_refresh_lock.lock().await;
        if !in_flight.insert(game_id.clone()) {
            return Err("Refresh already in progress for this game".into());
        }
    }
    let result = refresh_game_metadata_internal(&game_id, &state, &app).await;
    state.metadata_refresh_lock.lock().await.remove(&game_id);
    result
}

async fn refresh_game_metadata_internal(
    game_id: &str,
    state: &State<'_, AppState>,
    app: &AppHandle,
) -> Result<RefreshResult, String> {
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

    let found_app_id = crate::achievements::resolve_app_id(&game_path);
    let app_id_changed = found_app_id.is_some()
        && found_app_id.as_deref()
            != game
                .steam_app_id
                .as_ref()
                .map(|id| id.to_string())
                .as_deref();

    if let Some(ref id_str) = found_app_id {
        if app_id_changed {
            if let Ok(app_id_u32) = id_str.parse::<u32>() {
                state
                    .db_tx
                    .send(crate::state::DbWrite::Game(
                        crate::state::GameDbWrite::UpdateSteamAppId {
                            game_id: game_id.to_string(),
                            steam_app_id: Some(app_id_u32),
                        },
                    ))
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    let scan_roots = crate::settings::default_scan_roots();
    let effective_app_id = found_app_id
        .clone()
        .or_else(|| game.steam_app_id.as_ref().map(|id| id.to_string()));
    let save_path = crate::achievements::resolve_save_path(
        effective_app_id.as_deref(),
        &game_path,
        game.manual_achievement_path.as_deref(),
        &scan_roots,
        None,
    );

    let rawg_refreshed = false;
    let _ = app.emit("game-metadata-refreshed", &game_id);

    Ok(RefreshResult {
        app_id_updated: app_id_changed,
        save_path_found: save_path.is_some(),
        rawg_refreshed,
    })
}

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

#[cfg(target_os = "windows")]
mod borderless {
    use std::sync::atomic::{AtomicIsize, Ordering};
    use windows_sys::Win32::Foundation::{BOOL, FALSE, HWND, LPARAM, TRUE};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetSystemMetrics, GetWindowThreadProcessId, IsWindowVisible, SetWindowLongW,
        SetWindowPos, GWL_STYLE, HWND_TOPMOST, SM_CXSCREEN, SM_CYSCREEN, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, WS_POPUP, WS_VISIBLE,
    };

    static FOUND_HWND: AtomicIsize = AtomicIsize::new(0);

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return TRUE;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == lparam as u32 {
            FOUND_HWND.store(hwnd, Ordering::SeqCst);
            return FALSE;
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

            let new_style = (WS_POPUP | WS_VISIBLE) as i32;
            SetWindowLongW(hwnd, GWL_STYLE, new_style);

            let w = GetSystemMetrics(SM_CXSCREEN);
            let h = GetSystemMetrics(SM_CYSCREEN);
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                w,
                h,
                SWP_FRAMECHANGED | SWP_NOACTIVATE,
            );

            log::info!(
                "Forced borderless on HWND {:x} for PID {}",
                hwnd as usize,
                game_pid
            );
        }
        Ok(())
    }
}