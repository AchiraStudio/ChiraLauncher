import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDevConsoleStore, LogEntry } from "../../store/devConsoleStore";
import { Terminal, X, Trash2, Copy, Search, ExternalLink, AlertTriangle, AlertCircle, Info, Cpu } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

export function DevConsoleModal() {
    const { logs, isOpen, filter, search, toggle, clearLogs, setFilter, setSearch } = useDevConsoleStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') || e.key === '`') {
                e.preventDefault();
                toggle();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggle]);

    if (!isOpen) return null;

    const filteredLogs = logs.filter(log => {
        if (filter === "error" && log.type !== "error") return false;
        if (filter === "warn" && log.type !== "warn") return false;
        if (filter === "backend" && log.source !== "Backend") return false;
        if (filter === "frontend" && log.source !== "Frontend") return false;

        if (search.trim()) {
            const query = search.toLowerCase();
            return log.message.toLowerCase().includes(query) || (log.details && log.details.toLowerCase().includes(query));
        }

        return true;
    });

    const handleCopyLogs = () => {
        const text = filteredLogs.map(l => `[${l.timestamp}] [${l.source.toUpperCase()}] [${l.type.toUpperCase()}]: ${l.message}${l.details ? `\nDetails: ${l.details}` : ''}`).join('\n');
        navigator.clipboard.writeText(text);
        toast.success("Logs Copied to Clipboard");
    };

    const handleToggleNativeDevTools = () => {
        invoke("toggle_devtools").catch(err => {
            toast.error("Native DevTools requires Tauri runtime", { description: String(err) });
        });
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-w-5xl h-[80vh] bg-[#070a12] border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white font-mono"
                >
                    {/* Header */}
                    <div className="px-5 py-3.5 bg-surface/80 border-b border-white/10 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                                <Terminal size={18} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold tracking-wider uppercase text-white">Developer Console</h2>
                                    <span className="editorial-badge border-accent/30 text-accent">LIVE INTERCEPTOR</span>
                                </div>
                                <p className="text-[10px] text-white/40">Toggle anytime with Ctrl+Shift+D or `</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleToggleNativeDevTools}
                                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-xs font-sans text-white/80 hover:text-white flex items-center gap-2 transition-all"
                                title="Open Native Webview DevTools Inspect Window"
                            >
                                <ExternalLink size={14} className="text-accent" /> Inspect DevTools
                            </button>
                            <button
                                onClick={handleCopyLogs}
                                className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all"
                                title="Copy Logs"
                            >
                                <Copy size={16} />
                            </button>
                            <button
                                onClick={clearLogs}
                                className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-white transition-all"
                                title="Clear Console"
                            >
                                <Trash2 size={16} />
                            </button>
                            <button
                                onClick={toggle}
                                className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-all"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="px-5 py-2.5 bg-surface/40 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 text-xs">
                            {(["all", "error", "warn", "frontend", "backend"] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setFilter(tab)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-md transition-all uppercase tracking-wider text-[11px] font-semibold",
                                        filter === tab
                                            ? "bg-accent text-white shadow-md"
                                            : "bg-white/[0.03] text-white/50 hover:text-white hover:bg-white/10"
                                    )}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="relative w-64">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Filter log entries..."
                                className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder:text-white/30 outline-none focus:border-accent/50"
                            />
                        </div>
                    </div>

                    {/* Log Terminal Window */}
                    <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-1.5 bg-[#05070d]">
                        {filteredLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-white/30 text-xs gap-2">
                                <Terminal size={24} className="opacity-40" />
                                <span>No log messages recorded</span>
                            </div>
                        ) : (
                            filteredLogs.map((log: LogEntry) => (
                                <div
                                    key={log.id}
                                    className={cn(
                                        "p-2.5 rounded-lg border text-xs leading-relaxed transition-all",
                                        log.type === "error"
                                            ? "bg-rose-950/20 border-rose-500/30 text-rose-200"
                                            : log.type === "warn"
                                            ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
                                            : log.type === "backend"
                                            ? "bg-purple-950/20 border-purple-500/30 text-purple-200"
                                            : "bg-white/[0.02] border-white/5 text-white/80"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-white/40 text-[10px]">{log.timestamp}</span>
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                                log.source === "Backend" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                            )}>
                                                {log.source}
                                            </span>
                                            {log.type === "error" && <AlertCircle size={13} className="text-rose-400 shrink-0" />}
                                            {log.type === "warn" && <AlertTriangle size={13} className="text-amber-400 shrink-0" />}
                                            {log.type === "info" && <Info size={13} className="text-accent shrink-0" />}
                                            {log.type === "backend" && <Cpu size={13} className="text-purple-400 shrink-0" />}
                                        </div>
                                        <span className="break-all font-mono flex-1">{log.message}</span>
                                    </div>
                                    {log.details && (
                                        <pre className="mt-2 p-2 rounded bg-black/60 text-[11px] text-white/60 overflow-x-auto whitespace-pre-wrap border border-white/5">
                                            {log.details}
                                        </pre>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer bar */}
                    <div className="px-5 py-2 bg-surface/80 border-t border-white/10 flex items-center justify-between text-[11px] text-white/40 shrink-0">
                        <span>Total logs: {logs.length} (Showing: {filteredLogs.length})</span>
                        <div className="flex items-center gap-3">
                            <span>Modal: <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 border border-white/15">Ctrl+Shift+D</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 border border-white/15">`</kbd></span>
                            <span>Native DevTools: <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-accent border border-accent/20">Alt+Shift+F2</kbd></span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
