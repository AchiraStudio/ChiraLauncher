import { useEffect, useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useHttpStore, DownloadItem } from "./store/httpStore";
import { AddLinksModal } from "./components/modals/AddLinksModal";
import { DownloadCard, formatBytes } from "./components/downloads/DownloadCard";
import { FolderGroupCard } from "./components/downloads/FolderGroupCard";
import { motion, AnimatePresence } from "framer-motion";
import {
    HardDriveDownload, Activity, Globe, Trash2, PauseCircle,
    PlayCircle, ArrowUpDown, TrendingDown, Layers
} from "lucide-react";

type SortKey = 'filename' | 'progress' | 'speed' | 'status';

export function Downloads() {
    const { downloads, startPolling, stopPolling, pauseDownload, resumeDownload, deleteDownload } = useHttpStore();

    const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
    const [sortKey, setSortKey] = useState<SortKey>('filename');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [maxConcurrent, setMaxConcurrent] = useState(4);

    useEffect(() => {
        if (!window.__TAURI_INTERNALS__) return;
        invoke<number>("get_max_concurrent_downloads").then(setMaxConcurrent).catch(() => {});
    }, []);

    const handleSetConcurrent = async (val: number) => {
        setMaxConcurrent(val);
        await invoke("set_max_concurrent_downloads", { limit: val }).catch(() => {});
    };

    useEffect(() => {
        startPolling();
        return () => stopPolling();
    }, [startPolling, stopPolling]);

    const filteredDownloads = useMemo(() => {
        return downloads.filter(d => {
            const completed = d.status === "completed";
            if (filter === 'active') return !completed;
            if (filter === 'completed') return completed;
            return true;
        });
    }, [downloads, filter]);

    const groupedItems = useMemo(() => {
        const folderMap: Record<string, DownloadItem[]> = {};
        const standaloneFiles: DownloadItem[] = [];

        filteredDownloads.forEach(d => {
            if (d.folder_name) {
                if (!folderMap[d.folder_name]) folderMap[d.folder_name] = [];
                folderMap[d.folder_name].push(d);
            } else {
                standaloneFiles.push(d);
            }
        });

        const folders = Object.entries(folderMap).map(([folderName, files]) => ({
            type: "folder" as const,
            folderName,
            files,
            nameForSort: folderName,
            totalSpeed: files.reduce((s, f) => s + f.speed_bytes_per_sec, 0),
            progress: files.reduce((s, f) => s + f.total_bytes, 0) > 0
                ? files.reduce((s, f) => s + f.downloaded_bytes, 0) / files.reduce((s, f) => s + f.total_bytes, 0)
                : 0,
        }));

        const files = standaloneFiles.map(file => ({
            type: "file" as const,
            item: file,
            nameForSort: file.filename,
            totalSpeed: file.speed_bytes_per_sec,
            progress: file.total_bytes > 0 ? file.downloaded_bytes / file.total_bytes : 0,
        }));

        return [...folders, ...files].sort((a, b) => {
            switch (sortKey) {
                case 'filename':
                    return a.nameForSort.localeCompare(b.nameForSort);
                case 'progress':
                    return b.progress - a.progress;
                case 'speed':
                    return b.totalSpeed - a.totalSpeed;
                default:
                    return 0;
            }
        });
    }, [filteredDownloads, sortKey]);

    const activeDownloads = downloads.filter(d => d.status === "downloading" || d.status === "queued" || d.status === "pending");
    const globalDownloaded = activeDownloads.reduce((s, d) => s + d.downloaded_bytes, 0);
    const globalTotal = activeDownloads.reduce((s, d) => s + d.total_bytes, 0);
    const globalProgress = globalTotal > 0 ? (globalDownloaded / globalTotal) * 100 : 0;
    const globalSpeed = activeDownloads.reduce((s, d) => s + d.speed_bytes_per_sec, 0);

    const handlePauseAll = useCallback(async () => {
        for (const d of activeDownloads) {
            if (d.status === "downloading" || d.status === "queued") {
                await pauseDownload(d.id);
            }
        }
    }, [activeDownloads, pauseDownload]);

    const handleResumeAll = useCallback(async () => {
        for (const d of downloads) {
            if (d.status === "paused" || d.status === "pending" || d.status === "failed") {
                await resumeDownload(d.id);
            }
        }
    }, [downloads, resumeDownload]);

    const handleClearAll = useCallback(async () => {
        const completed = downloads.filter(d => d.status === "completed" || d.status === "failed" || d.status === "cancelled");
        for (const d of completed) {
            await deleteDownload(d.id, false);
        }
    }, [downloads, deleteDownload]);

    return (
        <>
            <AddLinksModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />

            <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <div className="flex flex-col min-h-full px-14 pt-14 pb-32 max-w-[1200px] mx-auto w-full">

                    {/* Header */}
                    <header className="flex flex-col gap-6 mb-10 px-2">
                        <div className="flex items-end justify-between">
                            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                                <h1 className="text-4xl font-bold text-white flex items-center gap-4">
                                    <HardDriveDownload size={40} className="text-accent drop-shadow-[0_0_15px_rgba(192,38,211,0.3)]" />
                                    Downloads
                                </h1>
                            </motion.div>

                            <div className="flex items-center gap-3">
                                {/* Concurrency Control */}
                                <div className="flex items-center gap-2.5 bg-black/40 border border-white/10 rounded-2xl px-4 py-2" title="Max simultaneous downloads">
                                    <Layers size={14} className="text-amber-400/80" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Concurrent</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleSetConcurrent(Math.max(1, maxConcurrent - 1))}
                                            className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-xs flex items-center justify-center transition-all"
                                        >
                                            -
                                        </button>
                                        <span className="text-sm font-black text-amber-400 w-4 text-center tabular-nums">{maxConcurrent}</span>
                                        <button
                                            onClick={() => handleSetConcurrent(Math.min(16, maxConcurrent + 1))}
                                            className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-xs flex items-center justify-center transition-all"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>

                                {/* Sort Options */}
                                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-2xl px-3.5 py-2">
                                    <ArrowUpDown size={14} className="text-white/30" />
                                    <select
                                        value={sortKey}
                                        onChange={e => setSortKey(e.target.value as SortKey)}
                                        className="bg-transparent text-white/70 text-xs font-bold outline-none cursor-pointer [&>option]:bg-[#0f1423]"
                                    >
                                        <option value="filename">Name</option>
                                        <option value="progress">Progress</option>
                                        <option value="speed">Speed</option>
                                    </select>
                                </div>

                                {/* Filter Tabs */}
                                <div className="flex bg-black/40 backdrop-blur-3xl rounded-2xl p-1.5 border border-white/5">
                                    {(['all', 'active', 'completed'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setFilter(f)}
                                            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all capitalize ${
                                                filter === f ? "bg-white/10 text-white shadow-lg" : "text-white/30 hover:text-white/60"
                                            }`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Actions Row */}
                        <div className="flex items-center justify-between gap-4">
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="bg-accent hover:bg-accent/90 text-white px-7 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-accent/20 flex items-center gap-2.5"
                            >
                                <Globe size={18} /> Add Links
                            </button>
                        </div>

                        {/* Global Queue Stats Bar */}
                        {downloads.length > 0 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/30 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                                            Queue ({activeDownloads.length} Active)
                                        </span>
                                        <div className="flex items-center gap-1.5 text-accent text-xs font-mono font-bold">
                                            <TrendingDown size={14} />
                                            {formatBytes(globalSpeed)}/s
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handlePauseAll}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            <PauseCircle size={14} /> Pause All
                                        </button>
                                        <button
                                            onClick={handleResumeAll}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            <PlayCircle size={14} /> Resume All
                                        </button>
                                        <button
                                            onClick={handleClearAll}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            <Trash2 size={14} /> Clear Finished
                                        </button>
                                        <span className="text-xs font-mono font-bold text-white ml-2">{globalProgress.toFixed(1)}%</span>
                                    </div>
                                </div>

                                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-accent to-blue-400 rounded-full"
                                        animate={{ width: `${globalProgress}%` }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </header>

                    {/* Downloads List */}
                    <div className="flex flex-col gap-4">
                        <AnimatePresence mode="popLayout">
                            {groupedItems.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex flex-col items-center justify-center py-32 text-center rounded-3xl border border-white/5 bg-black/20"
                                >
                                    <div className="w-24 h-24 flex items-center justify-center mb-6 rounded-2xl bg-white/[0.03] border border-white/10">
                                        <Activity size={40} className="text-white/20" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">No Downloads</h3>
                                    <p className="text-white/40 text-xs max-w-xs leading-relaxed">
                                        {filter === 'all' ? "Your download queue is empty. Click 'Add Links' above to start downloading." : `No ${filter} downloads found.`}
                                    </p>
                                </motion.div>
                            ) : (
                                groupedItems.map((group, index) => (
                                    group.type === "folder" ? (
                                        <FolderGroupCard
                                            key={`folder_${group.folderName}`}
                                            folderName={group.folderName}
                                            files={group.files}
                                            index={index}
                                        />
                                    ) : (
                                        <DownloadCard
                                            key={group.item.id}
                                            item={group.item}
                                            index={index}
                                        />
                                    )
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </>
    );
}