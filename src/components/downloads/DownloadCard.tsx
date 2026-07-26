import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DownloadItem, useHttpStore } from "../../store/httpStore";
import { DeleteDownloadModal } from "../modals/DeleteDownloadModal";
import { motion } from "framer-motion";
import {
    Play, Pause, RotateCcw, Trash2, FolderOpen, AlertCircle,
    CheckCircle2, Loader2, ArrowDown, XCircle
} from "lucide-react";

export function formatBytes(bytes: number, decimals = 1): string {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

interface Props {
    item: DownloadItem;
    index: number;
}

export function DownloadCard({ item, index }: Props) {
    const { pauseDownload, resumeDownload, deleteDownload, retryDownload } = useHttpStore();
    const [deleteModal, setDeleteModal] = useState<{ deleteFile: boolean } | null>(null);

    const progress = item.total_bytes > 0
        ? Math.min(100, Math.max(0, (item.downloaded_bytes / item.total_bytes) * 100))
        : 0;

    const isDownloading = item.status === "downloading";
    const isPaused = item.status === "paused";
    const isQueued = item.status === "queued" || item.status === "pending";
    const isCompleted = item.status === "completed";
    const isFailed = item.status === "failed";

    const handleOpenFolder = () => {
        const parentPath = item.save_path.substring(0, Math.max(item.save_path.lastIndexOf('\\'), item.save_path.lastIndexOf('/')));
        if (parentPath) {
            invoke("open_path_in_explorer", { path: parentPath }).catch(console.error);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-[#121624]/80 border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all shadow-xl group relative overflow-hidden backdrop-blur-xl"
        >
            {/* Top Row: Icon, Filename, Status Badge, Actions */}
            <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border flex-shrink-0 transition-colors ${
                        isCompleted ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                        isFailed ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
                        isDownloading ? "bg-accent/10 border-accent/30 text-accent" :
                        "bg-white/5 border-white/10 text-white/40"
                    }`}>
                        {isCompleted ? <CheckCircle2 size={24} /> :
                         isFailed ? <AlertCircle size={24} /> :
                         isDownloading ? <ArrowDown size={24} className="animate-bounce" /> :
                         isQueued ? <Loader2 size={24} className="animate-spin" /> :
                         <DownloadItemIcon status={item.status} />}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-sm font-bold text-white truncate" title={item.filename}>
                                {item.filename}
                            </h3>
                            {item.folder_name && (
                                <span className="bg-white/5 border border-white/10 text-white/50 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md flex-shrink-0">
                                    {item.folder_name}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-white/40 font-medium">
                            {isDownloading && (
                                <>
                                    <span className="text-accent font-bold font-mono">
                                        {formatBytes(item.speed_bytes_per_sec)}/s
                                    </span>
                                    <span>•</span>
                                </>
                            )}
                            <span>
                                {formatBytes(item.downloaded_bytes)}
                                {item.total_bytes > 0 && ` / ${formatBytes(item.total_bytes)}`}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Status & Controls */}
                <div className="flex items-center gap-3">
                    {/* Status Badge */}
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border ${
                        isCompleted ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                        isFailed ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                        isDownloading ? "bg-accent/10 border-accent/20 text-accent animate-pulse" :
                        isPaused ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                        "bg-white/5 border-white/10 text-white/40"
                    }`}>
                        {item.status}
                    </span>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl p-1">
                        {isDownloading && (
                            <button
                                onClick={() => pauseDownload(item.id)}
                                title="Pause"
                                className="p-2 text-amber-400 hover:bg-amber-500/20 rounded-lg transition-all"
                            >
                                <Pause size={16} />
                            </button>
                        )}

                        {isPaused && (
                            <button
                                onClick={() => resumeDownload(item.id)}
                                title="Resume"
                                className="p-2 text-accent hover:bg-accent/20 rounded-lg transition-all"
                            >
                                <Play size={16} />
                            </button>
                        )}

                        {isFailed && (
                            <button
                                onClick={() => retryDownload(item.id)}
                                title="Retry"
                                className="p-2 text-amber-400 hover:bg-amber-500/20 rounded-lg transition-all"
                            >
                                <RotateCcw size={16} />
                            </button>
                        )}

                        <button
                            onClick={handleOpenFolder}
                            title="Open in Explorer"
                            className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                        >
                            <FolderOpen size={16} />
                        </button>

                        <button
                            onClick={() => setDeleteModal({ deleteFile: false })}
                            title="Remove from list"
                            className="p-2 text-white/40 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                        >
                            <XCircle size={16} />
                        </button>

                        <button
                            onClick={() => setDeleteModal({ deleteFile: true })}
                            title="Delete Download Data from disk"
                            className="p-2 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Error Message banner */}
            {isFailed && item.error_message && (
                <div className="mt-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-300 font-medium">
                    {item.error_message}
                </div>
            )}

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-2 relative">
                <motion.div
                    className={`h-full rounded-full transition-all duration-300 ${
                        isCompleted ? "bg-emerald-500" :
                        isFailed ? "bg-rose-500" :
                        isPaused ? "bg-amber-500" :
                        "bg-gradient-to-r from-accent to-blue-400"
                    }`}
                    animate={{ width: `${progress}%` }}
                />
            </div>

            <DeleteDownloadModal
                isOpen={!!deleteModal}
                title={item.filename}
                deleteFile={deleteModal?.deleteFile ?? false}
                onClose={() => setDeleteModal(null)}
                onConfirm={() => {
                    if (deleteModal) {
                        deleteDownload(item.id, deleteModal.deleteFile);
                    }
                }}
            />
        </motion.div>
    );
}

function DownloadItemIcon({ status }: { status: string }) {
    if (status === "paused") return <Play size={24} />;
    return <ArrowDown size={24} />;
}
