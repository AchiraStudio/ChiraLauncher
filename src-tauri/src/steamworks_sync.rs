use libloading::{Library, Symbol};
use std::ffi::{c_char, c_void, CString};
use std::path::Path;
use std::time::Duration;
use tokio::time::sleep;

// FFI signatures for flat C API from steam_api64.dll
type SteamAPIInit = unsafe extern "C" fn() -> bool;
type SteamAPIShutdown = unsafe extern "C" fn();
type SteamAPIRunCallbacks = unsafe extern "C" fn();
type SteamAPIUserStats = unsafe extern "C" fn() -> *mut c_void;
type RequestCurrentStats = unsafe extern "C" fn(*mut c_void) -> bool;
type GetAchievement = unsafe extern "C" fn(*mut c_void, *const c_char, *mut bool) -> bool;

pub struct SteamworksClient {
    _lib: Library,
    stats_ptr: *mut c_void,
    request_current_stats: RequestCurrentStats,
    get_achievement: GetAchievement,
    run_callbacks: SteamAPIRunCallbacks,
    shutdown: SteamAPIShutdown,
}

// Ensure the struct is safe to send across threads if used in Tauri commands (raw pointers are not Send by default)
unsafe impl Send for SteamworksClient {}
unsafe impl Sync for SteamworksClient {}

impl SteamworksClient {
    pub fn init(dll_path: &Path, app_id: &str) -> Result<Self, String> {
        // Write steam_appid.txt so SteamAPI_Init knows which game we are spoofing
        let appid_path = std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join("steam_appid.txt");
        
        std::fs::write(&appid_path, app_id).map_err(|e| format!("Failed to write steam_appid.txt: {}", e))?;

        // Load the DLL
        let lib = unsafe { Library::new(dll_path).map_err(|e| format!("Failed to load steam_api64.dll: {}", e))? };

        unsafe {
            // SteamAPI_Init
            let init_fn: Symbol<SteamAPIInit> = lib.get(b"SteamAPI_Init\0")
                .map_err(|e| format!("Missing SteamAPI_Init: {}", e))?;
            
            if !init_fn() {
                let _ = std::fs::remove_file(&appid_path);
                return Err("SteamAPI_Init returned false (is Steam running?)".to_string());
            }

            let shutdown: Symbol<SteamAPIShutdown> = lib.get(b"SteamAPI_Shutdown\0")
                .map_err(|e| e.to_string())?;
            let run_callbacks: Symbol<SteamAPIRunCallbacks> = lib.get(b"SteamAPI_RunCallbacks\0")
                .map_err(|e| e.to_string())?;

            // Try to find the correct UserStats version
            let mut stats_fn: Option<Symbol<SteamAPIUserStats>> = None;
            for version in &["SteamAPI_SteamUserStats_v012\0", "SteamAPI_SteamUserStats_v011\0", "SteamAPI_SteamUserStats_v010\0"] {
                if let Ok(f) = lib.get(version.as_bytes()) {
                    stats_fn = Some(f);
                    break;
                }
            }

            let stats_fn = stats_fn.ok_or_else(|| "Could not find any SteamAPI_SteamUserStats_vXXX symbol".to_string())?;
            let stats_ptr = stats_fn();
            if stats_ptr.is_null() {
                shutdown();
                let _ = std::fs::remove_file(&appid_path);
                return Err("SteamUserStats returned null".to_string());
            }

            let request_current_stats: Symbol<RequestCurrentStats> = lib.get(b"SteamAPI_ISteamUserStats_RequestCurrentStats\0")
                .map_err(|e| e.to_string())?;
            let get_achievement: Symbol<GetAchievement> = lib.get(b"SteamAPI_ISteamUserStats_GetAchievement\0")
                .map_err(|e| e.to_string())?;

            // We copy the function pointers so we can store them in the struct alongside the library
            let rc_stats = *request_current_stats;
            let get_achv = *get_achievement;
            let run_cbs = *run_callbacks;
            let shutd = *shutdown;

            // Optional cleanup: we could remove steam_appid.txt now, or leave it until drop.
            // Leaving it until drop is safer in case Steam checks it later.

            Ok(Self {
                _lib: lib,
                stats_ptr,
                request_current_stats: rc_stats,
                get_achievement: get_achv,
                run_callbacks: run_cbs,
                shutdown: shutd,
            })
        }
    }

    pub async fn fetch_stats(&self) -> Result<(), String> {
        unsafe {
            if !(self.request_current_stats)(self.stats_ptr) {
                return Err("RequestCurrentStats failed".to_string());
            }
        }

        // We must pump callbacks so the async response from Steam backend arrives.
        // Usually takes ~100-500ms. We'll poll 40 times with 50ms sleep (2s timeout).
        for _ in 0..40 {
            unsafe { (self.run_callbacks)() };
            sleep(Duration::from_millis(50)).await;
        }

        Ok(())
    }

    pub fn is_achievement_unlocked(&self, api_name: &str) -> bool {
        if let Ok(c_str) = CString::new(api_name) {
            let mut unlocked: bool = false;
            unsafe {
                if (self.get_achievement)(self.stats_ptr, c_str.as_ptr(), &mut unlocked) {
                    return unlocked;
                }
            }
        }
        false
    }
}

impl Drop for SteamworksClient {
    fn drop(&mut self) {
        unsafe {
            (self.shutdown)();
        }
        let appid_path = std::env::current_dir().unwrap_or_default().join("steam_appid.txt");
        let _ = std::fs::remove_file(appid_path);
    }
}
