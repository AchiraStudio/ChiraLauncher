export function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(" ");
}

export function formatElapsedSeconds(seconds: number): string {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) {
        const remainingMins = mins % 60;
        return `${hours}h ${remainingMins}m`;
    }
    return `${mins}m`;
}

import { convertFileSrc } from "@tauri-apps/api/core";

export function getValidImageUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith("http://") || path.startsWith("https://")) {
        return path;
    }
    try {
        return convertFileSrc(path);
    } catch {
        return path;
    }
}
