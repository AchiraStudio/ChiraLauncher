import { memo, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { formatPlaytime } from "../../lib/format";
import { Clock, Gamepad2, Play, Square } from "lucide-react";
import type { Game } from "../../types/game";
import { useLocalImage } from "../../hooks/useLocalImage";
import { useProcessStore } from "../../store/processStore";

export const SidebarRow = memo(function SidebarRow({
    game,
    isActive,
    onClick,
    onContextMenu,
    onAction
}: {
    game: Game;
    isActive: boolean;
    onClick: () => void;
    onContextMenu?: (e: MouseEvent) => void;
    onAction: () => void;
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
                "w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all text-left outline-none group relative overflow-hidden cursor-pointer my-1",
                isActive ? "bg-accent/10 border border-accent/30 shadow-[0_0_30px_rgba(var(--color-accent),0.15)]" : "hover:bg-white/[0.04] border border-transparent"
            )}
        >
            {cover && (
                <div className="absolute inset-0 z-0 opacity-10 group-hover:opacity-30 transition-opacity duration-500 mix-blend-screen">
                    <img src={cover} alt="" className="w-full h-full object-cover blur-md scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#08090f]/90 via-[#08090f]/60 to-transparent" />
                </div>
            )}

            {isActive && (
                <motion.div layoutId="activeGameIndicator" className="absolute left-0 top-[20%] bottom-[20%] w-[5px] bg-accent rounded-r-full shadow-[0_0_15px_rgba(var(--color-accent),0.8)] z-20" />
            )}

            <div className="w-12 h-[68px] rounded-xl overflow-hidden shrink-0 bg-black/60 relative border border-white/10 shadow-xl z-10 group-hover:scale-105 transition-transform duration-500">
                {cover
                    ? <img src={cover} alt={game.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20"><Gamepad2 size={18} /></div>
                }
                {isRunning && <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.9)] border border-black/50" />}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-center relative z-10">
                <p className={cn("text-[14px] font-black truncate leading-tight transition-colors drop-shadow-md", isActive ? "text-white" : "text-white/70 group-hover:text-white")}>
                    {game.title}
                </p>

                <div className="flex items-center gap-1.5 text-[11px] text-white/40 font-bold tracking-widest uppercase mt-1.5">
                    <Clock size={11} className={cn(isRunning && "text-green-400")} />
                    <span className={cn(isRunning && "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]")}>{formatPlaytime(game.playtime_seconds || 0)}</span>
                </div>
            </div>

            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 relative z-10">
                <button
                    onClick={(e) => { e.stopPropagation(); onAction(); }}
                    data-no-press-sound="true"
                    className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-90 backdrop-blur-md",
                        isRunning ? "bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30" : "bg-white/10 text-white hover:bg-accent hover:text-black border border-white/10 hover:border-accent/50"
                    )}
                    title={isRunning ? "Stop Game" : "Quick Launch"}
                >
                    {isRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                </button>
            </div>
        </div>
    );
});
