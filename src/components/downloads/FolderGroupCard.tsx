import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DownloadItem, useHttpStore } from "../../store/httpStore";
import { DownloadCard, formatBytes } from "./DownloadCard";
import { DeleteDownloadModal } from "../modals/DeleteDownloadModal";
import { motion, AnimatePresence } from "framer-motion";
import {
    FolderTree, Play, Pause, Trash2, FolderOpen, ChevronDown,
    ChevronUp, XCircle
} from "lucide-react";

interface Props {
    folderName: string;
    files: DownloadItem[];
    index: number;
}

export function FolderGroupCard({ folderName, files, index }: Props) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ deleteFile: boolean } | null>(null);
    const { pauseDownload, resumeDownload, deleteDownload } = useHttpStore();

    const totalBytes = files.reduce((sum, f) => sum + f.total_bytes, 0);
    const downloadedBytes = files.reduce((sum, f) => sum + f.downloaded_bytes, 0);
    const combinedSpeed = files.reduce((sum, f) => sum + f.speed_bytes_per_sec, 0);

    const progress = totalBytes > 0
        ? Math.min(100, Math.max(0, (downloadedBytes / totalBytes) * 100))
        : 0;

    const isDownloading = files.some(f => f.status === "downloading");
    const isCompleted = files.every(f => f.status === "completed");
    const isFailed = files.some(f => f.status === "failed");
    const isPaused = files.every(f => f.status === "paused");

    const handlePauseFolder = async () => {
        for (const f of files) {
            if (f.status === "downloading" || f.status === "queued") {
                await pauseDownload(f.id);
            }
        }
    };

    const handleResumeFolder = async () => {
        for (const f of files) {
            if (f.status === "paused" || f.status === "pending" || f.status === "failed") {
                await resumeDownload(f.id);
            }
        }
    };

    const handleConfirmDeleteFolder = async (deleteFile: boolean) => {
        for (const f of files) {
            await deleteDownload(f.id, deleteFile);
        }
    };

    const handleOpenExplorer = () => {
        if (files.length > 0) {
            const firstPath = files[0].save_path;
            const parentDir = firstPath.substring(0, Math.max(firstPath.lastIndexOf('\\'), firstPath.lastIndexOf('/')));
            if (parentDir) {
                invoke("open_path_in_explorer", { path: parentDir }).catch(console.error);
            }
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-[#0e1220]/90 border border-white/10 hover:border-white/20 rounded-3xl overflow-hidden transition-all shadow-2xl backdrop-blur-xl"
        >
            {/* Main Folder Header Card */}
            <div className="p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                    {/* Left Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center border cursor-pointer flex-shrink-0 transition-transform active:scale-95 ${
                                isCompleted ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                                isFailed ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
                                isDownloading ? "bg-accent/10 border-accent/30 text-accent" :
                                "bg-purple-500/10 border-purple-500/20 text-purple-400"
                            }`}
                        >
                            <FolderTree size={28} />
                        </div>

                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-base font-extrabold text-white truncate" title={folderName}>
                                    {folderName}
                                </h3>
                                <span className="bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-black uppercase tracking-widest px-3 py-0.5 rounded-lg flex-shrink-0">
                                    {files.length} {files.length === 1 ? "File" : "Files"}
                                </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-white/50 font-medium">
                                {isDownloading && combinedSpeed > 0 && (
                                    <>
                                        <span className="text-accent font-bold font-mono">
                                            {formatBytes(combinedSpeed)}/s
                                        </span>
                                        <span>•</span>
                                    </>
                                )}
                                <span>
                                    {formatBytes(downloadedBytes)}
                                    {totalBytes > 0 && ` / ${formatBytes(totalBytes)}`}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-3">
                        {/* Status Badge */}
                        <span className={`text-xs font-black uppercase tracking-widest px-3.5 py-1.5 rounded-xl border ${
                            isCompleted ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            isFailed ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                            isDownloading ? "bg-accent/10 border-accent/20 text-accent animate-pulse" :
                            isPaused ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                            "bg-white/5 border-white/10 text-white/40"
                        }`}>
                            {isCompleted ? "Completed" : isFailed ? "Error" : isDownloading ? "Downloading" : isPaused ? "Paused" : "Queued"}
                        </span>

                        {/* Controls */}
                        <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-2xl p-1.5">
                            {isDownloading && (
                                <button
                                    onClick={handlePauseFolder}
                                    title="Pause All Files in Folder"
                                    className="p-2.5 text-amber-400 hover:bg-amber-500/20 rounded-xl transition-all"
                                >
                                    <Pause size={18} />
                                </button>
                            )}

                            {(!isDownloading && !isCompleted) && (
                                <button
                                    onClick={handleResumeFolder}
                                    title="Resume All Files in Folder"
                                    className="p-2.5 text-accent hover:bg-accent/20 rounded-xl transition-all"
                                >
                                    <Play size={18} />
                                </button>
                            )}

                            <button
                                onClick={handleOpenExplorer}
                                title="Open Folder in Explorer"
                                className="p-2.5 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                            >
                                <FolderOpen size={18} />
                            </button>

                            <button
                                onClick={() => setDeleteModal({ deleteFile: false })}
                                title="Remove from List"
                                className="p-2.5 text-white/40 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-all"
                            >
                                <XCircle size={18} />
                            </button>

                            <button
                                onClick={() => setDeleteModal({ deleteFile: true })}
                                title="Delete Download Data & Files from Disk"
                                className="p-2.5 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
                            >
                                <Trash2 size={18} />
                            </button>

                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                title={isExpanded ? "Collapse Files" : "Expand Files"}
                                className="p-2.5 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all ml-1"
                            >
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden relative">
                    <motion.div
                        className={`h-full rounded-full transition-all duration-300 ${
                            isCompleted ? "bg-emerald-500" :
                            isFailed ? "bg-rose-500" :
                            isPaused ? "bg-amber-500" :
                            "bg-gradient-to-r from-accent via-purple-500 to-blue-400"
                        }`}
                        animate={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Collapsible Files List */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-white/5 bg-black/40 p-6 space-y-3"
                    >
                        <div className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3 px-1">
                            Files in {folderName} ({files.length})
                        </div>
                        {files.map((file, idx) => (
                            <DownloadCard key={file.id} item={file} index={idx} />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <DeleteDownloadModal
                isOpen={!!deleteModal}
                title={folderName}
                isFolder={true}
                fileCount={files.length}
                deleteFile={deleteModal?.deleteFile ?? false}
                onClose={() => setDeleteModal(null)}
                onConfirm={() => {
                    if (deleteModal) {
                        handleConfirmDeleteFolder(deleteModal.deleteFile);
                    }
                }}
            />
        </motion.div>
    );
}
