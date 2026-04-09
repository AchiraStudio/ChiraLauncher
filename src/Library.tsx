import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useGameStore } from "./store/gameStore";
import { useUiStore } from "./store/uiStore";
import { useProcessStore } from "./store/processStore";
import { launchGame, forceStopGame } from "./services/gameService";
import { getAchievements, type Achievement } from "./services/achievementService";
import { cn } from "./lib/utils";
import { formatPlaytime } from "./lib/format";
import {
    Clock, Trophy, Heart, Settings, FolderOpen, Play, Square,
    Gamepad2, Trash2, RefreshCcw, Plus, Search, Star, Calendar,
    User2, Building2, Info, ChevronRight, X, ExternalLink
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "./components/ui/ContextMenu";
import { motion, AnimatePresence } from "framer-motion";
import { AchievementGrid } from "./components/game/AchievementGrid";
import type { Game } from "./types/game";

// ─── Native Image Helper ─────────────────────────────────────────────────────
function getSafeImageUrl(path: string | null | undefined): string | undefined {
    if (!path || path.trim() === "") return undefined;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    try {
        // This is Tauri's native way to securely load local files into an <img> tag!
        return convertFileSrc(path);
    } catch {
        return path;
    }
}

// ─── Sidebar List Item ────────────────────────────────────────────────────────
function LibraryListItem({
    game, isActive, onClick, onContextMenu,
}: {
    game: Game; isActive: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void;
}) {
    const runningInfo = useProcessStore((s: any) => s.running[game.id]);
    const isRunning = !!runningInfo;
    const coverUrl = getSafeImageUrl(game.cover_image_path || (game as any).cover_path);

    return (
        <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={cn(
                "w-full flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 text-left relative group outline-none",
                isActive
                    ? "bg-white/10 border border-white/20 shadow-lg"
                    : "hover:bg-white/[0.08] border border-transparent"
            )}
        >
            <div className="w-12 h-16 rounded-xl overflow-hidden shadow-md shrink-0 bg-black/50 relative border border-white/10">
                {coverUrl ? (
                    <img src={coverUrl} alt={game.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                        <Gamepad2 size={20} />
                    </div>
                )}
                {isRunning && (
                    <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-green-500 animate-pulse border border-black/50" />
                )}
            </div>

            <div className="flex-1 min-w-0 pr-2">
                <h3 className={cn(
                    "font-bold text-sm truncate transition-colors leading-tight mb-1.5",
                    isActive ? "text-white" : "text-white/70 group-hover:text-white"
                )}>
                    {game.title}
                </h3>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 tracking-wide uppercase">
                    <Clock size={12} />
                    <span>{formatPlaytime(game.playtime_seconds || 0)}</span>
                </div>
            </div>

            {isActive && (
                <div className="shrink-0">
                    <ChevronRight size={18} className="text-white/50" />
                </div>
            )}
        </button>
    );
}

// ─── Metadata row (icon + label + value) ──────────────────────────────────────
function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    if (!value || value === "Unknown") return null;
    return (
        <div className="flex items-center gap-3 text-sm group/row">
            <span className="text-white/20 group-hover/row:text-accent transition-colors shrink-0">{icon}</span>
            <span className="text-white/40 text-[11px] uppercase tracking-widest font-black w-[85px] shrink-0">{label}</span>
            <span className="text-white/80 font-medium truncate">{value}</span>
        </div>
    );
}

// ─── Main Library Page ────────────────────────────────────────────────────────
export default function Library() {
    const gamesById = useGameStore((s: any) => s.gamesById);
    const allGames: Game[] = useMemo(
        () => Object.values(gamesById as Record<string, Game>).sort((a, b) => a.title.localeCompare(b.title)),
        [gamesById]
    );

    const setEditGameModalOpen = useUiStore((s: any) => s.setEditGameModalOpen);
    const setAddGameModalOpen = useUiStore((s: any) => s.setAddGameModalOpen);
    const setScannerModalOpen = useUiStore((s: any) => s.setScannerModalOpen);
    const runningGames = useProcessStore((s: any) => s.running);
    const refreshMetadata = useGameStore((s: any) => s.refreshMetadata);

    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [achievementsLoading, setAchievementsLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [showDescription, setShowDescription] = useState(false);
    const [showAchievements, setShowAchievements] = useState(false);

    const [contextMenu, setContextMenu] = useState<{
        x: number; y: number; items: ContextMenuItem[];
    } | null>(null);

    // Auto-select first game
    useEffect(() => {
        if (!activeGameId && allGames.length > 0) {
            setActiveGameId(allGames[0].id);
        }
    }, [allGames, activeGameId]);

    const activeGame = activeGameId ? gamesById[activeGameId] : null;

    // Reset modals on game change
    useEffect(() => {
        setShowAchievements(false);
        setShowDescription(false);
    }, [activeGame?.id]);

    // Fetch achievements
    useEffect(() => {
        if (!activeGame) { setAchievements([]); return; }
        setAchievementsLoading(true);
        getAchievements(activeGame.id)
            .then(setAchievements)
            .catch(() => setAchievements([]))
            .finally(() => setAchievementsLoading(false));
    }, [activeGame?.id]);

    const handleAction = async () => {
        if (!activeGame) return;
        if (runningGames[activeGame.id]) {
            await forceStopGame(activeGame.id);
        } else {
            await launchGame(activeGame.id);
        }
    };

    const handleContextMenu = useCallback((e: React.MouseEvent, game: Game) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX, y: e.clientY,
            items: [
                { label: "Edit Metadata", icon: <Settings size={14} />, onClick: () => setEditGameModalOpen(true, game) },
                { label: "Open Location", icon: <FolderOpen size={14} />, onClick: async () => invoke("open_path_in_explorer", { path: game.executable_path.replace(/\//g, "\\") }) },
                { label: "", separator: true, onClick: () => { } },
                { label: "Sync Metadata", icon: <RefreshCcw size={14} />, onClick: () => refreshMetadata(game.id) },
                { label: "Remove Game", icon: <Trash2 size={14} />, danger: true, onClick: async () => { if (confirm(`Remove "${game.title}"?`)) { await invoke("delete_game", { id: game.id }); useGameStore.getState().fetchGames(); } } },
            ],
        });
    }, [setEditGameModalOpen, refreshMetadata]);

    const filteredGames = useMemo(() =>
        allGames.filter((g) => g.title.toLowerCase().includes(search.toLowerCase())),
        [allGames, search]
    );

    const isRunning = activeGame ? !!runningGames[activeGame.id] : false;
    const earnedAchievements = achievements.filter(a => a.earned).length;
    const achievePct = achievements.length > 0 ? Math.round((earnedAchievements / achievements.length) * 100) : 0;

    const bgUrl = getSafeImageUrl(activeGame?.background_image_path || (activeGame as any)?.background_path || activeGame?.cover_image_path || (activeGame as any)?.cover_path);
    const coverUrl = getSafeImageUrl(activeGame?.cover_image_path || (activeGame as any)?.cover_path);

    // ── EMPTY STATE ──
    if (allGames.length === 0) {
        return (
            <div className="flex items-center justify-center h-full relative" onClick={() => setContextMenu(null)}>
                <div className="text-center space-y-6 relative z-10 glass-panel p-16 rounded-[3rem] border border-white/5 shadow-2xl">
                    <div className="w-24 h-24 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto text-accent">
                        <Gamepad2 size={40} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tight">Your library is empty</h2>
                        <p className="text-white/40 text-sm mt-3 font-medium uppercase tracking-widest">Add your first game to initialize the index.</p>
                    </div>
                    <div className="flex gap-4 justify-center mt-8">
                        <button onClick={() => setAddGameModalOpen(true)} className="inline-flex items-center gap-2 bg-accent hover:brightness-110 text-white px-8 py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-accent/20 active:scale-95">
                            <Plus size={18} /> Add Game
                        </button>
                        <button onClick={() => setScannerModalOpen(true)} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-8 py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all border border-white/10 active:scale-95">
                            <FolderOpen size={18} /> Scan Folders
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full relative bg-background" onClick={() => setContextMenu(null)}>
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}

            {/* ── CINEMATIC BACKGROUND ── */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <AnimatePresence mode="wait">
                    {bgUrl && (
                        <motion.div
                            key={bgUrl}
                            initial={{ opacity: 0, scale: 1.05 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="absolute inset-0"
                        >
                            <img
                                src={bgUrl}
                                alt=""
                                className="w-full h-full object-cover brightness-[0.35] saturate-[1.2]"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Gradients to ensure UI is always readable */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/50 to-transparent" />
            </div>

            {/* ── MAIN CONTENT (LEFT PANEL) ── */}
            <div className="relative z-10 flex-1 flex flex-col justify-end p-12 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                    {activeGame && (
                        <motion.div
                            key={activeGame.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col lg:flex-row items-start gap-12"
                        >
                            {/* COVER & ACTIONS */}
                            <div className="flex flex-col gap-6 w-[240px] shrink-0">
                                <div className="w-full aspect-[2/3] rounded-[2rem] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] border border-white/10 relative bg-black/50 group">
                                    {coverUrl ? (
                                        <img src={coverUrl} alt={activeGame.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/20">
                                            <Gamepad2 size={64} strokeWidth={1} />
                                        </div>
                                    )}
                                    {isRunning && (
                                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-green-500/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-lg border border-green-400/50">
                                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Running</span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleAction}
                                    className={cn(
                                        "w-full py-4 rounded-2xl font-black text-sm tracking-widest flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-2xl uppercase border",
                                        isRunning
                                            ? "bg-red-500 hover:bg-red-600 text-white border-red-400 shadow-red-500/30"
                                            : "bg-accent hover:brightness-110 text-white border-accent/50 shadow-accent/30"
                                    )}
                                >
                                    {isRunning ? <><Square size={18} fill="currentColor" /> Stop Process</> : <><Play size={20} fill="currentColor" className="translate-x-0.5" /> Launch Game</>}
                                </button>

                                <div className="grid grid-cols-3 gap-3">
                                    <button onClick={() => setEditGameModalOpen(true, activeGame)} className="h-14 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-accent/40" title="Edit metadata">
                                        <Settings size={20} />
                                    </button>
                                    <button className="h-14 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-pink-400/40" title="Favorite">
                                        <Heart size={20} />
                                    </button>
                                    <button onClick={() => refreshMetadata(activeGame.id)} className="h-14 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-blue-400/40" title="Refresh metadata">
                                        <RefreshCcw size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* DETAILS & STATS */}
                            <div className="flex-1 min-w-0 flex flex-col justify-end pb-2 lg:pt-8">
                                {(activeGame.developer || activeGame.source) && (
                                    <div className="mb-4">
                                        <span className="text-[10px] font-black tracking-widest uppercase bg-white/10 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl text-white/90 shadow-lg">
                                            {activeGame.developer || activeGame.source || "PC"}
                                        </span>
                                    </div>
                                )}

                                <h1 className="text-6xl xl:text-7xl font-black tracking-tighter text-white leading-[1.1] mb-6 drop-shadow-2xl">
                                    {activeGame.title}
                                </h1>

                                {/* Quick Stats */}
                                <div className="flex items-center flex-wrap gap-6 text-sm text-white/70 font-bold mb-10 bg-black/40 w-fit px-6 py-4 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl">
                                    <span className="flex items-center gap-2.5 text-white"><Clock size={18} className="text-accent" /> {formatPlaytime(activeGame.playtime_seconds || 0)}</span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                                    {activeGame.last_played && (
                                        <>
                                            <span>Last played: <span className="text-white">{new Date(activeGame.last_played).toLocaleDateString()}</span></span>
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                                        </>
                                    )}
                                    {activeGame.release_date && (
                                        <span>Released: <span className="text-white">{new Date(activeGame.release_date).getFullYear()}</span></span>
                                    )}
                                </div>

                                {/* Info Cards */}
                                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 max-w-5xl">

                                    {/* Description Card */}
                                    {activeGame.description && (
                                        <div
                                            onClick={() => setShowDescription(true)}
                                            className="xl:col-span-2 bg-black/50 backdrop-blur-2xl border border-white/10 hover:border-white/30 rounded-[2rem] p-7 relative overflow-hidden cursor-pointer group shadow-2xl transition-all"
                                        >
                                            <div className="flex items-center gap-2 text-white/50 text-[10px] font-black uppercase tracking-widest mb-3">
                                                <Info size={14} className="text-white" /> Summary
                                            </div>
                                            <p className="text-white/70 text-sm leading-relaxed line-clamp-4 group-hover:text-white transition-colors pr-2">
                                                {activeGame.description}
                                            </p>
                                            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />
                                        </div>
                                    )}

                                    {/* Achievements Card */}
                                    {achievements.length > 0 && (
                                        <div
                                            onClick={() => setShowAchievements(true)}
                                            className="bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-2xl border border-white/10 hover:border-accent/50 rounded-[2rem] p-7 shadow-2xl hover:shadow-[0_0_40px_rgba(102,192,244,0.2)] transition-all cursor-pointer group flex flex-col justify-between min-h-[160px]"
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div>
                                                    <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                        <Trophy size={14} className="text-yellow-400" /> Progress
                                                    </h4>
                                                    <div className="text-4xl font-black text-white tracking-tighter">
                                                        {earnedAchievements} <span className="text-white/30 text-xl">/ {achievements.length}</span>
                                                    </div>
                                                </div>
                                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 group-hover:bg-accent/20 group-hover:text-accent transition-colors">
                                                    <ExternalLink size={16} />
                                                </div>
                                            </div>

                                            <div>
                                                <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden mb-3">
                                                    <motion.div
                                                        className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${achievePct}%` }}
                                                        transition={{ duration: 0.8, ease: "circOut", delay: 0.2 }}
                                                    />
                                                </div>
                                                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">{achievePct}% Completed</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Fallback Metadata Grid if no achievements exist */}
                                    {achievements.length === 0 && (activeGame.developer || activeGame.publisher || activeGame.release_date || activeGame.genre) && (
                                        <div className="bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-7 flex-1 min-w-[240px] space-y-3.5 shadow-2xl">
                                            <h4 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">Game Info</h4>
                                            <MetaRow icon={<User2 size={14} />} label="Developer" value={activeGame.developer || "Unknown"} />
                                            <MetaRow icon={<Building2 size={14} />} label="Publisher" value={activeGame.publisher || "Unknown"} />
                                            <MetaRow icon={<Calendar size={14} />} label="Released" value={activeGame.release_date ? new Date(activeGame.release_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Unknown"} />
                                            <MetaRow icon={<Star size={14} />} label="Genre" value={activeGame.genre || "Unknown"} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── SIDEBAR (RIGHT PANEL) ── */}
            <div className="w-[340px] shrink-0 h-full border-l border-white/10 bg-black/40 backdrop-blur-[40px] flex flex-col pointer-events-auto z-30 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
                <div className="px-6 pt-10 pb-5 shrink-0">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-black text-white tracking-widest uppercase">Collection</h2>
                        <span className="text-xs font-bold text-accent bg-accent/10 px-3 py-1 rounded-lg border border-accent/20">
                            {allGames.length}
                        </span>
                    </div>

                    <div className="relative">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search library..."
                            className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-10 py-3.5 text-white text-sm font-medium outline-none focus:border-accent/50 placeholder:text-white/30 transition-all shadow-inner"
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-4 pb-4 space-y-1.5">
                    {filteredGames.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-white/30 text-xs font-semibold gap-3">
                            <Search size={28} className="opacity-40" />
                            No match found
                        </div>
                    ) : (
                        filteredGames.map((game) => (
                            <LibraryListItem
                                key={game.id}
                                game={game}
                                isActive={activeGameId === game.id}
                                onClick={() => setActiveGameId(game.id)}
                                onContextMenu={(e) => handleContextMenu(e, game)}
                            />
                        ))
                    )}
                </div>

                <div className="p-5 shrink-0 border-t border-white/10 bg-black/20">
                    <button
                        onClick={() => setAddGameModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white text-xs font-bold transition-all shadow-sm uppercase tracking-widest"
                    >
                        <Plus size={16} /> Add New Game
                    </button>
                </div>
            </div>

            {/* ── MODALS ── */}
            <AnimatePresence>
                {/* Description Modal */}
                {showDescription && activeGame?.description && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
                        onClick={() => setShowDescription(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 12 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 12 }}
                            className="bg-[#11141d] rounded-[2rem] border border-white/10 p-10 max-w-2xl w-full shadow-[0_30px_100px_rgba(0,0,0,0.8)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-white font-black text-2xl tracking-tight flex items-center gap-3">
                                    <Info className="text-accent" /> About {activeGame.title}
                                </h3>
                                <button onClick={() => setShowDescription(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="text-white/70 text-sm leading-loose whitespace-pre-wrap max-h-[60vh] overflow-y-auto custom-scrollbar pr-4">
                                {activeGame.description}
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* Achievements Modal */}
                {showAchievements && activeGame && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xl flex items-center justify-center p-10"
                    >
                        <div className="absolute inset-0" onClick={() => setShowAchievements(false)} />

                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-7xl max-h-[88vh] bg-[#0b0e14] border border-white/10 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-10 py-8 border-b border-white/5 bg-white/[0.02] shrink-0">
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-500 shadow-lg shadow-yellow-500/10">
                                        <Trophy size={28} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                                            {activeGame.title}
                                        </h2>
                                        <p className="text-white/40 text-xs font-bold tracking-widest uppercase mt-1">
                                            Achievement Archive
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAchievements(false)}
                                    className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/50 hover:text-white transition-all active:scale-95"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-gradient-to-b from-transparent to-black/40">
                                {achievementsLoading ? (
                                    <div className="flex flex-col items-center justify-center h-64 gap-4 opacity-50">
                                        <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
                                        <p className="text-xs font-black tracking-widest uppercase">Syncing Records...</p>
                                    </div>
                                ) : (
                                    <AchievementGrid achievements={achievements} gameName={activeGame.title} />
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}