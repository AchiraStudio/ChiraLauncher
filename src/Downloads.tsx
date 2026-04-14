import { useEffect, useState, useMemo } from "react";
import { useDownloadsStore } from "./store/downloadsStore";
import { useHttpStore } from "./store/httpStore";
import { useUiStore } from "./store/uiStore";
import { BulkLinkModal } from "./components/modals/BulkLinkModal";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, X, HardDriveDownload, Link as LinkIcon, Activity, Clock, ArrowDownToLine, ArrowUpToLine, Users, CheckCircle2, AlertCircle, Globe, FolderTree } from "lucide-react";
import { cn } from "./lib/utils";

function formatBytes(bytes: number, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatETA(bytesRemaining: number, bytesPerSec: number) {
    if (bytesPerSec === 0) return "∞";
    const seconds = Math.floor(bytesRemaining / bytesPerSec);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function UnifiedDownloadCard({ item, index, type, onOpenFolder }: { item: any; index: number, type: "torrent" | "http" | "folder", onOpenFolder?: (folder: any) => void }) {
    const torrentStore = useDownloadsStore();
    const httpStore = useHttpStore();

    const isFolder = type === "folder";

    const bytesRemaining = item.total_bytes - item.downloaded_bytes;
    const isCompleted = item.state === "Finished" || item.progress_percent >= 100;
    const isPaused = item.state === "Paused";
    const isError = item.state === "Error";

    const handlePause = () => {
        if (isFolder) {
            item.files.forEach((f: any) => httpStore.pauseDownload(f.id));
        } else {
            type === "torrent" ? torrentStore.pauseDownload(item.id) : httpStore.pauseDownload(item.id);
        }
    };

    const handleResume = () => {
        if (isFolder) {
            item.files.forEach((f: any) => httpStore.resumeDownload(f.id));
        } else {
            type === "torrent" ? torrentStore.resumeDownload(item.id) : httpStore.resumeDownload(item.id);
        }
    };

    const handleCancel = () => {
        if (isFolder) {
            item.files.forEach((f: any) => httpStore.cancelDownload(f.id));
        } else {
            type === "torrent" ? torrentStore.cancelDownload(item.id) : httpStore.cancelDownload(item.id);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.05 }}
            className="group relative glass-panel rounded-3xl p-8 hover:border-accent/40 transition-all duration-500 hover:shadow-3xl bg-surface/30 backdrop-blur-3xl overflow-hidden border border-white/5 flex flex-col"
        >
            <div className={cn(
                "absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-0 group-hover:opacity-10 transition-opacity duration-700 pointer-events-none",
                isError ? 'bg-red-500' : isCompleted ? 'bg-green-500' : isPaused ? 'bg-yellow-500' : (type === "torrent" ? 'bg-accent' : isFolder ? 'bg-purple-500' : 'bg-blue-500')
            )} />

            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-3">
                        {isFolder ? <FolderTree size={16} className="text-purple-400" /> : type === "http" ? <Globe size={16} className="text-blue-400" /> : <Users size={16} className="text-accent" />}
                        <h3 className="font-bold text-white text-xl truncate group-hover:text-white transition-colors" title={item.name}>
                            {item.name} {isFolder && <span className="text-sm text-white/40 ml-2 font-medium">({item.files.length} files)</span>}
                        </h3>
                    </div>

                    {!isFolder && item.folder_name && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-white/40 text-[10px] font-bold uppercase tracking-widest">
                            <FolderTree size={12} /> {item.folder_name}
                        </div>
                    )}

                    <div className="flex items-center gap-6 mt-3">
                        <div className="flex items-center gap-2 bg-white/[0.03] px-3 py-1 rounded-lg border border-white/5">
                            <ArrowDownToLine size={14} className="text-white/20" />
                            <span className="text-xs text-white/60 tabular-nums">
                                {formatBytes(item.downloaded_bytes)} <span className="text-white/10 mx-1">/</span> {formatBytes(item.total_bytes)}
                            </span>
                        </div>
                        {isError ? (
                            <div className="flex items-center gap-2 text-red-500 text-xs font-semibold">
                                <AlertCircle size={14} /> Error: {isFolder ? "Check internal files" : item.error_msg || "Unknown"}
                            </div>
                        ) : isCompleted ? (
                            <div className="flex items-center gap-2 text-green-500 text-xs font-semibold">
                                <CheckCircle2 size={14} /> Completed
                            </div>
                        ) : isPaused ? (
                            <div className="flex items-center gap-2 text-yellow-500 text-xs font-semibold">
                                <Pause size={14} /> Paused
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-accent text-xs font-semibold animate-pulse">
                                <Activity size={14} /> {item.state}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    {!isCompleted && !isError && (
                        <button
                            onClick={isPaused ? handleResume : handlePause}
                            className="w-12 h-12 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] text-white transition-all active:scale-90 border border-white/5 flex items-center justify-center shadow-xl"
                            title={isPaused ? "Resume" : "Pause"}
                        >
                            {isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
                        </button>
                    )}
                    <button
                        onClick={handleCancel}
                        className="w-12 h-12 rounded-2xl bg-white/[0.03] hover:bg-red-500/20 hover:text-red-500 text-white/40 transition-all active:scale-90 border border-white/5 flex items-center justify-center shadow-xl"
                        title="Purge Task"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div className="relative mb-6 z-10 mt-auto">
                <div className="h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, Math.min(100, item.progress_percent))}%` }}
                        transition={{ duration: 1.2, ease: "linear" }}
                        className={cn(
                            "h-full rounded-full transition-colors duration-700 relative",
                            isError ? 'bg-red-500' : isCompleted ? 'bg-green-500' : isPaused ? 'bg-yellow-500' : (type === "torrent" ? 'bg-accent' : isFolder ? 'bg-purple-500' : 'bg-blue-400')
                        )}
                    >
                        {!isCompleted && !isPaused && !isError && (
                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        )}
                    </motion.div>
                </div>
                <div className="absolute -top-7 right-0 text-xs font-bold text-white/40">
                    {Math.round(item.progress_percent)}%
                </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
                {!isCompleted && !isError && (
                    <div className="flex items-center justify-between text-xs font-medium text-white/50 relative z-10 w-full">
                        <div className="flex items-center gap-10">
                            <div className="flex items-center gap-3">
                                <ArrowDownToLine size={16} className={isFolder ? "text-purple-400/40" : type === "http" ? "text-blue-400/40" : "text-accent/40"} />
                                <span className="text-white/60 tabular-nums">{formatBytes(item.download_speed)}/s</span>
                            </div>
                            {type === "torrent" && (
                                <>
                                    <div className="flex items-center gap-3">
                                        <ArrowUpToLine size={16} className="text-purple-500/30" />
                                        <span className="text-white/30 tabular-nums">{formatBytes(item.upload_speed)}/s</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Users size={16} className="text-white/10" />
                                        <span className="text-white/30 tabular-nums uppercase">{item.peers} Peers</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {!isPaused && item.download_speed > 0 && (
                            <div className="flex items-center gap-2 text-white/80 bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-xs font-semibold">
                                <Clock size={14} />
                                {formatETA(bytesRemaining, item.download_speed)} remaining
                            </div>
                        )}
                    </div>
                )}

                {isFolder && (
                    <button onClick={() => onOpenFolder && onOpenFolder(item)} className="ml-auto px-4 py-2 bg-white/5 hover:bg-white/10 text-[10px] text-white font-black uppercase tracking-widest rounded-xl transition-colors border border-white/10 shadow-md">
                        View Contents
                    </button>
                )}
            </div>

        </motion.div>
    );
}

export function Downloads() {
    const { downloads: torrents, startPolling: startTorrent, stopPolling: stopTorrent } = useDownloadsStore();
    const { downloads: https, startPolling: startHttp, stopPolling: stopHttp } = useHttpStore();
    const { setTorrentModalOpen } = useUiStore();

    const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
    const [magnetInput, setMagnetInput] = useState("");
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [selectedFolder, setSelectedFolder] = useState<any | null>(null);

    // NOTIFICATION SYSTEM 
    const [notifiedIds] = useState(() => new Set<string>());

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

    const allDownloads = [
        ...torrents.map(t => ({ ...t, _type: "torrent" as const, id: `t_${t.id}` })),
        ...https.map(h => ({ ...h, _type: "http" as const, id: `h_${h.id}` }))
    ].sort((a, b) => a.name.localeCompare(b.name));

    // Check for newly completed downloads and notify
    useEffect(() => {
        allDownloads.forEach(d => {
            if ((d.state === "Finished" || d.progress_percent >= 100) && !notifiedIds.has(d.id)) {
                notifiedIds.add(d.id);
                if (Notification.permission === "granted") {
                    new Notification("Download Complete", {
                        body: `${d.name} has finished downloading.`,
                        icon: "/cl_logo.png"
                    });
                }
            }
        });
    }, [allDownloads, notifiedIds]);

    const filteredDownloads = allDownloads.filter(d => {
        const isCompleted = d.state === "Finished" || d.progress_percent >= 100;
        if (filter === 'active') return !isCompleted;
        if (filter === 'completed') return isCompleted;
        return true;
    });

    const groupedDownloads = useMemo(() => {
        const groups: Record<string, any[]> = {};
        const standalone: any[] = [];

        filteredDownloads.forEach(d => {
            if (d._type === "http" && d.folder_name) {
                if (!groups[d.folder_name]) groups[d.folder_name] = [];
                groups[d.folder_name].push(d);
            } else {
                standalone.push(d);
            }
        });

        const folderItems = Object.entries(groups).map(([folderName, files]) => {
            const totalBytes = files.reduce((s, f) => s + f.total_bytes, 0);
            const downloadedBytes = files.reduce((s, f) => s + f.downloaded_bytes, 0);
            const downloadSpeed = files.reduce((s, f) => s + f.download_speed, 0);
            const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
            const isError = files.some(f => f.state === "Error");
            const isFinished = files.every(f => f.state === "Finished" || f.progress_percent >= 100);
            const isPaused = files.every(f => f.state === "Paused");

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

        return [...folderItems, ...standalone].sort((a, b) => a.name.localeCompare(b.name));
    }, [filteredDownloads]);

    const activeDownloads = allDownloads.filter(d => d.state !== "Finished" && d.progress_percent < 100);
    const globalDownloaded = activeDownloads.reduce((sum, d) => sum + d.downloaded_bytes, 0);
    const globalTotal = activeDownloads.reduce((sum, d) => sum + d.total_bytes, 0);
    const globalProgress = globalTotal > 0 ? (globalDownloaded / globalTotal) * 100 : 0;

    return (
        <>
            <BulkLinkModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} />

            {/* Folder Contents Modal */}
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
                                    <UnifiedDownloadCard key={file.id} item={file} index={idx} type="http" />
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

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 flex-1 shadow-inner">
                                <LinkIcon size={18} className="text-accent" />
                                <input
                                    type="text"
                                    placeholder="Paste Torrent Magnet Link..."
                                    value={magnetInput}
                                    onChange={(e) => setMagnetInput(e.target.value)}
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
                                onClick={() => setIsBulkModalOpen(true)}
                                className="bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white px-6 py-5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-lg flex items-center gap-2"
                            >
                                <Globe size={16} /> Add Direct Links
                            </button>
                        </div>

                        {activeDownloads.length > 0 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/20 border border-white/5 rounded-2xl p-5">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Global Queue Progress ({activeDownloads.length} Active)</span>
                                    <span className="text-xs font-bold text-white">{globalProgress.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-accent to-blue-400 rounded-full" style={{ width: `${globalProgress}%` }} />
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
                                    className="flex flex-col items-center justify-center py-40 text-center glass-panel border-2 border-dashed border-white/5 rounded-[3rem] bg-surface/20"
                                >
                                    <div className="w-28 h-28 glass-panel rounded-[2rem] flex items-center justify-center mb-10 shadow-3xl border border-white/5 group">
                                        <Activity size={48} className="text-white/5 group-hover:text-white/20 transition-all duration-700" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-4">No Downloads</h3>
                                    <p className="text-white/50 text-sm max-w-sm leading-relaxed">
                                        {filter === 'all' ? "Your queue is empty." : `No ${filter} downloads found.`}
                                    </p>
                                </motion.div>
                            ) : (
                                groupedDownloads.map((d, i) => (
                                    <UnifiedDownloadCard key={d.id} item={d} index={i} type={d._type} onOpenFolder={setSelectedFolder} />
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