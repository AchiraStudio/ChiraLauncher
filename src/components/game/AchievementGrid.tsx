import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Achievement } from "../../services/achievementService";

type FilterKey = "all" | "unlocked" | "locked";

function formatDate(ts: number | null): string {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Rarity Color Logic ──
function getRarityColors(percent: number | null) {
    if (percent === null) return { name: "COMMON", border: "border-white/10", shadow: "shadow-none", text: "text-white/40" };
    if (percent > 50) return { name: "COMMON", border: "border-[#10b981]/50", shadow: "shadow-[0_0_15px_rgba(16,185,129,0.15)]", text: "text-[#10b981]" };
    if (percent > 25) return { name: "UNCOMMON", border: "border-[#3b82f6]/50", shadow: "shadow-[0_0_15px_rgba(59,130,246,0.15)]", text: "text-[#3b82f6]" };
    if (percent > 10) return { name: "RARE", border: "border-[#8b5cf6]/50", shadow: "shadow-[0_0_15px_rgba(139,92,246,0.15)]", text: "text-[#8b5cf6]" };
    if (percent > 5) return { name: "VERY RARE", border: "border-[#eab308]/50", shadow: "shadow-[0_0_15px_rgba(234,179,8,0.15)]", text: "text-[#eab308]" };
    return { name: "ULTRA RARE", border: "border-[#ef4444]/60", shadow: "shadow-[0_0_15px_rgba(239,68,68,0.25)]", text: "text-[#ef4444]" };
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
            case "locked": return achievements.filter(a => !a.earned);
            default: return achievements;
        }
    }, [achievements, filter]);

    const grouped = useMemo(() => {
        const groups = {
            "ULTRA RARE (< 5%)": [] as Achievement[],
            "VERY RARE (5% - 10%)": [] as Achievement[],
            "RARE (10% - 25%)": [] as Achievement[],
            "UNCOMMON (25% - 50%)": [] as Achievement[],
            "COMMON (> 50%)": [] as Achievement[]
        };

        filtered.forEach(ach => {
            const p = ach.global_percent ?? 100;
            if (p <= 5) groups["ULTRA RARE (< 5%)"].push(ach);
            else if (p <= 10) groups["VERY RARE (5% - 10%)"].push(ach);
            else if (p <= 25) groups["RARE (10% - 25%)"].push(ach);
            else if (p <= 50) groups["UNCOMMON (25% - 50%)"].push(ach);
            else groups["COMMON (> 50%)"].push(ach);
        });

        for (const key of Object.keys(groups)) {
            const k = key as keyof typeof groups;
            groups[k].sort((a, b) => {
                if (a.earned !== b.earned) return a.earned ? -1 : 1;
                if (a.earned && b.earned) return (b.earned_time ?? 0) - (a.earned_time ?? 0);
                return 0;
            });
        }

        return groups;
    }, [filtered]);

    if (achievements.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4 opacity-30">
                <div className="text-5xl">🏆</div>
                <p className="font-black tracking-widest text-xs uppercase text-white">No achievements found</p>
                <p className="text-white/40 text-sm text-center max-w-xs">This game has no local achievements.json in its steam_settings folder. Run the metadata sync to pull from Steam.</p>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-white font-black text-sm tracking-widest uppercase mb-1">
                        {gameName ? `${gameName} Achievements` : "Achievements"}
                    </h2>
                    <p className="text-white/40 text-xs">{unlocked} / {achievements.length} Unlocked</p>
                </div>
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

            <div className="flex gap-1.5 flex-wrap">
                {([
                    { key: "all", label: `All (${achievements.length})`, cls: "text-white/60" },
                    { key: "unlocked", label: `✓ Unlocked (${unlocked})`, cls: "text-emerald-400" },
                    { key: "locked", label: `Locked (${achievements.length - unlocked})`, cls: "text-white/30" },
                ] as { key: FilterKey; label: string; cls: string }[]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setFilter(tab.key)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${filter === tab.key
                                ? `bg-white/10 border-white/20 shadow-md ${tab.cls}`
                                : "border-transparent text-white/20 hover:text-white/40 hover:bg-white/5"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="space-y-12">
                {Object.entries(grouped).map(([groupName, groupAch]) => {
                    if (groupAch.length === 0) return null;
                    return (
                        <div key={groupName} className="space-y-4">
                            <div className="flex items-center gap-3 opacity-60">
                                <h3 className="text-xs font-black text-white tracking-widest uppercase">{groupName}</h3>
                                <div className="h-px flex-1 bg-white/10" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                <AnimatePresence mode="popLayout">
                                    {groupAch.map(ach => {
                                        const isHiddenLocked = ach.hidden && !ach.earned;
                                        const iconSrc = ach.earned && !imgErrors.has(ach.api_name + ".icon") && ach.icon_path
                                            ? ach.icon_path
                                            : !ach.earned && !imgErrors.has(ach.api_name + ".gray") && ach.icon_gray_path
                                                ? ach.icon_gray_path
                                                : null;

                                        const rarityInfo = getRarityColors(ach.global_percent);
                                        const rarityCss = ach.earned ? `${rarityInfo.border} ${rarityInfo.shadow}` : "border-white/5 opacity-55 hover:opacity-80 hover:border-white/10";

                                        return (
                                            <motion.div
                                                key={ach.api_name}
                                                layout
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.85 }}
                                                transition={{ duration: 0.18 }}
                                                onClick={() => setSelected(ach)}
                                                className={`relative group cursor-pointer rounded-2xl border p-4 flex items-center gap-5 transition-all hover:scale-[1.02] ${rarityCss} bg-white/[0.03] hover:bg-white/[0.06]`}
                                            >
                                                <div className={`relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border ${ach.earned ? "border-transparent" : "border-white/10"} bg-black/30`}>
                                                    {iconSrc ? (
                                                        <img
                                                            src={iconSrc}
                                                            alt={ach.display_name}
                                                            className={`w-full h-full object-cover ${!ach.earned ? "grayscale brightness-50" : ""}`}
                                                            loading="lazy"
                                                            onError={() => setImgErrors(prev => new Set(prev).add(ach.api_name + (ach.earned ? ".icon" : ".gray")))}
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-2xl">
                                                            {isHiddenLocked ? "🔒" : "🏅"}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {ach.earned ? (
                                                            <span className="text-[8px] font-black tracking-widest text-emerald-400">✓ UNLOCKED</span>
                                                        ) : (
                                                            <span className={`text-[8px] font-black tracking-widest ${rarityInfo.text}`}>{rarityInfo.name}</span>
                                                        )}
                                                    </div>
                                                    <h4 className="text-white font-bold text-xs leading-snug truncate">
                                                        {isHiddenLocked ? "???" : ach.display_name}
                                                    </h4>
                                                    {!isHiddenLocked && ach.description && (
                                                        <p className="text-white/35 text-[10px] mt-1 line-clamp-2 leading-snug">
                                                            {ach.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        </div>
                    );
                })}
            </div>

            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-6"
                        onClick={() => setSelected(null)}
                    >
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0, y: 16 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.92, opacity: 0, y: 16 }}
                            onClick={e => e.stopPropagation()}
                            className="relative z-10 w-full max-w-sm bg-[#161a26] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl"
                        >
                            <div className="p-8 pb-6 bg-black/40 flex flex-col items-center text-center">
                                <div className={`w-28 h-28 rounded-3xl overflow-hidden border-4 mb-6 ${selected.earned ? getRarityColors(selected.global_percent).border.split(' ')[0] : "border-white/10"} shadow-xl`}>
                                    {(selected.earned && selected.icon_path) || (!selected.earned && selected.icon_gray_path) ? (
                                        <img src={selected.earned ? selected.icon_path! : selected.icon_gray_path!} className={`w-full h-full object-cover ${!selected.earned ? "grayscale" : ""}`} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-4xl">
                                            {selected.hidden && !selected.earned ? "🔒" : "🏆"}
                                        </div>
                                    )}
                                </div>
                                <h3 className="text-xl font-black text-white">{selected.hidden && !selected.earned ? "Secret Achievement" : selected.display_name}</h3>
                                <p className="text-white/50 text-sm mt-3 leading-relaxed">
                                    {selected.hidden && !selected.earned ? "Keep playing to reveal this achievement." : selected.description}
                                </p>
                            </div>

                            <div className="bg-[#12141c] p-6 border-t border-white/5 flex flex-col gap-4">
                                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-white/40">
                                    <span>Status</span>
                                    {selected.earned ? <span className="text-emerald-400">Unlocked</span> : <span>Locked</span>}
                                </div>
                                {selected.earned && selected.earned_time && (
                                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-white/40">
                                        <span>Date</span>
                                        <span className="text-white/80">{formatDate(selected.earned_time)}</span>
                                    </div>
                                )}
                                {selected.global_percent !== null && (
                                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-white/40">
                                        <span>Rarity ({getRarityColors(selected.global_percent).name})</span>
                                        <span className="text-white/80 text-right">{selected.global_percent.toFixed(1)}% of players have unlocked this achievement</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}