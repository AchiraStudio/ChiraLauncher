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
    type SteamReviewsResponse, type SteamAppDetails
} from "./services/steamService";
import { cn } from "./lib/utils";
import { formatPlaytime } from "./lib/format";
import { toast } from "sonner";
import { smartAudio } from "./services/SmartAudio";
import {
    Clock, Trophy, Heart, Settings, FolderOpen, Play, Square,
    Gamepad2, Trash2, RefreshCcw, Plus, Search,
    User2, Building2, X, ExternalLink, Star, Link2, Unlink, ShieldAlert, Hash, Fingerprint
} from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "./components/ui/ContextMenu";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { AchievementGrid } from "./components/game/AchievementGrid";
import { RemoveGameModal } from "./components/modals/RemoveGameModal";
import type { Game } from "./types/game";
import { useLocalImage } from "./hooks/useLocalImage";
import { SteamDetails } from "./components/library/SteamDetails";

import { SidebarRow } from "./components/library/SidebarRow";
import { GameTitle } from "./components/library/GameTitle";
import { AboutSection } from "./components/library/AboutSection";
export default function Library() {
    const location = useLocation();
    const gamesById = useGameStore((s: any) => s.gamesById);
    const reorderGames = useGameStore((s: any) => s.reorderGames);
    const allGames: Game[] = useMemo(
        () => Object.values(gamesById as Record<string, Game>).sort((a, b) => {
            if (a.sort_order !== b.sort_order) {
                return (a.sort_order || 0) - (b.sort_order || 0);
            }
            return a.title.localeCompare(b.title);
        }),
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
    const [orderedGames, setOrderedGames] = useState<Game[]>([]);
    const [showAchievements, setShowAchievements] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

    const mainScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const hasRunning = Object.keys(runningGames).length > 0;
        smartAudio.setGameRunning(hasRunning);
    }, [runningGames]);

    useEffect(() => {
        const activeGame = activeGameId ? gamesById[activeGameId] : null;
        if (activeGame) {
            const paths = activeGame.custom_bgm_paths?.length > 0 
                ? activeGame.custom_bgm_paths 
                : (activeGame.custom_bgm_path ? [activeGame.custom_bgm_path] : []);
                
            smartAudio.playGameBGM(activeGame.id, paths);
        } else {
            smartAudio.playGlobalBGM();
        }
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

    // ── FIXED: SMART SHORTCUT CREATOR ──
    const handleCreateShortcut = useCallback(async (gameToShortcut: Game) => {
        try {
            const isLauncher = gameToShortcut.execution_method === "auto_launcher" || gameToShortcut.execution_method === "manual_launcher";
            const targetExe = isLauncher && gameToShortcut.launcher_path && gameToShortcut.launcher_path.trim() !== ""
                ? gameToShortcut.launcher_path 
                : gameToShortcut.executable_path;

            await invoke("create_all_shortcuts", {
                gameId: gameToShortcut.id,
                title: gameToShortcut.title,
                exePath: targetExe,
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
        e.stopPropagation();
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

    useEffect(() => {
        setOrderedGames(filteredGames);
    }, [filteredGames]);

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
            <div className="absolute inset-0 flex items-center justify-center bg-[#08090f] radar-grid">
                <div className="text-center space-y-6 p-16 relative z-10 tech-card max-w-md w-full">
                    <div className="w-24 h-24 flex items-center justify-center mx-auto text-accent shadow-[0_0_40px_rgba(var(--color-accent),0.15)] tech-card-sm relative z-10">
                        <Gamepad2 size={40} strokeWidth={1.5} className="relative z-10" />
                    </div>
                    <div className="relative z-10">
                        <h2 className="text-4xl font-black text-white uppercase tracking-tight drop-shadow-md">Library Empty</h2>
                        <p className="text-white/40 text-sm mt-3 font-medium uppercase tracking-widest">Connect your first title to begin.</p>
                    </div>
                    <div className="flex gap-4 justify-center pt-6 relative z-10">
                        <button onClick={() => setAddGameModalOpen(true)} className="flex items-center gap-3 bg-gradient-to-r from-accent to-accent/80 text-black px-10 py-4 rounded-xl font-black text-xs tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(var(--color-accent),0.3)] hover:brightness-110 active:scale-95">
                            <Plus size={18} strokeWidth={3} /> Add Game
                        </button>
                        <button onClick={() => setScannerModalOpen(true)} className="flex items-center gap-3 bg-white/5 hover:bg-white/10 text-white px-10 py-4 rounded-xl font-bold text-xs tracking-widest uppercase transition-all border border-white/5 active:scale-95">
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
                            className="absolute inset-0 w-full h-full object-cover brightness-[0.5] saturate-[1.3] blur-[2px] scale-105"
                            style={{ objectPosition: bgPos }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.2, ease: "easeOut" }}
                        />
                    )}
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-r from-[#08090f] via-[#08090f]/80 to-transparent w-full md:w-[60%]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08090f] via-[#08090f]/60 to-transparent" />
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-accent/10 blur-[200px] rounded-full mix-blend-screen opacity-60" />
            </div>

            <div className="relative z-10 flex w-full h-full">

                <div className="w-[320px] lg:w-[400px] shrink-0 h-full p-6 pr-4 flex flex-col relative">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl border-r border-white/5 pointer-events-none" />
                    
                    <div className="w-full flex-1 flex flex-col overflow-hidden relative z-10">
                        <div className="px-4 pt-8 pb-6 shrink-0">
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-xl font-black text-white tracking-tight drop-shadow-md">COLLECTION</h2>
                                <span className="text-[11px] font-black text-accent bg-accent/10 px-3 py-1 rounded-xl border border-accent/20 shadow-[0_0_15px_rgba(var(--color-accent),0.2)]">
                                    {allGames.length} GAMES
                                </span>
                            </div>

                            <div className="relative group">
                                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Find a game..."
                                    className="w-full bg-black/40 hover:bg-black/60 border border-white/10 rounded-2xl pl-12 pr-10 py-4 text-white text-sm font-bold outline-none focus:border-accent/50 focus:bg-black/80 focus:shadow-[0_0_20px_rgba(var(--color-accent),0.15)] placeholder:text-white/20 transition-all backdrop-blur-md"
                                />
                                {search && (
                                    <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors bg-white/10 p-1.5 rounded-md">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 space-y-1 pb-4">
                            {filteredGames.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-white/20 text-xs font-bold gap-3 uppercase tracking-widest">
                                    <Search size={28} strokeWidth={2} className="opacity-40" /> No matches
                                </div>
                            ) : !search ? (
                                <Reorder.Group
                                    axis="y"
                                    values={orderedGames}
                                    onReorder={setOrderedGames}
                                    onPointerUp={() => reorderGames(orderedGames)}
                                    className="space-y-1"
                                >
                                    {orderedGames.map(game => (
                                        <Reorder.Item key={game.id} value={game}>
                                            <SidebarRow
                                                game={game}
                                                isActive={activeGameId === game.id}
                                                onClick={() => { setActiveGameId(game.id); }}
                                                onContextMenu={e => handleContextMenu(e, game)}
                                                onAction={() => handleLaunch(game)}
                                            />
                                        </Reorder.Item>
                                    ))}
                                </Reorder.Group>
                            ) : (
                                filteredGames.map(game => (
                                    <SidebarRow
                                        key={game.id}
                                        game={game}
                                        isActive={activeGameId === game.id}
                                        onClick={() => { setActiveGameId(game.id); }}
                                        onContextMenu={e => handleContextMenu(e, game)}
                                        onAction={() => handleLaunch(game)}
                                    />
                                ))
                            )}
                        </div>

                        <div className="shrink-0 p-6 pt-4 relative z-10 border-t border-white/5">
                            <button
                                onClick={() => setAddGameModalOpen(true)}
                                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-accent/10 hover:bg-accent/20 border border-accent/20 text-accent font-black transition-all uppercase tracking-widest text-[12px] backdrop-blur-md shadow-[0_0_20px_rgba(var(--color-accent),0.1)] hover:shadow-[0_0_30px_rgba(var(--color-accent),0.2)]"
                            >
                                <Plus size={18} strokeWidth={3} /> LINK NEW GAME
                            </button>
                        </div>
                    </div>
                </div>

                <main
                    ref={mainScrollRef}
                    className="flex-1 h-full overflow-y-auto overflow-x-hidden p-8 pl-10 flex flex-col relative z-0"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    <AnimatePresence mode="wait">
                        {activeGame && (
                            <motion.div
                                key={activeGame.id}
                                initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                                exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="w-full max-w-[1400px] pb-24"
                            >
                                <div className="h-[15vh] min-h-[80px] pointer-events-none" />

                                <div className="flex flex-col xl:flex-row items-start gap-12 mb-16 relative z-10">
                                    <div className="w-[300px] shrink-0 flex flex-col gap-6 perspective-[1000px]">
                                        <motion.div
                                            onMouseMove={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = (e.clientX - rect.left) / rect.width - 0.5;
                                                const y = (e.clientY - rect.top) / rect.height - 0.5;
                                                e.currentTarget.style.transform = `rotateY(${x * 15}deg) rotateX(${-y * 15}deg)`;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = `rotateY(0deg) rotateX(0deg)`;
                                            }}
                                            style={{ transition: "transform 0.1s ease-out" }}
                                            className="w-full aspect-[2/3] rounded-3xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.8)] bg-black/60 relative group border border-white/10 tech-card"
                                        >
                                            {coverUrl
                                                ? <img src={coverUrl} alt={activeGame.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 relative z-10 pointer-events-none" />
                                                : <div className="w-full h-full flex items-center justify-center text-white/10 relative z-10 pointer-events-none"><Gamepad2 size={64} strokeWidth={1} /></div>
                                            }
                                            {/* Hover Glare Effect */}
                                            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-20 mix-blend-overlay" />
                                            
                                            {isRunning && (
                                                <div className="absolute top-4 left-4 flex items-center gap-2 bg-green-500/90 backdrop-blur-xl px-4 py-2.5 rounded-xl border border-green-400/50 shadow-[0_0_20px_rgba(74,222,128,0.5)] z-30 pointer-events-none">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                                                    <span className="text-[11px] font-black text-white uppercase tracking-widest">Running</span>
                                                </div>
                                            )}
                                        </motion.div>

                                        <button
                                            onClick={() => handleLaunch(activeGame)}
                                            data-no-press-sound="true"
                                            className={cn(
                                                "w-full h-16 rounded-2xl font-black text-[15px] tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 relative z-10 overflow-hidden group",
                                                isRunning
                                                    ? "bg-red-500 hover:bg-red-400 text-white shadow-[0_0_40px_rgba(239,68,68,0.5)] active:scale-95"
                                                    : "bg-gradient-to-r from-accent to-accent/80 hover:brightness-110 text-black shadow-[0_0_40px_rgba(var(--color-accent),0.4)] active:scale-95"
                                            )}
                                        >
                                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                                            {isRunning
                                                ? <><Square size={20} fill="currentColor" className="relative z-10" /> <span className="relative z-10">Stop Title</span></>
                                                : <><Play size={20} fill="currentColor" className="relative z-10 ml-1" /> <span className="relative z-10">Play Now</span></>
                                            }
                                        </button>

                                        <div className="grid grid-cols-3 gap-3">
                                            <button onClick={() => setEditGameModalOpen(true, activeGame)} title="Edit metadata" className="h-16 rounded-2xl flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all shadow-xl backdrop-blur-md">
                                                <Settings size={22} className="relative z-10" />
                                            </button>
                                            <button onClick={() => useGameStore.getState().toggleFavorite(activeGame.id)} title="Favorite" className="h-16 rounded-2xl flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/10 text-white/60 hover:text-white hover:border-pink-500/30 transition-all shadow-xl backdrop-blur-md">
                                                <Heart size={22} fill={activeGame.is_favorite ? "currentColor" : "none"} className={cn("relative z-10 transition-colors", activeGame.is_favorite ? "text-pink-500" : "")} />
                                            </button>
                                            <button onClick={() => refreshMetadata(activeGame.id)} disabled={useGameStore.getState().isRefreshing[activeGame.id]} title="Refresh metadata" className="h-16 rounded-2xl flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all shadow-xl backdrop-blur-md disabled:opacity-50">
                                                <RefreshCcw size={22} className={cn("relative z-10", useGameStore.getState().isRefreshing[activeGame.id] && "animate-spin")} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0 pt-2">
                                        <GameTitle game={activeGame} />

                                        <div className="flex flex-wrap items-center gap-3 mb-10">
                                            {activeGame.developer && (
                                                <span className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest text-white/80 flex items-center gap-2 backdrop-blur-md">
                                                    <User2 size={14} className="text-accent" /> {activeGame.developer}
                                                </span>
                                            )}
                                            {activeGame.publisher && activeGame.publisher !== activeGame.developer && (
                                                <span className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest text-white/80 flex items-center gap-2 backdrop-blur-md">
                                                    <Building2 size={14} className="text-accent" /> {activeGame.publisher}
                                                </span>
                                            )}
                                            {activeGame.crack_type && activeGame.crack_type !== "unknown" && (
                                                <span className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2 backdrop-blur-md">
                                                    <ShieldAlert size={14} /> {activeGame.crack_type}
                                                </span>
                                            )}
                                            {activeGame.steam_app_id && (
                                                <span className="px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] font-black uppercase tracking-widest text-purple-400 flex items-center gap-2 backdrop-blur-md">
                                                    <Hash size={14} /> AppID: {activeGame.steam_app_id}
                                                </span>
                                            )}
                                            {activeGame.genre && (
                                                <span className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-[11px] font-black uppercase tracking-widest text-white/80 flex items-center gap-2 backdrop-blur-md">
                                                    <Star size={14} className="text-yellow-400" /> {activeGame.genre}
                                                </span>
                                            )}
                                            {activeGame.id && (
                                                <span className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-[11px] font-mono uppercase tracking-widest text-white/40 flex items-center gap-2 backdrop-blur-md" title="Internal Game ID">
                                                    <Fingerprint size={14} className="text-white/20" /> {activeGame.id}
                                                </span>
                                            )}
                                        </div>

                                        <div className="inline-flex items-center flex-wrap gap-8 px-8 py-5 rounded-3xl bg-black/40 backdrop-blur-2xl border border-white/10 text-[13px] font-bold text-white/50 mb-14 shadow-2xl">
                                            <span className="flex items-center gap-2.5 text-accent drop-shadow-[0_0_10px_rgba(var(--color-accent),0.5)]">
                                                <Clock size={18} />
                                                <span className="text-white">{formatPlaytime(activeGame.playtime_seconds || 0)}</span> PLAYED
                                            </span>
                                            {activeGame.last_played && (
                                                <>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                                    <span>LAST PLAYED: <span className="text-white ml-1">{new Date(activeGame.last_played).toLocaleDateString()}</span></span>
                                                </>
                                            )}
                                            {activeGame.release_date && (
                                                <>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                                    <span>RELEASED: <span className="text-white ml-1">{new Date(activeGame.release_date).getFullYear()}</span></span>
                                                </>
                                            )}
                                        </div>

                                        <div
                                            onClick={() => achievements.length > 0 && setShowAchievements(true)}
                                            className={cn(
                                                "p-8 rounded-3xl bg-black/40 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col justify-between transition-all",
                                                achievements.length > 0
                                                    ? "cursor-pointer group hover:bg-black/60 hover:border-white/20 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                                                    : "opacity-50"
                                            )}
                                        >
                                            <div className="flex justify-between items-start mb-8 relative z-10">
                                                <div>
                                                    <h3 className="text-[12px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2.5">
                                                        <Trophy size={16} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" /> PROGRESS
                                                    </h3>
                                                    <div className="text-5xl font-black text-white tracking-tighter drop-shadow-md">
                                                        {earned} <span className="text-white/30 text-2xl font-bold">/ {achievements.length || "—"}</span>
                                                    </div>
                                                </div>
                                                {achievements.length > 0 && (
                                                    <button className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/30 group-hover:text-yellow-400 group-hover:bg-yellow-500/10 transition-colors border border-white/5 group-hover:border-yellow-500/20">
                                                        <ExternalLink size={16} />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="relative z-10">
                                                <div className="h-2 w-full bg-white/10 rounded-full mb-4 overflow-hidden shadow-inner border border-white/[0.02]">
                                                    <motion.div
                                                        className="h-full bg-yellow-400 rounded-full shadow-[0_0_12px_rgba(250,204,21,0.5)] diagonal-progress"
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

                                <SteamDetails steamDetails={steamDetails} reviews={reviews} />

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