import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface DownloadItem {
    id: string;
    url: string;
    original_url?: string | null;
    save_path: string;
    filename: string;
    folder_name: string | null;
    status: "pending" | "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";
    downloaded_bytes: number;
    total_bytes: number;
    speed_bytes_per_sec: number;
    error_message: string | null;
}

export interface ResolvedLinkInfo {
    title: string;
    download_url: string;
    file_size: number;
}

interface HttpStoreState {
    downloads: DownloadItem[];
    fetchDownloads: () => Promise<void>;
    resolveLink: (url: string) => Promise<ResolvedLinkInfo>;
    addDownloads: (urls: string[], savePaths: string[], folderName?: string, originalUrls?: string[]) => Promise<void>;
    pauseDownload: (id: string) => Promise<void>;
    resumeDownload: (id: string) => Promise<void>;
    cancelDownload: (id: string) => Promise<void>;
    deleteDownload: (id: string, deleteFile: boolean) => Promise<void>;
    retryDownload: (id: string) => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
}

let pollingInterval: number | null = null;

export const useHttpStore = create<HttpStoreState>((set, get) => ({
    downloads: [],

    fetchDownloads: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
            const data = await invoke<DownloadItem[]>("get_http_downloads");
            set({ downloads: data });
        } catch (err) {
            console.error("Failed to fetch HTTP downloads:", err);
        }
    },

    resolveLink: async (url: string) => {
        return await invoke<ResolvedLinkInfo>("resolve_link", { url });
    },

    addDownloads: async (urls, savePaths, folderName, originalUrls) => {
        await invoke("add_http_downloads", {
            urls,
            savePaths,
            folderName: folderName || null,
            originalUrls: originalUrls || null
        });
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

    deleteDownload: async (id, deleteFile) => {
        await invoke("delete_http_download", { id, deleteFile });
        get().fetchDownloads();
    },

    retryDownload: async (id) => {
        await invoke("retry_http_download", { id });
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
