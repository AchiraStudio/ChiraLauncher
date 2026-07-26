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
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left outline-none group relative overflow-hidden cursor-pointer my-0.5",
                isActive ? "bg-accent/15 border border-accent/30 shadow-[0_0_20px_rgba(59,130,246,0.15)]" : "hover:bg-white/[0.04] border border-transparent"
            )}
        >
            {isActive && (
                <motion.div layoutId="activeGameIndicator" className="absolute left-0 top-[15%] bottom-[15%] w-[3px] bg-accent rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.8)] z-20" />
            )}

            <div className="w-10 h-[56px] rounded-lg overflow-hidden shrink-0 bg-black/60 relative border border-white/10 shadow-md z-10 group-hover:scale-105 transition-transform duration-300">
                {cover
                    ? <img src={cover} alt={game.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20"><Gamepad2 size={16} /></div>
                }
                {isRunning && <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.9)]" />}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-center relative z-10">
                <p className={cn("text-[13px] font-bold truncate leading-tight transition-colors", isActive ? "text-white" : "text-white/80 group-hover:text-white")}>
                    {game.title}
                </p>

                <div className="flex items-center gap-1 font-mono text-[10px] text-white/40 tracking-wider uppercase mt-1">
                    <Clock size={10} className={cn(isRunning && "text-emerald-400")} />
                    <span className={cn(isRunning && "text-emerald-400 font-semibold")}>{formatPlaytime(game.playtime_seconds || 0)}</span>
                </div>
            </div>

            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 relative z-10">
                <button
                    onClick={(e) => { e.stopPropagation(); onAction(); }}
                    data-no-press-sound="true"
                    className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-md",
                        isRunning ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/30" : "bg-white/10 text-white hover:bg-accent hover:text-white border border-white/10"
                    )}
                    title={isRunning ? "Stop Game" : "Quick Launch"}
                >
                    {isRunning ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                </button>
            </div>
        </div>
    );
});

