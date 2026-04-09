import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, X, Medal, Shield, Sparkles, Star, Circle } from "lucide-react";
import { cn } from "../../lib/utils";

export interface RepackAchievement {
    name: string;
    description: string;
    image: string;
}

interface Props {
    achievements: RepackAchievement[];
    gameName?: string;
}

// Rarity tiers based on index — earlier achievements tend to be rarer/harder
function getRarity(rank: number, total: number): { label: string; color: string; glow: string; icon: React.ReactNode } {
    const ratio = rank / total;
    if (ratio < 0.1) return { label: "LEGENDARY", color: "text-yellow-400", glow: "shadow-[0_0_20px_rgba(253,224,71,0.25)] border-yellow-500/30", icon: <Sparkles size={12} /> };
    if (ratio < 0.25) return { label: "EPIC", color: "text-purple-400", glow: "shadow-[0_0_16px_rgba(168,85,247,0.25)] border-purple-500/30", icon: <Shield size={12} /> };
    if (ratio < 0.5) return { label: "RARE", color: "text-blue-400", glow: "shadow-[0_0_12px_rgba(96,165,250,0.2)] border-blue-500/30", icon: <Star size={12} /> };
    return { label: "COMMON", color: "text-white/20", glow: "border-white/5", icon: <Circle size={10} /> };
}

export function RepackAchievementGrid({ achievements, gameName }: Props) {
    const [selected, setSelected] = useState<RepackAchievement | null>(null);
    const [filter, setFilter] = useState<"all" | "legendary" | "epic" | "rare" | "common">("all");
    const [imgErrors, setImgErrors] = useState<Set<number>>(new Set());

    const withRarity = useMemo(() =>
        achievements.map((ach, i) => ({ ...ach, rarity: getRarity(i, achievements.length), rank: i })),
        [achievements]
    );

    const filtered = useMemo(() => {
        if (filter === "all") return withRarity;
        return withRarity.filter(a => a.rarity.label === filter.toUpperCase());
    }, [withRarity, filter]);

    const counts = useMemo(() => ({
        legendary: withRarity.filter(a => a.rarity.label === "LEGENDARY").length,
        epic: withRarity.filter(a => a.rarity.label === "EPIC").length,
        rare: withRarity.filter(a => a.rarity.label === "RARE").length,
        common: withRarity.filter(a => a.rarity.label === "COMMON").length,
    }), [withRarity]);

    if (achievements.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-40 gap-8 opacity-20">
                <div className="w-24 h-24 rounded-[2rem] bg-white/[0.03] border border-white/5 flex items-center justify-center">
                    <Trophy size={48} />
                </div>
                <div className="text-center">
                    <p className="font-black tracking-normal text-[10px] uppercase text-white mb-2 ">Honors Offline</p>
                    <p className="text-white/40 text-xs font-medium tracking-widest uppercase">Index contains zero trackable parameters</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-12">
            {/* Stats Row */}
            <div className="flex items-center gap-6 flex-wrap px-2">
                <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                        <Trophy size={18} className="text-accent" />
                        <h2 className="text-white font-black text-[12px] tracking-normal uppercase ">
                            {gameName ? `${gameName} Honors` : "Task Achievements"}
                        </h2>
                    </div>
                    <p className="text-white/20 text-[10px] font-black tracking-normal uppercase ml-8">{achievements.length} TOTAL INDICES</p>
                </div>
                <div className="flex gap-2.5 flex-wrap bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 shadow-inner">
                    {[
                        { key: "all", label: `ALL`, count: achievements.length, cls: "text-white/60" },
                        { key: "legendary", label: `LEGENDARY`, count: counts.legendary, cls: "text-yellow-400" },
                        { key: "epic", label: `EPIC`, count: counts.epic, cls: "text-purple-400" },
                        { key: "rare", label: `RARE`, count: counts.rare, cls: "text-blue-400" },
                        { key: "common", label: `COMMON`, count: counts.common, cls: "text-white/20" },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key as any)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-[9px] font-black tracking-normal transition-all uppercase border",
                                filter === tab.key
                                    ? "bg-white/10 border-white/10 shadow-xl " + tab.cls
                                    : "border-transparent text-white/15 hover:text-white/40"
                            )}
                        >
                            {tab.label} <span className="ml-1 opacity-40 tabular-nums">({tab.count})</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Achievement Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-2">
                <AnimatePresence mode="popLayout">
                    {filtered.map((ach) => (
                        <motion.div
                            key={ach.name}
                            layout
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.3 }}
                            onClick={() => setSelected(ach)}
                            className={cn(
                                "relative group cursor-pointer rounded-[1.5rem] border bg-surface/30 backdrop-blur-3xl p-5 flex items-start gap-5 transition-all duration-500 hover:bg-white/[0.05] hover:scale-[1.03] shadow-xl border-white/5",
                                ach.rarity.glow
                            )}
                        >
                            {/* Medal Icon Area */}
                            <div className="flex-shrink-0 relative">
                                <div className={cn(
                                    "w-16 h-16 rounded-2xl overflow-hidden border bg-black/40 shadow-2xl transition-all duration-500 group-hover:scale-105",
                                    ach.rarity.glow
                                )}>
                                    {!imgErrors.has(ach.rank) ? (
                                        <img
                                            src={ach.image}
                                            alt={ach.name}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                            loading="lazy"
                                            onError={() => setImgErrors(prev => new Set(prev).add(ach.rank))}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/10">
                                            <Medal size={24} />
                                        </div>
                                    )}
                                </div>
                                {/* Rarity pip */}
                                <div className={cn(
                                    "absolute -bottom-1 -right-1 w-5 h-5 rounded-lg border-2 border-background flex items-center justify-center shadow-lg",
                                    ach.rarity.label === "LEGENDARY" ? "bg-yellow-400 text-black" :
                                    ach.rarity.label === "EPIC" ? "bg-purple-400 text-white" :
                                    ach.rarity.label === "RARE" ? "bg-blue-400 text-white" : "bg-white/10 text-white/40"
                                )}>
                                    <div className="scale-[0.6]">{ach.rarity.icon}</div>
                                </div>
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <span className={cn("text-[9px] font-black tracking-normal uppercase block mb-1.5", ach.rarity.color)}>
                                    {ach.rarity.label}
                                </span>
                                <h4 className="text-white font-black text-sm leading-tight truncate uppercase tracking-wide group-hover:text-accent transition-colors">{ach.name}</h4>
                                <p className="text-white/20 text-[10px] mt-2 font-medium leading-relaxed line-clamp-2 uppercase tracking-widest">{ach.description}</p>
                            </div>

                            {/* Hover shimmer */}
                            <div className="absolute inset-0 rounded-[1.5rem] bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-background/80 backdrop-blur-xl"
                        onClick={() => setSelected(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            onClick={(e) => e.stopPropagation()}
                            className="relative z-10 w-full max-w-lg bg-surface/50 border border-white/10 rounded-[3rem] overflow-hidden shadow-3xl backdrop-blur-3xl"
                        >
                            {/* Hero image */}
                            <div className="relative h-64 overflow-hidden">
                                <img
                                    src={selected.image}
                                    alt={selected.name}
                                    className="w-full h-full object-cover brightness-50"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-surface/50 via-surface/10 to-transparent" />
                                <button
                                    onClick={() => setSelected(null)}
                                    className="absolute top-6 right-6 w-10 h-10 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all hover:scale-110 active:scale-90"
                                >
                                    <X size={20} />
                                </button>
                                
                                <div className="absolute bottom-8 left-10">
                                    {(() => {
                                        const idx = withRarity.find(a => a.name === selected.name)?.rank ?? 0;
                                        const r = getRarity(idx, achievements.length);
                                        return (
                                            <div className={cn("flex items-center gap-3 px-4 py-1.5 rounded-xl border text-[10px] font-black tracking-normal uppercase backdrop-blur-xl shadow-2xl", r.color, "bg-black/40 border-white/5")}>
                                                {r.icon} {r.label} PARAMETER
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="p-10">
                                <h3 className="text-white text-3xl font-black tracking-tighter mb-4 uppercase ">{selected.name}</h3>
                                <p className="text-white/40 text-sm leading-loose uppercase tracking-normal font-medium">{selected.description}</p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

