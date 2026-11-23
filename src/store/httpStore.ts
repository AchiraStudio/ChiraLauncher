import { create } from "zustand";
import { call, isTauri } from "../lib/tauri";

export type DownloadStatus = "pending" | "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";

export interface DownloadItem {
    id: string;
    url: string;
    original_url?: string | null;
    save_path: string;
    filename: string;
    folder_name: string | null;
    status: DownloadStatus;
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

export const isActiveStatus = (s: DownloadStatus) => s === "downloading" || s === "queued" || s === "pending";

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
    /** Apply one action to many downloads in parallel, then refresh once. */
    bulk: (action: "pause" | "resume" | "delete" | "cancel", ids: string[]) => Promise<void>;
}

const sameItem = (a: DownloadItem, b: DownloadItem) =>
    a.status === b.status && a.downloaded_bytes === b.downloaded_bytes && a.total_bytes === b.total_bytes &&
    a.speed_bytes_per_sec === b.speed_bytes_per_sec && a.filename === b.filename && a.error_message === b.error_message &&
    a.folder_name === b.folder_name && a.save_path === b.save_path;

let inFlight: Promise<void> | null = null;

export const useHttpStore = create<HttpStoreState>((set, get) => {
    // Run an action, then refresh immediately so the UI reflects it without waiting for the next poll
    const act = (cmd: string, args: Record<string, unknown>) => async () => {
        await call(cmd, args);
        await get().fetchDownloads();
    };

    return {
        downloads: [],

        fetchDownloads: () => {
            if (!isTauri()) return Promise.resolve();
            if (inFlight) return inFlight; // never stack requests if the backend is slow
            inFlight = (async () => {
                try {
                    const data = await call<DownloadItem[]>("get_http_downloads");
                    set((s) => {
                        const prev = new Map(s.downloads.map((d) => [d.id, d]));
                        const next = data.map((d) => {
                            const p = prev.get(d.id);
                            return p && sameItem(p, d) ? p : d;
                        });
                        const unchanged = next.length === s.downloads.length && next.every((d, i) => d === s.downloads[i]);
                        return unchanged ? s : { downloads: next };
                    });
                } catch (err) {
                    console.error("Failed to fetch downloads:", err);
                } finally {
                    inFlight = null;
                }
            })();
            return inFlight;
        },

        resolveLink: (url) => call<ResolvedLinkInfo>("resolve_link", { url }),

        addDownloads: async (urls, savePaths, folderName, originalUrls) => {
            await call("add_http_downloads", { urls, savePaths, folderName: folderName || null, originalUrls: originalUrls || null });
            await get().fetchDownloads();
        },

        pauseDownload: (id) => act("pause_http_download", { id })(),
        resumeDownload: (id) => act("resume_http_download", { id })(),
        cancelDownload: (id) => act("cancel_http_download", { id })(),
        deleteDownload: (id, deleteFile) => act("delete_http_download", { id, deleteFile })(),
        retryDownload: (id) => act("retry_http_download", { id })(),

        bulk: async (action, ids) => {
            const cmd = { pause: "pause_http_download", resume: "resume_http_download", delete: "delete_http_download", cancel: "cancel_http_download" }[action];
            await Promise.allSettled(ids.map((id) => call(cmd, action === "delete" ? { id, deleteFile: false } : { id })));
            await get().fetchDownloads();
        },
    };
});

/**
 * One poller for the whole app (mounted in the shell):
 *  - 1s while something is downloading or the Downloads page is open
 *  - 8s while idle (keeps the sidebar badge honest)
 *  - suspended entirely while the window is hidden / minimised to tray
 */
export function startDownloadPoller(isPageOpen: () => boolean): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const tick = async () => {
        if (stopped) return;
        if (!document.hidden) await useHttpStore.getState().fetchDownloads();
        const busy = useHttpStore.getState().downloads.some((d) => isActiveStatus(d.status));
        timer = setTimeout(tick, busy || isPageOpen() ? 1000 : 8000);
    };
    const onVisible = () => {
        if (!document.hidden) {
            clearTimeout(timer);
            void tick();
        }
    };

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
        stopped = true;
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
    };
}
