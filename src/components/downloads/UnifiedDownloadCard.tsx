import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import {
    Play, Pause, X, ArrowDownToLine, CheckCircle2, AlertCircle,
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
    type: "http" | "folder";
    onOpenFolder?: (folder: any) => void;
    onContextMenu?: (e: React.MouseEvent, item: any, type: "http" | "folder") => void;
}) {
    const { isFolder, isCompleted, isPaused, isError, isQueued } = computeDownloadStatus(item, type);
    const bytesRemaining = item.total_bytes - item.downloaded_bytes;

    const displayName = isFolder ? item.name : getName(item);
    const downloadSpeed = isFolder ? item.download_speed : getDownloadSpeed(item);
    const statusText = isFolder ? item.state : getStatus(item);
    const progress = getProgress(item);

    const handlePause = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) item.files.forEach((f: any) => invoke("pause_http_download", { id: f.id }));
        else invoke("pause_http_download", { id: item.id });
    };

    const handleResume = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) item.files.forEach((f: any) => invoke("resume_http_download", { id: f.id }));
        else invoke("resume_http_download", { id: item.id });
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) item.files.forEach((f: any) => invoke("cancel_http_download", { id: f.id }));
        else invoke("cancel_http_download", { id: item.id });
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            for (const f of item.files) await invoke("delete_http_download", { id: f.id, deleteFile: true });
        } else {
            await invoke("delete_http_download", { id: item.id, deleteFile: true });
        }
    };

    const handleRetry = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            for (const f of item.files) if (isItemError(f)) await invoke("retry_http_download", { id: f.id });
        } else {
            await invoke("retry_http_download", { id: item.id });
        }
    };

    const handleOpenFolder = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const pathToOpen = resolveOpenPath(item, type);
        if (pathToOpen) await invoke("open_path_in_explorer", { path: pathToOpen }).catch(console.error);
    };

    const accentColor = isError ? 'bg-rose-500'
        : isCompleted ? 'bg-emerald-500'
        : isPaused ? 'bg-amber-500'
        : isQueued ? 'bg-amber-500'
        : isFolder ? 'bg-purple-500'
        : 'bg-accent';

    return (

        <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: index * 0.04 }}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, item, type)}
            className="group relative rounded-2xl bg-surface/60 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all duration-300 p-6 overflow-hidden shadow-xl"
        >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                {/* Left Section: Icon & Identity */}
                <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-white/10 transition-all duration-300 bg-white/[0.04]"
                    )}>
                        {isFolder ? <FolderTree size={22} className="text-purple-400" />
                            : <Globe size={22} className="text-accent" />}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            {isFolder && <span className="editorial-badge border-purple-500/30 text-purple-300 bg-purple-500/10">Batch Folder</span>}
                            {!isFolder && item.folder_name && (
                                <span className="editorial-badge flex items-center gap-1">
                                    <FolderTree size={9} /> {item.folder_name}
                                </span>
                            )}
                            {!isFolder && <span className="editorial-badge border-accent/30 text-accent bg-accent/10">Direct HTTP</span>}
                        </div>

                        <h3 className="font-bold text-white text-lg truncate tracking-tight mb-1">{displayName}</h3>

                        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-white/50">
                            <span className="flex items-center gap-1.5 bg-white/[0.04] px-2.5 py-0.5 rounded border border-white/10">
                                <ArrowDownToLine size={12} className="text-white/40" />
                                <span className="text-white/90">{formatBytes(item.downloaded_bytes)}</span> / {formatBytes(item.total_bytes)}
                            </span>

                            {isFolder && (
                                <span className="flex items-center gap-1.5 bg-white/[0.04] px-2.5 py-0.5 rounded border border-white/10">
                                    <Layers size={12} className="text-white/40" />
                                    <span className="text-white/90">{item.files.length}</span> Files
                                </span>
                            )}

                            {isError ? (
                                <span className="flex items-center gap-1.5 text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded border border-rose-500/20">
                                    <AlertCircle size={12} /> {isFolder ? "Check files" : item.error_message || item.error_msg || "Error"}
                                </span>
                            ) : isCompleted ? (
                                <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20">
                                    <CheckCircle2 size={12} /> Completed
                                </span>
                            ) : isPaused ? (
                                <span className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
                                    <Pause size={12} /> Paused
                                </span>
                            ) : isQueued ? (
                                <span className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
                                    <Clock size={12} /> Queued
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 text-accent bg-accent/10 px-2.5 py-0.5 rounded border border-accent/20">
                                    <Activity size={12} /> {statusText}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Section: Action Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    {isFolder && onOpenFolder && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onOpenFolder(item); }}
                            className="px-4 h-10 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95"
                        >
                            <FolderTree size={15} /> Files
                        </button>
                    )}

                    {(isCompleted || isFolder) && (
                        <button onClick={handleOpenFolder} className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all active:scale-95" title="Open in Explorer">
                            <FolderOpen size={16} />
                        </button>
                    )}

                    {isError && (
                        <button onClick={handleRetry} className="w-10 h-10 rounded-xl bg-accent/20 hover:bg-accent text-accent hover:text-white transition-all border border-accent/30 flex items-center justify-center active:scale-95" title="Retry Download">
                            <RotateCcw size={16} />
                        </button>
                    )}

                    {!isCompleted && !isError && !isQueued && (
                        <button
                            onClick={isPaused ? handleResume : handlePause}
                            className="px-4 h-10 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-white font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95"
                        >
                            {isPaused ? <><Play size={14} fill="currentColor" /> Resume</> : <><Pause size={14} fill="currentColor" /> Pause</>}
                        </button>
                    )}

                    <button
                        onClick={isError || isCompleted ? handleDelete : handleCancel}
                        className={cn(
                            "w-10 h-10 rounded-xl transition-all border flex items-center justify-center active:scale-95",
                            isError || isCompleted
                                ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white"
                                : "bg-white/[0.04] hover:bg-rose-500/20 border-white/10 text-white/50 hover:text-rose-400 hover:border-rose-500/30"
                        )}
                        title={isError || isCompleted ? "Remove Entry" : "Cancel Download"}
                    >
                        {isError || isCompleted ? <Trash2 size={16} /> : <X size={16} />}
                    </button>
                </div>
            </div>

            {/* Bottom: Progress & Stats */}
            <div className="mt-5 pt-4 border-t border-white/[0.06] relative z-10">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                    <div className="flex-1 w-full">
                        <div className="flex items-end justify-between mb-2">
                            <span className="font-mono text-2xl font-bold text-white tracking-tight">
                                {progress.toFixed(1)}<span className="text-sm text-white/40">%</span>
                            </span>
                            {!isCompleted && !isPaused && !isError && downloadSpeed > 0 && (
                                <span className="font-mono text-[10px] text-white/50 uppercase tracking-widest flex items-center gap-1.5">
                                    <Clock size={11} className="text-accent" /> {formatETA(bytesRemaining, downloadSpeed)} REMAINING
                                </span>
                            )}
                        </div>
                        <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/10">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className={cn("h-full rounded-full transition-colors duration-500 relative diagonal-progress", accentColor)}
                            />
                        </div>
                    </div>

                    {!isCompleted && !isError && (
                        <div className="flex items-center gap-3 w-full lg:w-auto shrink-0">
                            <div className="flex flex-col bg-black/30 border border-white/10 px-4 py-2 rounded-xl">
                                <span className="font-mono text-[9px] text-white/40 uppercase tracking-widest mb-0.5">Speed</span>
                                <div className="font-mono text-xs font-semibold text-white flex items-center gap-1.5">
                                    <ArrowDownToLine size={12} className="text-accent" /> {formatBytes(downloadSpeed)}/s
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

