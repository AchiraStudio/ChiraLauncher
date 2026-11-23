import { memo } from "react";
import { Heart, Play, Square, Trophy } from "lucide-react";
import type { Game } from "../../types/game";
import { useProcessStore } from "../../store/processStore";
import { useElapsed } from "../../hooks/useElapsed";
import { formatElapsed, formatPlaytime } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Cover } from "./Cover";

export interface GameItemProps {
    game: Game;
    onOpen: (game: Game) => void;
    onPlay: (game: Game) => void;
    onContext?: (e: React.MouseEvent, game: Game) => void;
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent, game: Game) => void;
    onDragOver?: (e: React.DragEvent, game: Game) => void;
    onDrop?: (e: React.DragEvent, game: Game) => void;
    dragging?: boolean;
}

function RunningPill({ startTime }: { startTime: number }) {
    const elapsed = useElapsed(startTime);
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-ok">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
            {formatElapsed(elapsed)}
        </span>
    );
}

/** Poster card for grid views. Memoised: only re-renders when its own game (or running state) changes. */
export const GameCard = memo(function GameCard({
    game, onOpen, onPlay, onContext, draggable, onDragStart, onDragOver, onDrop, dragging,
}: GameItemProps) {
    const running = useProcessStore((s) => s.running[game.id]);
    const busy = useProcessStore((s) => s.launching[game.id] || s.stopping[game.id]);
    const pct = game.achievements_total ? Math.round(((game.achievements_unlocked ?? 0) / game.achievements_total) * 100) : null;

    return (
        <div
            className={cn("group select-none transition-opacity", dragging && "opacity-40")}
            draggable={draggable}
            onDragStart={onDragStart ? (e) => onDragStart(e, game) : undefined}
            onDragOver={onDragOver ? (e) => onDragOver(e, game) : undefined}
            onDrop={onDrop ? (e) => onDrop(e, game) : undefined}
            onContextMenu={onContext ? (e) => onContext(e, game) : undefined}
        >
            <div
                role="button"
                tabIndex={0}
                aria-label={`Open ${game.title}`}
                onClick={() => onOpen(game)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(game); } }}
                className={cn(
                    "relative aspect-[2/3] cursor-pointer overflow-hidden rounded-xl border bg-raised transition-all duration-200",
                    "group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_30px_-14px_rgb(0_0_0/0.8)]",
                    running ? "border-ok/50" : "border-line group-hover:border-white/25",
                )}
            >
                <Cover title={game.title} path={game.cover_path} className="transition-transform duration-500 group-hover:scale-[1.04]" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                <div className="absolute left-2 top-2 flex items-center gap-1.5">
                    {running && <RunningPill startTime={running.startTime} />}
                    {game.is_favorite && !running && (
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-black/60 text-rose-400">
                            <Heart size={12} fill="currentColor" />
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    aria-label={running ? `Stop ${game.title}` : `Play ${game.title}`}
                    data-no-press-sound
                    disabled={!!busy}
                    onClick={(e) => { e.stopPropagation(); onPlay(game); }}
                    className={cn(
                        "absolute bottom-2.5 right-2.5 grid h-10 w-10 translate-y-1 place-items-center rounded-full opacity-0 shadow-lg transition-all duration-200",
                        "group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 disabled:opacity-60",
                        running ? "bg-danger text-white" : "bg-accent text-accent-fg hover:brightness-110",
                    )}
                >
                    {running ? <Square size={15} fill="currentColor" /> : <Play size={17} fill="currentColor" className="translate-x-px" />}
                </button>
            </div>

            <div className="mt-2.5 px-0.5">
                <div className="truncate text-[13.5px] font-medium text-fg" title={game.title}>{game.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-mute">
                    <span className="truncate">{formatPlaytime(game.playtime_seconds)}</span>
                    {pct !== null && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-warn/90">
                            <Trophy size={11} /> {pct}%
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});

/** Dense row for list views. */
export const GameRow = memo(function GameRow({
    game, onOpen, onPlay, onContext, draggable, onDragStart, onDragOver, onDrop, dragging,
}: GameItemProps) {
    const running = useProcessStore((s) => s.running[game.id]);
    const busy = useProcessStore((s) => s.launching[game.id] || s.stopping[game.id]);
    const pct = game.achievements_total ? Math.round(((game.achievements_unlocked ?? 0) / game.achievements_total) * 100) : null;

    return (
        <div
            role="button"
            tabIndex={0}
            draggable={draggable}
            onDragStart={onDragStart ? (e) => onDragStart(e, game) : undefined}
            onDragOver={onDragOver ? (e) => onDragOver(e, game) : undefined}
            onDrop={onDrop ? (e) => onDrop(e, game) : undefined}
            onClick={() => onOpen(game)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(game); }}
            onContextMenu={onContext ? (e) => onContext(e, game) : undefined}
            className={cn(
                "group flex cursor-pointer items-center gap-4 rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-line hover:bg-white/[0.04]",
                dragging && "opacity-40",
            )}
        >
            <div className="h-[60px] w-10 shrink-0 overflow-hidden rounded-md border border-line">
                <Cover title={game.title} path={game.cover_path} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{game.title}</span>
                    {game.is_favorite && <Heart size={12} className="shrink-0 text-rose-400" fill="currentColor" />}
                    {running && <RunningPill startTime={running.startTime} />}
                </div>
                <div className="mt-0.5 truncate text-xs text-fg-mute">{game.developer || game.genre || "-"}</div>
            </div>
            <div className="hidden w-28 shrink-0 text-right text-xs text-fg-soft sm:block">{formatPlaytime(game.playtime_seconds)}</div>
            <div className="hidden w-16 shrink-0 text-right text-xs text-warn/90 md:block">
                {pct !== null ? <span className="inline-flex items-center justify-end gap-1"><Trophy size={11} />{pct}%</span> : ""}
            </div>
            <button
                type="button"
                data-no-press-sound
                disabled={!!busy}
                aria-label={running ? `Stop ${game.title}` : `Play ${game.title}`}
                onClick={(e) => { e.stopPropagation(); onPlay(game); }}
                className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-all disabled:opacity-60",
                    running ? "bg-danger text-white" : "bg-white/[0.07] text-fg-soft group-hover:bg-accent group-hover:text-accent-fg",
                )}
            >
                {running ? <Square size={13} fill="currentColor" /> : <Play size={14} fill="currentColor" className="translate-x-px" />}
            </button>
        </div>
    );
});
