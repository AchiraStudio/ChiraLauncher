//! In-app updates.
//!
//! The heavy lifting (checking the release manifest, downloading, verifying the
//! minisign signature and running the installer) is done by `tauri-plugin-updater`.
//! This module only answers one question for the UI: "is this build able to
//! verify updates at all?" - i.e. was it built with an updater public key.

use tauri::AppHandle;

/// True when `plugins.updater.pubkey` is set in `tauri.conf.json`.
///
/// Without a key the plugin loads fine but can never verify a download, so the
/// frontend uses this to show a helpful "set up signing" hint instead of a
/// confusing signature error after the user clicked *Install*.
#[tauri::command]
pub fn updater_configured(app: AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|cfg| cfg.get("pubkey"))
        .and_then(|key| key.as_str())
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false)
}
