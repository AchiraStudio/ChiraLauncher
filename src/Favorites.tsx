import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "./store/gameStore";
import { useFolderStore } from "./store/folderStore";
import { GameCard } from "./components/game/GameCard";
import { Star, Library as LibraryIcon, Sparkles } from "lucide-react";

export function Favorites() {
    const navigate = useNavigate();
    const { gamesById } = useGameStore();
    const { customFolders } = useFolderStore();

    const favoriteGames = useMemo(() => {
        const allGames = Object.values(gamesById);
        const favoriteIds = new Set<string>();
        customFolders.forEach(f => {
            if (f.filterType === "favorites") {
                f.gameIds?.forEach(id => favoriteIds.add(id));
            }
        });
        return allGames.filter(g => favoriteIds.has(g.id));
    }, [gamesById, customFolders]);

    return (
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="flex flex-col min-h-full px-14 pt-14 pb-32 max-w-[1440px] mx-auto w-full">
                <header className="mb-14 px-2">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                        className="flex items-center gap-6"
                    >
                        <div className="w-16 h-16 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-[0_0_25px_rgba(192,38,211,0.2)]">
                            <Star size={32} fill="currentColor" />
                        </div>
                        <div>
                            <h1 className="text-5xl font-bold text-white tracking-tight">Favorites</h1>
                            <p className="text-white/40 text-sm mt-2">
                                Your favorite games
                            </p>
                        </div>
                    </motion.div>
                </header>

                {favoriteGames.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex-1 flex flex-col items-center justify-center py-40 text-center"
                    >
                        <div className="w-32 h-32 glass-panel rounded-[2.5rem] flex items-center justify-center mb-10 shadow-3xl border border-white/5 relative group">
                            <div className="absolute inset-0 bg-accent/5 rounded-[2.5rem] blur-2xl group-hover:bg-accent/10 transition-all" />
                            <Star size={56} className="text-white/5 group-hover:text-accent group-hover:scale-110 transition-all duration-500" />
                        </div>
                        <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Empty Favorites</h3>
                        <p className="text-white/50 text-sm max-w-sm leading-relaxed">
                            Star games in your library to access them quickly here.
                        </p>
                        <button
                            onClick={() => navigate('/library')}
                            className="mt-10 px-8 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center gap-2"
                        >
                            <LibraryIcon size={14} /> ACCESS LIBRARY
                        </button>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-10 p-2">
                        <AnimatePresence mode="popLayout">
                            {favoriteGames.map((game, i) => (
                                <motion.div
                                    key={game.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                    transition={{ duration: 0.3, delay: i * 0.05 }}
                                >
                                    <GameCard
                                        game={game}
                                        index={i}
                                        onClick={() => navigate('/library', { state: { gameId: game.id } })}
                                        onHoverStart={() => { }}
                                        onHoverEnd={() => { }}
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {favoriteGames.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-20 pt-10 border-t border-white/5 flex flex-col items-center gap-4 text-white/10"
                    >
                        <Sparkles size={24} className="opacity-20" />
                        <p className="text-xs text-white/40">End of Favorites</p>
                    </motion.div>
                )}
            </div>
        </div>
    );
}