import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Trash2, X, XCircle } from "lucide-react";

interface Props {
    isOpen: boolean;
    title: string;
    isFolder?: boolean;
    deleteFile: boolean;
    fileCount?: number;
    onClose: () => void;
    onConfirm: () => void;
}

export function DeleteDownloadModal({
    isOpen,
    title,
    isFolder = false,
    deleteFile,
    fileCount,
    onClose,
    onConfirm,
}: Props) {
    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className={`w-full max-w-md bg-[#0c0f1d]/95 backdrop-blur-3xl rounded-[2rem] border overflow-hidden flex flex-col relative shadow-2xl ${
                    deleteFile
                        ? "border-red-500/30 shadow-[0_30px_100px_rgba(239,68,68,0.3)]"
                        : "border-amber-500/30 shadow-[0_30px_100px_rgba(245,158,11,0.25)]"
                }`}
            >
                {/* Ambient glow */}
                <div
                    className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 blur-[70px] pointer-events-none rounded-full ${
                        deleteFile ? "bg-red-500/30" : "bg-amber-500/25"
                    }`}
                />

                {/* Header */}
                <div className="px-8 py-6 flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <div
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner ${
                                deleteFile
                                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            }`}
                        >
                            {deleteFile ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">
                                {deleteFile ? "Delete Download Data" : "Remove from Queue"}
                            </h2>
                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                                {deleteFile ? "Permanent Deletion" : "Queue Action"}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-8 py-4 relative z-10 space-y-3">
                    <p className="text-white/70 text-sm leading-relaxed">
                        Are you sure you want to {deleteFile ? "delete all files and data for" : "remove"}{" "}
                        <span className="text-white font-bold">"{title}"</span>
                        {isFolder && fileCount ? ` (${fileCount} files)` : ""}?
                    </p>

                    {deleteFile ? (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl">
                            <p className="text-red-300 text-xs font-semibold leading-relaxed">
                                ⚠️ This will permanently delete the downloaded file data and its folder from your disk. This action cannot be undone.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl">
                            <p className="text-amber-300 text-xs font-medium leading-relaxed">
                                This will remove the download entry from your queue list. Physical files on your disk will remain untouched.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 mt-4 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3 relative z-10">
                    <button
                        onClick={onClose}
                        className="px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`px-8 py-3.5 rounded-xl text-xs uppercase tracking-widest font-black text-white transition-all shadow-lg flex items-center gap-2 active:scale-95 ${
                            deleteFile
                                ? "bg-red-500 hover:bg-red-600 shadow-red-500/30"
                                : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/30"
                        }`}
                    >
                        {deleteFile ? <Trash2 size={16} /> : <XCircle size={16} />}
                        {deleteFile ? "Delete Files & Folder" : "Remove Entry"}
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
}
