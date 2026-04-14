import { motion } from "framer-motion";
import { Trash2, AlertTriangle, X } from "lucide-react";
import type { Game } from "../../types/game";

interface Props {
    game: Game | null;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function RemoveGameModal({ game, isOpen, onClose, onConfirm }: Props) {
    if (!isOpen || !game) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-md bg-black/60 backdrop-blur-3xl rounded-[2rem] border border-red-500/20 shadow-[0_30px_100px_rgba(239,68,68,0.15)] overflow-hidden flex flex-col relative"
            >
                {/* Red ambient glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-red-500/20 blur-[60px] pointer-events-none rounded-full" />

                <div className="px-8 py-6 flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-400 shadow-inner">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Remove Game</h2>
                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Destructive Action</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-8 py-4 relative z-10">
                    <p className="text-white/60 text-sm leading-relaxed">
                        Are you sure you want to remove <span className="text-white font-bold">"{game.title}"</span> from your library?
                    </p>
                    <p className="text-red-400/80 text-xs mt-3 bg-red-500/10 border border-red-500/20 p-3 rounded-xl font-medium">
                        This will remove the game from the launcher and delete its shortcuts. Your save files and actual game files will <span className="font-bold text-red-400">not</span> be deleted.
                    </p>
                </div>

                <div className="px-8 py-6 mt-4 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3 relative z-10">
                    <button
                        onClick={onClose}
                        className="px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-8 py-3.5 rounded-xl text-xs uppercase tracking-widest font-black text-white bg-red-500/80 hover:bg-red-500 transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] flex items-center gap-2 active:scale-95"
                    >
                        <Trash2 size={16} /> Confirm Removal
                    </button>
                </div>
            </motion.div>
        </div>
    );
}