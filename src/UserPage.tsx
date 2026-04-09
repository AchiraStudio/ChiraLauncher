import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "./store/gameStore";
import { useProfileStore } from "./store/profileStore";
import { formatPlaytime } from "./lib/format";
import { convertFileSrc } from "@tauri-apps/api/core";
import { 
    Edit2, 
    Check, 
    X, 
    Shield, 
    Copy, 
    Trophy, 
    Gamepad2, 
    Clock, 
    Play, 
    TrendingUp, 
    History, 
    BarChart3, 
    Sparkles, 
    Rocket,
    User,
    Lock,
    Target
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "./lib/utils";

// ── XP / Level System ────────────────────────────────────────────────────────
function computeLevel(totalGames: number, totalPlaytimeSeconds: number) {
    const xp = totalGames * 100 + Math.floor(totalPlaytimeSeconds / 3600) * 50;
    const level = Math.max(1, Math.floor(xp / 500) + 1);
    const xpForCurrentLevel = (level - 1) * 500;
    const xpForNextLevel = level * 500;
    const xpProgress = ((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;
    return { level, xp, xpProgress: Math.min(xpProgress, 100) };
}

// ── Milestone Badges ──────────────────────────────────────────────────────────
const ALL_MILESTONES = [
    { id: "first_game", icon: <Gamepad2 size={16} />, label: "Core Initialized", desc: "Added your first game", check: (g: number, _: number) => g >= 1 },
    { id: "collector", icon: <Target size={16} />, label: "Collector", desc: "5+ games in your library", check: (g: number, _: number) => g >= 5 },
    { id: "hoarder", icon: <Shield size={16} />, label: "Archivist", desc: "10+ games in your library", check: (g: number, _: number) => g >= 10 },
    { id: "hour_one", icon: <Clock size={16} />, label: "Cycle One", desc: "1+ hour of playtime", check: (_: number, s: number) => s >= 3600 },
    { id: "time_lord", icon: <Sparkles size={16} />, label: "Time Lord", desc: "10+ hours of total playtime", check: (_: number, s: number) => s >= 36000 },
    { id: "marathon", icon: <TrendingUp size={16} />, label: "Marathon", desc: "100+ hours of playtime", check: (_: number, s: number) => s >= 360000 },
];

export function UserPage() {
    const navigate = useNavigate();
    const gamesById = useGameStore((s) => s.gamesById);
    const allGames = Object.values(gamesById);

    const stats = useMemo(() => {
        const totalGames = allGames.length;
        const totalPlaytime = allGames.reduce((sum, g) => sum + (g.playtime_seconds || 0), 0);

        const topGames = [...allGames]
            .filter(g => g.playtime_seconds > 0)
            .sort((a, b) => b.playtime_seconds - a.playtime_seconds)
            .slice(0, 5);

        const recentGames = [...allGames]
            .filter(g => g.last_played)
            .sort((a, b) => (b.last_played ?? "").localeCompare(a.last_played ?? ""))
            .slice(0, 5);

        const genreMap: Record<string, number> = {};
        allGames.forEach(g => {
            const genre = g.genre || "Unknown";
            genreMap[genre] = (genreMap[genre] || 0) + 1;
        });
        const topGenres = Object.entries(genreMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const { level, xp, xpProgress } = computeLevel(totalGames, totalPlaytime);
        const unlockedBadges = ALL_MILESTONES.filter(m => m.check(totalGames, totalPlaytime));
        const lockedBadges = ALL_MILESTONES.filter(m => !m.check(totalGames, totalPlaytime));

        return { totalGames, totalPlaytime, topGames, recentGames, topGenres, level, xp, xpProgress, unlockedBadges, lockedBadges };
    }, [allGames]);

    const { profile, updateProfile } = useProfileStore();
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(profile?.username || "");
    const [editSteamId, setEditSteamId] = useState(profile?.steam_id || "");

    useEffect(() => {
        if (profile) {
            setEditName(profile.username);
            setEditSteamId(profile.steam_id || "");
        }
    }, [profile]);

    const handleSave = async () => {
        try {
            await updateProfile(editName, editSteamId || null);
            setIsEditing(false);
            toast.success("Identity profile updated");
        } catch (e) {
            toast.error("Failed to update profile");
        }
    };

    const copySteamId = () => {
        if (profile?.steam_id) {
            navigator.clipboard.writeText(profile.steam_id);
            toast.success("Steam ID copied to system clipboard");
        }
    };

    const statCards = [
        { label: "Library Capacity", value: stats.totalGames.toString(), icon: <Gamepad2 size={24} />, color: "from-accent/10 to-transparent", barColor: "from-accent to-blue-400", border: "border-accent/10", pct: Math.min((stats.totalGames / 50) * 100, 100) },
        { label: "Total Playtime", value: formatPlaytime(stats.totalPlaytime), icon: <Clock size={24} />, color: "from-purple-500/10 to-transparent", barColor: "from-purple-400 to-purple-600", border: "border-purple-500/10", pct: Math.min((stats.totalPlaytime / 360000) * 100, 100) },
        { label: "Games Played", value: allGames.filter(g => g.playtime_seconds > 0).length.toString(), icon: <Play size={24} />, color: "from-green-500/10 to-transparent", barColor: "from-green-400 to-green-600", border: "border-green-500/10", pct: stats.totalGames > 0 ? (allGames.filter(g => g.playtime_seconds > 0).length / stats.totalGames) * 100 : 0 },
    ];

    return (
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="flex flex-col min-h-full px-14 pt-14 pb-32 max-w-[1440px] mx-auto w-full">

                {/* ── Header / Avatar ──────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center gap-10 mb-14"
                >
                    <div className="relative group">
                        <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-3xl bg-surface/30 flex items-center justify-center backdrop-blur-3xl group-hover:border-accent/40 transition-all duration-500">
                            {profile?.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt="Profile"
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                />
                            ) : (
                                <User size={48} className="text-white/5" />
                            )}
                        </div>
                    </div>

                    <div className="flex-1">
                        {isEditing ? (
                            <div className="space-y-4">
                                <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-3xl font-black text-white focus:outline-none focus:border-accent outline-none w-full max-w-sm shadow-inner"
                                    placeholder="Username"
                                />
                                <div className="flex items-center gap-3">
                                    <Shield className="h-4 w-4 text-white/20" />
                                    <input
                                        value={editSteamId}
                                        onChange={(e) => setEditSteamId(e.target.value)}
                                        className="bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-[11px] font-black text-white/40 focus:outline-none focus:border-accent outline-none w-full max-w-[240px] uppercase tracking-widest shadow-inner"
                                        placeholder="Steam ID (17 digits)"
                                    />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-6">
                                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase ">{profile?.username || "GUEST_SYSTEM"}</h1>
                                    {profile?.steam_id && (
                                        <div
                                            onClick={copySteamId}
                                            className="flex items-center gap-3 px-4 py-1.5 bg-white/[0.03] border border-white/10 rounded-xl text-[10px] font-black text-white/20 cursor-pointer hover:bg-white/10 hover:text-white/60 transition-all uppercase tracking-normal shadow-xl group"
                                            title="Copy Identity Token"
                                        >
                                            <Shield className="h-3 w-3" />
                                            ID: {profile.steam_id}
                                            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    )}
                                </div>
                                <p className="text-white/20 text-[10px] font-black mt-3 tracking-normal uppercase  font-medium">Node Operator · Level {stats.level} Gamer · Est. 2025</p>
                            </>
                        )}

                        {/* XP Bar */}
                        <div className="mt-6 flex items-center gap-5">
                            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden max-w-[320px] border border-white/5 shadow-inner">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-accent to-blue-400 rounded-full shadow-[0_0_15px_rgba(192,38,211,0.3)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${stats.xpProgress}%` }}
                                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                                />
                            </div>
                            <span className="text-[10px] text-white/20 font-black tracking-widest tabular-nums uppercase">{stats.xp} / {(stats.level) * 500} XP</span>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <AnimatePresence mode="wait">
                            {isEditing ? (
                                <motion.div
                                    key="editing"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="flex gap-3"
                                >
                                    <button
                                        onClick={handleSave}
                                        className="w-12 h-12 flex items-center justify-center bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-2xl text-green-500 transition-all active:scale-90 shadow-xl"
                                    >
                                        <Check size={20} />
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="w-12 h-12 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl text-red-500 transition-all active:scale-90 shadow-xl"
                                    >
                                        <X size={20} />
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.button
                                    key="static"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => setIsEditing(true)}
                                    className="w-12 h-12 flex items-center justify-center bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 rounded-2xl text-white/20 hover:text-white transition-all active:scale-90 shadow-xl"
                                >
                                    <Edit2 size={20} />
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                {/* ── Stat Cards ────────────────────────────────────────── */}
                <div className="grid grid-cols-3 gap-8 mb-16">
                    {statCards.map((card, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={cn(
                                "bg-gradient-to-br border rounded-[2rem] p-8 flex items-center gap-6 shadow-3xl backdrop-blur-3xl relative overflow-hidden",
                                card.color, card.border
                            )}
                        >
                            <div className="text-white/10">{card.icon}</div>
                            <div className="flex-1 w-full">
                                <p className="text-white text-4xl font-black leading-none drop-shadow-2xl tabular-nums uppercase">{card.value}</p>
                                <p className="text-white/20 text-[9px] font-black tracking-normal uppercase mt-3 mb-4 ">{card.label}</p>
                                <div className="h-2 bg-black/30 rounded-full overflow-hidden w-full shadow-inner">
                                    <motion.div
                                        className={cn("h-full bg-gradient-to-r rounded-full", card.barColor)}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${card.pct}%` }}
                                        transition={{ duration: 1.2, delay: i * 0.15, ease: "easeOut" }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* ── Badges / Milestones ───────────────────────────────── */}
                <div className="mb-16">
                    <div className="flex items-center gap-6 mb-8 px-2">
                        <Trophy size={20} className="text-accent" />
                        <h2 className="text-white font-black tracking-widest text-xs uppercase ">Honors</h2>
                        <div className="h-px flex-1 bg-white/5" />
                        <span className="text-white/10 font-black text-[10px] tracking-normal uppercase">
                            {stats.unlockedBadges.length} / {ALL_MILESTONES.length} UNLOCKED
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-4 px-2">
                        {ALL_MILESTONES.map((badge, i) => {
                            const unlocked = stats.unlockedBadges.some(b => b.id === badge.id);
                            return (
                                <motion.div
                                    key={badge.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.05 }}
                                    title={badge.desc}
                                    className={cn(
                                        "flex items-center gap-4 px-6 py-4 rounded-2xl border text-xs font-black transition-all duration-500 uppercase tracking-widest ",
                                        unlocked
                                            ? "bg-accent/5 border-accent/20 text-white shadow-2xl shadow-accent/10"
                                            : "bg-white/[0.01] border-white/5 text-white/10 cursor-not-allowed"
                                    )}
                                >
                                    <div className={cn("transition-all duration-500", unlocked ? "text-accent scale-110" : "opacity-20")}>
                                        {badge.icon}
                                    </div>
                                    <span>{badge.label}</span>
                                    {!unlocked && <Lock size={12} className="ml-2 text-white/5" />}
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Content Grid OR Empty State ───────────────────────────── */}
                {stats.totalGames === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-4 flex flex-col items-center justify-center p-24 rounded-[3.5rem] border border-white/5 bg-surface/20 backdrop-blur-3xl text-center relative overflow-hidden group shadow-3xl"
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(192,38,211,0.05),transparent_60%)] pointer-events-none" />
                        <div className="w-24 h-24 rounded-[2rem] glass-panel flex items-center justify-center mb-10 shadow-3xl border border-white/5 group-hover:scale-110 transition-transform duration-700">
                             <Rocket size={48} className="text-accent drop-shadow-[0_0_15px_rgba(192,38,211,0.3)]" />
                        </div>
                        <h2 className="text-4xl font-black text-white tracking-widest uppercase">Initialize the Void</h2>
                        <p className="text-white/20 text-xs mt-6 max-w-[420px] leading-loose font-medium tracking-widest uppercase">
                            The index is currently offline. Navigate to the Browse sector to sync repacks, or import manual cores to begin your journey.
                        </p>
                        <div className="flex gap-6 mt-12 relative z-10">
                            <button
                                onClick={() => navigate("/browse")}
                                className="px-8 py-3.5 bg-accent hover:bg-accent text-white font-black tracking-normal uppercase rounded-2xl transition-all shadow-3xl shadow-accent/20 hover:scale-105 active:scale-95 text-[10px]"
                            >
                                BROWSE CORES
                            </button>
                            <button
                                onClick={() => navigate("/library")}
                                className="px-8 py-3.5 bg-white/[0.03] hover:bg-white/[0.08] text-white/40 hover:text-white font-black tracking-normal uppercase rounded-2xl transition-all border border-white/5 hover:scale-105 active:scale-95 text-[10px]"
                            >
                                INJECT MANUAL
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-3 gap-12 px-2">
                        {/* Most Played */}
                        <div className="col-span-2 space-y-6">
                            <div className="flex items-center gap-6 mb-8">
                                <Target size={20} className="text-accent" />
                                <h2 className="text-white font-black tracking-widest text-xs uppercase ">Priority Usage</h2>
                                <div className="h-px flex-1 bg-white/5" />
                            </div>
                            
                            <div className="space-y-4">
                                {stats.topGames.map((game, i) => {
                                    const maxTime = stats.topGames[0]?.playtime_seconds || 1;
                                    const pct = (game.playtime_seconds / maxTime) * 100;
                                    return (
                                        <motion.div
                                            key={game.id}
                                            initial={{ opacity: 0, x: -12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.08 }}
                                            className="flex items-center gap-6 bg-white/[0.01] hover:bg-white/[0.04] rounded-3xl border border-white/5 px-6 py-5 transition-all duration-500 cursor-pointer group shadow-xl"
                                            onClick={() => navigate(`/game/${game.id}`)}
                                        >
                                            <span className="text-white/10 font-black text-xl w-8 text-right flex-shrink-0 tabular-nums ">#{i + 1}</span>
                                            <div className="w-12 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-black/40 border border-white/5 shadow-2xl group-hover:scale-105 transition-transform duration-500">
                                                {game.cover_image_path && (
                                                    <img src={convertFileSrc(game.cover_image_path)} alt="" className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-black text-lg truncate group-hover:text-accent transition-colors drop-shadow-xl uppercase ">{game.title}</p>
                                                <div className="mt-3 h-2 bg-black/40 rounded-full overflow-hidden shadow-inner flex-1 max-w-[280px]">
                                                    <motion.div
                                                        className="h-full bg-gradient-to-r from-accent to-blue-500 rounded-full shadow-[0_0_10px_rgba(102,192,244,0.2)]"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${pct}%` }}
                                                        transition={{ delay: 0.2 + i * 0.08, duration: 1, ease: "easeOut" }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-white font-black text-[12px] tabular-nums bg-white/[0.03] px-3 py-1 rounded-xl border border-white/5 shadow-xl ">
                                                    {formatPlaytime(game.playtime_seconds)}
                                                </span>
                                                <span className="text-[10px] font-black text-white/10 tracking-normal uppercase ">TOTAL CYCLES</span>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Sidebar */}
                        <div className="col-span-1 space-y-12">
                            {/* Recently Played */}
                            <div>
                                <div className="flex items-center gap-6 mb-10">
                                    <History size={20} className="text-purple-400" />
                                    <h2 className="text-white font-black tracking-widest text-xs uppercase ">Activity</h2>
                                    <div className="h-px flex-1 bg-white/5" />
                                </div>
                                <div className="space-y-4">
                                    {stats.recentGames.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-10 gap-4 glass-panel border border-dashed border-white/5 rounded-3xl opacity-20">
                                            <Clock size={24} />
                                            <p className="text-[10px] font-black tracking-widest uppercase">No logs detected</p>
                                        </div>
                                    ) : (
                                        stats.recentGames.map((game, i) => (
                                            <motion.div
                                                key={game.id}
                                                initial={{ opacity: 0, x: 12 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.1 }}
                                                onClick={() => navigate(`/game/${game.id}`)}
                                                className="flex items-center gap-5 bg-white/[0.02] rounded-[1.5rem] border border-white/5 px-5 py-4 hover:border-purple-400/40 transition-all duration-500 cursor-pointer group hover:bg-white/[0.06] shadow-xl"
                                            >
                                                <div className="w-10 h-10 bg-purple-500/10 rounded-xl text-center flex items-center justify-center text-purple-400/60 group-hover:scale-110 transition-transform">
                                                    <Play size={14} fill="currentColor" stroke="none" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-black truncate group-hover:text-purple-400 transition-colors uppercase ">{game.title}</p>
                                                    <p className="text-white/20 text-[10px] font-black tracking-widest uppercase mt-1">
                                                        {game.last_played
                                                            ? new Date(game.last_played).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                                            : "INITIAL SYNC"}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Top Genres */}
                            <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-10 shadow-3xl backdrop-blur-3xl relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none" />
                                <div className="flex items-center gap-6 mb-10 relative z-10">
                                    <BarChart3 size={20} className="text-green-400" />
                                    <h2 className="text-white font-black tracking-widest text-xs uppercase ">Taxonomy</h2>
                                </div>
                                {stats.topGenres.length === 0 ? (
                                    <p className="text-white/20 text-[10px] font-black tracking-widest uppercase py-6 relative z-10">DATA INSUFFICIENT</p>
                                ) : (
                                    <div className="space-y-6 relative z-10 text-pretty">
                                        {stats.topGenres.map(([genre, count], i) => {
                                            const maxCount = stats.topGenres[0]?.[1] || 1;
                                            const colors = ["from-green-400/60", "from-blue-400/60", "from-purple-400/60", "from-orange-400/60", "from-pink-400/60"];
                                            return (
                                                <div key={i} className="space-y-3">
                                                    <div className="flex justify-between text-[10px] font-black tracking-widest uppercase">
                                                        <span className="text-white/60 ">{genre}</span>
                                                        <span className="text-white/20 tabular-nums bg-white/[0.03] px-2 py-0.5 rounded-lg border border-white/5">{count}</span>
                                                    </div>
                                                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/5">
                                                        <motion.div
                                                            className={cn("h-full bg-gradient-to-r rounded-full shadow-lg", colors[i] ?? "from-accent/60", "to-transparent")}
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${(count / maxCount) * 100}%` }}
                                                            transition={{ delay: 0.3 + i * 0.1, duration: 1.2, ease: "easeOut" }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Footer sequence */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="mt-32 pt-12 border-t border-white/5 flex flex-col items-center gap-6 text-white/10"
                >
                    <Sparkles size={24} className="opacity-20 translate-y-0 animate-pulse duration-[3000ms]" />
                    <p className="text-[10px] font-black tracking-normal uppercase">Identity Link Stable — Secure Sequence End</p>
                </motion.div>
            </div>
        </div>
    );
}

