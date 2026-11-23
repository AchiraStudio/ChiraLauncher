import { memo } from "react";
import { Pause, Play, RotateCcw, Trash2, FolderOpen, CheckCircle2, AlertCircle, Clock, ArrowDownToLine, FileArchive, XCircle } from "lucide-react";
import { useHttpStore, isActiveStatus, type DownloadItem } from "../../store/httpStore";
import { call } from "../../lib/tauri";
import { confirm } from "../../store/confirmStore";
import { formatBytes, formatEta } from "../../lib/format";
import { dirname } from "../../lib/utils";
import { cn } from "../../lib/utils";
import { IconButton } from "../ui/Button";
import { ProgressBar } from "../ui/controls";

const pctOf = (d: { downloaded_bytes: number; total_bytes: number }) =>
    d.total_bytes > 0 ? Math.min(100, (d.downloaded_bytes / d.total_bytes) * 100) : 0;

export function StatusIcon({ status, size = 18 }: { status: DownloadItem["status"]; size?: number }) {
    const common = { size };
    switch (status) {
        case "completed": return <CheckCircle2 {...common} className="text-ok" />;
        case "failed": return <AlertCircle {...common} className="text-danger" />;
        case "cancelled": return <XCircle {...common} className="text-fg-mute" />;
        case "downloading": return <ArrowDownToLine {...common} className="text-accent" />;
        case "paused": return <Pause {...common} className="text-warn" />;
        default: return <Clock {...common} className="text-fg-mute" />;
    }
}

export async function removeWithConfirm(items: DownloadItem[], title: string) {
    const ok = await confirm({
        title: `Delete ${title}?`,
        description: `This removes ${items.length > 1 ? `${items.length} files` : "the file"} from your disk as well as from the list. This can't be undone.`,
        confirmLabel: "Delete files",
        danger: true,
    });
    if (!ok) return;
    await Promise.allSettled(items.map((d) => call("delete_http_download", { id: d.id, deleteFile: true })));
    await useHttpStore.getState().fetchDownloads();
}

export const DownloadRow = memo(function DownloadRow({ item, nested }: { item: DownloadItem; nested?: boolean }) {
    const { pauseDownload, resumeDownload, retryDownload, deleteDownload } = useHttpStore.getState();
    const pct = pctOf(item);
    const downloading = item.status === "downloading";
    const eta = downloading && item.speed_bytes_per_sec > 0 ? (item.total_bytes - item.downloaded_bytes) / item.speed_bytes_per_sec : 0;
    const showBar = item.status !== "completed" && item.status !== "cancelled";

    return (
        <div className={cn("group flex items-center gap-4 px-4 py-3.5", !nested && "surface")}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
                {nested ? <StatusIcon status={item.status} /> : <FileArchive size={18} className="text-fg-mute" />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium" title={item.filename}>{item.filename}</span>
                    {!nested && <StatusIcon status={item.status} size={14} />}
                </div>
                {showBar && <ProgressBar value={pct} tone={item.status === "failed" ? "danger" : item.status === "paused" ? "warn" : "accent"} className="mt-2" height={5} />}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-fg-mute">
                    {item.status === "failed" ? (
                        <span className="text-danger" title={item.error_message ?? ""}>{item.error_message || "Download failed"}</span>
                    ) : (
                        <>
                            <span className="tabular-nums">
                                {item.total_bytes > 0 ? `${formatBytes(item.downloaded_bytes)} / ${formatBytes(item.total_bytes)}` : formatBytes(item.downloaded_bytes)}
                                {showBar && item.total_bytes > 0 && ` · ${pct.toFixed(0)}%`}
                            </span>
                            {downloading && <span className="tabular-nums text-accent">{formatBytes(item.speed_bytes_per_sec)}/s</span>}
                            {downloading && eta > 0 && <span>{formatEta(eta)} left</span>}
                            {(item.status === "queued" || item.status === "pending") && <span>Waiting in queue</span>}
                            {item.status === "paused" && <span className="text-warn">Paused</span>}
                            {item.status === "completed" && <span className="text-ok">Completed</span>}
                        </>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                {(downloading || item.status === "queued" || item.status === "pending") && <IconButton label="Pause" size="sm" onClick={() => void pauseDownload(item.id)}><Pause size={15} /></IconButton>}
                {item.status === "paused" && <IconButton label="Resume" size="sm" onClick={() => void resumeDownload(item.id)}><Play size={15} /></IconButton>}
                {(item.status === "failed" || item.status === "cancelled") && <IconButton label="Retry" size="sm" onClick={() => void retryDownload(item.id)}><RotateCcw size={15} /></IconButton>}
                <IconButton label="Show in folder" size="sm" onClick={() => void call("open_path_in_explorer", { path: dirname(item.save_path) }).catch(console.error)}><FolderOpen size={15} /></IconButton>
                <IconButton label="Remove from list" size="sm" onClick={() => void deleteDownload(item.id, false)}><XCircle size={15} /></IconButton>
                <IconButton label="Delete file" size="sm" tone="danger" onClick={() => void removeWithConfirm([item], item.filename)}><Trash2 size={15} /></IconButton>
            </div>
        </div>
    );
});

export { isActiveStatus, pctOf };
