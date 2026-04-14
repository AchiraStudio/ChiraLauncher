import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
import { toast } from "sonner";
import { smartAudio } from "./services/SmartAudio";
import {
    Clock, Trophy, Heart, Settings, FolderOpen, Play, Square,
    Gamepad2, Trash2, RefreshCcw, Plus, Search,
    User2, Building2, X, ExternalLink, ThumbsUp, ThumbsDown, Star, Info, Link2, Unlink, ShieldAlert, Hash, Fingerprint, ChevronDown, ChevronUp
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "./components/ui/ContextMenu";
import { motion, AnimatePresence } from "framer-motion";
import { AchievementGrid } from "./components/game/AchievementGrid";
import { RemoveGameModal } from "./components/modals/RemoveGameModal";
import type { Game } from "./types/game";
import { useLocalImage } from "./hooks/useLocalImage";

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

function SidebarRow({ game, isActive, onClick, onContextMenu, onAction }: {
    game: Game; isActive: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void; onAction: () => void;
}) {
    const isRunning = !!useProcessStore((s: any) => s.running[game.id]);
    const { src: cover } = useLocalImage(game.cover_image_path || (game as any).cover_path);

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={cn(
                "w-full flex items-center gap-4 px-3 py-2.5 rounded-2xl transition-all text-left outline-none group relative overflow-hidden cursor-pointer my-0.5",
                isActive ? "bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]" : "hover:bg-white/[0.04]"
            )}
        >
            {isActive && (
                <motion.div layoutId="activeGameIndicator" className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-cyan-400 rounded-r-full shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            )}

            <div className="w-11 h-[60px] rounded-xl overflow-hidden shrink-0 bg-black/60 relative border border-white/5 shadow-md">
                {cover
                    ? <img src={cover} alt={game.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20"><Gamepad2 size={16} /></div>
                }
                {isRunning && <div className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className={cn("text-[13px] font-bold truncate leading-tight transition-colors", isActive ? "text-white" : "text-white/70 group-hover:text-white")}>
                    {game.title}
                </p>

                <div className="flex items-center gap-1.5 text-[10px] text-white/40 font-medium mt-1">
                    <Clock size={10} className={cn(isRunning && "text-green-400")} />
                    <span className={cn(isRunning && "text-green-400")}>{formatPlaytime(game.playtime_seconds || 0)}</span>
                </div>
            </div>

            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onAction(); }}
                    data-no-press-sound="true"
                    className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-md active:scale-90",
                        isRunning ? "bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white" : "bg-white/10 text-white hover:bg-cyan-400 hover:text-black"
                    )}
                    title={isRunning ? "Stop Game" : "Quick Launch"}
                >
                    {isRunning ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                </button>
            </div>
        </div>
    );
}

function GameTitle({ game }: { game: Game }) {
    const { src: logoSrc, error: logoErr } = useLocalImage(game.logo_path);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [game.id, game.logo_path]);

    const hasLogo = Boolean(game.logo_path && !logoErr && !imgError && logoSrc);

    return (
        <div className="mb-6 min-h-[120px] flex items-end">
            <AnimatePresence mode="wait">
                {hasLogo ? (
                    <motion.div
                        key="logo"
                        initial={{ opacity: 0, x: -10, filter: "blur(10px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, x: 10, filter: "blur(10px)" }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="relative group"
                    >
                        <img
                            src={logoSrc!}
                            alt=""
                            className="absolute inset-0 w-auto h-[120px] object-contain blur-3xl opacity-50 brightness-150 saturate-150 scale-110 pointer-events-none"
                        />
                        <img
                            src={logoSrc!}
                            alt={game.title}
                            onError={() => setImgError(true)}
                            className="relative block w-auto max-w-[600px] h-[120px] object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.9)] transition-transform duration-700 group-hover:scale-[1.02]"
                        />
                    </motion.div>
                ) : (
                    <motion.h1
                        key="text"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.4 }}
                        className="text-6xl lg:text-7xl font-black tracking-tighter text-white leading-[0.9] max-w-4xl drop-shadow-[0_4px_40px_rgba(0,0,0,0.8)]"
                    >
                        {game.title}
                    </motion.h1>
                )}
            </AnimatePresence>
        </div>
    );
}

function AboutSection({ description }: { description: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="relative mt-8 border-t border-white/10 pt-16">
            <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
                <Info size={15} className="text-cyan-400" /> About this game
            </p>
            <div className={cn(
                "relative bg-black/40 backdrop-blur-3xl px-10 pt-10 rounded-[2rem] border border-white/10 shadow-2xl transition-all duration-500 overflow-hidden",
                expanded ? "max-h-[5000px] pb-10" : "max-h-[350px] pb-0"
            )}>
                <div className={cn(steamHtml, "max-w-4xl")} dangerouslySetInnerHTML={{ __html: description }} />

                {!expanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0b0e14] via-[#0b0e14]/80 to-transparent flex items-end justify-center pb-6">
                        <button onClick={() => setExpanded(true)} className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-lg flex items-center gap-2">
                            Read More <ChevronDown size={14} />
                        </button>
                    </div>
                )}
                {expanded && (
                    <div className="mt-8 flex justify-center border-t border-white/5 pt-8">
                        <button onClick={() => setExpanded(false)} className="bg-white/5 hover:bg-white/10 border border-white/5 text-white/50 hover:text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2">
                            Show Less <ChevronUp size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

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
    const [gameToRemove, setGameToRemove] = useState<Game | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [achievementsLoading, setAchievementsLoading] = useState(false);
    const [reviews, setReviews] = useState<SteamReviewsResponse | null>(null);
    const [steamDetails, setSteamDetails] = useState<SteamAppDetails | null>(null);
    const [search, setSearch] = useState("");
    const [showAchievements, setShowAchievements] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

    const mainScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const activeGame = activeGameId ? gamesById[activeGameId] : null;
        if (activeGame) {
            smartAudio.playGameBGM(activeGame.id, activeGame.custom_bgm_path || null);
        } else {
            smartAudio.playGlobalBGM();
        }
        // Removed cleanup function to prevent global BGM resetting when navigating games
    }, [activeGameId, gamesById]);


    useEffect(() => {
        invoke("update_tray").catch(e => console.error("Failed to sync tray:", e));
    }, [allGames.length, runningGames]);

    useEffect(() => {
        const unlistenStop = listen<string>("stop-game-requested", async (event) => {
            const gameId = event.payload;
            if (gameId) {
                await forceStopGame(gameId);
            }
        });

        return () => {
            unlistenStop.then(f => f());
        };
    }, []);

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

    const handleLaunch = async (gameToLaunch: Game) => {
        if (!gameToLaunch) return;
        smartAudio.playUI('play-sound.mp3');
        runningGames[gameToLaunch.id] ? await forceStopGame(gameToLaunch.id) : await launchGame(gameToLaunch.id);
    };

    const handleCreateShortcut = useCallback(async (gameToShortcut: Game) => {
        try {
            await invoke("create_all_shortcuts", {
                gameId: gameToShortcut.id,
                title: gameToShortcut.title,
                exePath: gameToShortcut.executable_path,
                installDir: gameToShortcut.install_dir || ""
            });
            toast.success("Shortcuts Created", { description: `${gameToShortcut.title} added to Desktop & Start Menu.` });
        } catch (e) {
            toast.error("Failed to create shortcut", { description: String(e) });
        }
    }, []);

    const handleRemoveShortcut = useCallback(async (gameToShortcut: Game) => {
        try {
            await invoke("remove_all_shortcuts", { gameId: gameToShortcut.id, title: gameToShortcut.title });
            toast.success("Shortcuts Removed", { description: `${gameToShortcut.title} shortcuts cleared.` });
        } catch (e) {
            toast.error("Failed to remove shortcuts", { description: String(e) });
        }
    }, []);

    const confirmRemoveGame = async () => {
        if (!gameToRemove) return;
        try {
            await invoke("delete_game", { id: gameToRemove.id });
            await useGameStore.getState().fetchGames();
            toast.success("Game Removed", { description: `${gameToRemove.title} has been removed from your library.` });
        } catch (e) {
            toast.error("Failed to remove game", { description: String(e) });
        } finally {
            setGameToRemove(null);
        }
    };

    const handleContextMenu = useCallback((e: React.MouseEvent, game: Game) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX, y: e.clientY,
            items: [
                { label: "Edit Metadata", icon: <Settings size={14} />, onClick: () => setEditGameModalOpen(true, game) },
                { label: "Create Shortcuts", icon: <Link2 size={14} />, onClick: () => handleCreateShortcut(game) },
                { label: "Remove Shortcuts", icon: <Unlink size={14} />, onClick: () => handleRemoveShortcut(game) },
                { label: "Open Location", icon: <FolderOpen size={14} />, onClick: async () => invoke("open_path_in_explorer", { path: game.executable_path.replace(/\//g, "\\") }) },
                { label: "", separator: true, onClick: () => { } },
                { label: "Sync Metadata", icon: <RefreshCcw size={14} />, onClick: () => refreshMetadata(game.id) },
                {
                    label: "Remove Game", icon: <Trash2 size={14} />, danger: true,
                    onClick: () => setGameToRemove(game)
                },
            ],
        });
    }, [setEditGameModalOpen, refreshMetadata, handleCreateShortcut, handleRemoveShortcut]);

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
            <div className="absolute inset-0 flex items-center justify-center bg-[#08090f]">
                <div className="text-center space-y-6 p-16 relative z-10">
                    <div className="w-24 h-24 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center mx-auto text-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
                        <Gamepad2 size={40} strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight drop-shadow-md">Library Empty</h2>
                        <p className="text-white/40 text-sm mt-3 font-medium uppercase tracking-widest">Connect your first title to begin.</p>
                    </div>
                    <div className="flex gap-4 justify-center pt-6">
                        <button onClick={() => setAddGameModalOpen(true)} className="flex items-center gap-3 bg-gradient-to-r from-cyan-400 to-cyan-300 text-black px-10 py-4 rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:brightness-110 active:scale-95">
                            <Plus size={18} strokeWidth={3} /> Add Game
                        </button>
                        <button onClick={() => setScannerModalOpen(true)} className="flex items-center gap-3 bg-white/5 hover:bg-white/10 text-white px-10 py-4 rounded-2xl font-bold text-xs tracking-widest uppercase transition-all border border-white/10 active:scale-95">
                            <FolderOpen size={18} /> Scan PC
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="absolute inset-0 flex overflow-hidden bg-[#08090f]"
            onClick={() => setContextMenu(null)}
        >
            <AnimatePresence>
                {contextMenu && (
                    <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {gameToRemove && (
                    <RemoveGameModal
                        isOpen={!!gameToRemove}
                        game={gameToRemove}
                        onClose={() => setGameToRemove(null)}
                        onConfirm={confirmRemoveGame}
                    />
                )}
            </AnimatePresence>

            <div className="absolute inset-0 z-0 pointer-events-none">
                <AnimatePresence mode="wait">
                    {bgUrl && (
                        <motion.img
                            key={bgUrl}
                            src={bgUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover brightness-[0.4] saturate-[1.2]"
                            style={{ objectPosition: bgPos }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.8 }}
                        />
                    )}
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-r from-[#08090f] via-[#08090f]/90 to-transparent w-full md:w-[70%]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08090f] via-[#08090f]/40 to-transparent" />
            </div>

            <div className="relative z-10 flex w-full h-full">

                <div className="w-[320px] lg:w-[380px] shrink-0 h-full p-6 pr-3 flex flex-col">
                    <aside className="w-full flex-1 flex flex-col bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_32px_128px_rgba(0,0,0,0.8)] overflow-hidden">
                        <div className="px-6 pt-8 pb-5 shrink-0">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-sm font-black text-white tracking-widest uppercase drop-shadow-md">Collection</h2>
                                <span className="text-[11px] font-black text-cyan-400 bg-cyan-400/10 px-3 py-1 rounded-lg border border-cyan-400/20">
                                    {allGames.length}
                                </span>
                            </div>

                            <div className="relative group">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-cyan-400 transition-colors" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Find a game..."
                                    className="w-full bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 rounded-2xl pl-12 pr-10 py-4 text-white text-sm font-bold outline-none focus:border-cyan-400/40 focus:bg-white/[0.06] placeholder:text-white/20 transition-all shadow-inner backdrop-blur-md"
                                />
                                {search && (
                                    <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 space-y-1">
                            {filteredGames.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-white/20 text-xs font-bold gap-3 uppercase tracking-widest">
                                    <Search size={28} strokeWidth={2} className="opacity-40" /> No matches
                                </div>
                            ) : filteredGames.map(game => (
                                <SidebarRow
                                    key={game.id}
                                    game={game}
                                    isActive={activeGameId === game.id}
                                    onClick={() => { setActiveGameId(game.id); }}
                                    onContextMenu={e => handleContextMenu(e, game)}
                                    onAction={() => handleLaunch(game)}
                                />
                            ))}
                        </div>

                        <div className="shrink-0 p-5 pt-4">
                            <button
                                onClick={() => setAddGameModalOpen(true)}
                                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-white font-black transition-all uppercase tracking-widest text-[11px] backdrop-blur-md"
                            >
                                <Plus size={16} strokeWidth={2.5} /> Link New Game
                            </button>
                        </div>
                    </aside>
                </div>

                <main
                    ref={mainScrollRef}
                    className="flex-1 h-full overflow-y-auto overflow-x-hidden p-6 pl-3 flex flex-col"
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
                                className="w-full max-w-[1200px] mx-auto pb-24"
                            >
                                <div className="h-[25vh] min-h-[120px] pointer-events-none" />

                                <div className="flex flex-col xl:flex-row items-start gap-12 mb-16">
                                    <div className="w-[260px] shrink-0 flex flex-col gap-5">
                                        <div className="w-full aspect-[2/3] rounded-[2rem] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.9)] border border-white/10 bg-black/60 relative group">
                                            {coverUrl
                                                ? <img src={coverUrl} alt={activeGame.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                                : <div className="w-full h-full flex items-center justify-center text-white/10"><Gamepad2 size={48} strokeWidth={1} /></div>
                                            }
                                            {isRunning && (
                                                <div className="absolute top-4 left-4 flex items-center gap-2 bg-green-500/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-green-400/30 shadow-lg">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Running</span>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => handleLaunch(activeGame)}
                                            data-no-press-sound="true"
                                            className={cn(
                                                "w-full py-4 rounded-[1.25rem] font-black text-[13px] tracking-widest uppercase transition-all shadow-xl flex items-center justify-center gap-2.5",
                                                isRunning
                                                    ? "bg-red-500/90 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] active:scale-95"
                                                    : "bg-gradient-to-r from-cyan-400 to-cyan-300 hover:brightness-110 text-black shadow-[0_0_30px_rgba(34,211,238,0.35)] active:scale-95"
                                            )}
                                        >
                                            {isRunning
                                                ? <><Square size={16} fill="currentColor" /> Stop Game</>
                                                : <><Play size={16} fill="currentColor" /> Launch Game</>
                                            }
                                        </button>

                                        <div className="grid grid-cols-3 gap-3">
                                            <button onClick={() => setEditGameModalOpen(true, activeGame)} title="Edit metadata" className="h-14 rounded-2xl bg-black/40 hover:bg-black/60 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all backdrop-blur-3xl shadow-xl">
                                                <Settings size={20} />
                                            </button>
                                            <button onClick={() => useGameStore.getState().toggleFavorite(activeGame.id)} title="Favorite" className="h-14 rounded-2xl bg-black/40 hover:bg-black/60 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all backdrop-blur-3xl shadow-xl">
                                                <Heart size={20} fill={activeGame.is_favorite ? "currentColor" : "none"} className={activeGame.is_favorite ? "text-pink-500" : ""} />
                                            </button>
                                            <button onClick={() => refreshMetadata(activeGame.id)} disabled={useGameStore.getState().isRefreshing[activeGame.id]} title="Refresh metadata" className="h-14 rounded-2xl bg-black/40 hover:bg-black/60 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all backdrop-blur-3xl shadow-xl disabled:opacity-50">
                                                <RefreshCcw size={20} className={cn(useGameStore.getState().isRefreshing[activeGame.id] && "animate-spin")} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0 pt-2">
                                        <GameTitle game={activeGame} />

                                        <div className="flex flex-wrap items-center gap-3 mb-10">
                                            {activeGame.developer && (
                                                <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/80 flex items-center gap-2 backdrop-blur-md">
                                                    <User2 size={14} className="text-cyan-400" /> {activeGame.developer}
                                                </span>
                                            )}
                                            {activeGame.publisher && activeGame.publisher !== activeGame.developer && (
                                                <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/80 flex items-center gap-2 backdrop-blur-md">
                                                    <Building2 size={14} className="text-cyan-400" /> {activeGame.publisher}
                                                </span>
                                            )}
                                            {activeGame.crack_type && activeGame.crack_type !== "unknown" && (
                                                <span className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2 backdrop-blur-md">
                                                    <ShieldAlert size={14} /> {activeGame.crack_type}
                                                </span>
                                            )}
                                            {activeGame.steam_app_id && (
                                                <span className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] font-black uppercase tracking-widest text-purple-400 flex items-center gap-2 backdrop-blur-md">
                                                    <Hash size={14} /> AppID: {activeGame.steam_app_id}
                                                </span>
                                            )}
                                            {activeGame.genre && (
                                                <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/80 flex items-center gap-2 backdrop-blur-md">
                                                    <Star size={14} className="text-yellow-400" /> {activeGame.genre}
                                                </span>
                                            )}
                                            {activeGame.id && (
                                                <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-mono uppercase tracking-widest text-white/40 flex items-center gap-2 backdrop-blur-md" title="Internal Game ID">
                                                    <Fingerprint size={14} className="text-white/20" /> {activeGame.id}
                                                </span>
                                            )}
                                        </div>

                                        <div className="inline-flex items-center flex-wrap gap-6 px-6 py-4 rounded-[1.25rem] bg-black/50 border border-white/10 backdrop-blur-2xl text-xs font-bold text-white/50 mb-12 shadow-2xl">
                                            <span className="flex items-center gap-2.5 text-cyan-400">
                                                <Clock size={16} />
                                                {formatPlaytime(activeGame.playtime_seconds || 0)}
                                            </span>
                                            {activeGame.last_played && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                                    <span>Last played: <span className="text-white/90">{new Date(activeGame.last_played).toLocaleDateString()}</span></span>
                                                </>
                                            )}
                                            {activeGame.release_date && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                                    <span>Released: <span className="text-white/90">{new Date(activeGame.release_date).getFullYear()}</span></span>
                                                </>
                                            )}
                                        </div>

                                        <div
                                            onClick={() => achievements.length > 0 && setShowAchievements(true)}
                                            className={cn(
                                                "bg-black/50 backdrop-blur-3xl rounded-[2rem] p-8 border border-white/10 shadow-2xl flex flex-col justify-between transition-all",
                                                achievements.length > 0
                                                    ? "cursor-pointer hover:border-yellow-500/40 hover:bg-black/70 group"
                                                    : "opacity-60"
                                            )}
                                        >
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2.5">
                                                        <Trophy size={14} className="text-yellow-400" /> Progress
                                                    </h3>
                                                    <div className="text-5xl font-black text-white tracking-tighter drop-shadow-md">
                                                        {earned} <span className="text-white/30 text-2xl font-bold">/ {achievements.length || "—"}</span>
                                                    </div>
                                                </div>
                                                {achievements.length > 0 && (
                                                    <button className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/30 group-hover:text-yellow-400 group-hover:bg-yellow-500/10 transition-colors border border-white/5 group-hover:border-yellow-500/20">
                                                        <ExternalLink size={16} />
                                                    </button>
                                                )}
                                            </div>
                                            <div>
                                                <div className="h-2 w-full bg-white/10 rounded-full mb-4 overflow-hidden shadow-inner border border-white/[0.02]">
                                                    <motion.div
                                                        className="h-full bg-yellow-400 rounded-full shadow-[0_0_12px_rgba(250,204,21,0.5)]"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${achievePct}%` }}
                                                        transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
                                                    />
                                                </div>
                                                <p className="text-[10px] font-bold text-white/50 tracking-widest uppercase">{achievePct}% Completed</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {activeGame.description && (
                                    <AboutSection description={activeGame.description} />
                                )}

                                {steamDetails?.pc_requirements && (steamDetails.pc_requirements.minimum || steamDetails.pc_requirements.recommended) && (
                                    <div className="mt-16 border-t border-white/10 pt-16">
                                        <h2 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-10">System Requirements</h2>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            {steamDetails.pc_requirements.minimum && (
                                                <div
                                                    className={cn("bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-10 shadow-2xl", reqHtml)}
                                                    dangerouslySetInnerHTML={{ __html: steamDetails.pc_requirements.minimum }}
                                                />
                                            )}
                                            {steamDetails.pc_requirements.recommended && (
                                                <div
                                                    className={cn("bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-10 shadow-2xl", reqHtml)}
                                                    dangerouslySetInnerHTML={{ __html: steamDetails.pc_requirements.recommended }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {steamDetails && (steamDetails.metacritic || steamDetails.genres?.length || steamDetails.categories?.length) && (
                                    <div className="mt-16 border-t border-white/10 pt-16 flex flex-wrap gap-16">
                                        {steamDetails.metacritic && (
                                            <div>
                                                <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-5">Metacritic</p>
                                                <div className="flex items-center gap-5">
                                                    <div className={cn(
                                                        "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-2xl border border-white/10",
                                                        steamDetails.metacritic.score >= 75 ? "bg-green-500" :
                                                            steamDetails.metacritic.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                                                    )}>
                                                        {steamDetails.metacritic.score}
                                                    </div>
                                                    <span className="text-white/50 text-xs font-bold uppercase tracking-[0.2em] leading-tight">Critic<br />Score</span>
                                                </div>
                                            </div>
                                        )}
                                        {steamDetails.genres && steamDetails.genres.length > 0 && (
                                            <div>
                                                <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-5">Genres</p>
                                                <div className="flex flex-wrap gap-3">
                                                    {steamDetails.genres.map((g: { description: string }) => (
                                                        <span key={g.description} className="bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-sm backdrop-blur-md">
                                                            {g.description}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {reviews && reviews.reviews.length > 0 && (
                                    <div className="mt-16 border-t border-white/10 pt-16 pb-20">
                                        <div className="mb-10">
                                            <h2 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-3 flex items-center gap-3">
                                                <ThumbsUp size={15} className="text-green-400" /> Player Reviews
                                            </h2>
                                            <p className="text-sm text-white/40 font-medium">
                                                <span className="text-cyan-400 font-bold">{reviews.query_summary.review_score_desc}</span>
                                                {" · "}{reviews.query_summary.total_reviews.toLocaleString()} reviews
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                            {reviews.reviews.slice(0, 4).map((rev: SteamReview, i: number) => (
                                                <div key={i} className="bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 hover:bg-black/60 transition-colors shadow-2xl">
                                                    <div className="flex items-center justify-between mb-5">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-full bg-black/40 overflow-hidden border border-white/10 shrink-0 shadow-inner flex items-center justify-center">
                                                                {rev.author.avatar ? (
                                                                    <img src={rev.author.avatar} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <User2 size={20} className="text-white/30" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <p className="text-white text-sm font-bold">{rev.author.personaname}</p>
                                                                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">{Math.round(rev.author.playtime_forever / 60)}h played</p>
                                                            </div>
                                                        </div>
                                                        <div className={cn(
                                                            "flex items-center gap-2 px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest shadow-md backdrop-blur-md",
                                                            rev.voted_up ? "bg-cyan-400/10 border-cyan-400/20 text-cyan-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                                                        )}>
                                                            {rev.voted_up ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}
                                                            <span>{rev.voted_up ? "Yes" : "No"}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-white/60 text-sm leading-relaxed line-clamp-4">{rev.review}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>

            <AnimatePresence>
                {showAchievements && activeGame && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-8"
                    >
                        <div className="absolute inset-0" onClick={() => setShowAchievements(false)} />
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="relative w-full max-w-7xl max-h-[90vh] bg-[#0b0e14]/80 border border-white/10 rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden backdrop-blur-xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-10 py-8 border-b border-white/5 shrink-0 bg-white/[0.02]">
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 shadow-inner">
                                        <Trophy size={26} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">{activeGame.title}</h2>
                                        <p className="text-white/40 text-[11px] font-bold tracking-widest uppercase mt-1">Achievement Archive</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAchievements(false)}
                                    className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all shadow-md"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-10 bg-black/20" style={{ scrollbarWidth: "none" }}>
                                {achievementsLoading ? (
                                    <div className="flex flex-col items-center justify-center h-64 gap-4 opacity-40">
                                        <div className="w-10 h-10 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                                        <p className="text-[11px] font-black tracking-[0.2em] text-cyan-400 uppercase">Synchronizing...</p>
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