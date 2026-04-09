import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type DownloadStateEnum = "Initializing" | "Downloading" | "Paused" | "Finished" | "Error";

export interface DownloadStatus {
    id: number;
    name: string;
    state: DownloadStateEnum;
    downloaded_bytes: number;
    total_bytes: number;
    download_speed: number;
    upload_speed: number;
    progress_percent: number;
    peers: number;
}

interface DownloadsState {
    downloads: DownloadStatus[];
    isLoading: boolean;
    error: string | null;
    fetchDownloads: () => Promise<void>;
    pauseDownload: (id: number) => Promise<void>;
    resumeDownload: (id: number) => Promise<void>;
    cancelDownload: (id: number) => Promise<void>;
    startPolling: () => Promise<void>;
    stopPolling: () => void;
}

let unlistenProgress: UnlistenFn | null = null;
let isPolling = false;

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
    downloads: [],
    isLoading: false,
    error: null,

    fetchDownloads: async () => {
        // SAFETY GUARD: Prevent crashes in web browsers
        if (!window.__TAURI_INTERNALS__) return;

        try {
            const data = await invoke<DownloadStatus[]>("get_downloads");
            set({ downloads: data, error: null });
        } catch (err: any) {
            console.error("Failed to fetch downloads:", err);
            set({ error: err.toString() });
        }
    },

    pauseDownload: async (id: number) => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
            await invoke("pause_download", { id });
            get().fetchDownloads();
        } catch (err) {
            console.error("Pause failed", err);
        }
    },

    resumeDownload: async (id: number) => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
            await invoke("resume_download", { id });
            get().fetchDownloads();
        } catch (err) {
            console.error("Resume failed", err);
        }
    },

    cancelDownload: async (id: number) => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
            await invoke("cancel_download", { id });
            get().fetchDownloads();
        } catch (err) {
            console.error("Cancel failed", err);
        }
    },

    startPolling: async () => {
        // SAFETY GUARD: Prevent event listener crashes in web browsers
        if (!window.__TAURI_INTERNALS__) return;
        if (isPolling) return;

        isPolling = true;
        get().fetchDownloads();

        if (!unlistenProgress) {
            try {
                unlistenProgress = await listen<DownloadStatus[]>("download-progress", (event) => {
                    set({ downloads: event.payload });
                });
            } catch (e) {
                console.error("Failed to listen to download progress", e);
            }
        }
    },

    stopPolling: () => {
        isPolling = false;
        if (unlistenProgress) {
            unlistenProgress();
            unlistenProgress = null;
        }
    }
}));