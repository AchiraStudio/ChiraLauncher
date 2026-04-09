import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Play, Clock, Gamepad2, ChevronRight, Star, HardDriveDownload, Square } from "lucide-react";
import { cn } from "./lib/utils";
import { useGameStore } from "./store/gameStore";
import { useProcessStore } from "./store/processStore";
import { launchGame, forceStopGame } from "./services/gameService";
import type { Game } from "./types/game";
import { useLocalImage } from "./hooks/useLocalImage";

/** Strip HTML tags and decode basic entities for plain-text previews */
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")          // remove all tags
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")              // collapse whitespace
        .trim();
}

function HeroFeaturedGame({ game }: { game: Game }) {
    const navigate = useNavigate();
    const runningInfo = useProcessStore((s) => s.running[game.id]);
    const isRunning = !!runningInfo;

    const { src: bgUrl } = useLocalImage(game.background_image_path || (game as any).background_path || game.cover_image_path || (game as any).cover_path);

    // Robust logo resolving via the backend cache/http handler
    const { src: logoSrc, error: logoErr } = useLocalImage(game.logo_path);
    const [logoFailed, setLogoFailed] = useState(false);

    // Assume logo is valid if path exists, unless explicitly proven otherwise
    const isLogoValid = Boolean(game.logo_path && !logoErr && !logoFailed);

    const handleAction = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isRunning) await forceStopGame(game.id);
        else await launchGame(game.id);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full h-[500px] rounded-[2rem] overflow-hidden group cursor-pointer border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            onClick={() => navigate('/library', { state: { gameId: game.id } })}
        >
            {bgUrl ? (
                <img src={bgUrl} alt={game.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-105 brightness-[0.6] saturate-125" />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-black flex items-center justify-center">
                    <Gamepad2 size={64} className="text-white/5" />
                </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />

            <div className="absolute inset-0 p-12 flex flex-col justify-end">
                <span className="text-accent text-[10px] font-black uppercase tracking-widest mb-4 inline-block bg-accent/10 px-3 py-1.5 rounded-lg border border-accent/20 w-fit backdrop-blur-md">
                    Featured Selection
                </span>

                {isLogoValid ? (
                    <img
                        key={game.id}
                        src={logoSrc || undefined}
                        alt={game.title}
                        onError={() => setLogoFailed(true)}
                        className={cn(
                            "block w-auto max-w-[420px] max-h-[154px] object-contain mb-5 drop-shadow-[0_4px_40px_rgba(0,0,0,0.95)] transition-opacity duration-300",
                            !logoSrc ? "opacity-0" : "opacity-100"
                        )}
                    />
                ) : (
                    <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter uppercase leading-[0.9] mb-4 drop-shadow-2xl max-w-3xl">
                        {game.title}
                    </h1>
                )}

                {game.description && (
                    <p className="text-white/60 text-sm md:text-base font-medium max-w-2xl line-clamp-2 leading-relaxed mb-8 drop-shadow-md">
                        {stripHtml(game.description)}
                    </p>
                )}

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleAction}
                        className={cn(
                            "px-10 py-4 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 shadow-2xl",
                            isRunning ? "bg-red-500 hover:bg-red-600 text-white" : "bg-white text-black hover:bg-white/90"
                        )}
                    >
                        {isRunning ? <Square size={16} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        {isRunning ? "Stop Process" : "Play Now"}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); navigate('/library', { state: { gameId: game.id } }); }} className="px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs uppercase tracking-widest transition-all backdrop-blur-md">
                        View Details
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

function StoreCard({ game }: { game: Game }) {
    const navigate = useNavigate();
    const { src: coverUrl } = useLocalImage(game.cover_image_path || (game as any).cover_path);

    return (
        <motion.div
            whileHover={{ y: -8 }}
            onClick={() => navigate('/library', { state: { gameId: game.id } })}
            className="group cursor-pointer flex flex-col gap-3"
        >
            <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 bg-black/40 shadow-xl relative">
                {coverUrl ? (
                    <img src={coverUrl} alt={game.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 brightness-90 group-hover:brightness-110" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center"><Gamepad2 size={32} className="text-white/20" /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0">
                    <span className="bg-accent text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg shadow-lg">In Library</span>
                </div>
            </div>
            <div>
                <h3 className="text-white font-bold text-sm truncate group-hover:text-accent transition-colors">{game.title}</h3>
                <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mt-1 truncate">
                    {game.developer || game.source || "Unknown Developer"}
                </p>
            </div>
        </motion.div>
    );
}

export function Browse() {
    const { gamesById } = useGameStore();

    const { heroGame, recentGames, allGamesList } = useMemo(() => {
        const all = Object.values(gamesById);

        let hero = all.find(g => g.background_image_path && g.description) ||
            all.find(g => g.cover_image_path) ||
            all[0];

        const recent = [...all]
            .sort((a, b) => (b.last_played ?? "").localeCompare(a.last_played ?? ""))
            .filter(g => g.id !== hero?.id)
            .slice(0, 4);

        const list = [...all].filter(g => g.id !== hero?.id && !recent.find(r => r.id === g.id)).slice(0, 10);

        return { heroGame: hero, recentGames: recent, allGamesList: list };
    }, [gamesById]);

    return (
        <div className="min-h-full w-full bg-background relative overflow-y-auto overflow-x-hidden custom-scrollbar">
            <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-accent/10 blur-[120px] rounded-full animate-pulse opacity-40 pointer-events-none" />

            <div className="relative z-10 px-10 md:px-14 pt-14 pb-32 max-w-[1600px] mx-auto w-full space-y-16">

                {/* ── Store Navigation ── */}
                <div className="flex items-center gap-8 border-b border-white/5 pb-4">
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                        <Star className="text-accent" size={20} /> Discover
                    </h2>
                    <div className="flex items-center gap-6 text-[11px] font-black uppercase tracking-widest text-white/40">
                        <Link to="/library" className="hover:text-white transition-colors">Library</Link>
                        <Link to="/downloads" className="hover:text-white transition-colors">Downloads</Link>
                        <Link to="/extensions" className="hover:text-white transition-colors">Extensions</Link>
                    </div>
                </div>

                {heroGame ? (
                    <HeroFeaturedGame game={heroGame} />
                ) : (
                    <div className="h-[400px] rounded-[2rem] border border-white/5 border-dashed flex flex-col items-center justify-center text-white/30 gap-4">
                        <HardDriveDownload size={48} />
                        <p className="font-bold tracking-widest uppercase text-xs">Your library is completely empty.</p>
                    </div>
                )}

                {/* ── Continue Playing Row ── */}
                {recentGames.length > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Clock size={16} className="text-purple-400" /> Continue Playing
                            </h3>
                            <Link to="/library" className="text-[10px] font-bold text-white/30 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1">
                                View All <ChevronRight size={14} />
                            </Link>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {recentGames.map(game => (
                                <StoreCard key={game.id} game={game} />
                            ))}
                        </div>
                    </section>
                )}

                {/* ── More in Collection ── */}
                {allGamesList.length > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Gamepad2 size={16} className="text-blue-400" /> From Your Vault
                            </h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                            {allGamesList.map(game => (
                                <StoreCard key={game.id} game={game} />
                            ))}
                        </div>
                    </section>
                )}

            </div>
        </div>
    );
}