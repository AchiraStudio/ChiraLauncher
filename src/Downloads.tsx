import { useEffect, useState } from "react";
import { useDownloadsStore, DownloadStatus } from "./store/downloadsStore";
import { motion, AnimatePresence } from "framer-motion";
import {
    Play, Pause, X, HardDriveDownload,
    Activity, Clock, ArrowDownToLine, ArrowUpToLine, Users, CheckCircle2, AlertCircle
} from "lucide-react";
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

function DownloadCard({ item, index }: { item: DownloadStatus; index: number }) {
    const { pauseDownload, resumeDownload, cancelDownload } = useDownloadsStore();
    const bytesRemaining = item.total_bytes - item.downloaded_bytes;

    const isCompleted = item.state === "Finished" || item.progress_percent >= 100;
    const isPaused = item.state === "Paused";

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.05 }}
            className="group relative glass-panel rounded-3xl p-8 hover:border-accent/40 transition-all duration-500 hover:shadow-3xl bg-surface/30 backdrop-blur-3xl overflow-hidden border border-white/5"
        >
            {/* Background Glow */}
            <div className={cn(
                "absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-0 group-hover:opacity-10 transition-opacity duration-700 pointer-events-none",
                isCompleted ? 'bg-green-500' : isPaused ? 'bg-yellow-500' : 'bg-accent'
            )} />

            {/* Header */}
            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex-1 min-w-0 pr-6">
                    <h3 className="font-bold text-white text-xl truncate group-hover:text-accent transition-colors" title={item.name}>
                        {item.name}
                    </h3>
                    <div className="flex items-center gap-6 mt-3">
                        <div className="flex items-center gap-2 bg-white/[0.03] px-3 py-1 rounded-lg border border-white/5">
                            <ArrowDownToLine size={14} className="text-white/20" />
                            <span className="text-xs text-white/60 tabular-nums">
                                {formatBytes(item.downloaded_bytes)} <span className="text-white/10 mx-1">/</span> {formatBytes(item.total_bytes)}
                            </span>
                        </div>
                        {isCompleted ? (
                            <div className="flex items-center gap-2 text-green-500 text-xs font-semibold">
                                <CheckCircle2 size={14} /> Completed
                            </div>
                        ) : isPaused ? (
                            <div className="flex items-center gap-2 text-yellow-500 text-xs font-semibold">
                                <Pause size={14} /> Paused
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-accent text-xs font-semibold animate-pulse">
                                <Activity size={14} /> Downloading
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    {!isCompleted && (
                        <button
                            onClick={() => isPaused ? resumeDownload(item.id) : pauseDownload(item.id)}
                            className="w-12 h-12 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] text-white transition-all active:scale-90 border border-white/5 flex items-center justify-center group/btn shadow-xl"
                            title={isPaused ? "Resume" : "Pause"}
                        >
                            {isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
                        </button>
                    )}
                    <button
                        onClick={() => cancelDownload(item.id)}
                        className="w-12 h-12 rounded-2xl bg-white/[0.03] hover:bg-red-500/20 hover:text-red-500 text-white/40 transition-all active:scale-90 border border-white/5 flex items-center justify-center shadow-xl"
                        title="Purge Task"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Progress Bar Container */}
            <div className="relative mb-6 z-10">
                <div className="h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, Math.min(100, item.progress_percent))}%` }}
                        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                        className={cn(
                            "h-full rounded-full transition-colors duration-700 relative",
                            isCompleted ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : isPaused ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'bg-accent shadow-[0_0_15px_rgba(192,38,211,0.3)]'
                        )}
                    >
                        {!isCompleted && !isPaused && (
                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        )}
                    </motion.div>
                </div>
                {/* Percentage hint */}
                <div className="absolute -top-7 right-0 text-xs font-bold text-white/40">
                    {Math.round(item.progress_percent)}%
                </div>
            </div>

            {/* Stats Footer */}
            {!isCompleted && (
                <div className="flex items-center justify-between text-xs font-medium text-white/50 relative z-10">
                    <div className="flex items-center gap-10">
                        <div className="flex items-center gap-3">
                            <ArrowDownToLine size={16} className="text-accent/40" />
                            <span className="text-white/60 tabular-nums">{formatBytes(item.download_speed)}/s</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <ArrowUpToLine size={16} className="text-blue-500/20" />
                            <span className="text-white/30 tabular-nums">{formatBytes(item.upload_speed)}/s</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Users size={16} className="text-white/10" />
                            <span className="text-white/30 tabular-nums uppercase">{item.peers} Peers</span>
                        </div>
                    </div>

                    {!isPaused && item.download_speed > 0 && (
                        <div className="flex items-center gap-2 text-accent bg-accent/10 px-3 py-1 rounded-lg text-xs font-semibold">
                            <Clock size={14} />
                            {formatETA(bytesRemaining, item.download_speed)} remaining
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}

export function Downloads() {
    const { downloads, startPolling, stopPolling } = useDownloadsStore();
    const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

    useEffect(() => {
        startPolling();
        return () => stopPolling();
    }, [startPolling, stopPolling]);

    const filteredDownloads = downloads.filter(d => {
        const isCompleted = d.state === "Finished" || d.progress_percent >= 100;
        if (filter === 'active') return !isCompleted;
        if (filter === 'completed') return isCompleted;
        return true;
    });

    return (
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="flex flex-col min-h-full px-14 pt-14 pb-32 max-w-[1200px] mx-auto w-full">

                <header className="flex items-end justify-between mb-16 px-2">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                    >
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
                                    "px-5 py-2 rounded-lg text-sm font-semibold transition-all",
                                    filter === f
                                        ? "bg-white/10 text-white shadow-xl"
                                        : "text-white/20 hover:text-white/50"
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </header>

                <div className="flex flex-col gap-8">
                    <AnimatePresence mode="popLayout">
                        {filteredDownloads.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="flex flex-col items-center justify-center py-40 text-center glass-panel border-2 border-dashed border-white/5 rounded-[3rem] bg-surface/20"
                            >
                                <div className="w-28 h-28 glass-panel rounded-[2rem] flex items-center justify-center mb-10 shadow-3xl border border-white/5 group">
                                    <div className="absolute inset-0 bg-white/5 blur-2xl group-hover:bg-white/10 transition-all rounded-[2rem]" />
                                    <Activity size={48} className="text-white/5 group-hover:text-white/20 transition-all duration-700" />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-4">No Downloads</h3>
                                <p className="text-white/50 text-sm max-w-sm leading-relaxed">
                                    {filter === 'all'
                                        ? "Your download queue is empty."
                                        : `No ${filter} downloads found.`}
                                </p>
                            </motion.div>
                        ) : (
                            filteredDownloads.map((d, i) => (
                                <DownloadCard key={d.id} item={d} index={i} />
                            ))
                        )}
                    </AnimatePresence>
                </div>

                {filteredDownloads.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-20 pt-10 border-t border-white/5 flex flex-col items-center gap-5 text-white/10"
                    >
                        <AlertCircle size={24} className="opacity-20" />
                        <p className="text-xs text-white/40">End of Downloads</p>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
