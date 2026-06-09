import { invoke } from "@tauri-apps/api/core";
import { useDownloadsStore } from "../../store/downloadsStore";
import { motion } from "framer-motion";
import {
    Play, Pause, X, ArrowDownToLine, ArrowUpToLine, Users, CheckCircle2, AlertCircle,
    Globe, FolderTree, Trash2, RotateCcw, FolderOpen, Clock, Activity, Layers
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
    formatBytes, computeDownloadStatus, resolveOpenPath, formatETA, isItemError, getName, getProgress, getDownloadSpeed, getStatus
} from "./DownloadUtils";

export function UnifiedDownloadCard({
    item, index, type, onOpenFolder, onContextMenu
}: {
    item: any;
    index: number;
    type: "torrent" | "http" | "folder";
    onOpenFolder?: (folder: any) => void;
    onContextMenu?: (e: React.MouseEvent, item: any, type: "torrent" | "http" | "folder") => void;
}) {
    const torrentStore = useDownloadsStore();

    const { isFolder, isCompleted, isPaused, isError, isQueued } = computeDownloadStatus(item, type);
    const bytesRemaining = item.total_bytes - item.downloaded_bytes;

    const displayName = isFolder ? item.name : getName(item);
    const downloadSpeed = isFolder ? item.download_speed : getDownloadSpeed(item);
    const statusText = isFolder ? item.state : getStatus(item);
    const progress = getProgress(item);

    const getTorrentId = () => parseInt((item.id as string).replace('t_', ''));

    const handlePause = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            item.files.forEach((f: any) => invoke("pause_http_download", { id: f.id }));
        } else {
            type === "torrent" ? torrentStore.pauseDownload(getTorrentId()) : invoke("pause_http_download", { id: item.id });
        }
    };

    const handleResume = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            item.files.forEach((f: any) => invoke("resume_http_download", { id: f.id }));
        } else {
            type === "torrent" ? torrentStore.resumeDownload(getTorrentId()) : invoke("resume_http_download", { id: item.id });
        }
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            item.files.forEach((f: any) => invoke("cancel_http_download", { id: f.id }));
        } else {
            type === "torrent" ? torrentStore.cancelDownload(getTorrentId()) : invoke("cancel_http_download", { id: item.id });
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            for (const f of item.files) {
                await invoke("delete_http_download", { id: f.id, deleteFile: true });
            }
        } else {
            if (type === "torrent") {
                torrentStore.cancelDownload(getTorrentId());
            } else {
                await invoke("delete_http_download", { id: item.id, deleteFile: true });
            }
        }
    };

    const handleRetry = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            for (const f of item.files) {
                if (isItemError(f)) {
                    await invoke("retry_http_download", { id: f.id });
                }
            }
        } else {
            if (type === "http") {
                await invoke("retry_http_download", { id: item.id });
            }
        }
    };

    const handleOpenFolder = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const pathToOpen = resolveOpenPath(item, type);
        if (pathToOpen) {
            try {
                await invoke("open_path_in_explorer", { path: pathToOpen });
            } catch (err) {
                console.error("Failed to open in explorer:", err);
            }
        } else {
            console.warn("Could not resolve a path to open for item:", item);
        }
    };

    const accentColor = isError ? 'bg-red-500'
        : isCompleted ? 'bg-green-500'
        : isPaused ? 'bg-yellow-500'
        : isQueued ? 'bg-amber-500'
        : type === "torrent" ? 'bg-accent'
        : isFolder ? 'bg-purple-500'
        : 'bg-cyan-400';

    const glowColor = isError ? 'shadow-[0_0_30px_rgba(239,68,68,0.3)]'
        : isCompleted ? 'shadow-[0_0_30px_rgba(34,197,94,0.3)]'
        : isPaused ? 'shadow-[0_0_30px_rgba(234,179,8,0.2)]'
        : isQueued ? 'shadow-[0_0_30px_rgba(245,158,11,0.2)]'
        : type === "torrent" ? 'shadow-[0_0_40px_rgba(var(--color-accent),0.4)]'
        : isFolder ? 'shadow-[0_0_40px_rgba(168,85,247,0.4)]'
        : 'shadow-[0_0_40px_rgba(34,211,238,0.4)]';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.05 }}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, item, type)}
            className="group relative rounded-[2rem] bg-black/40 backdrop-blur-3xl border border-white/10 hover:bg-black/60 hover:border-white/20 transition-all duration-500 p-8 overflow-hidden shadow-2xl"
        >
            {/* Dynamic Background Glow */}
            <div className={cn(
                "absolute -right-24 -top-24 w-64 h-64 blur-[100px] opacity-10 group-hover:opacity-30 transition-opacity duration-700 pointer-events-none rounded-full",
                accentColor
            )} />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
                
                {/* Left Section: Icon & Identity */}
                <div className="flex items-center gap-6 flex-1 min-w-0">
                    <div className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border border-white/10 transition-all duration-500",
                        glowColor,
                        "bg-white/5 backdrop-blur-md group-hover:scale-105"
                    )}>
                        {isFolder ? <FolderTree size={28} className="text-purple-400" />
                            : type === "http" ? <Globe size={28} className="text-cyan-400" />
                            : <Users size={28} className="text-accent" />}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                            {isFolder && <span className="px-3 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-black uppercase tracking-[0.2em]">Batch Folder</span>}
                            {!isFolder && item.folder_name && (
                                <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5">
                                    <FolderTree size={10} /> {item.folder_name}
                                </span>
                            )}
                            {type === "torrent" && <span className="px-3 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-[0.2em]">P2P Network</span>}
                            {type === "http" && !isFolder && <span className="px-3 py-1 rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em]">Direct HTTP</span>}
                        </div>
                        
                        <h3 className="font-black text-white text-2xl truncate tracking-tight drop-shadow-md mb-2">
                            {displayName}
                        </h3>

                        <div className="flex items-center gap-4 text-white/50 text-[11px] font-bold uppercase tracking-widest">
                            <span className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                                <ArrowDownToLine size={14} className="text-white/30" />
                                <span className="text-white">{formatBytes(item.downloaded_bytes)}</span> / {formatBytes(item.total_bytes)}
                            </span>

                            {isFolder && (
                                <span className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                                    <Layers size={14} className="text-white/30" />
                                    <span className="text-white">{item.files.length}</span> Files
                                </span>
                            )}

                            {isError ? (
                                <span className="flex items-center gap-2 text-red-400 bg-red-500/10 px-3 py-1 rounded-lg border border-red-500/20">
                                    <AlertCircle size={14} /> {isFolder ? "Check files" : item.error_message || item.error_msg || "Error"}
                                </span>
                            ) : isCompleted ? (
                                <span className="flex items-center gap-2 text-green-400 bg-green-500/10 px-3 py-1 rounded-lg border border-green-500/20">
                                    <CheckCircle2 size={14} /> Completed
                                </span>
                            ) : isPaused ? (
                                <span className="flex items-center gap-2 text-yellow-400 bg-yellow-500/10 px-3 py-1 rounded-lg border border-yellow-500/20">
                                    <Pause size={14} /> Paused
                                </span>
                            ) : isQueued ? (
                                <span className="flex items-center gap-2 text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20">
                                    <Clock size={14} /> Queued
                                </span>
                            ) : (
                                <span className="flex items-center gap-2 text-accent animate-pulse bg-accent/10 px-3 py-1 rounded-lg border border-accent/20">
                                    <Activity size={14} /> {statusText}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Section: Action Controls */}
                <div className="flex items-center gap-3 shrink-0">
                    {/* View Contents — only for folder groups */}
                    {isFolder && onOpenFolder && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onOpenFolder(item); }}
                            className="px-5 h-14 rounded-2xl bg-purple-500/15 hover:bg-purple-500/30 border border-purple-500/30 hover:border-purple-400/50 text-purple-300 hover:text-white font-black text-xs uppercase tracking-widest transition-all flex items-center gap-3 shadow-lg hover:shadow-xl active:scale-95"
                            title="View individual files in this batch"
                        >
                            <FolderTree size={18} /> View Files
                        </button>
                    )}

                    {/* Open in Explorer — for completed or folder items */}
                    {(isCompleted || isFolder) && (
                        <button
                            onClick={handleOpenFolder}
                            className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all shadow-lg hover:shadow-xl active:scale-95"
                            title="Open in Explorer"
                        >
                            <FolderOpen size={20} />
                        </button>
                    )}

                    {/* Retry Action */}
                    {isError && (type === "http" || isFolder) && (
                        <button
                            onClick={handleRetry}
                            className="w-14 h-14 rounded-2xl bg-cyan-400/20 hover:bg-cyan-400 text-cyan-400 hover:text-black transition-all border border-cyan-400/30 flex items-center justify-center shadow-lg hover:shadow-xl active:scale-95"
                            title="Retry Download"
                        >
                            <RotateCcw size={20} />
                        </button>
                    )}

                    {/* Pause/Resume Actions */}
                    {!isCompleted && !isError && !isQueued && (
                        <button
                            onClick={isPaused ? handleResume : handlePause}
                            className="px-6 h-14 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 text-white font-black text-xs uppercase tracking-widest transition-all flex items-center gap-3 shadow-lg hover:shadow-xl active:scale-95"
                        >
                            {isPaused ? <><Play size={18} fill="currentColor" /> Resume</> : <><Pause size={18} fill="currentColor" /> Pause</>}
                        </button>
                    )}

                    {/* Cancel/Delete */}
                    <button
                        onClick={isError || isCompleted ? handleDelete : handleCancel}
                        className={cn(
                            "w-14 h-14 rounded-2xl transition-all border flex items-center justify-center shadow-lg hover:shadow-xl active:scale-95",
                            isError || isCompleted
                                ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white"
                                : "bg-white/5 hover:bg-red-500/20 border-white/10 text-white/40 hover:text-red-500 hover:border-red-500/30"
                        )}
                        title={isError || isCompleted ? "Remove Entry" : "Cancel Download"}
                    >
                        {isError || isCompleted ? <Trash2 size={20} /> : <X size={20} />}
                    </button>
                </div>
            </div>

            {/* Bottom Section: Progress & High-End Stats */}
            <div className="mt-8 pt-8 border-t border-white/5 relative z-10">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                    
                    {/* Progress Track */}
                    <div className="flex-1 w-full max-w-2xl">
                        <div className="flex items-end justify-between mb-3">
                            <span className="text-4xl font-black text-white tracking-tighter drop-shadow-md">
                                {progress.toFixed(1)}<span className="text-xl text-white/50">%</span>
                            </span>
                            {!isCompleted && !isPaused && !isError && downloadSpeed > 0 && (
                                <span className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em] flex items-center gap-2 mb-1">
                                    <Clock size={12} className="text-cyan-400" /> {formatETA(bytesRemaining, downloadSpeed)} REMAINING
                                </span>
                            )}
                        </div>
                        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner relative">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                                transition={{ duration: 1.2, ease: "easeOut" }}
                                className={cn("h-full rounded-full transition-colors duration-700 relative diagonal-progress", accentColor)}
                            >
                                {!isCompleted && !isPaused && !isError && (
                                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                )}
                            </motion.div>
                        </div>
                    </div>

                    {/* Stats Rail */}
                    {!isCompleted && !isError && (
                        <div className="flex items-center gap-4 w-full lg:w-auto overflow-x-auto hide-scroll">
                            <div className="flex flex-col bg-black/40 backdrop-blur-md border border-white/5 px-6 py-3 rounded-2xl min-w-[120px]">
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Download</span>
                                <div className="text-sm font-bold text-white flex items-center gap-2">
                                    <ArrowDownToLine size={14} className="text-cyan-400" /> {formatBytes(downloadSpeed)}/s
                                </div>
                            </div>
                            
                            {type === "torrent" && (
                                <>
                                    <div className="flex flex-col bg-black/40 backdrop-blur-md border border-white/5 px-6 py-3 rounded-2xl min-w-[120px]">
                                        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Upload</span>
                                        <div className="text-sm font-bold text-white flex items-center gap-2">
                                            <ArrowUpToLine size={14} className="text-purple-400" /> {formatBytes(item.upload_speed)}/s
                                        </div>
                                    </div>
                                    <div className="flex flex-col bg-black/40 backdrop-blur-md border border-white/5 px-6 py-3 rounded-2xl min-w-[120px]">
                                        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Network</span>
                                        <div className="text-sm font-bold text-white flex items-center gap-2">
                                            <Users size={14} className="text-accent" /> {item.peers} Peers
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
