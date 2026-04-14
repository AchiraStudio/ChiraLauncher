import { useState } from "react";
import { motion } from "framer-motion";
import { X, Trash2, ShieldAlert } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export function ResetAppModal() {
    const { isResetModalOpen, setResetModalOpen } = useUiStore();
    const [confirmText, setConfirmText] = useState("");
    const [keepProgress, setKeepProgress] = useState(true);
    const [isWiping, setIsWiping] = useState(false);

    if (!isResetModalOpen) return null;

    const handleConfirm = async () => {
        if (confirmText !== "FACTORY RESET") return;

        setIsWiping(true);
        toast.warning("Initiating Factory Reset...");

        try {
            // Tell backend to drop tables and purge files
            await invoke("reset_application", { keepProgress });

            // Clear frontend persistence
            localStorage.clear();
            sessionStorage.clear();

            // The backend command invokes `app.restart()`, so the UI will freeze here briefly
        } catch (e: any) {
            toast.error("Failed to reset application", { description: e.message });
            setIsWiping(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-lg bg-[#0a0a0f]/90 backdrop-blur-3xl rounded-[2.5rem] border border-red-500/30 shadow-[0_30px_100px_rgba(239,68,68,0.2)] overflow-hidden flex flex-col relative"
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-40 bg-red-500/20 blur-[80px] pointer-events-none rounded-full" />

                <div className="px-10 py-8 flex items-center justify-between relative z-10 border-b border-red-500/10">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500 shadow-inner">
                            <ShieldAlert size={28} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Factory Reset</h2>
                            <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest mt-1">Irreversible System Purge</p>
                        </div>
                    </div>
                    <button onClick={() => setResetModalOpen(false)} className="w-10 h-10 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-10 py-8 relative z-10 space-y-6">
                    <p className="text-white/70 text-sm leading-relaxed">
                        This action will wipe ChiraLauncher's internal database, cached images, settings, and OS integrations. Your actual game files and save data will <b>not</b> be touched.
                    </p>

                    <label className="flex items-center gap-4 p-4 rounded-2xl border border-red-500/20 bg-red-500/5 cursor-pointer hover:bg-red-500/10 transition-colors">
                        <input
                            type="checkbox"
                            checked={keepProgress}
                            onChange={e => setKeepProgress(e.target.checked)}
                            className="w-5 h-5 accent-red-500 rounded bg-black border-red-500"
                        />
                        <div className="flex-1">
                            <p className="text-white text-sm font-bold">Preserve Playtime & Unlocks</p>
                            <p className="text-white/50 text-xs mt-0.5">Keep achievement history, play hours, and identity keys.</p>
                        </div>
                    </label>

                    <div>
                        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-3 ml-2">Type "FACTORY RESET" to confirm</p>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder="FACTORY RESET"
                            className="w-full bg-black/50 border border-red-500/30 rounded-2xl px-5 py-4 text-white text-center font-black tracking-widest placeholder:text-white/10 focus:outline-none focus:border-red-400 transition-colors shadow-inner"
                        />
                    </div>
                </div>

                <div className="px-10 py-6 bg-black/40 border-t border-red-500/10 flex justify-end gap-3 relative z-10">
                    <button
                        onClick={() => setResetModalOpen(false)}
                        className="px-6 py-4 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Abort
                    </button>
                    <button
                        disabled={confirmText !== "FACTORY RESET" || isWiping}
                        onClick={handleConfirm}
                        className="flex-1 px-8 py-4 rounded-xl text-xs uppercase tracking-widest font-black text-white bg-red-500/90 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] flex items-center justify-center gap-3 active:scale-95"
                    >
                        <Trash2 size={16} /> Execute Purge
                    </button>
                </div>
            </motion.div>
        </div>
    );
}