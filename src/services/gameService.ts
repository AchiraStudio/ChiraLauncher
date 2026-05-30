import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export async function launchGame(id: string): Promise<void> {
    try {
        await invoke("launch_game", { id });
    } catch (e: any) {
        console.error(`Failed to launch game ${id}:`, e);
        toast.error("Failed to launch game", { description: String(e) });
        throw e;
    }
}

export async function forceStopGame(id: string): Promise<void> {
    try {
        await invoke("force_stop_game", { id });
    } catch (e: any) {
        console.error(`Failed to forcefully stop game ${id}:`, e);
        toast.error("Failed to stop game", { description: String(e) });
        throw e;
    }
}

export async function fetchAndCacheMetadata(id: string): Promise<void> {
    try {
        await invoke("fetch_and_cache_metadata", { id });
    } catch (e: any) {
        console.error(`Failed to fetch metadata for game ${id}:`, e);
        toast.error("Failed to fetch metadata", { description: String(e) });
        throw e;
    }
}

export async function openPathInExplorer(path: string): Promise<void> {
    try {
        const normalizedPath = path.replace(/\//g, '\\');
        await invoke("open_path_in_explorer", { path: normalizedPath });
    } catch (e: any) {
        console.error("Failed to open path in explorer:", e);
        toast.error("Failed to open path", { description: String(e) });
        throw e;
    }
}