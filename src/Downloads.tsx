import { useEffect, useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useDownloadsStore } from "./store/downloadsStore";
import { useHttpStore } from "./store/httpStore";
import { useUiStore } from "./store/uiStore";
import { BulkLinkModal } from "./components/modals/BulkLinkModal";
import { ContextMenu, ContextMenuItem } from "./components/ui/ContextMenu";
import { motion, AnimatePresence } from "framer-motion";
import {
    Play, Pause, X, HardDriveDownload, Link as LinkIcon, Activity,
    AlertCircle, Globe, FolderTree, Trash2, RotateCcw, FolderOpen, PauseCircle, PlayCircle,
    ArrowUpDown, TrendingDown, File, Layers
} from "lucide-react";
import { cn } from "./lib/utils";

import { UnifiedDownloadCard } from "./components/downloads/UnifiedDownloadCard";
import { formatBytes, computeDownloadStatus, resolveOpenPath, isItemError, isItemPaused, isItemCompleted, getName, getProgress, getDownloadSpeed } from "./components/downloads/DownloadUtils";

type SortKey = 'name' | 'progress' | 'speed' | 'status';

export function Downloads() {
    const { downloads: torrents, startPolling: startTorrent, stopPolling: stopTorrent } = useDownloadsStore();
    const { downloads: https, startPolling: startHttp, stopPolling: stopHttp } = useHttpStore();
    const { setTorrentModalOpen } = useUiStore();

    const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [magnetInput, setMagnetInput] = useState("");
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [selectedFolder, setSelectedFolder] = useState<any | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: any, type: "torrent" | "http" | "folder" } | null>(null);
    const [maxConcurrent, setMaxConcurrent] = useState(4);

    // Load current concurrency limit from backend on mount
    useEffect(() => {
        invoke<number>("get_max_concurrent_downloads").then(setMaxConcurrent).catch(() => {});
    }, []);

    const handleSetConcurrent = async (val: number) => {
        setMaxConcurrent(val);
        await invoke("set_max_concurrent_downloads", { limit: val }).catch(() => {});
    };

    const [notifiedIds] = useState(() => new Set<string>());

    const handlePickTorrentFile = async () => {
        const selected = await openDialog({
            multiple: false,
            filters: [{ name: 'Torrent Files', extensions: ['torrent'] }]
        });
        if (selected && typeof selected === 'string') {
            setTorrentModalOpen(true, "file://" + selected);
        }
    };

    useEffect(() => {
        if (Notification.permission === "default") {
            Notification.requestPermission();
        }
    }, []);

    useEffect(() => {
        startTorrent();
        startHttp();
        return () => {
            stopTorrent();
            stopHttp();
        };
    }, []);

    // Combine and normalize items for robust filtering
    const allDownloads = [
        ...torrents.map(t => ({ ...t, _type: "torrent" as const, id: `t_${t.id}` })),
        ...https.map(h => ({ ...h, _type: "http" as const, id: h.id }))
    ];

    useEffect(() => {
        allDownloads.forEach(d => {
            if (isItemCompleted(d) && !notifiedIds.has(d.id)) {
                notifiedIds.add(d.id);
                if (Notification.permission === "granted") {
                    new Notification("Download Complete", {
                        body: `${getName(d)} has finished downloading.`,
                        icon: "/cl_logo.png"
                    });
                }
            }
        });
    }, [allDownloads, notifiedIds]);

    const filteredDownloads = allDownloads.filter(d => {
        const completed = isItemCompleted(d);
        if (filter === 'active') return !completed;
        if (filter === 'completed') return completed;
        return true;
    });

    const groupedDownloads = useMemo(() => {
        const groups: Record<string, any[]> = {};
        const standalone: any[] = [];

        filteredDownloads.forEach(d => {
            if (d._type === "http" && (d as any).folder_name) {
                const folderName = (d as any).folder_name;
                if (!groups[folderName]) groups[folderName] = [];
                groups[folderName].push(d);
            } else {
                standalone.push(d);
            }
        });

        const folderItems = Object.entries(groups).map(([folderName, files]) => {
            const totalBytes = files.reduce((s, f) => s + f.total_bytes, 0);
            const downloadedBytes = files.reduce((s, f) => s + f.downloaded_bytes, 0);
            const downloadSpeed = files.reduce((s, f) => s + getDownloadSpeed(f), 0);
            const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
            const isError = files.some(f => isItemError(f));
            const isFinished = files.every(f => isItemCompleted(f));
            const isPaused = files.every(f => isItemPaused(f));

            return {
                id: `folder_${folderName}`,
                _type: "folder" as const,
                name: folderName,
                files,
                total_bytes: totalBytes,
                downloaded_bytes: downloadedBytes,
                download_speed: downloadSpeed,
                progress_percent: progress,
                state: isError ? "Error" : isFinished ? "Finished" : isPaused ? "Paused" : "Downloading"
            };
        });

        const combined = [...folderItems, ...standalone];

        // Sorting
        combined.sort((a, b) => {
            switch (sortKey) {
                case 'name': return getName(a).localeCompare(getName(b));
                case 'progress': return getProgress(b) - getProgress(a);
                case 'speed': return getDownloadSpeed(b) - getDownloadSpeed(a);
                case 'status': {
                    const order = (x: any) => isItemCompleted(x) ? 2 : isItemError(x) ? 3 : isItemPaused(x) ? 1 : 0;
                    return order(a) - order(b);
                }
                default: return 0;
            }
        });

        return combined;
    }, [filteredDownloads, sortKey]);

    const activeDownloads = allDownloads.filter(d => !isItemCompleted(d) && !isItemError(d));
    const globalDownloaded = activeDownloads.reduce((sum, d) => sum + d.downloaded_bytes, 0);
    const globalTotal = activeDownloads.reduce((sum, d) => sum + d.total_bytes, 0);
    const globalProgress = globalTotal > 0 ? (globalDownloaded / globalTotal) * 100 : 0;
    const globalSpeed = activeDownloads.reduce((sum, d) => sum + getDownloadSpeed(d), 0);

    // Pause all / resume all handlers
    const handlePauseAll = useCallback(async () => {
        for (const d of activeDownloads) {
            if (!isItemPaused(d) && !isItemCompleted(d)) {
                try {
                    if (d._type === "torrent") {
                        const id = parseInt(d.id.replace('t_', ''));
                        await invoke("pause_download", { id });
                    } else {
                        await invoke("pause_http_download", { id: d.id });
                    }
                } catch (e) { console.error(e); }
            }
        }
    }, [activeDownloads]);

    const handleResumeAll = useCallback(async () => {
        for (const d of allDownloads) {
            if (isItemPaused(d)) {
                try {
                    if (d._type === "torrent") {
                        const id = parseInt(d.id.replace('t_', ''));
                        await invoke("resume_download", { id });
                    } else {
                        await invoke("resume_http_download", { id: d.id });
                    }
                } catch (e) { console.error(e); }
            }
        }
    }, [allDownloads]);

    const handleClearAll = useCallback(async () => {
        for (const d of allDownloads) {
            try {
                if (d._type === "torrent") {
                    const id = parseInt(d.id.replace('t_', ''));
                    await invoke("cancel_download", { id });
                } else {
                    await invoke("delete_http_download", { id: d.id, deleteFile: false });
                }
            } catch (e) { console.error(e); }
        }
    }, [allDownloads]);

    const handleContextMenu = (e: React.MouseEvent, item: any, type: "torrent" | "http" | "folder") => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, item, type });
    };

    const getContextMenuItems = (): ContextMenuItem[] => {
        if (!contextMenu) return [];
        const { item, type } = contextMenu;
        const { isFolder, isCompleted, isPaused, isError } = computeDownloadStatus(item, type);
        const torrentStore = useDownloadsStore.getState();

        const getTorrentId = () => parseInt((item.id as string).replace('t_', ''));

        const items: ContextMenuItem[] = [];

        // ── Folder-specific: always available ──
        if (isFolder) {
            items.push({
                label: "View Files",
                icon: <FolderTree size={16} />,
                onClick: () => setSelectedFolder(item)
            });
        }

        // ── Open in Explorer: for completed items or folders ──
        if (isCompleted || isFolder) {
            items.push({
                label: "Open in Explorer",
                icon: <FolderOpen size={16} />,
                onClick: () => {
                    const pathToOpen = resolveOpenPath(item, type);
                    if (pathToOpen) invoke("open_path_in_explorer", { path: pathToOpen }).catch(console.error);
                }
            });
        }

        if (items.length > 0) {
            items.push({ separator: true, label: "" });
        }

        // ── Active/Paused: Pause & Resume ──
        if (!isCompleted && !isError) {
            items.push({
                label: isPaused ? "Resume Download" : "Pause Download",
                icon: isPaused ? <Play size={16} /> : <Pause size={16} />,
                onClick: () => {
                    if (isFolder) {
                        item.files.forEach((f: any) => invoke(isPaused ? "resume_http_download" : "pause_http_download", { id: f.id }));
                    } else if (type === "torrent") {
                        isPaused ? torrentStore.resumeDownload(getTorrentId()) : torrentStore.pauseDownload(getTorrentId());
                    } else {
                        invoke(isPaused ? "resume_http_download" : "pause_http_download", { id: item.id });
                    }
                }
            });
        }

        // ── Error: Retry ──
        if (isError && (type === "http" || isFolder)) {
            items.push({
                label: "Retry Download",
                icon: <RotateCcw size={16} />,
                onClick: async () => {
                    if (isFolder) {
                        for (const f of item.files) if (isItemError(f)) await invoke("retry_http_download", { id: f.id });
                    } else {
                        await invoke("retry_http_download", { id: item.id });
                    }
                }
            });
        }

        items.push({ separator: true, label: "" });

        // ── Remove (keep file) ──
        items.push({
            label: isCompleted ? "Remove from List" : "Cancel & Remove from List",
            icon: <X size={16} />,
            onClick: async () => {
                if (isFolder) {
                    for (const f of item.files) await invoke("delete_http_download", { id: f.id, deleteFile: false });
                } else if (type === "torrent") {
                    torrentStore.cancelDownload(getTorrentId());
                } else {
                    await invoke("delete_http_download", { id: item.id, deleteFile: false });
                }
            }
        });

        // ── Remove + delete file ──
        items.push({
            label: isCompleted ? "Remove & Delete Data" : "Cancel & Delete Data",
            icon: <Trash2 size={16} />,
            danger: true,
            onClick: async () => {
                if (isFolder) {
                    for (const f of item.files) await invoke("delete_http_download", { id: f.id, deleteFile: true });
                } else if (type === "torrent") {
                    torrentStore.cancelDownload(getTorrentId());
                } else {
                    await invoke("delete_http_download", { id: item.id, deleteFile: true });
                }
            }
        });

        return items;
    };

    const SORT_OPTIONS: { key: SortKey; label: string }[] = [
        { key: 'name', label: 'Name' },
        { key: 'progress', label: 'Progress' },
        { key: 'speed', label: 'Speed' },
        { key: 'status', label: 'Status' },
    ];

    return (
        <>
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={getContextMenuItems()}
                    onClose={() => setContextMenu(null)}
                />
            )}

            <BulkLinkModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} />

            <AnimatePresence>
                {selectedFolder && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-4xl bg-[#12141c] rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                        >
                            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400">
                                        <FolderTree size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-white uppercase tracking-tight">{selectedFolder.name}</h2>
                                        <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">
                                            {selectedFolder.files.length} Files • {formatBytes(selectedFolder.total_bytes)}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedFolder(null)} className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-4 bg-black/20">
                                {selectedFolder.files.map((file: any, idx: number) => (
                                    <UnifiedDownloadCard key={file.id} item={file} index={idx} type="http" onContextMenu={handleContextMenu} />
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <div className="flex flex-col min-h-full px-14 pt-14 pb-32 max-w-[1200px] mx-auto w-full">

                    <header className="flex flex-col gap-6 mb-12 px-2">
                        <div className="flex items-end justify-between">
                            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                                <h1 className="text-4xl font-bold text-white flex items-center gap-4">
                                    <HardDriveDownload size={40} className="text-accent drop-shadow-[0_0_15px_rgba(192,38,211,0.3)]" />
                                    Downloads
                                </h1>
                            </motion.div>

                            {/* Filter + Sort controls */}
                            <div className="flex items-center gap-3">
                                {/* Concurrent downloads control */}
                                <div className="flex items-center gap-2.5 bg-black/40 border border-white/10 rounded-2xl px-4 py-2" title="Max simultaneous downloads">
                                    <Layers size={13} className="text-amber-400/80" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Concurrent</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleSetConcurrent(Math.max(1, maxConcurrent - 1))}
                                            className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-xs flex items-center justify-center transition-all"
                                        >-</button>
                                        <span className="text-sm font-black text-amber-400 w-4 text-center tabular-nums">{maxConcurrent}</span>
                                        <button
                                            onClick={() => handleSetConcurrent(Math.min(16, maxConcurrent + 1))}
                                            className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-xs flex items-center justify-center transition-all"
                                        >+</button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-2xl px-3 py-1.5">
                                    <ArrowUpDown size={13} className="text-white/30" />
                                    <select
                                        value={sortKey}
                                        onChange={e => setSortKey(e.target.value as SortKey)}
                                        className="bg-transparent text-white/60 text-xs font-bold outline-none cursor-pointer [&>option]:bg-[#0f1423]"
                                    >
                                        {SORT_OPTIONS.map(o => (
                                            <option key={o.key} value={o.key}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Filter pills */}
                                <div className="flex bg-black/40 backdrop-blur-3xl rounded-2xl p-1.5 border border-white/5 shadow-3xl">
                                    {(['all', 'active', 'completed'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setFilter(f)}
                                            className={cn(
                                                "px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize",
                                                filter === f ? "bg-white/10 text-white shadow-xl" : "text-white/20 hover:text-white/50"
                                            )}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Magnet input */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 flex-1 shadow-inner">
                                <LinkIcon size={18} className="text-accent" />
                                <input
                                    type="text"
                                    placeholder="Paste Torrent Magnet Link..."
                                    value={magnetInput}
                                    onChange={(e) => setMagnetInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && magnetInput.trim()) {
                                            setTorrentModalOpen(true, magnetInput.trim());
                                            setMagnetInput("");
                                        }
                                    }}
                                    className="bg-transparent border-none outline-none text-sm text-white flex-1 placeholder:text-white/30"
                                />
                                <button
                                    onClick={() => {
                                        if (magnetInput.trim()) {
                                            setTorrentModalOpen(true, magnetInput.trim());
                                            setMagnetInput("");
                                        }
                                    }}
                                    disabled={!magnetInput.trim()}
                                    className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                >
                                    Add Torrent
                                </button>
                            </div>

                            <button
                                onClick={handlePickTorrentFile}
                                className="bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white px-6 py-5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-lg flex items-center gap-2"
                            >
                                <File size={16} /> Open .torrent
                            </button>

                            <button
                                onClick={() => setIsBulkModalOpen(true)}
                                className="bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white px-6 py-5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-lg flex items-center gap-2"
                            >
                                <Globe size={16} /> Add Direct Links
                            </button>
                        </div>

                        {/* Global queue progress + Pause All / Resume All / Clear All */}
                        {allDownloads.length > 0 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/20 border border-white/5 rounded-2xl p-5">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                                            Global Queue ({activeDownloads.length} Active)
                                        </span>
                                        <div className="flex items-center gap-1.5 text-white/30 text-xs font-mono">
                                            <TrendingDown size={12} />
                                            {formatBytes(globalSpeed)}/s
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handlePauseAll}
                                            className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            <PauseCircle size={13} /> Pause All
                                        </button>
                                        <button
                                            onClick={handleResumeAll}
                                            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            <PlayCircle size={13} /> Resume All
                                        </button>
                                        <button
                                            onClick={handleClearAll}
                                            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            <Trash2 size={13} /> Clear All
                                        </button>
                                        <span className="text-xs font-bold text-white">{globalProgress.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative z-10">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-accent to-blue-400 rounded-full diagonal-progress"
                                        animate={{ width: `${globalProgress}%` }}
                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </header>

                    <div className="flex flex-col gap-8">
                        <AnimatePresence mode="popLayout">
                            {groupedDownloads.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex flex-col items-center justify-center py-40 text-center radar-grid rounded-xl border border-white/5"
                                >
                                    <div className="w-28 h-28 flex items-center justify-center mb-10 shadow-3xl group tech-card-sm">
                                        <Activity size={48} className="text-white/5 group-hover:text-accent group-hover:scale-110 transition-all duration-500 relative z-10" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-4 relative z-10">No Downloads</h3>
                                    <p className="text-white/50 text-sm max-w-sm leading-relaxed relative z-10">
                                        {filter === 'all' ? "Your queue is empty." : `No ${filter} downloads found.`}
                                    </p>
                                </motion.div>
                            ) : (
                                groupedDownloads.map((d, i) => (
                                    <UnifiedDownloadCard key={d.id} item={d} index={i} type={d._type} onOpenFolder={setSelectedFolder} onContextMenu={handleContextMenu} />
                                ))
                            )}
                        </AnimatePresence>
                    </div>

                    {groupedDownloads.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-20 pt-10 border-t border-white/5 flex flex-col items-center gap-5 text-white/10"
                        >
                            <AlertCircle size={24} className="opacity-20" />
                            <p className="text-xs text-white/40 uppercase tracking-widest font-black">End of Queue</p>
                        </motion.div>
                    )}
                </div>
            </div>
        </>
    );
}