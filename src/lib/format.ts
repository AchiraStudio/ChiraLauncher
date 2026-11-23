/** "Never played" | "< 1m" | "42m" | "12h 5m" */
export function formatPlaytime(seconds: number | null | undefined): string {
    const s = seconds ?? 0;
    if (s <= 0) return "Never played";
    const totalMinutes = Math.floor(s / 60);
    if (totalMinutes === 0) return "< 1m";
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

/** Hours with one decimal for big stats: 12.4 */
export function formatHours(seconds: number): string {
    const h = seconds / 3600;
    return h >= 100 ? Math.round(h).toLocaleString() : h.toFixed(1);
}

/** Live session timer: 45s | 12m | 1h 03m */
export function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const h = Math.floor(mins / 60);
    return h > 0 ? `${h}h ${String(mins % 60).padStart(2, "0")}m` : `${mins}m`;
}

export function formatBytes(bytes: number, decimals = 1): string {
    if (!bytes || bytes < 0) return "0 B";
    const k = 1024;
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
    return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function formatEta(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return "-";
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

const rtf = typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
    ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
    : null;

/** "today", "yesterday", "3 days ago", "2 months ago" */
export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "Never";
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "Never";
    const diff = (t - Date.now()) / 1000;
    const abs = Math.abs(diff);
    const steps: [number, Intl.RelativeTimeFormatUnit][] = [
        [60, "second"], [3600, "minute"], [86400, "hour"], [2592000, "day"], [31536000, "month"], [Infinity, "year"],
    ];
    const divisors = [1, 60, 3600, 86400, 2592000, 31536000];
    for (let i = 0; i < steps.length; i++) {
        if (abs < steps[i][0]) {
            const v = Math.round(diff / divisors[i]);
            if (steps[i][1] === "second") return "just now";
            return rtf ? rtf.format(v, steps[i][1]) : `${Math.abs(v)} ${steps[i][1]}s ago`;
        }
    }
    return "Never";
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return "-";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
