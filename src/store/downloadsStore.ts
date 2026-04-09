import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useGameStore } from "./gameStore";
import { useSettingsStore } from "./settingsStore";

export interface DownloadStatus {
    id: number;
    name: string;
    progress_percent: number;
    downloaded_bytes: number;
    total_bytes: number;
    download_speed: number;
    upload_speed: number;
    peers: number;
    state: string;
}

interface DownloadsState {
    downloads: DownloadStatus[];
    isLoading: boolean;
    error: string | null;
    fetchDownloads: () => Promise<void>;
    pauseDownload: (id: number) => Promise<void>;
    resumeDownload: (id: number) => Promise<void>;
    cancelDownload: (id: number) => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
}

let progressUnlisten: UnlistenFn | null = null;
let eventUnlisten: UnlistenFn | null = null;

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
    downloads: [],
    isLoading: false,
    error: null,

    fetchDownloads: async () => {
        try {
            const list = await invoke<DownloadStatus[]>("get_downloads");
            set({ downloads: list, error: null });
        } catch (err) {
            console.error("Failed to fetch downloads:", err);
            set({ error: String(err) });
        }
    },

    pauseDownload: async (id) => {
        try {
            await invoke("pause_download", { id });
            await get().fetchDownloads();
        } catch (err) {
            toast.error("Failed to pause", { description: String(err) });
        }
    },

    resumeDownload: async (id) => {
        try {
            await invoke("resume_download", { id });
            await get().fetchDownloads();
        } catch (err) {
            toast.error("Failed to resume", { description: String(err) });
        }
    },

    cancelDownload: async (id) => {
        try {
            await invoke("cancel_download", { id });
            await get().fetchDownloads();
            toast.info("Download cancelled");
        } catch (err) {
            toast.error("Failed to cancel", { description: String(err) });
        }
    },

    startPolling: () => {
        if (progressUnlisten) return; // Already listening

        // Initial fetch
        get().fetchDownloads();

        // Listen for live progress updates broadcast by the Rust backend roughly every second
        listen<DownloadStatus[]>("download-progress", (event) => {
            set({ downloads: event.payload, error: null });
        }).then(unlisten => {
            progressUnlisten = unlisten;
        });

        // Listen for completion events from backend (if we set them up later)
        listen<{ id: number; name: string }>("download-completed", async (event) => {
            toast.success("Download Complete!", { description: event.payload.name });
            get().fetchDownloads();

            // Lazy-load stores inside the callback to avoid cross-store TDZ crash at module init
            const settings = useSettingsStore.getState().settings;
            if (settings?.auto_add_to_library) {
                try {
                    // Quick debounce to let file handles close
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Trigger a scan of the download directory
                    // Since we don't know the exact path of the game inside the download, 
                    // we scan the root downloads folder to pick up new nested executables.
                    await invoke("scan_directory", { path: settings.download_path });
                    useGameStore.getState().fetchGames();
                    toast.success("Scan Complete", { description: `${event.payload.name} added to library.` });
                } catch (err) {
                    console.error("Auto-add to library failed:", err);
                }
            }
        }).then(unlisten => {
            eventUnlisten = unlisten;
        });
    },

    stopPolling: () => {
        if (progressUnlisten) {
            progressUnlisten();
            progressUnlisten = null;
        }
        if (eventUnlisten) {
            eventUnlisten();
            eventUnlisten = null;
        }
    }
}));
