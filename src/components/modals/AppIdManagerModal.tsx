import { useState, useEffect } from "react";
import { useUiStore } from "../../store/uiStore";
import { useGameStore } from "../../store/gameStore";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { X, Search, Save, Hash, RefreshCcw, Gamepad2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

export function AppIdManagerModal() {
    const isOpen = useUiStore((s) => s.isAppIdModalOpen);
    const close = () => useUiStore.getState().setAppIdModalOpen(false);

    const { gamesById, fetchGames } = useGameStore();
    const [localIds, setLocalIds] = useState<Record<string, string>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (isOpen) {
            const initial: Record<string, string> = {};
            Object.values(gamesById).forEach(g => {
                initial[g.id] = g.steam_app_id ? g.steam_app_id.toString() : "";
            });
            setLocalIds(initial);
        }
    }, [isOpen, gamesById]);

    if (!isOpen) return null;

    const handleMagicDetect = async () => {
        setIsProcessing(true);
        let foundCount = 0;
        const newLocal = { ...localIds };

        for (const game of Object.values(gamesById)) {
            if (!newLocal[game.id]) {
                try {
                    const detectedId = await invoke<string | null>("resolve_game_app_id", { gameId: game.id });
                    if (detectedId) {
                        newLocal[game.id] = detectedId;
                        foundCount++;
                    }
                } catch (e) {
                    console.error("Detect failed for", game.title);
                }
            }
        }

        setLocalIds(newLocal);
        setIsProcessing(false);
        toast.success("Magic Detect Complete", { description: `Discovered ${foundCount} missing App IDs.` });
    };

    const handleSave = async () => {
        setIsProcessing(true);
        let updatedCount = 0;

        for (const game of Object.values(gamesById)) {
            const currentDbVal = game.steam_app_id ? game.steam_app_id.toString() : "";
            const newVal = localIds[game.id].trim();

            if (currentDbVal !== newVal) {
                const parsedId = newVal === "" ? null : parseInt(newVal);
                await invoke("update_game", {
                    game: { ...game, steam_app_id: parsedId }
                });
                updatedCount++;
            }
        }

        await fetchGames();
        setIsProcessing(false);
        toast.success("Saved Successfully", { description: `Updated ${updatedCount} games.` });
        close();
    };

    const games = Object.values(gamesById).filter(g => g.title.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-3xl bg-[#12141c] rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden max-h-[85vh]"
            >
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent border border-accent/20">
                            <Hash size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">App ID Manager</h2>
                            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">Bulk Edit Steam Connectivity</p>
                        </div>
                    </div>
                    <button onClick={close} className="text-white/30 hover:text-white hover:bg-white/5 p-2 rounded-xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-8 py-4 border-b border-white/5 flex gap-4 bg-black/20">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter games..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:border-accent outline-none transition-all"
                        />
                    </div>
                    <button
                        onClick={handleMagicDetect}
                        disabled={isProcessing}
                        className="px-6 py-2.5 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/20 text-accent font-bold text-xs uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        <RefreshCcw size={14} className={isProcessing ? "animate-spin" : ""} />
                        Magic Detect Missing
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-black/10">
                    {games.length === 0 ? (
                        <div className="py-20 text-center text-white/30 font-bold text-sm">No games found.</div>
                    ) : (
                        games.map(game => (
                            <div key={game.id} className="flex items-center gap-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-2xl p-3 transition-colors">
                                <div className="w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center shrink-0 border border-white/10 overflow-hidden">
                                    <Gamepad2 size={16} className="text-white/30" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-bold text-sm truncate">{game.title}</p>
                                    <p className="text-white/30 text-[10px] font-mono truncate">{game.executable_path}</p>
                                </div>
                                <div className="shrink-0 relative">
                                    <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                                    <input
                                        type="number"
                                        value={localIds[game.id] || ""}
                                        onChange={e => setLocalIds({ ...localIds, [game.id]: e.target.value })}
                                        placeholder="No ID"
                                        className={cn(
                                            "w-36 bg-black/40 border rounded-xl py-2 pl-9 pr-3 font-mono text-sm outline-none transition-all text-right",
                                            localIds[game.id] ? "border-accent/40 text-accent focus:border-accent" : "border-red-500/30 text-red-400 focus:border-red-500"
                                        )}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="px-8 py-5 border-t border-white/5 flex justify-end gap-3 bg-white/[0.02]">
                    <button onClick={close} className="px-6 py-2.5 rounded-xl text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest hover:bg-white/5">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isProcessing}
                        className="px-8 py-2.5 rounded-xl bg-accent hover:brightness-110 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save size={16} /> Save Changes
                    </button>
                </div>
            </motion.div>
        </div>
    );
}