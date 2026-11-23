import { memo, useMemo, useState } from "react";
import { ChevronRight, Folder, Pause, Play, FolderOpen, Trash2, XCircle } from "lucide-react";
import { useHttpStore, type DownloadItem } from "../../store/httpStore";
import { call } from "../../lib/tauri";
import { formatBytes, formatEta } from "../../lib/format";
import { cn, dirname } from "../../lib/utils";
import { IconButton } from "../ui/Button";
import { ProgressBar } from "../ui/controls";
import { DownloadRow, StatusIcon, removeWithConfirm } from "./DownloadRow";

/** Multi-part downloads (e.g. .part1.rar … .partN.rar) collapse into one card. */
export const FolderGroup = memo(function FolderGroup({ name, files }: { name: string; files: DownloadItem[] }) {
    const [open, setOpen] = useState(false);
    const bulk = useHttpStore((s) => s.bulk);

    const s = useMemo(() => {
        const total = files.reduce((n, f) => n + f.total_bytes, 0);
        const done = files.reduce((n, f) => n + f.downloaded_bytes, 0);
        const speed = files.reduce((n, f) => n + f.speed_bytes_per_sec, 0);
        const completed = files.filter((f) => f.status === "completed").length;
        const failed = files.filter((f) => f.status === "failed").length;
        const active = files.filter((f) => f.status === "downloading" || f.status === "queued" || f.status === "pending");
        const paused = files.filter((f) => f.status === "paused");
        return { total, done, speed, completed, failed, active, paused, pct: total > 0 ? (done / total) * 100 : 0 };
    }, [files]);

    const eta = s.speed > 0 ? (s.total - s.done) / s.speed : 0;
    const allDone = s.completed === files.length;

    return (
        <div className="surface overflow-hidden">
            <div className="group flex items-center gap-4 px-4 py-3.5">
                <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent"><Folder size={18} /></div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium" title={name}>{name}</span>
                            <span className="shrink-0 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[11px] text-fg-mute">{s.completed}/{files.length} files</span>
                            {allDone && <StatusIcon status="completed" size={14} />}
                            {s.failed > 0 && <span className="shrink-0 text-[11px] text-danger">{s.failed} failed</span>}
                        </div>
                        {!allDone && <ProgressBar value={s.pct} tone={s.failed ? "danger" : s.active.length ? "accent" : "warn"} className="mt-2" height={5} />}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-fg-mute tabular-nums">
                            <span>{formatBytes(s.done)} / {formatBytes(s.total)}{!allDone && ` · ${s.pct.toFixed(0)}%`}</span>
                            {s.speed > 0 && <span className="text-accent">{formatBytes(s.speed)}/s</span>}
                            {eta > 0 && <span>{formatEta(eta)} left</span>}
                        </div>
                    </div>
                    <ChevronRight size={16} className={cn("shrink-0 text-fg-mute transition-transform", open && "rotate-90")} />
                </button>
                <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    {s.active.length > 0 && <IconButton label="Pause all" size="sm" onClick={() => void bulk("pause", s.active.map((f) => f.id))}><Pause size={15} /></IconButton>}
                    {s.paused.length > 0 && <IconButton label="Resume all" size="sm" onClick={() => void bulk("resume", s.paused.map((f) => f.id))}><Play size={15} /></IconButton>}
                    <IconButton label="Show in folder" size="sm" onClick={() => void call("open_path_in_explorer", { path: dirname(files[0].save_path) }).catch(console.error)}><FolderOpen size={15} /></IconButton>
                    <IconButton label="Remove from list" size="sm" onClick={() => void bulk("delete", files.map((f) => f.id))}><XCircle size={15} /></IconButton>
                    <IconButton label="Delete files" size="sm" tone="danger" onClick={() => void removeWithConfirm(files, name)}><Trash2 size={15} /></IconButton>
                </div>
            </div>
            {open && (
                <div className="divide-y divide-line border-t border-line bg-black/20">
                    {files.map((f) => <DownloadRow key={f.id} item={f} nested />)}
                </div>
            )}
        </div>
    );
});
