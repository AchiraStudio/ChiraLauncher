import { useEffect, useMemo } from "react";
import { useGameStore } from "../store/gameStore";
import { useProcessStore } from "../store/processStore";
import { launchGame, forceStopGame } from "../services/gameService";
import { Play, Square, Maximize, Power, Gamepad2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

export default function TrayMenu() {
    const gamesById = useGameStore(s => s.gamesById);
    const fetchGames = useGameStore(s => s.fetchGames);
    const runningGames = useProcessStore(s => s.running);

    useEffect(() => {
        document.documentElement.style.setProperty("background", "transparent", "important");
        document.body.style.setProperty("background", "transparent", "important");
        const rootElement = document.getElementById("root");
        if (rootElement) {
            rootElement.style.setProperty("background", "transparent", "important");
        }

        // Fresh data poll so the list is always 100% accurate when opened
        fetchGames();
    }, [fetchGames]);

    const allGames = Object.values(gamesById);
    const activeGames = Object.values(runningGames);

    // Dynamic recent games sorting
    const recentGames = useMemo(() => {
        return allGames
            .filter((g: any) => g.last_played)
            .sort((a: any, b: any) => new Date(b.last_played!).getTime() - new Date(a.last_played!).getTime())
            .slice(0, 4);
    }, [allGames]);

    const hideTray = async () => {
        await getCurrentWindow().hide();
    };

    const handleOpenMain = async () => {
        await invoke("show_main_window");
        hideTray();
    };

    const handleQuit = async () => {
        await invoke("quit_app");
    };

    return (
        <div className="h-screen w-screen p-3 flex flex-col bg-transparent select-none font-outfit text-white overflow-hidden">
            <div className="flex-1 bg-[#08090f]/90 backdrop-blur-2xl border border-white/10 rounded-[1.5rem] shadow-none flex flex-col overflow-hidden">

                <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-white/[0.02] shrink-0">
                    <div className="w-8 h-8 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400 shadow-inner">
                        <Gamepad2 size={16} />
                    </div>
                    <div>
                        <h1 className="text-sm font-black uppercase tracking-widest">Chira Launcher</h1>
                        <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">System Engine</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">

                    {/* ACTIVE GAMES */}
                    <div className="mb-4">
                        <p className="px-3 py-2 text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Currently Running</p>
                        {activeGames.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-white/20 italic font-medium">No games active</div>
                        ) : (
                            activeGames.map((game: any) => {
                                const gameTitle = gamesById[game.gameId]?.title || "Unknown Game";

                                return (
                                    <button
                                        key={game.gameId}
                                        onClick={() => { forceStopGame(game.gameId); hideTray(); }}
                                        className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-red-500/10 text-left transition-colors group border border-transparent hover:border-red-500/20"
                                    >
                                        <span className="text-xs font-bold text-white/80 group-hover:text-red-400 truncate pr-2">{gameTitle}</span>
                                        <div className="w-6 h-6 rounded-md bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 shadow-sm border border-red-500/20">
                                            <Square size={10} fill="currentColor" />
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* RECENT GAMES */}
                    <div className="mb-2">
                        <p className="px-3 py-2 text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Recent Titles</p>
                        {recentGames.map((game: any) => {
                            const isRunning = activeGames.some((a: any) => a.gameId === game.id);

                            return (
                                <button
                                    key={game.id}
                                    onClick={() => { isRunning ? forceStopGame(game.id) : launchGame(game.id); hideTray(); }}
                                    className={cn(
                                        "w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors group border",
                                        isRunning
                                            ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
                                            : "hover:bg-white/5 border-transparent"
                                    )}
                                >
                                    <span className={cn("text-xs font-bold truncate pr-2 transition-colors", isRunning ? "text-green-400" : "text-white/80 group-hover:text-cyan-400")}>
                                        {game.title}
                                    </span>
                                    <div className={cn(
                                        "w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors border",
                                        isRunning
                                            ? "bg-green-400/20 text-green-400 border-green-400/30 shadow-[0_0_10px_rgba(74,222,128,0.4)]"
                                            : "bg-white/5 text-white/40 group-hover:bg-cyan-400/20 group-hover:text-cyan-400 border-transparent group-hover:border-cyan-400/20"
                                    )}>
                                        {isRunning ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" className="ml-0.5" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                </div>

                <div className="p-2 border-t border-white/5 bg-white/[0.02] shrink-0">
                    <button onClick={handleOpenMain} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-left transition-colors text-xs font-bold text-white/70 hover:text-white">
                        <Maximize size={14} /> Open Launcher
                    </button>
                    <button onClick={handleQuit} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-left transition-colors text-xs font-bold text-white/70 hover:text-red-400">
                        <Power size={14} /> Quit Engine
                    </button>
                </div>
            </div>
        </div>
    );
}