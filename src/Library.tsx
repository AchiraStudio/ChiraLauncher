import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "./store/gameStore";
import { useUiStore } from "./store/uiStore";
import { useProcessStore } from "./store/processStore";
import { launchGame, forceStopGame } from "./services/gameService";
import { getAchievements, type Achievement } from "./services/achievementService";
import {
    fetchSteamReviews, fetchSteamMetadata, fetchSteamAchievementPercentages,
    type SteamReviewsResponse, type SteamAppDetails, type SteamReview
} from "./services/steamService";
import { cn } from "./lib/utils";
import { formatPlaytime } from "./lib/format";
import {
    Clock, Trophy, Heart, Settings, FolderOpen, Play, Square,
    Gamepad2, Trash2, RefreshCcw, Plus, Search, Calendar,
    User2, Building2, ChevronRight, X, ExternalLink, ThumbsUp, ThumbsDown, Star, Info
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "./components/ui/ContextMenu";
import { motion, AnimatePresence } from "framer-motion";
import { AchievementGrid } from "./components/game/AchievementGrid";
import type { Game } from "./types/game";
import { useLocalImage } from "./hooks/useLocalImage";

// ─── Steam HTML renderer styles ──────────────────────────────────────────────
const steamHtml = [
    "text-white/65 text-[14px] leading-[1.9] font-normal",
    "[&_h1]:text-white [&_h1]:text-2xl [&_h1]:font-black [&_h1]:uppercase [&_h1]:tracking-tight",
    "[&_h1]:border-b [&_h1]:border-white/10 [&_h1]:pb-3 [&_h1]:mt-12 [&_h1]:mb-5 [&_h1:first-child]:mt-0",
    "[&_h2]:text-white [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3",
    "[&_h3]:text-white/90 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2",
    "[&_p]:mb-4 [&_p]:text-white/60",
    "[&_strong]:text-white/90 [&_strong]:font-semibold",
    "[&_b]:text-white/90 [&_b]:font-semibold",
    "[&_i]:text-white/40 [&_em]:text-white/40",
    "[&_.bb_ul]:list-none [&_.bb_ul]:ml-0 [&_.bb_ul]:mb-5 [&_.bb_ul]:space-y-1.5",
    "[&_.bb_ul>li]:text-white/60 [&_.bb_ul>li]:flex [&_.bb_ul>li]:items-start [&_.bb_ul>li]:gap-2.5",
    "[&_.bb_ul>li]:before:content-['▸'] [&_.bb_ul>li]:before:text-accent [&_.bb_ul>li]:before:text-xs [&_.bb_ul>li]:before:shrink-0 [&_.bb_ul>li]:before:mt-1",
    "[&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-5 [&_ul]:space-y-1.5 [&_li]:text-white/60",
    "[&_.bb_img_ctn]:block [&_.bb_img_ctn]:my-6",
    "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:border [&_img]:border-white/10 [&_img]:block [&_img]:shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
    "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2",
    "[&_br]:leading-none",
].join(" ");

const reqHtml = [
    "text-xs text-white/50 leading-relaxed",
    "[&>strong]:text-accent [&>strong]:block [&>strong]:mb-3 [&>strong]:text-[9px] [&>strong]:font-black [&>strong]:uppercase [&>strong]:tracking-widest",
    "[&_ul]:list-none [&_ul]:m-0 [&_ul]:p-0",
    "[&_ul>li]:py-1.5 [&_ul>li]:border-b [&_ul>li]:border-white/[0.05] [&_ul>li:last-child]:border-0",
    "[&_ul>li>strong]:text-white/75 [&_ul>li>strong]:font-semibold [&_ul>li>strong]:mr-1.5",
].join(" ");

// ─── Sidebar row ─────────────────────────────────────────────────────────────
function SidebarRow({ game, isActive, onClick, onContextMenu }: {
    game: Game; isActive: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void;
}) {
    const isRunning = !!useProcessStore((s: any) => s.running[game.id]);
    const { src: cover } = useLocalImage(game.cover_image_path || (game as any).cover_path);

    return (
        <button
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left outline-none group relative",
                isActive ? "bg-white/10 border border-white/15" : "border border-transparent hover:bg-white/[0.06]"
            )}
        >
            <div className="w-10 h-[52px] rounded-lg overflow-hidden shrink-0 bg-black/60 relative border border-white/10">
                {cover
                    ? <img src={cover} alt={game.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20"><Gamepad2 size={16} /></div>
                }
                {isRunning && <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className={cn("text-xs font-semibold truncate leading-tight mb-1", isActive ? "text-white" : "text-white/60 group-hover:text-white/90")}>
                    {game.title}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-white/30 font-medium">
                    <Clock size={9} /><span>{formatPlaytime(game.playtime_seconds || 0)}</span>
                </div>
            </div>
            {isActive && <ChevronRight size={14} className="text-white/30 shrink-0" />}
        </button>
    );
}

// ─── Simple label/value row ───────────────────────────────────────────────────
function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
    if (!value || value === "Unknown") return null;
    return (
        <div className="flex items-center gap-3 group/row">
            <span className="text-white/20 group-hover/row:text-accent transition-colors shrink-0">{icon}</span>
            <span className="text-white/35 text-[10px] uppercase tracking-widest font-black w-20 shrink-0">{label}</span>
            <span className="text-white/80 text-xs font-medium truncate">{value}</span>
        </div>
    );
}

// ─── Game logo or title fallback ─────────────────────────────────────────────
function GameTitle({ game }: { game: Game }) {
    const { src: logoSrc, error: logoErr } = useLocalImage(game.logo_path);
    const [failed, setFailed] = useState(false);
    const [prevGameId, setPrevGameId] = useState(game.id);

    if (game.id !== prevGameId) {
        setPrevGameId(game.id);
        setFailed(false);
    }

    const isLogoValid = Boolean(game.logo_path && !logoErr && !failed);

    if (isLogoValid) {
        return (
            <div className="mb-6">
                <img
                    key={game.id}
                    src={logoSrc || undefined}
                    alt={game.title}
                    onError={() => setFailed(true)}
                    className={cn(
                        "block w-auto max-w-[480px] max-h-[160px] object-contain drop-shadow-[0_4px_40px_rgba(0,0,0,0.95)] transition-opacity duration-300",
                        !logoSrc ? "opacity-0" : "opacity-100"
                    )}
                />
            </div>
        );
    }

    return (
        <h1 className="text-6xl font-black tracking-tighter text-white leading-[1] mb-6 drop-shadow-[0_4px_40px_rgba(0,0,0,0.95)]">
            {game.title}
        </h1>
    );
}

// ─── Main Library component ───────────────────────────────────────────────────
export default function Library() {
    const location = useLocation();
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
    const [reviews, setReviews] = useState<SteamReviewsResponse | null>(null);
    const [steamDetails, setSteamDetails] = useState<SteamAppDetails | null>(null);
    const [search, setSearch] = useState("");
    const [showAchievements, setShowAchievements] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

    const mainScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (location.state?.gameId) {
            setActiveGameId(location.state.gameId);
            window.history.replaceState({}, document.title);
        } else if (!activeGameId && allGames.length > 0) {
            setActiveGameId(allGames[0].id);
        }
    }, [allGames, activeGameId, location.state]);

    const activeGame = activeGameId ? gamesById[activeGameId] : null;

    useEffect(() => {
        setShowAchievements(false);
        if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
    }, [activeGame?.id]);

    useEffect(() => {
        if (!activeGame) {
            setAchievements([]);
            setReviews(null);
            setSteamDetails(null);
            return;
        }

        setAchievementsLoading(true);
        let local: Achievement[] = [];

        getAchievements(activeGame.id)
            .then(async (ach: Achievement[]) => {
                local = ach;
                setAchievements(local);
                if (activeGame.steam_app_id && ach.length > 0) {
                    try {
                        const pcts = await fetchSteamAchievementPercentages(activeGame.steam_app_id.toString());
                        if (Object.keys(pcts).length > 0)
                            setAchievements(local.map((a: Achievement) => ({ ...a, global_percent: a.global_percent ?? pcts[a.api_name] ?? null })));
                    } catch (_) { }
                }
            })
            .catch(() => setAchievements([]))
            .finally(() => setAchievementsLoading(false));

        if (activeGame.steam_app_id) {
            const id = activeGame.steam_app_id.toString();
            fetchSteamReviews(id).then(setReviews).catch(() => setReviews(null));
            fetchSteamMetadata(id).then(setSteamDetails).catch(() => setSteamDetails(null));
        } else {
            setReviews(null);
            setSteamDetails(null);
        }
    }, [activeGame?.id]);

    const handleLaunch = async () => {
        if (!activeGame) return;
        runningGames[activeGame.id] ? await forceStopGame(activeGame.id) : await launchGame(activeGame.id);
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
                {
                    label: "Remove Game", icon: <Trash2 size={14} />, danger: true,
                    onClick: async () => {
                        if (confirm(`Remove "${game.title}"?`)) {
                            await invoke("delete_game", { id: game.id });
                            useGameStore.getState().fetchGames();
                        }
                    }
                },
            ],
        });
    }, [setEditGameModalOpen, refreshMetadata]);

    const filteredGames = useMemo(
        () => allGames.filter(g => g.title.toLowerCase().includes(search.toLowerCase())),
        [allGames, search]
    );

    const isRunning = activeGame ? !!runningGames[activeGame.id] : false;
    const earned = achievements.filter(a => a.earned).length;
    const achievePct = achievements.length > 0 ? Math.round((earned / achievements.length) * 100) : 0;

    const rawBg = activeGame?.background_image_path || (activeGame as any)?.background_path;
    const rawCover = activeGame?.cover_image_path || (activeGame as any)?.cover_path;

    const { src: bgSrc, error: bgErr } = useLocalImage(rawBg ? rawBg.split("?pos=")[0] : null);
    const { src: coverSrc, error: coverErr } = useLocalImage(rawCover);

    const bgUrl = bgSrc && !bgErr ? bgSrc : coverSrc && !coverErr ? coverSrc : null;
    const coverUrl = coverSrc && !coverErr ? coverSrc : null;
    const bgPos = rawBg?.includes("?pos=") ? rawBg.split("?pos=")[1].replace("-", " ") : "center top";

    if (allGames.length === 0) {
        return (
            <div className="flex items-center justify-center w-full h-screen">
                <div className="text-center space-y-6 p-16 rounded-[3rem] border border-white/5 bg-white/[0.02] shadow-2xl">
                    <div className="w-20 h-20 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto text-accent">
                        <Gamepad2 size={36} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tight">Your library is empty</h2>
                        <p className="text-white/40 text-xs mt-2 font-medium uppercase tracking-widest">Add your first game to get started.</p>
                    </div>
                    <div className="flex gap-3 justify-center">
                        <button onClick={() => setAddGameModalOpen(true)} className="flex items-center gap-2 bg-accent hover:brightness-110 text-white px-6 py-3 rounded-xl font-bold text-xs tracking-widest uppercase transition-all shadow-lg shadow-accent/20 active:scale-95">
                            <Plus size={16} /> Add Game
                        </button>
                        <button onClick={() => setScannerModalOpen(true)} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-xl font-bold text-xs tracking-widest uppercase transition-all border border-white/10 active:scale-95">
                            <FolderOpen size={16} /> Scan Folders
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 flex overflow-hidden bg-[#08090f]"
            onClick={() => setContextMenu(null)}
        >
            {contextMenu && (
                <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />
            )}

            {/* ── Sidebar ── */}
            <aside className="w-[340px] shrink-0 flex flex-col h-full bg-black/40 backdrop-blur-3xl border-r border-white/5 z-30">
                <div className="px-6 pt-10 pb-5 shrink-0">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-black text-white tracking-widest uppercase">Collection</h2>
                        <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-lg border border-accent/20">
                            {allGames.length}
                        </span>
                    </div>

                    <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search library..."
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-8 py-3 text-white text-sm font-medium outline-none focus:border-accent/40 placeholder:text-white/25 transition-all shadow-inner"
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-3 py-1 space-y-0.5">
                    {filteredGames.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-white/20 text-[10px] font-bold gap-2 uppercase tracking-widest">
                            <Search size={20} className="opacity-30" /> No results
                        </div>
                    ) : filteredGames.map(game => (
                        <SidebarRow
                            key={game.id}
                            game={game}
                            isActive={activeGameId === game.id}
                            onClick={() => { setActiveGameId(game.id); }}
                            onContextMenu={e => handleContextMenu(e, game)}
                        />
                    ))}
                </div>

                <div className="px-5 py-5 shrink-0 border-t border-white/[0.06]">
                    <button
                        onClick={() => setAddGameModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold transition-all uppercase tracking-widest text-[11px]"
                    >
                        <Plus size={16} /> Add New Game
                    </button>
                </div>
            </aside>

            {/* ── Main content area ── */}
            <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <AnimatePresence mode="wait">
                        {bgUrl && (
                            <motion.img
                                key={bgUrl}
                                src={bgUrl}
                                alt=""
                                className="w-full h-full object-cover"
                                style={{ objectPosition: bgPos }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.8 }}
                            />
                        )}
                    </AnimatePresence>
                    <div className="absolute inset-0 bg-[#08090f]/70" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#08090f]/80 via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#08090f] via-[#08090f]/60 to-transparent" />
                </div>

                <div
                    ref={mainScrollRef}
                    className="relative z-10 h-full overflow-y-auto overflow-x-hidden"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    <AnimatePresence mode="wait">
                        {activeGame && (
                            <motion.div
                                key={activeGame.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <div className="h-[60vh] min-h-[460px] pointer-events-none" />

                                <div className="px-12 pb-10 flex items-end gap-10">
                                    <div className="w-[185px] shrink-0">
                                        <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.9)] border border-white/10 bg-black/50 relative group">
                                            {coverUrl
                                                ? <img src={coverUrl} alt={activeGame.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                                : <div className="w-full h-full flex items-center justify-center text-white/10"><Gamepad2 size={48} strokeWidth={1} /></div>
                                            }
                                            {isRunning && (
                                                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-green-500/90 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-green-400/30">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Running</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0 pb-1">
                                        {(activeGame.developer || activeGame.source) && (
                                            <span className="inline-block text-[9px] font-black tracking-widest uppercase bg-white/[0.07] border border-white/10 px-3 py-1.5 rounded-lg text-white/60 mb-5">
                                                {activeGame.developer || activeGame.source}
                                            </span>
                                        )}

                                        <GameTitle game={activeGame} />

                                        <div className="flex items-center flex-wrap gap-5 text-xs text-white/45 font-medium mb-7 bg-black/40 backdrop-blur-md w-fit px-5 py-3 rounded-xl border border-white/[0.07]">
                                            <span className="flex items-center gap-1.5 text-white/80">
                                                <Clock size={13} className="text-accent" />
                                                {formatPlaytime(activeGame.playtime_seconds || 0)}
                                            </span>
                                            {activeGame.last_played && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                                    <span>Last played: <b className="text-white/65 font-semibold">{new Date(activeGame.last_played).toLocaleDateString()}</b></span>
                                                </>
                                            )}
                                            {activeGame.release_date && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                                    <span>Released <b className="text-white/65 font-semibold">{new Date(activeGame.release_date).getFullYear()}</b></span>
                                                </>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={handleLaunch}
                                                className={cn(
                                                    "flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-black text-xs tracking-widest uppercase transition-all active:scale-95 shadow-xl border",
                                                    isRunning
                                                        ? "bg-red-500/90 hover:bg-red-500 text-white border-red-400/40 shadow-red-500/20"
                                                        : "bg-accent hover:brightness-110 text-white border-accent/40 shadow-accent/30"
                                                )}
                                            >
                                                {isRunning
                                                    ? <><Square size={14} fill="currentColor" /> Stop</>
                                                    : <><Play size={14} fill="currentColor" /> Launch</>
                                                }
                                            </button>
                                            <button onClick={() => setEditGameModalOpen(true, activeGame)} title="Edit metadata" className="h-11 w-11 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
                                                <Settings size={16} />
                                            </button>
                                            <button title="Favorite" className="h-11 w-11 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
                                                <Heart size={16} />
                                            </button>
                                            <button onClick={() => refreshMetadata(activeGame.id)} title="Refresh metadata" className="h-11 w-11 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
                                                <RefreshCcw size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-12 pb-10 grid grid-cols-2 gap-5 max-w-4xl relative z-20">
                                    <div className="bg-black/45 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-7">
                                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-5 flex items-center gap-1.5">
                                            <Building2 size={11} className="text-purple-400" /> Game Info
                                        </p>
                                        <div className="space-y-3.5">
                                            <MetaRow icon={<User2 size={13} />} label="Developer" value={activeGame.developer} />
                                            <MetaRow icon={<Building2 size={13} />} label="Publisher" value={activeGame.publisher} />
                                            <MetaRow
                                                icon={<Calendar size={13} />}
                                                label="Released"
                                                value={activeGame.release_date ? new Date(activeGame.release_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : null}
                                            />
                                            <MetaRow icon={<Star size={13} />} label="Genre" value={activeGame.genre} />
                                        </div>
                                    </div>

                                    <div
                                        onClick={() => achievements.length > 0 && setShowAchievements(true)}
                                        className={cn(
                                            "bg-black/45 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-7 flex flex-col justify-between transition-all",
                                            achievements.length > 0
                                                ? "cursor-pointer hover:border-yellow-500/30 hover:bg-black/55 group"
                                                : "opacity-50"
                                        )}
                                    >
                                        <div className="flex items-start justify-between mb-6">
                                            <div>
                                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                                                    <Trophy size={11} className="text-yellow-400" /> Achievements
                                                </p>
                                                <div className="text-5xl font-black text-white tracking-tighter leading-none">
                                                    {earned}
                                                    <span className="text-white/25 text-2xl ml-2">/ {achievements.length || "—"}</span>
                                                </div>
                                            </div>
                                            {achievements.length > 0 && (
                                                <div className="w-9 h-9 rounded-xl bg-white/[0.04] group-hover:bg-yellow-500/10 flex items-center justify-center text-white/20 group-hover:text-yellow-400 transition-all">
                                                    <ExternalLink size={14} />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden mb-3">
                                                <motion.div
                                                    className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${achievePct}%` }}
                                                    transition={{ duration: 0.9, ease: "circOut", delay: 0.15 }}
                                                />
                                            </div>
                                            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">{achievePct}% complete</p>
                                        </div>
                                    </div>
                                </div>

                                {activeGame.description && (
                                    <div className="px-12 pt-10 pb-10 border-t border-white/[0.06] max-w-4xl">
                                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-6 flex items-center gap-1.5">
                                            <Info size={11} className="text-blue-400" /> About this game
                                        </p>
                                        <div
                                            className={steamHtml}
                                            dangerouslySetInnerHTML={{ __html: activeGame.description }}
                                        />
                                    </div>
                                )}

                                {steamDetails?.pc_requirements && (steamDetails.pc_requirements.minimum || steamDetails.pc_requirements.recommended) && (
                                    <div className="px-12 pt-10 pb-10 border-t border-white/[0.06] max-w-5xl">
                                        <h2 className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-6">System Requirements</h2>
                                        <div className="grid grid-cols-2 gap-5">
                                            {steamDetails.pc_requirements.minimum && (
                                                <div
                                                    className={cn("bg-black/40 border border-white/[0.08] rounded-2xl p-6", reqHtml)}
                                                    dangerouslySetInnerHTML={{ __html: steamDetails.pc_requirements.minimum }}
                                                />
                                            )}
                                            {steamDetails.pc_requirements.recommended && (
                                                <div
                                                    className={cn("bg-black/40 border border-white/[0.08] rounded-2xl p-6", reqHtml)}
                                                    dangerouslySetInnerHTML={{ __html: steamDetails.pc_requirements.recommended }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {steamDetails && (steamDetails.metacritic || steamDetails.genres?.length || steamDetails.categories?.length) && (
                                    <div className="px-12 pt-10 pb-10 border-t border-white/[0.06] max-w-4xl flex flex-wrap gap-10">
                                        {steamDetails.metacritic && (
                                            <div>
                                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Metacritic</p>
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white",
                                                        steamDetails.metacritic.score >= 75 ? "bg-green-600" :
                                                            steamDetails.metacritic.score >= 50 ? "bg-yellow-600" : "bg-red-600"
                                                    )}>
                                                        {steamDetails.metacritic.score}
                                                    </div>
                                                    <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Critic Score</span>
                                                </div>
                                            </div>
                                        )}
                                        {steamDetails.genres && steamDetails.genres.length > 0 && (
                                            <div>
                                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Genres</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {steamDetails.genres.map((g: { description: string }) => (
                                                        <span key={g.description} className="bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                            {g.description}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {steamDetails.categories && steamDetails.categories.length > 0 && (
                                            <div>
                                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Features</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {steamDetails.categories.map((c: { description: string }) => (
                                                        <span key={c.description} className="bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 rounded-lg text-[10px] text-white/50 font-medium">
                                                            {c.description}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {reviews && reviews.reviews.length > 0 && (
                                    <div className="px-12 pt-10 pb-16 border-t border-white/[0.06] max-w-4xl">
                                        <div className="mb-6">
                                            <h2 className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                <ThumbsUp size={11} className="text-green-400" /> Player Reviews
                                            </h2>
                                            <p className="text-[11px] text-white/40 mt-2">
                                                <span className="text-accent font-bold">{reviews.query_summary.review_score_desc}</span>
                                                {" · "}{reviews.query_summary.total_reviews.toLocaleString()} reviews
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {reviews.reviews.slice(0, 4).map((rev: SteamReview, i: number) => (
                                                <div key={i} className="bg-black/40 border border-white/[0.07] rounded-2xl p-5 hover:bg-black/50 transition-colors">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-full bg-black/50 overflow-hidden border border-white/10 shrink-0">
                                                                {rev.author.avatar && <img src={rev.author.avatar} alt="" className="w-full h-full object-cover" />}
                                                            </div>
                                                            <div>
                                                                <p className="text-white text-[11px] font-bold">{rev.author.personaname}</p>
                                                                <p className="text-white/25 text-[9px] uppercase tracking-widest">{Math.round(rev.author.playtime_forever / 60)}h played</p>
                                                            </div>
                                                        </div>
                                                        <div className={cn(
                                                            "flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black uppercase",
                                                            rev.voted_up ? "bg-accent/10 border-accent/20 text-accent" : "bg-red-500/10 border-red-500/20 text-red-400"
                                                        )}>
                                                            {rev.voted_up ? <ThumbsUp size={9} /> : <ThumbsDown size={9} />}
                                                            <span className="ml-1">{rev.voted_up ? "Yes" : "No"}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-white/45 text-[11px] leading-relaxed line-clamp-4">{rev.review}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!activeGame.description && !steamDetails && !reviews && (
                                    <div className="px-12 py-16 border-t border-white/[0.06] flex flex-col items-center text-center">
                                        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-5">
                                            <Gamepad2 size={28} className="text-white/15" />
                                        </div>
                                        <h3 className="text-lg font-black text-white uppercase tracking-wide mb-2">No metadata linked</h3>
                                        <p className="text-white/30 text-xs max-w-sm mb-6 leading-relaxed">
                                            Link this game to a Steam App ID to pull descriptions, reviews, requirements, and more.
                                        </p>
                                        <button
                                            onClick={() => setEditGameModalOpen(true, activeGame)}
                                            className="flex items-center gap-2 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-bold px-6 py-3 rounded-xl border border-accent/20 transition-all uppercase tracking-widest"
                                        >
                                            <Settings size={14} /> Configure Steam ID
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ACHIEVEMENTS MODAL */}
            <AnimatePresence>
                {showAchievements && activeGame && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-xl flex items-center justify-center p-8"
                    >
                        <div className="absolute inset-0" onClick={() => setShowAchievements(false)} />
                        <motion.div
                            initial={{ scale: 0.96, y: 16 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.96, y: 16 }}
                            transition={{ type: "spring", damping: 28, stiffness: 320 }}
                            className="relative w-full max-w-7xl max-h-[90vh] bg-[#0b0e14] border border-white/10 rounded-3xl shadow-[0_40px_100px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-8 py-6 border-b border-white/[0.06] shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400">
                                        <Trophy size={22} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-white uppercase tracking-tight">{activeGame.title}</h2>
                                        <p className="text-white/30 text-[10px] font-bold tracking-widest uppercase">Achievement Archive</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAchievements(false)}
                                    className="w-10 h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 border border-white/[0.06] flex items-center justify-center text-white/40 hover:text-white transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8" style={{ scrollbarWidth: "none" }}>
                                {achievementsLoading ? (
                                    <div className="flex flex-col items-center justify-center h-48 gap-3 opacity-40">
                                        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                                        <p className="text-[10px] font-black tracking-widest uppercase">Syncing...</p>
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