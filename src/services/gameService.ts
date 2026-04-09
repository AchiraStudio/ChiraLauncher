import { invoke } from "@tauri-apps/api/core";
import { getAppSettings } from "./settingsService";

export async function launchGame(id: string): Promise<void> {
    try {
        await invoke("launch_game", { id });
    } catch (e) {
        console.error(`Failed to launch game ${id}:`, e);
        throw e;
    }
}

export async function forceStopGame(id: string): Promise<void> {
    try {
        await invoke("force_stop_game", { id });
    } catch (e) {
        console.error(`Failed to forcefully stop game ${id}:`, e);
        throw e;
    }
}

export async function fetchAndCacheMetadata(id: string): Promise<void> {
    try {
        await invoke("fetch_and_cache_metadata", { id });
    } catch (e) {
        console.error(`Failed to fetch metadata for game ${id}:`, e);
        throw e;
    }
}

export async function openPathInExplorer(path: string): Promise<void> {
    try {
        // Ensure path uses backslashes for Windows explorer
        const normalizedPath = path.replace(/\//g, '\\');
        await invoke("open_path_in_explorer", { path: normalizedPath });
    } catch (e) {
        console.error("Failed to open path in explorer:", e);
        throw e;
    }
}

export async function autoFetchSteamAchievements(gameId: string, installDir: string): Promise<void> {
    try {
        const settings = await getAppSettings();
        if (!settings.auto_fetch_achievements || !settings.steam_api_key) return;

        const appId = await invoke<string | null>("resolve_game_app_id", { gameId });
        if (!appId) return;

        // Fire and forget, don't block
        invoke("fetch_and_write_achievements", {
            appId,
            gameDir: installDir,
            apiKey: settings.steam_api_key
        }).catch(e => console.error("Background auto-fetch failed:", e));
    } catch (e) {
        console.error("Failed to start auto-fetch:", e);
    }
}
