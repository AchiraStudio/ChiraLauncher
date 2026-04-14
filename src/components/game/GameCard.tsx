import { useRef } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { useProcessStore } from "../../store/processStore";
import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";
import { Flame, CheckCircle, Play, Square, Settings, KeyRound } from "lucide-react";
import type { Game } from "../../types/game";
import { PlaceholderCover } from "../ui/PlaceholderCover";
import { cn, formatElapsedSeconds } from "../../lib/utils";
import { formatPlaytime } from "../../lib/format";
import { launchGame, forceStopGame } from "../../services/gameService";
import { useLocalImage } from "../../hooks/useLocalImage";

interface GameCardProps {
    game: Game;
    index: number;
    onClick: () => void;
    onHoverStart?: () => void;
    onHoverEnd?: () => void;
    isFocused?: boolean;
    badge?: "new" | "trending" | "installed";
}

export function GameCard({ game, onClick, onHoverStart, onHoverEnd, badge }: GameCardProps) {
    const runningInfo = useProcessStore((s) => s.running[game.id]);
    const isRunning = !!runningInfo;
    const elapsed = useProcessStore((s) => isRunning ? s.elapsedTimeMap[game.id] : undefined);
    const isRefreshing = useGameStore((s) => s.isRefreshing[game.id] || false);
    const setEditGameModalOpen = useUiStore((s) => s.setEditGameModalOpen);

    const cardRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(cardRef, { once: true, margin: "200px" });

    const targetPath = game.cover_image_path || (game as any).cover_path;
    const { src: coverUrl, error: coverError } = useLocalImage(isInView ? targetPath : null);

    const badgeConfig = {
        new: { label: "NEW", bg: "bg-green-500/80", text: "text-white", icon: null },
        trending: { label: "TRENDING", bg: "bg-orange-500/80", text: "text-white", icon: <Flame size={10} /> },
        installed: { label: "INSTALLED", bg: "bg-accent/80", text: "text-white", icon: <CheckCircle size={10} /> },
    };

    return (
        <motion.div
            ref={cardRef}
            layoutId={`card-${game.id}`}
            whileHover="hover"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate="idle"
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={onClick}
            onHoverStart={onHoverStart}
            onHoverEnd={onHoverEnd}
            variants={{
                idle: { scale: 1, y: 0, zIndex: 0, opacity: 1 },
                hover: { scale: 1.04, y: -4, zIndex: 10, opacity: 1 }
            }}
            transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.8 }}
            className={cn(
                "relative w-full rounded-xl overflow-hidden cursor-pointer group",
                "aspect-[2/3] bg-surface",
                "shadow-[0_4px_16px_rgba(0,0,0,0.5)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_30px_rgba(var(--color-accent),0.3)]",
                "ring-0 hover:ring-2 hover:ring-accent/70 transition-shadow duration-300"
            )}
        >
            {coverUrl && !coverError ? (
                <img
                    src={coverUrl}
                    alt={game.title}
                    loading="lazy"
                    className={cn(
                        "w-full h-full object-cover transition-all duration-500 ease-out",
                        "brightness-[0.80] group-hover:brightness-110 group-hover:scale-105"
                    )}
                />
            ) : (
                <PlaceholderCover title={game.title} />
            )}

            <div className={cn(
                "absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent",
                "transition-opacity duration-300 opacity-60 group-hover:opacity-100"
            )} />

            {/* Running badge */}
            {isRunning && elapsed !== undefined && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/70 backdrop-blur rounded-md px-2 py-0.5 z-10 pointer-events-none">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-400 font-bold">{formatElapsedSeconds(elapsed)}</span>
                </div>
            )}

            {/* Edit Button overlay on hover (top right) */}
            {!isRunning && (
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-20 translate-y-[-10px] group-hover:translate-y-0">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditGameModalOpen(true, game);
                        }}
                        className="w-8 h-8 rounded-xl bg-black/60 text-white/50 hover:text-white hover:bg-black flex items-center justify-center pointer-events-auto backdrop-blur-md transition-all shadow-lg border border-white/10 hover:border-white/30 hover:scale-110 active:scale-95"
                        title="Edit Metadata"
                    >
                        <Settings size={15} />
                    </button>
                </div>
            )}

            {/* AutoAttach indicator */}
            {isRunning && runningInfo.source === "AutoAttach" && (
                <div className="absolute top-2 left-2 text-[10px] bg-black/70 backdrop-blur rounded px-1.5 py-0.5 text-white/60 font-bold tracking-wide uppercase">
                    Detected
                </div>
            )}

            {/* Custom badge (NEW/TRENDING/etc.) */}
            {badge && !isRunning && (
                <div className={cn(
                    "absolute top-2 left-2 text-[9px] font-black tracking-widest rounded px-2 py-1 flex items-center gap-1",
                    badgeConfig[badge].bg,
                    badgeConfig[badge].text
                )}>
                    {badgeConfig[badge].icon}
                    {badgeConfig[badge].label}
                </div>
            )}

            {/* Play button overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isRunning) {
                            forceStopGame(game.id);
                        } else {
                            launchGame(game.id);
                        }
                    }}
                    className={cn(
                        "w-16 h-16 rounded-full flex items-center justify-center pointer-events-auto transition-all duration-300 scale-75 group-hover:scale-100 shadow-2xl backdrop-blur-md border border-white/20",
                        isRunning
                            ? "bg-red-500/90 hover:bg-red-600 hover:scale-110 shadow-[0_0_30px_rgba(239,68,68,0.5)]"
                            : "bg-accent/90 hover:bg-accent hover:scale-110 shadow-[0_0_30_rgba(var(--color-accent),0.5)]"
                    )}
                >
                    {isRunning ? (
                        <Square size={24} fill="currentColor" />
                    ) : (
                        <Play size={32} className="translate-x-1" fill="currentColor" />
                    )}
                </button>
            </div>

            {/* Refreshing Overlay */}
            <AnimatePresence>
                {isRefreshing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-black via-black/80 to-transparent flex items-end justify-center pb-8 z-20 pointer-events-none"
                    >
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-5 h-5 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                            <span className="text-white/80 text-[10px] font-bold tracking-wide drop-shadow-md">Refreshing</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom overlay — title, playtime, and Crack Type on hover */}
            <div className={cn(
                "absolute bottom-0 inset-x-0 p-5 flex flex-col gap-1",
                "transform transition-all duration-300 ease-out",
                "opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0"
            )}>
                <div className="text-[14px] font-bold text-white drop-shadow-md leading-tight line-clamp-2">{game.title}</div>
                <div className="flex items-center justify-between mt-1">
                    {game.playtime_seconds > 0 ? (
                        <div className="text-[10px] text-white/50 font-semibold tracking-wide">
                            {formatPlaytime(game.playtime_seconds)}
                        </div>
                    ) : <div />}

                    {game.crack_type && game.crack_type !== "unknown" && (
                        <div className="flex items-center gap-1 bg-white/10 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-white/60 border border-white/10">
                            <KeyRound size={8} /> {game.crack_type}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}