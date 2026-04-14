import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface HttpDownloadStatus {
    id: string;
    name: string;
    folder_name: string | null;
    state: "Initializing" | "Downloading" | "Paused" | "Finished" | "Error";
    progress_percent: number;
    downloaded_bytes: number;
    total_bytes: number;
    download_speed: number;
    error_msg: string | null;
}

interface HttpDownloadsState {
    downloads: HttpDownloadStatus[];
    fetchDownloads: () => Promise<void>;
    addDownloads: (links: string[], savePath: string, folderName?: string) => Promise<void>;
    pauseDownload: (id: string) => Promise<void>;
    resumeDownload: (id: string) => Promise<void>;
    cancelDownload: (id: string) => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
}

let pollingInterval: number | null = null;

export const useHttpStore = create<HttpDownloadsState>((set, get) => ({
    downloads: [],

    fetchDownloads: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
            const data = await invoke<HttpDownloadStatus[]>("get_http_downloads");
            set({ downloads: data });
        } catch (err) {
            console.error("Failed to fetch HTTP downloads:", err);
        }
    },

    addDownloads: async (links, savePath, folderName) => {
        await invoke("add_http_downloads", { links, savePath, folderName: folderName || null });
        get().fetchDownloads();
    },

    pauseDownload: async (id) => {
        await invoke("pause_http_download", { id });
        get().fetchDownloads();
    },

    resumeDownload: async (id) => {
        await invoke("resume_http_download", { id });
        get().fetchDownloads();
    },

    cancelDownload: async (id) => {
        await invoke("cancel_http_download", { id });
        get().fetchDownloads();
    },

    startPolling: () => {
        if (pollingInterval) return;
        get().fetchDownloads();
        pollingInterval = window.setInterval(() => {
            get().fetchDownloads();
        }, 1000);
    },

    stopPolling: () => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }
}));