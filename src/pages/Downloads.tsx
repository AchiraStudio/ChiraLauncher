import { useEffect, useMemo, useState } from "react";
import { Globe, Pause, Play, Trash2, Activity, Layers, Minus, Plus, TrendingDown } from "lucide-react";
import { useHttpStore, isActiveStatus, type DownloadItem } from "../store/httpStore";
import { call, isTauri } from "../lib/tauri";
import { formatBytes } from "../lib/format";
import { DownloadRow } from "../components/downloads/DownloadRow";
import { FolderGroup } from "../components/downloads/FolderGroup";
import { AddLinksModal } from "../components/modals/AddLinksModal";
import { Button, IconButton } from "../components/ui/Button";
import { EmptyState, ProgressBar, Segmented } from "../components/ui/controls";

type Filter = "all" | "active" | "completed";
type SortKey = "name" | "progress" | "speed";

type Group =
    | { kind: "folder"; key: string; name: string; files: DownloadItem[]; sort: { name: string; progress: number; speed: number } }
    | { kind: "file"; key: string; item: DownloadItem; sort: { name: string; progress: number; speed: number } };

export default function Downloads() {
    const downloads = useHttpStore((s) => s.downloads);
    const bulk = useHttpStore((s) => s.bulk);
    const [filter, setFilter] = useState<Filter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("name");
    const [addOpen, setAddOpen] = useState(false);
    const [maxConcurrent, setMaxConcurrent] = useState(4);

    useEffect(() => {
        if (isTauri()) call<number>("get_max_concurrent_downloads").then(setMaxConcurrent).catch(() => { });
    }, []);
    const setConcurrent = (n: number) => {
        const v = Math.max(1, Math.min(16, n));
        setMaxConcurrent(v);
        call("set_max_concurrent_downloads", { limit: v }).catch(() => { });
    };

    const groups = useMemo<Group[]>(() => {
        const list = downloads.filter((d) => filter === "all" ? true : filter === "completed" ? d.status === "completed" : d.status !== "completed");
        const folders = new Map<string, DownloadItem[]>();
        const files: DownloadItem[] = [];
        for (const d of list) {
            if (d.folder_name) (folders.get(d.folder_name) ?? folders.set(d.folder_name, []).get(d.folder_name)!).push(d);
            else files.push(d);
        }
        const pct = (a: DownloadItem[]) => {
            const t = a.reduce((n, f) => n + f.total_bytes, 0);
            return t > 0 ? a.reduce((n, f) => n + f.downloaded_bytes, 0) / t : 0;
        };
        const out: Group[] = [
            ...[...folders].map(([name, fs]): Group => ({
                kind: "folder", key: `f:${name}`, name, files: fs.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true })),
                sort: { name, progress: pct(fs), speed: fs.reduce((n, f) => n + f.speed_bytes_per_sec, 0) },
            })),
            ...files.map((item): Group => ({ kind: "file", key: item.id, item, sort: { name: item.filename, progress: pct([item]), speed: item.speed_bytes_per_sec } })),
        ];
        return out.sort((a, b) => sortKey === "name" ? a.sort.name.localeCompare(b.sort.name) : sortKey === "progress" ? b.sort.progress - a.sort.progress : b.sort.speed - a.sort.speed);
    }, [downloads, filter, sortKey]);

    const stats = useMemo(() => {
        const active = downloads.filter((d) => isActiveStatus(d.status));
        const total = active.reduce((n, d) => n + d.total_bytes, 0);
        const done = active.reduce((n, d) => n + d.downloaded_bytes, 0);
        return {
            active: active.length,
            speed: active.reduce((n, d) => n + d.speed_bytes_per_sec, 0),
            pct: total > 0 ? (done / total) * 100 : 0,
            running: downloads.filter((d) => d.status === "downloading" || d.status === "queued").map((d) => d.id),
            resumable: downloads.filter((d) => d.status === "paused" || d.status === "pending" || d.status === "failed").map((d) => d.id),
            finished: downloads.filter((d) => d.status === "completed" || d.status === "failed" || d.status === "cancelled").map((d) => d.id),
        };
    }, [downloads]);

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1000px] space-y-5 px-8 pb-12 pt-8">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-[26px] font-semibold tracking-tight">Downloads</h1>
                        <p className="mt-0.5 text-sm text-fg-mute">{stats.active > 0 ? `${stats.active} active · ${formatBytes(stats.speed)}/s` : "Nothing downloading"}</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-1 rounded-ctl border border-line bg-white/[0.03] py-0.5 pl-3 pr-0.5" title="Maximum simultaneous downloads">
                            <Layers size={14} className="text-fg-mute" />
                            <span className="mx-1.5 text-[13px] text-fg-soft">Parallel</span>
                            <IconButton label="Fewer" size="sm" onClick={() => setConcurrent(maxConcurrent - 1)}><Minus size={13} /></IconButton>
                            <span className="w-5 text-center text-sm font-medium tabular-nums">{maxConcurrent}</span>
                            <IconButton label="More" size="sm" onClick={() => setConcurrent(maxConcurrent + 1)}><Plus size={13} /></IconButton>
                        </div>
                        <Button variant="primary" icon={<Globe size={16} />} onClick={() => setAddOpen(true)}>Add links</Button>
                    </div>
                </header>

                {downloads.length > 0 && (
                    <div className="surface space-y-3.5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 text-sm">
                                <TrendingDown size={16} className="text-accent" />
                                <span className="font-medium tabular-nums">{formatBytes(stats.speed)}/s</span>
                                <span className="text-fg-mute">·</span>
                                <span className="tabular-nums text-fg-soft">{stats.pct.toFixed(1)}% of active</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="secondary" icon={<Pause size={14} />} disabled={!stats.running.length} onClick={() => void bulk("pause", stats.running)}>Pause all</Button>
                                <Button size="sm" variant="secondary" icon={<Play size={14} />} disabled={!stats.resumable.length} onClick={() => void bulk("resume", stats.resumable)}>Resume all</Button>
                                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={!stats.finished.length} onClick={() => void bulk("delete", stats.finished)}>Clear finished</Button>
                            </div>
                        </div>
                        <ProgressBar value={stats.pct} height={6} />
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Segmented value={filter} onChange={setFilter} size="sm" options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "completed", label: "Completed" }]} />
                    <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Sort downloads" className="h-8 !py-0 text-[13px]">
                        <option value="name">Sort: Name</option>
                        <option value="progress">Sort: Progress</option>
                        <option value="speed">Sort: Speed</option>
                    </select>
                </div>

                {groups.length === 0 ? (
                    <div className="surface">
                        <EmptyState
                            icon={<Activity size={26} />}
                            title={filter === "all" ? "No downloads" : `No ${filter} downloads`}
                            description={filter === "all" ? "Paste direct or FuckingFast links and ChiraLauncher will queue, resume and group them for you." : undefined}
                            actions={filter === "all" ? <Button variant="primary" icon={<Globe size={16} />} onClick={() => setAddOpen(true)}>Add links</Button> : undefined}
                        />
                    </div>
                ) : (
                    <div className="space-y-3">
                        {groups.map((g) => g.kind === "folder" ? <FolderGroup key={g.key} name={g.name} files={g.files} /> : <DownloadRow key={g.key} item={g.item} />)}
                    </div>
                )}
            </div>
            <AddLinksModal open={addOpen} onClose={() => setAddOpen(false)} />
        </div>
    );
}
