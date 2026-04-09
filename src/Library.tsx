import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "./store/gameStore";
import { useUiStore } from "./store/uiStore";
import { useProcessStore } from "./store/processStore";
import { launchGame, forceStopGame } from "./services/gameService";
import { getAchievements, type Achievement } from "./services/achievementService";
import { fetchSteamReviews, fetchSteamMetadata, fetchSteamAchievementPercentages, type SteamReviewsResponse, type SteamAppDetails, type SteamReview } from "./services/steamService";
import { cn } from "./lib/utils";
import { formatPlaytime } from "./lib/format";
import {
    Clock, Trophy, Heart, Settings, FolderOpen, Play, Square,
    Gamepad2, Trash2, RefreshCcw, Plus, Search, Calendar,
    User2, Building2, ChevronRight, X, ExternalLink, ThumbsUp, ThumbsDown, Star
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "./components/ui/ContextMenu";
import { motion, AnimatePresence } from "framer-motion";
import { AchievementGrid } from "./components/game/AchievementGrid";
import type { Game } from "./types/game";
import { useLocalImage } from "./hooks/useLocalImage";

function LibraryListItem({ game, isActive, onClick, onContextMenu }: { game: Game; isActive: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void; }) {
    const runningInfo = useProcessStore((s: any) => s.running[game.id]);
    const isRunning = !!runningInfo;
    const { src: coverUrl } = useLocalImage(game.cover_image_path || (game as any).cover_path);

    return (
        <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={cn(
                "w-full flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 text-left relative group outline-none",
                isActive ? "bg-white/10 border border-white/20 shadow-lg" : "hover:bg-white/[0.08] border border-transparent"
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
                {isRunning && <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-green-500 animate-pulse border border-black/50" />}
            </div>
            <div className="flex-1 min-w-0 pr-2">
                <h3 className={cn("font-bold text-sm truncate transition-colors leading-tight mb-1.5", isActive ? "text-white" : "text-white/70 group-hover:text-white")}>{game.title}</h3>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 tracking-wide uppercase">
                    <Clock size={12} /><span>{formatPlaytime(game.playtime_seconds || 0)}</span>
                </div>
            </div>
            {isActive && <div className="shrink-0"><ChevronRight size={18} className="text-white/50" /></div>}
        </button>
    );
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    if (!value || value === "Unknown") return null;
    return (
        <div className="flex items-center gap-4 text-sm group/row mb-3 last:mb-0">
            <span className="text-white/20 group-hover/row:text-accent transition-colors shrink-0">{icon}</span>
            <span className="text-white/40 text-[11px] uppercase tracking-widest font-black w-[90px] shrink-0">{label}</span>
            <span className="text-white/90 font-semibold truncate">{value}</span>
        </div>
    );
}

export default function Library() {
    const gamesById = useGameStore((s: any) => s.gamesById);
    const allGames: Game[] = useMemo(() => Object.values(gamesById as Record<string, Game>).sort((a, b) => a.title.localeCompare(b.title)), [gamesById]);

    const setEditGameModalOpen = useUiStore((s: any) => s.setEditGameModalOpen);
    const setAddGameModalOpen = useUiStore((s: any) => s.setAddGameModalOpen);
    const setScannerModalOpen = useUiStore((s: any) => s.setScannerModalOpen);
    const runningGames = useProcessStore((s: any) => s.running);
    const refreshMetadata = useGameStore((s: any) => s.refreshMetadata);

    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [achievementsLoading, setAchievementsLoading] = useState(false);
    const [reviews, setReviews] = useState<SteamReviewsResponse | null>(null);
    const [steamDetails, setSteamDetails] = useState<SteamAppDetails | null>(null);

    const [search, setSearch] = useState("");
    const [showAchievements, setShowAchievements] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[]; } | null>(null);

    useEffect(() => {
        if (!activeGameId && allGames.length > 0) setActiveGameId(allGames[0].id);
    }, [allGames, activeGameId]);

    const activeGame = activeGameId ? gamesById[activeGameId] : null;

    useEffect(() => {
        setShowAchievements(false);
    }, [activeGame?.id]);

    useEffect(() => {
        if (!activeGame) {
            setAchievements([]);
            setReviews(null);
            setSteamDetails(null);
            return;
        }

        setAchievementsLoading(true);
        let currentAchievements: Achievement[] = [];

        getAchievements(activeGame.id).then(async (ach) => {
            currentAchievements = ach;
            setAchievements(currentAchievements);

            if (activeGame.steam_app_id && ach.length > 0) {
                try {
                    const pcts = await fetchSteamAchievementPercentages(activeGame.steam_app_id.toString());
                    if (Object.keys(pcts).length > 0) {
                        const merged = currentAchievements.map(a => ({
                            ...a,
                            global_percent: a.global_percent ?? pcts[a.api_name] ?? a.global_percent
                        }));
                        setAchievements(merged);
                    }
                } catch (e) { }
            }
        }).catch(() => setAchievements([])).finally(() => setAchievementsLoading(false));

        if (activeGame.steam_app_id) {
            const appIdStr = activeGame.steam_app_id.toString();
            fetchSteamReviews(appIdStr).then(setReviews).catch(() => setReviews(null));
            fetchSteamMetadata(appIdStr).then(setSteamDetails).catch(() => setSteamDetails(null));
        } else {
            setReviews(null);
            setSteamDetails(null);
        }
    }, [activeGame?.id]);

    const handleAction = async () => {
        if (!activeGame) return;
        if (runningGames[activeGame.id]) await forceStopGame(activeGame.id);
        else await launchGame(activeGame.id);
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

    const filteredGames = useMemo(() => allGames.filter((g) => g.title.toLowerCase().includes(search.toLowerCase())), [allGames, search]);

    const isRunning = activeGame ? !!runningGames[activeGame.id] : false;
    const earnedAchievements = achievements.filter(a => a.earned).length;
    const achievePct = achievements.length > 0 ? Math.round((earnedAchievements / achievements.length) * 100) : 0;

    const rawBgPath = activeGame?.background_image_path || (activeGame as any)?.background_path;
    const rawCoverPath = activeGame?.cover_image_path || (activeGame as any)?.cover_path;

    const { src: loadedBg, error: bgErr } = useLocalImage(rawBgPath ? rawBgPath.split("?pos=")[0] : null);
    const { src: loadedCover, error: coverErr } = useLocalImage(rawCoverPath);

    const bgUrl = (loadedBg && !bgErr) ? loadedBg : (loadedCover && !coverErr) ? loadedCover : null;
    const coverUrl = (loadedCover && !coverErr) ? loadedCover : null;
    const bgPos = rawBgPath?.includes("?pos=") ? rawBgPath.split("?pos=")[1].replace("-", " ") : "center top";

    if (allGames.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-full relative w-full" onClick={() => setContextMenu(null)}>
                <div className="text-center space-y-6 relative z-10 glass-panel p-16 rounded-[3rem] border border-white/5 shadow-2xl">
                    <div className="w-24 h-24 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto text-accent">
                        <Gamepad2 size={40} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tight">Your library is empty</h2>
                        <p className="text-white/40 text-sm mt-3 font-medium uppercase tracking-widest">Add your first game to initialize the index.</p>
                    </div>
                    <div className="flex gap-4 justify-center mt-8">
                        <button onClick={() => setAddGameModalOpen(true)} className="inline-flex items-center gap-2 bg-accent hover:brightness-110 text-white px-8 py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-accent/20 active:scale-95"><Plus size={18} /> Add Game</button>
                        <button onClick={() => setScannerModalOpen(true)} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-8 py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all border border-white/10 active:scale-95"><FolderOpen size={18} /> Scan Folders</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full min-h-full" onClick={() => setContextMenu(null)}>
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}

            {/* ── FLOATING RIGHT SIDEBAR ── */}
            <div className="fixed right-8 top-1/2 -translate-y-1/2 h-[60vh] w-[340px] bg-[#090b14]/80 backdrop-blur-[60px] border border-white/10 rounded-[2.5rem] flex flex-col pointer-events-auto z-40 shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="px-6 pt-8 pb-4 shrink-0">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-black text-white tracking-widest uppercase">Collection</h2>
                        <span className="text-xs font-bold text-accent bg-accent/10 px-3 py-1 rounded-xl border border-accent/20">
                            {allGames.length}
                        </span>
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search library..."
                            className="w-full bg-black/50 border border-white/10 rounded-2xl pl-11 pr-10 py-3 text-white text-sm font-medium outline-none focus:border-accent/50 placeholder:text-white/30 transition-all shadow-inner"
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-4 pb-4 space-y-1">
                    {filteredGames.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-white/30 text-xs font-semibold gap-3">
                            <Search size={24} className="opacity-40" />
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

                <div className="p-4 shrink-0 border-t border-white/10 bg-black/20">
                    <button
                        onClick={() => setAddGameModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white text-xs font-bold transition-all shadow-sm uppercase tracking-widest"
                    >
                        <Plus size={16} /> Add New Game
                    </button>
                </div>
            </div>

            {/* ── FIXED BACKGROUND IMAGE LAYER ── */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <AnimatePresence mode="wait">
                    {bgUrl && (
                        <motion.div key={bgUrl} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2, ease: "easeOut" }} className="absolute inset-0">
                            <img src={bgUrl} alt="Background" className="w-full h-full object-cover brightness-[0.35] saturate-[1.2]" style={{ objectPosition: bgPos }} />
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/40 to-transparent" />
            </div>

            {/* ── MAIN SCROLLABLE CONTENT AREA ── */}
            {/* The natural document flow will push this down, allowing scrolling */}
            <div className="relative z-10 w-full pr-[380px] pt-[15vh] px-14 flex flex-col gap-12 pb-32">

                {/* ── HERO SECTION ── */}
                <AnimatePresence mode="wait">
                    {activeGame && (
                        <motion.div key={activeGame.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col xl:flex-row items-end gap-14 min-h-[50vh]">
                            {/* COVER & ACTIONS */}
                            <div className="flex flex-col gap-6 w-[260px] shrink-0">
                                <div className="w-full aspect-[2/3] rounded-[2rem] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.7)] border border-white/10 relative bg-black/50 group">
                                    {coverUrl ? <img src={coverUrl} alt={activeGame.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center text-white/20"><Gamepad2 size={64} strokeWidth={1} /></div>}
                                    {isRunning && <div className="absolute top-4 left-4 flex items-center gap-2 bg-green-500/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-lg border border-green-400/50"><div className="w-2 h-2 rounded-full bg-white animate-pulse" /><span className="text-[10px] font-black text-white uppercase tracking-widest">Running</span></div>}
                                </div>

                                <button onClick={handleAction} className={cn("w-full py-4.5 rounded-2xl font-black text-sm tracking-widest flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-2xl uppercase border", isRunning ? "bg-red-500 hover:bg-red-600 text-white border-red-400 shadow-red-500/30" : "bg-accent hover:brightness-110 text-white border-accent/50 shadow-accent/30")}>
                                    {isRunning ? <><Square size={18} fill="currentColor" /> Stop Process</> : <><Play size={20} fill="currentColor" className="translate-x-0.5" /> Launch Game</>}
                                </button>

                                <div className="grid grid-cols-3 gap-3">
                                    <button onClick={() => setEditGameModalOpen(true, activeGame)} className="h-14 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-accent/40" title="Edit metadata"><Settings size={20} /></button>
                                    <button className="h-14 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-pink-400/40" title="Favorite"><Heart size={20} /></button>
                                    <button onClick={() => refreshMetadata(activeGame.id)} className="h-14 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all backdrop-blur-md hover:border-blue-400/40" title="Refresh metadata"><RefreshCcw size={20} /></button>
                                </div>
                            </div>

                            {/* HERO TEXT & MINI STATS */}
                            <div className="flex-1 min-w-0 flex flex-col justify-end pb-2">
                                {(activeGame.developer || activeGame.source) && (
                                    <div className="mb-5">
                                        <span className="text-[10px] font-black tracking-widest uppercase bg-white/10 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl text-white/90 shadow-lg">
                                            {activeGame.developer || activeGame.source || "PC"}
                                        </span>
                                    </div>
                                )}

                                <h1 className="text-6xl xl:text-[5.5rem] font-black tracking-tighter text-white leading-[1.05] mb-8 drop-shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                                    {activeGame.title}
                                </h1>

                                <div className="flex items-center flex-wrap gap-6 text-sm text-white/70 font-bold bg-black/40 w-fit px-6 py-4 rounded-2xl border border-white/10 backdrop-blur-md shadow-xl">
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
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── PANELS SECTION (Game Info & Progress) ── */}
                {activeGame && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mt-4">

                        {/* Panel 1: Game Info */}
                        <div className="bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 shadow-2xl h-full">
                            <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Building2 size={14} className="text-purple-400" /> Game Info
                            </h4>
                            <div className="space-y-1">
                                <MetaRow icon={<User2 size={16} />} label="Developer" value={activeGame.developer || "Unknown"} />
                                <MetaRow icon={<Building2 size={16} />} label="Publisher" value={activeGame.publisher || "Unknown"} />
                                <MetaRow icon={<Calendar size={16} />} label="Released" value={activeGame.release_date ? new Date(activeGame.release_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Unknown"} />
                                <MetaRow icon={<Star size={16} />} label="Genre" value={activeGame.genre || "Unknown"} />
                            </div>
                        </div>

                        {/* Panel 2: Progress (Achievements) */}
                        <div
                            onClick={() => achievements.length > 0 && setShowAchievements(true)}
                            className={cn(
                                "bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 shadow-2xl flex flex-col justify-between h-full",
                                achievements.length > 0 ? "hover:border-accent/40 cursor-pointer group hover:shadow-[0_0_40px_rgba(102,192,244,0.15)] transition-all transform hover:-translate-y-1" : "opacity-60"
                            )}
                        >
                            <div className="flex items-start justify-between mb-8">
                                <div>
                                    <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Trophy size={14} className="text-yellow-400" /> Progress
                                    </h4>
                                    <div className="text-5xl font-black text-white tracking-tighter">
                                        {earnedAchievements} <span className="text-white/30 text-2xl">/ {achievements.length > 0 ? achievements.length : "--"}</span>
                                    </div>
                                </div>
                                {achievements.length > 0 && (
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/30 group-hover:bg-accent/20 group-hover:text-accent transition-colors">
                                        <ExternalLink size={16} />
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden mb-3">
                                    <motion.div className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.5)]" initial={{ width: 0 }} animate={{ width: `${achievePct}%` }} transition={{ duration: 0.8, ease: "circOut", delay: 0.2 }} />
                                </div>
                                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">{achievePct}% Completed</p>
                            </div>
                        </div>

                    </div>
                )}

                {/* ── DEEP METADATA SECTION (Flows Naturally Below) ── */}
                {activeGame && (activeGame.description || steamDetails || reviews) && (
                    <div className="pt-8">
                        <div className="max-w-7xl grid grid-cols-1 xl:grid-cols-3 gap-16">

                            {/* Left Column: Description & System Reqs */}
                            <div className="xl:col-span-2 space-y-16">

                                {/* Rich Description (Unboxed & Clean) */}
                                {activeGame.description && (
                                    <div>
                                        <div
                                            className="text-white/80 text-[15px] leading-relaxed font-medium max-w-4xl
                                            [&_h1]:text-white [&_h1]:text-4xl [&_h1]:font-black [&_h1]:mt-12 [&_h1]:mb-6 [&_h1]:tracking-tight
                                            [&_h2]:text-white [&_h2]:text-2xl [&_h2]:font-black [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:tracking-tight
                                            [&_h3]:text-white [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mt-8 [&_h3]:mb-4
                                            [&_p]:mb-6
                                            [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-2xl [&_img]:shadow-[0_20px_40px_rgba(0,0,0,0.5)] [&_img]:border [&_img]:border-white/10 [&_img]:my-8
                                            [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-4 [&_li]:mb-2 [&_li]:pl-2
                                            [&_a]:text-accent [&_a]:hover:underline
                                            [&_.bb_img_ctn]:block [&_.bb_img_ctn]:my-8 [&_.bb_img]:w-full [&_.bb_img]:m-0
                                            [&_strong]:text-white [&_b]:text-white"
                                            dangerouslySetInnerHTML={{ __html: activeGame.description }}
                                        />
                                    </div>
                                )}

                                {/* System Requirements */}
                                {steamDetails?.pc_requirements && (steamDetails.pc_requirements.minimum || steamDetails.pc_requirements.recommended) && (
                                    <div className="mb-16">
                                        <h2 className="text-2xl font-black text-white tracking-tight mb-6 border-b border-white/10 pb-4">System Requirements</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            {steamDetails.pc_requirements.minimum && (
                                                <div
                                                    className="text-white/60 text-sm leading-relaxed 
                                                    [&>strong]:text-white [&>strong]:block [&>strong]:mb-3 [&>strong]:text-lg [&>strong]:tracking-tight
                                                    [&>ul]:list-none [&>ul]:m-0 [&>ul]:p-0 [&>ul>li]:mb-2 [&>ul>li>strong]:inline [&>ul>li>strong]:text-white/90 [&>ul>li>strong]:mr-2"
                                                    dangerouslySetInnerHTML={{ __html: steamDetails.pc_requirements.minimum }}
                                                />
                                            )}
                                            {steamDetails.pc_requirements.recommended && (
                                                <div
                                                    className="text-white/60 text-sm leading-relaxed 
                                                    [&>strong]:text-white [&>strong]:block [&>strong]:mb-3 [&>strong]:text-lg [&>strong]:tracking-tight
                                                    [&>ul]:list-none [&>ul]:m-0 [&>ul]:p-0 [&>ul>li]:mb-2 [&>ul>li>strong]:inline [&>ul>li>strong]:text-white/90 [&>ul>li>strong]:mr-2"
                                                    dangerouslySetInnerHTML={{ __html: steamDetails.pc_requirements.recommended }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Column: Game Info & Reviews */}
                            <div className="xl:col-span-1 space-y-12">
                                {steamDetails && (
                                    <div className="space-y-10">
                                        {steamDetails.metacritic && (
                                            <div>
                                                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">Metacritic Score</h3>
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white shadow-lg",
                                                        steamDetails.metacritic.score >= 75 ? "bg-green-600" : steamDetails.metacritic.score >= 50 ? "bg-yellow-600" : "bg-red-600"
                                                    )}>
                                                        {steamDetails.metacritic.score}
                                                    </div>
                                                    <p className="text-white/50 text-xs font-bold">Critically Acclaimed</p>
                                                </div>
                                            </div>
                                        )}

                                        {steamDetails.categories && steamDetails.categories.length > 0 && (
                                            <div>
                                                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">Features</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    {steamDetails.categories.map(c => (
                                                        <span key={c.description} className="bg-black/40 border border-white/10 px-3 py-1.5 rounded-lg text-xs text-white/70 font-medium">
                                                            {c.description}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {steamDetails.genres && steamDetails.genres.length > 0 && (
                                            <div>
                                                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">Genres</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    {steamDetails.genres.map(g => (
                                                        <span key={g.description} className="bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider">
                                                            {g.description}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {reviews && reviews.reviews.length > 0 && (
                                    <div className="pt-8 border-t border-white/10">
                                        <h2 className="text-lg font-black text-white uppercase tracking-widest mb-2">Global Transmissions</h2>
                                        <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-6">
                                            <span className="text-accent">{reviews.query_summary.review_score_desc}</span> • {reviews.query_summary.total_reviews.toLocaleString()} Records
                                        </p>
                                        <div className="space-y-4">
                                            {reviews.reviews.slice(0, 4).map((rev: SteamReview) => (
                                                <div key={rev.author.personaname} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 shadow-lg">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-black/50 overflow-hidden border border-white/10">
                                                                {rev.author.avatar && <img src={rev.author.avatar} alt="" className="w-full h-full object-cover" />}
                                                            </div>
                                                            <div>
                                                                <p className="text-white font-bold text-xs">{rev.author.personaname}</p>
                                                                <p className="text-white/30 text-[9px] uppercase tracking-widest font-black">{Math.round(rev.author.playtime_forever / 60)}h on record</p>
                                                            </div>
                                                        </div>
                                                        <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-black uppercase tracking-widest", rev.voted_up ? "bg-accent/10 border-accent/20 text-accent" : "bg-red-500/10 border-red-500/20 text-red-400")}>
                                                            {rev.voted_up ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
                                                        </div>
                                                    </div>
                                                    <p className="text-white/60 text-xs leading-relaxed line-clamp-4">{rev.review}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── EMPTY STATE FOR MISSING STEAM METADATA ── */}
                {activeGame && !activeGame.steam_app_id && !activeGame.description && !steamDetails && !reviews && (
                    <div className="px-14 py-20 mt-10 border-t border-white/5 flex flex-col items-center justify-center text-center">
                        <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-xl">
                            <Gamepad2 size={40} className="text-white/20" />
                        </div>
                        <h2 className="text-3xl font-black text-white tracking-widest uppercase mb-4">Deep Metadata Locked</h2>
                        <p className="text-white/40 max-w-lg mb-8 leading-relaxed font-medium">
                            This game is not linked to a Steam App ID. By mapping it to the Steam Store, the launcher can pull rich descriptions, global user reviews, system requirements, and HD assets!
                        </p>
                        <button
                            onClick={() => setEditGameModalOpen(true, activeGame)}
                            className="bg-accent/20 hover:bg-accent/40 text-accent font-black tracking-widest uppercase text-sm px-8 py-4 rounded-2xl border border-accent/20 transition-all shadow-[0_0_30px_rgba(102,192,244,0.15)] flex items-center gap-3"
                        >
                            <Settings size={18} /> Configure Steam ID
                        </button>
                    </div>
                )}
            </div>

            {/* ── MODALS ── */}
            <AnimatePresence>
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
                                            Global Achievement Archive
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