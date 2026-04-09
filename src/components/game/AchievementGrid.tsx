import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Achievement } from "../../services/achievementService";

type FilterKey = "all" | "unlocked" | "locked";

function formatDate(ts: number | null): string {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface Props {
    achievements: Achievement[];
    gameName?: string;
}

export function AchievementGrid({ achievements, gameName }: Props) {
    const [filter, setFilter] = useState<FilterKey>("all");
    const [selected, setSelected] = useState<Achievement | null>(null);
    const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

    const unlocked = useMemo(() => achievements.filter(a => a.earned).length, [achievements]);
    const progress = achievements.length ? Math.round((unlocked / achievements.length) * 100) : 0;

    const filtered = useMemo(() => {
        switch (filter) {
            case "unlocked": return achievements.filter(a => a.earned);
            case "locked":   return achievements.filter(a => !a.earned);
            default:         return achievements;
        }
    }, [achievements, filter]);

    // Unlocked first, then by earned_time descending (most recent first), then locked
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            if (a.earned !== b.earned) return a.earned ? -1 : 1;
            if (a.earned && b.earned) {
                return (b.earned_time ?? 0) - (a.earned_time ?? 0);
            }
            return 0;
        });
    }, [filtered]);

    if (achievements.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4 opacity-30">
                <div className="text-5xl">🏆</div>
                <p className="font-black tracking-widest text-xs uppercase text-white">No achievements found</p>
                <p className="text-white/40 text-sm text-center max-w-xs">This game has no local achievements.json in its steam_settings folder.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-white font-black text-sm tracking-widest uppercase mb-1">
                        {gameName ? `${gameName} Achievements` : "Achievements"}
                    </h2>
                    <p className="text-white/40 text-xs">{unlocked} / {achievements.length} Unlocked</p>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-3 min-w-[180px]">
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-accent via-accent/70 to-accent/40 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                        />
                    </div>
                    <span className="text-xs font-black text-white/60 tabular-nums">{progress}%</span>
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1.5 flex-wrap">
                {([
                    { key: "all",      label: `All (${achievements.length})`,                   cls: "text-white/60" },
                    { key: "unlocked", label: `✓ Unlocked (${unlocked})`,                        cls: "text-emerald-400" },
                    { key: "locked",   label: `⌀ Locked (${achievements.length - unlocked})`,    cls: "text-white/30" },
                ] as { key: FilterKey; label: string; cls: string }[]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setFilter(tab.key)}
                        className={`px-3 py-1 rounded-full text-[11px] font-black tracking-wider transition-all border ${
                            filter === tab.key
                                ? `bg-white/10 border-white/20 ${tab.cls}`
                                : "border-transparent text-white/20 hover:text-white/40"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                <AnimatePresence mode="popLayout">
                    {sorted.map(ach => {
                        const isHiddenLocked = ach.hidden && !ach.earned;
                        const iconSrc = ach.earned && !imgErrors.has(ach.api_name + ".icon") && ach.icon_path
                            ? ach.icon_path
                            : !ach.earned && !imgErrors.has(ach.api_name + ".gray") && ach.icon_gray_path
                                ? ach.icon_gray_path
                                : null;

                        return (
                            <motion.div
                                key={ach.api_name}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                transition={{ duration: 0.18 }}
                                onClick={() => setSelected(ach)}
                                className={`relative group cursor-pointer rounded-2xl border p-3 flex items-center gap-5 transition-all hover:scale-[1.02] ${
                                    ach.earned
                                        ? "border-accent/30 shadow-[0_0_12px_rgba(102,192,244,0.15)]"
                                        : "border-white/8 opacity-55 hover:opacity-80"
                                } bg-white/[0.03] hover:bg-white/[0.06]`}
                            >
                                {/* Icon */}
                                <div className={`relative flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden border ${ach.earned ? "border-accent/30" : "border-white/10"} bg-black/30`}>
                                    {iconSrc ? (
                                        <img
                                            src={iconSrc}
                                            alt={ach.display_name}
                                            className={`w-full h-full object-cover ${!ach.earned ? "grayscale brightness-50" : ""}`}
                                            loading="lazy"
                                            onError={() => setImgErrors(prev => new Set(prev).add(
                                                ach.api_name + (ach.earned ? ".icon" : ".gray")
                                            ))}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xl">
                                            {isHiddenLocked ? "🔒" : "🏅"}
                                        </div>
                                    )}
                                    {/* Earned indicator pip */}
                                    {ach.earned && (
                                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black/50 bg-emerald-400" />
                                    )}
                                </div>

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        {ach.earned && (
                                            <span className="text-[9px] font-black tracking-wider text-emerald-400">✓ UNLOCKED</span>
                                        )}
                                    </div>
                                    <h4 className="text-white font-bold text-xs leading-snug truncate">
                                        {isHiddenLocked ? "???" : ach.display_name}
                                    </h4>
                                    {!isHiddenLocked && ach.description && (
                                        <p className="text-white/35 text-[10px] mt-0.5 line-clamp-2 leading-snug">
                                            {ach.description}
                                        </p>
                                    )}
                                    {isHiddenLocked && (
                                        <p className="text-white/25 text-[10px] mt-0.5">Keep playing to discover this.</p>
                                    )}
                                </div>

                                {/* Hover shimmer */}
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Detail modal */}
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-6"
                        onClick={() => setSelected(null)}
                    >
                        <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" />
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.92, opacity: 0, y: 16 }}
                            transition={{ duration: 0.2 }}
                            onClick={e => e.stopPropagation()}
                            className="relative z-10 w-full max-w-sm bg-surface/95 border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                        >
                            {/* Icon hero */}
                            <div className="relative h-36 overflow-hidden bg-black/40 flex items-center justify-center">
                                {(() => {
                                    const isHidden = selected.hidden && !selected.earned;
                                    const iconSrc = selected.earned && selected.icon_path
                                        ? selected.icon_path
                                        : !selected.earned && selected.icon_gray_path
                                            ? selected.icon_gray_path
                                            : null;

                                    return (
                                        <>
                                            {/* Glow bg */}
                                            <div className="absolute inset-0" style={{
                                                background: selected.earned
                                                    ? "radial-gradient(ellipse at center, rgba(102,192,244,0.15), transparent 70%)"
                                                    : "radial-gradient(ellipse at center, rgba(255,255,255,0.05), transparent 70%)"
                                            }} />
                                            {iconSrc ? (
                                                <img
                                                    src={iconSrc}
                                                    alt={selected.display_name}
                                                    className={`w-24 h-24 rounded-2xl object-cover z-10 shadow-2xl border-2 border-white/10 ${!selected.earned ? "grayscale brightness-50" : ""}`}
                                                />
                                            ) : (
                                                <div className="text-6xl z-10">{isHidden ? "🔒" : "🏅"}</div>
                                            )}
                                            <button
                                                onClick={() => setSelected(null)}
                                                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white/50 hover:text-white text-sm transition-colors z-10"
                                            >×</button>
                                        </>
                                    );
                                })()}
                            </div>

                            <div className="p-5">
                                {(() => {
                                    const isHidden = selected.hidden && !selected.earned;
                                    return (
                                        <>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black tracking-widest uppercase text-white/40">
                                                    Achievement
                                                </span>
                                                {selected.earned ? (
                                                    <span className="text-[10px] font-black text-emerald-400 tracking-wider">✓ UNLOCKED</span>
                                                ) : (
                                                    <span className="text-[10px] font-black text-white/30 tracking-wider">LOCKED</span>
                                                )}
                                            </div>
                                            <h3 className="text-white text-xl font-black tracking-tight mb-2">
                                                {isHidden ? "???" : selected.display_name}
                                            </h3>
                                            <p className="text-white/55 text-sm leading-relaxed mb-4">
                                                {isHidden
                                                    ? "Keep playing to discover this hidden achievement."
                                                    : selected.description || "No description available."}
                                            </p>
                                            <div className="flex items-center justify-end text-xs font-bold pt-3 border-t border-white/8">
                                                {selected.earned && selected.earned_time ? (
                                                    <span className="text-white/40">Unlocked {formatDate(selected.earned_time)}</span>
                                                ) : selected.global_percent !== null && selected.global_percent !== undefined ? (
                                                    <span className="text-white/35">{selected.global_percent.toFixed(1)}% of players</span>
                                                ) : null}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
