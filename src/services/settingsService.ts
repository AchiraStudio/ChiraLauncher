import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
    theme: string;
    language: string;
    download_path: string;
    auto_launch_on_boot: boolean;
    minimize_to_tray: boolean;
    enable_notifications: boolean;
    volume_sfx: number;
    volume_bgm: number;
    developer_mode: boolean;
    max_download_speed_kbps: number;
    max_upload_speed_kbps: number;
    max_concurrent_downloads: number;
    auto_add_to_library: boolean;
    sequential_download: boolean;
    steam_api_key: string;
    auto_fetch_achievements: boolean;
}

export async function getAppSettings(): Promise<AppSettings> {
    return await invoke<AppSettings>("get_app_settings");
}

export async function updateAppSettings(settings: AppSettings): Promise<void> {
    await invoke("update_app_settings", { settings });
}
