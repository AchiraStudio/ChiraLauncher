export function formatBytes(bytes: number, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatETA(bytesRemaining: number, bytesPerSec: number) {
    if (bytesPerSec === 0) return "∞";
    const seconds = Math.floor(bytesRemaining / bytesPerSec);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// Helper accessors for dealing with the union type of HTTP vs Torrent structures
export const getName = (item: any) => item.name || item.filename || "Unknown Download";
export const getStatus = (item: any) => item.state || item.status || "pending";
export const getDownloadSpeed = (item: any) => item.download_speed || item.speed_bytes_per_sec || 0;

export const isItemCompleted = (item: any) => {
    const s = getStatus(item);
    return s === "Finished" || s === "completed" || item.progress_percent >= 100;
};

export const isItemError = (item: any) => {
    const s = getStatus(item);
    return s === "Error" || s === "failed" || s === "cancelled";
};

export const isItemPaused = (item: any) => {
    const s = getStatus(item);
    return s === "Paused" || s === "paused";
};

export const isItemQueued = (item: any) => {
    const s = getStatus(item);
    return s === "queued";
};

export const getProgress = (item: any) => {
    if (item.progress_percent !== undefined) return item.progress_percent;
    if (item.total_bytes > 0) return (item.downloaded_bytes / item.total_bytes) * 100;
    return 0;
};

// Resolves the best path to open in Explorer for any item type.
export const resolveOpenPath = (item: any, type: string): string | null => {
    let path = null;
    if (type === "folder") {
        const firstFile = item.files?.[0];
        const filePath: string | undefined = firstFile?.save_path;
        if (filePath) {
            const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
            path = lastSep > 0 ? filePath.substring(0, lastSep) : filePath;
        }
    } else {
        path = item.save_path || item.download_path || null;
    }
    
    return path ? path.replace(/\//g, "\\") : null;
};

/** Computes the completion/pause/error state for any download item (HTTP, Torrent, or virtual folder). */
export function computeDownloadStatus(item: any, type: "torrent" | "http" | "folder") {
    const isFolder = type === "folder";
    return {
        isFolder,
        isCompleted: isFolder ? item.state === "Finished" : isItemCompleted(item),
        isPaused:    isFolder ? item.state === "Paused"   : isItemPaused(item),
        isError:     isFolder ? item.state === "Error"    : isItemError(item),
        isQueued:    !isFolder && isItemQueued(item),
    };
}
