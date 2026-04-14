import { invoke } from "@tauri-apps/api/core";

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
        const normalizedPath = path.replace(/\//g, '\\');
        await invoke("open_path_in_explorer", { path: normalizedPath });
    } catch (e) {
        console.error("Failed to open path in explorer:", e);
        throw e;
    }
}