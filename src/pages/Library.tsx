import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { useProcessStore } from "../store/processStore";
import { launchGame, forceStopGame } from "../services/gameService";
import { getAchievements, type Achievement } from "../services/achievementService";
import { cn } from "../lib/utils";
import { formatPlaytime } from "../lib/format";
import {
    Clock, Trophy, Heart, Settings, FolderOpen, Play, Square,
    Gamepad2, Trash2, RefreshCcw, Plus, Search, Star, Calendar,
    User2, Building2, Info, ChevronRight, X, ExternalLink
} from "lucide-react";
import { ContextMenu } from "../components/ui/ContextMenu";
import type { ContextMenuItem } from "../components/ui/ContextMenu";
import { motion, AnimatePresence } from "framer-motion";
import { AchievementGrid } from "../components/game/AchievementGrid";
import type { Game } from "../types/game";
import { useLocalImage } from "../hooks/useLocalImage";

// ─────────────────────────────────────────────────────────
//  Sidebar list item
// ─────────────────────────────────────────────────────────
function LibraryListItem({
    game, isActive, onClick, onContextMenu,
}: {
    game: Game; isActive: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void;
}) {
    const runningInfo = useProcessStore((s) => s.running[game.id]);
    const isRunning = !!runningInfo;
    const { src: coverUrl } = useLocalImage(game.cover_image_path || (game as any).cover_path);

    return (
        <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={cn(
                "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 text-left relative group outline-none",
                isActive
                    ? "bg-white/10 border border-white/15 shadow-sm"
                    : "hover:bg-white/5 border border-transparent"
            )}
        >
            <div className="w-10 h-14 rounded-lg overflow-hidden shadow-md shrink-0 bg-black/40 relative border border-white/5">
                {coverUrl ? (
                    <img src={coverUrl} alt={game.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/15">
                        <Gamepad2 size={18} />
                    </div>
                )}
                {isRunning && (
                    <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse border border-green-800/60" />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <h3 className={cn(
                    "font-semibold text-[13px] truncate transition-colors leading-tight",
                    isActive ? "text-white" : "text-white/70 group-hover:text-white"
                )}>
                    {game.title}
                </h3>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/30">
                    <Clock size={10} />
                    <span>{formatPlaytime(game.playtime_seconds || 0)}</span>
                </div>
            </div>

            {isActive && (
                <div className="shrink-0 mr-0.5">
                    <ChevronRight size={14} className="text-white/40" />
                </div>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────
//  Metadata row (icon + label + value)
// ─────────────────────────────────────────────────────────
function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    if (!value) return null;
    return (
        <div className="flex items-center gap-3 text-sm group/row">
            <span className="text-white/20 group-hover/row:text-accent transition-colors shrink-0">{icon}</span>
            <span className="text-white/40 text-[11px] uppercase tracking-widest font-black w-[85px] shrink-0">{label}</span>
            <span className="text-white/80 font-medium truncate">{value}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  Main Library page
// ─────────────────────────────────────────────────────────
export default function Library() {
    const gamesById = useGameStore((s) => s.gamesById);
    const allGames = useMemo(
        () => Object.values(gamesById).sort((a: Game, b: Game) => a.title.localeCompare(b.title)),
        [gamesById]
    );

    const setCurrentBg = useUiStore((s) => s.setCurrentBg);
    const setEditGameModalOpen = useUiStore((s) => s.setEditGameModalOpen);
    const setAddGameModalOpen = useUiStore((s) => s.setAddGameModalOpen);
    const setScannerModalOpen = useUiStore((s) => s.setScannerModalOpen);
    const runningGames = useProcessStore((s) => s.running);
    const refreshMetadata = useGameStore((s) => s.refreshMetadata);

    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [achievementsLoading, setAchievementsLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [showDescription, setShowDescription] = useState(false);
    const [showAchievements, setShowAchievements] = useState(false);

    const [contextMenu, setContextMenu] = useState<{
        x: number; y: number; items: ContextMenuItem[];
    } | null>(null);

    // Default to first game
    useEffect(() => {
        if (!activeGameId && allGames.length > 0) {
            setActiveGameId(allGames[0].id);
        }
    }, [allGames, activeGameId]);

    const activeGame = activeGameId ? gamesById[activeGameId] : null;

    // Reset modals when active game changes
    useEffect(() => {
        setShowAchievements(false);
        setShowDescription(false);
    }, [activeGame?.id]);

    // Fetch achievements when active game changes
    useEffect(() => {
        if (!activeGame) { setAchievements([]); return; }
        setAchievementsLoading(true);
        getAchievements(activeGame.id)
            .then(setAchievements)
            .catch(() => setAchievements([]))
            .finally(() => setAchievementsLoading(false));
    }, [activeGame?.id]);

    // Update global background (which renders across the ENTIRE app window)
    useEffect(() => {
        if (activeGame) {
            setCurrentBg(activeGame.background_image_path || (activeGame as any).background_path || activeGame.cover_image_path || null);
        } else {
            setCurrentBg(null);
        }
        return () => { setCurrentBg(null); };
    }, [activeGame?.id, setCurrentBg]);

    // Prepare local cover url for the left panel
    const { src: coverUrl } = useLocalImage(activeGame?.cover_image_path || (activeGame as any)?.cover_path);
    const { src: bgUrl } = useLocalImage(activeGame?.background_image_path || (activeGame as any)?.background_path || activeGame?.cover_image_path || (activeGame as any)?.cover_path);

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
        allGames.filter((g: Game) => g.title.toLowerCase().includes(search.toLowerCase())),
        [allGames, search]
    );

    const isRunning = activeGame ? !!runningGames[activeGame.id] : false;
    const earnedAchievements = achievements.filter(a => a.earned).length;
    const achievePct = achievements.length > 0 ? Math.round((earnedAchievements / achievements.length) * 100) : 0;

    // ── Empty state ──
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
                        <button
                            onClick={() => setAddGameModalOpen(true)}
                            className="inline-flex items-center gap-2 bg-accent hover:brightness-110 text-white px-8 py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-accent/20 active:scale-95"
                        >
                            <Plus size={18} /> Add Game
                        </button>
                        <button
                            onClick={() => setScannerModalOpen(true)}
                            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-8 py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all border border-white/10 active:scale-95"
                        >
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
                                className="w-full h-full object-cover brightness-[0.5] saturate-[1.2]"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Subtle overlay gradients so text remains readable against bright backgrounds */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/30 to-transparent" />
            </div>

            {/* ── Hero / Detail Panel (left) ── */}
            <div className="flex-1 relative z-20 flex flex-col justify-end p-12 pointer-events-auto">
                <AnimatePresence mode="wait">
                    {activeGame && (
                        <motion.div
                            key={activeGame.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <div className="flex items-start gap-10">

                                {/* ── Left Column: Cover & Primary Actions ── */}
                                <div className="flex flex-col gap-5 w-[200px] shrink-0">
                                    {/* Box-art cover */}
                                    <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/15 relative bg-black/40">
                                        {coverUrl ? (
                                            <img src={coverUrl} alt={activeGame.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/20">
                                                <Gamepad2 size={48} />
                                            </div>
                                        )}
                                        {isRunning && (
                                            <div className="absolute top-3 left-3 flex items-center gap-2 bg-green-500/90 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-lg">
                                                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Running</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Primary Action Button */}
                                    <button
                                        onClick={handleAction}
                                        className={cn(
                                            "w-full py-4 rounded-xl font-black text-sm tracking-widest flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-2xl uppercase",
                                            isRunning
                                                ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30"
                                                : "bg-accent hover:brightness-110 text-white shadow-accent/30"
                                        )}
                                    >
                                        {isRunning ? <><Square size={16} fill="currentColor" /> Stop Process</> : <><Play size={18} fill="currentColor" className="translate-x-0.5" /> Launch Game</>}
                                    </button>

                                    {/* Secondary Actions Grid */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <button
                                            onClick={() => setEditGameModalOpen(true, activeGame)}
                                            className="h-12 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-accent/40"
                                            title="Edit metadata"
                                        >
                                            <Settings size={18} />
                                        </button>
                                        <button className="h-12 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-pink-400/40" title="Favorite">
                                            <Heart size={18} />
                                        </button>
                                        <button
                                            onClick={() => refreshMetadata(activeGame.id)}
                                            className="h-12 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-blue-400/40"
                                            title="Refresh metadata"
                                        >
                                            <RefreshCcw size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* ── Right Column: Info & Stats ── */}
                                <div className="flex-1 min-w-0 flex flex-col justify-end pb-2">

                                    {/* Developer badge */}
                                    {(activeGame.developer || activeGame.source) && (
                                        <div className="mb-4">
                                            <span className="text-[10px] font-bold tracking-widest uppercase bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-white/80 shadow-sm">
                                                {activeGame.developer || activeGame.source || "PC"}
                                            </span>
                                        </div>
                                    )}

                                    <h1 className="text-6xl font-black tracking-tighter text-white leading-[1.1] mb-6 drop-shadow-2xl">
                                        {activeGame.title}
                                    </h1>

                                    {/* Quick Stats Row */}
                                    <div className="flex items-center flex-wrap gap-6 text-sm text-white/60 font-semibold mb-8 bg-black/30 w-fit px-5 py-3 rounded-2xl border border-white/5 backdrop-blur-sm shadow-xl">
                                        <span className="flex items-center gap-2"><Clock size={16} className="text-accent" /> {formatPlaytime(activeGame.playtime_seconds || 0)}</span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                        {activeGame.last_played && (
                                            <>
                                                <span>Last played: {new Date(activeGame.last_played).toLocaleDateString()}</span>
                                                <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                            </>
                                        )}
                                        {activeGame.release_date && (
                                            <span>Released: {new Date(activeGame.release_date).getFullYear()}</span>
                                        )}
                                    </div>

                                    {/* Detail Cards Row */}
                                    <div className="flex gap-4 items-stretch max-w-4xl">

                                        {/* Metadata Grid */}
                                        {(activeGame.developer || activeGame.publisher || activeGame.release_date || activeGame.genre) && (
                                            <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 flex-1 min-w-[240px] space-y-3.5 shadow-xl hover:bg-black/60 transition-colors">
                                                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Game Info</h4>
                                                <MetaRow icon={<User2 size={14} />} label="Developer" value={activeGame.developer || "Unknown"} />
                                                <MetaRow icon={<Building2 size={14} />} label="Publisher" value={activeGame.publisher || "Unknown"} />
                                                <MetaRow icon={<Calendar size={14} />} label="Released" value={activeGame.release_date ? new Date(activeGame.release_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Unknown"} />
                                                <MetaRow icon={<Star size={14} />} label="Genre" value={activeGame.genre || "Unknown"} />
                                            </div>
                                        )}

                                        {/* Achievement Summary Card */}
                                        {achievements.length > 0 && (
                                            <div
                                                onClick={() => setShowAchievements(true)}
                                                className="bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-2xl border border-white/10 hover:border-accent/50 rounded-2xl p-6 flex-1 min-w-[240px] shadow-xl hover:shadow-[0_0_30px_rgba(102,192,244,0.15)] transition-all cursor-pointer group flex flex-col justify-between"
                                            >
                                                <div className="flex items-start justify-between mb-4">
                                                    <div>
                                                        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                            <Trophy size={12} className="text-yellow-400" /> Progress
                                                        </h4>
                                                        <div className="text-2xl font-black text-white">
                                                            {earnedAchievements} <span className="text-white/30 text-lg">/ {achievements.length}</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/30 group-hover:bg-accent/20 group-hover:text-accent transition-colors">
                                                        <ExternalLink size={14} />
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden mb-2">
                                                        <motion.div
                                                            className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full"
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${achievePct}%` }}
                                                            transition={{ duration: 0.8, ease: "circOut", delay: 0.2 }}
                                                        />
                                                    </div>
                                                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider">{achievePct}% Completed</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Description Snippet */}
                                        {activeGame.description && (
                                            <div
                                                onClick={() => setShowDescription(true)}
                                                className="bg-black/40 backdrop-blur-2xl border border-white/10 hover:border-white/25 rounded-2xl p-5 flex-[1.5] relative overflow-hidden cursor-pointer group shadow-xl transition-all"
                                            >
                                                <div className="flex items-center gap-2 text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">
                                                    <Info size={12} /> Summary
                                                </div>
                                                <p className="text-white/60 text-xs leading-loose line-clamp-4 group-hover:text-white/80 transition-colors pr-2">
                                                    {activeGame.description}
                                                </p>
                                                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/80 to-transparent" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Right Panel: Game List ── */}
            <div className="w-[340px] shrink-0 h-full border-l border-white/5 bg-black/40 backdrop-blur-3xl flex flex-col pointer-events-auto z-30">
                {/* List header */}
                <div className="px-6 pt-10 pb-5 shrink-0">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-black text-white tracking-widest uppercase">Collection</h2>
                        <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-lg border border-accent/20">
                            {allGames.length}
                        </span>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search library..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white text-sm font-medium outline-none focus:border-accent/50 placeholder:text-white/30 transition-all shadow-inner"
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Scrollable game list */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-4 pb-4 space-y-1">
                    {filteredGames.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-white/30 text-xs font-semibold gap-2">
                            <Search size={24} className="opacity-50" />
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

                {/* Add game footer */}
                <div className="p-5 shrink-0 border-t border-white/5 bg-white/[0.02]">
                    <button
                        onClick={() => setAddGameModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white text-xs font-bold transition-all shadow-sm"
                    >
                        <Plus size={16} /> Add New Game
                    </button>
                </div>
            </div>

            {/* ── Modals ── */}
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
                        {/* Click outside to close */}
                        <div className="absolute inset-0" onClick={() => setShowAchievements(false)} />

                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-7xl max-h-[88vh] bg-[#0b0e14] border border-white/10 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
                        >
                            {/* Modal Header */}
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

                            {/* Modal Body */}
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