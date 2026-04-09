import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "./store/gameStore";
import { useProfileStore } from "./store/profileStore";
import { formatPlaytime } from "./lib/format";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
    Edit2, Check, Shield, Copy, Trophy, Gamepad2, Clock,
    TrendingUp, BarChart3, Sparkles, User, Lock, Target, Zap, Fingerprint, Hexagon
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "./lib/utils";

function computeLevel(xp: number) {
    let level = 1;
    while (true) {
        const nextXp = Math.pow(level, 2) * 50;
        if (xp >= nextXp) {
            level++;
        } else {
            break;
        }
    }
    const xpForCurrentLevel = Math.pow(level - 1, 2) * 50;
    const xpForNextLevel = Math.pow(level, 2) * 50;
    const xpProgress = ((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;

    return { level, xpProgress: Math.min(Math.max(xpProgress, 0), 100), xpForNextLevel };
}

const ALL_MILESTONES = [
    { id: "first_game", icon: <Gamepad2 size={18} />, label: "Core Initialized", desc: "Added your first game", check: (g: number, _: number) => g >= 1 },
    { id: "collector", icon: <Target size={18} />, label: "Collector", desc: "5+ games in your library", check: (g: number, _: number) => g >= 5 },
    { id: "hoarder", icon: <Shield size={18} />, label: "Archivist", desc: "10+ games in your library", check: (g: number, _: number) => g >= 10 },
    { id: "hour_one", icon: <Clock size={18} />, label: "Cycle One", desc: "1+ hour of playtime", check: (_: number, s: number) => s >= 3600 },
    { id: "time_lord", icon: <Sparkles size={18} />, label: "Time Lord", desc: "10+ hours of total playtime", check: (_: number, s: number) => s >= 36000 },
    { id: "marathon", icon: <TrendingUp size={18} />, label: "Marathon", desc: "100+ hours of playtime", check: (_: number, s: number) => s >= 360000 },
];

export function UserPage() {
    const navigate = useNavigate();
    const gamesById = useGameStore((s) => s.gamesById);
    const { profile, updateProfile, fetchProfile } = useProfileStore();
    const allGames = Object.values(gamesById);

    // Fetch latest profile state to grab potential bulk XP additions
    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    const stats = useMemo(() => {
        const totalGames = allGames.length;
        const totalPlaytime = allGames.reduce((sum, g) => sum + (g.playtime_seconds || 0), 0);

        const topGames = [...allGames]
            .filter(g => g.playtime_seconds > 0)
            .sort((a, b) => b.playtime_seconds - a.playtime_seconds)
            .slice(0, 4);

        const genreMap: Record<string, number> = {};
        allGames.forEach(g => {
            const genre = g.genre || "Unknown";
            genreMap[genre] = (genreMap[genre] || 0) + 1;
        });
        const topGenres = Object.entries(genreMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const { level, xpProgress, xpForNextLevel } = computeLevel(profile?.xp || 0);
        const unlockedBadges = ALL_MILESTONES.filter(m => m.check(totalGames, totalPlaytime));

        return { totalGames, totalPlaytime, topGames, topGenres, level, xpProgress, xpForNextLevel, unlockedBadges };
    }, [allGames, profile?.xp]);

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

    return (
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent bg-background">
            <div className="absolute top-0 right-[10%] w-[600px] h-[600px] bg-accent/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute top-[40%] left-[-10%] w-[500px] h-[500px] bg-purple-500/10 blur-[150px] rounded-full pointer-events-none" />

            <div className="flex flex-col min-h-full px-14 pt-14 pb-32 max-w-[1440px] mx-auto w-full relative z-10">

                <header className="mb-12 flex items-center gap-4">
                    <Fingerprint className="text-accent w-8 h-8" />
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Pilot Identity</h1>
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">Global User Record</p>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* ── LEFT COLUMN: ID CARD & STATS ── */}
                    <div className="col-span-1 lg:col-span-4 flex flex-col gap-8">

                        {/* ID Card */}
                        <motion.div
                            layout
                            className="bg-[#0f1423]/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            <AnimatePresence mode="wait">
                                {isEditing ? (
                                    <motion.div key="editing" initial={{ opacity: 0, rotateY: 90 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: -90 }} className="relative z-10 flex flex-col gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2 mb-2 block">Callsign</label>
                                                <input
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-xl font-black text-white focus:outline-none focus:border-accent shadow-inner transition-colors"
                                                    placeholder="Enter Callsign"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2 mb-2 block">Steam ID (Optional)</label>
                                                <div className="relative">
                                                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                                    <input
                                                        value={editSteamId}
                                                        onChange={(e) => setEditSteamId(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl pl-11 pr-5 py-3 text-sm font-mono text-white focus:outline-none focus:border-accent shadow-inner transition-colors"
                                                        placeholder="17-digit ID"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 mt-4">
                                            <button onClick={() => setIsEditing(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors">Cancel</button>
                                            <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-accent hover:brightness-110 text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"><Check size={16} /> Save</button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div key="viewing" initial={{ opacity: 0, rotateY: -90 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: 90 }} className="relative z-10">
                                        <button onClick={() => setIsEditing(true)} className="absolute top-0 right-0 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors border border-white/5"><Edit2 size={16} /></button>

                                        <div className="flex flex-col items-center text-center mt-2">
                                            <div className="w-32 h-32 rounded-[2rem] bg-black/50 border border-white/10 shadow-2xl overflow-hidden mb-6 relative group/avatar">
                                                {profile?.avatar_url ? (
                                                    <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center"><User size={48} className="text-white/10" /></div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent mix-blend-overlay" />
                                            </div>

                                            <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-2">{profile?.username || "GUEST"}</h2>

                                            <div className="flex items-center justify-center gap-2">
                                                <span className="px-3 py-1 rounded-md bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-widest">Level {stats.level}</span>
                                                <span className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Node Operator</span>
                                            </div>

                                            {profile?.steam_id && (
                                                <button onClick={copySteamId} className="mt-6 flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-black/60 border border-white/5 rounded-lg text-white/40 hover:text-white transition-colors group/id">
                                                    <Shield size={12} />
                                                    <span className="font-mono text-[10px] tracking-widest">{profile.steam_id}</span>
                                                    <Copy size={12} className="opacity-0 group-hover/id:opacity-100 transition-opacity" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="mt-10 bg-black/40 rounded-2xl p-5 border border-white/5 shadow-inner">
                                            <div className="flex justify-between items-end mb-3">
                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Experience</span>
                                                <span className="text-xs font-mono font-bold text-accent">{profile?.xp || 0} <span className="text-white/20">/ {stats.xpForNextLevel}</span></span>
                                            </div>
                                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-gradient-to-r from-accent to-blue-400"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${stats.xpProgress}%` }}
                                                    transition={{ duration: 1, ease: "easeOut" }}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>

                        {/* Mini Stats */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[#0f1423]/60 backdrop-blur-xl rounded-3xl p-6 border border-white/5 flex flex-col items-center text-center group hover:border-white/10 transition-colors">
                                <Gamepad2 className="text-blue-400 mb-4" size={24} />
                                <span className="text-3xl font-black text-white mb-1 tabular-nums">{stats.totalGames}</span>
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Total Cores</span>
                            </div>
                            <div className="bg-[#0f1423]/60 backdrop-blur-xl rounded-3xl p-6 border border-white/5 flex flex-col items-center text-center group hover:border-white/10 transition-colors">
                                <Clock className="text-purple-400 mb-4" size={24} />
                                <span className="text-xl font-black text-white mb-1 tabular-nums leading-[1.8]">{formatPlaytime(stats.totalPlaytime).replace(' played', '')}</span>
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Time Logged</span>
                            </div>
                        </div>

                    </div>

                    {/* ── RIGHT COLUMN: ACTIVITY & HONORS ── */}
                    <div className="col-span-1 lg:col-span-8 flex flex-col gap-8">

                        {/* Honors Row */}
                        <div className="bg-[#0f1423]/60 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                                    <Trophy className="text-yellow-400" size={18} /> Service Honors
                                </h3>
                                <span className="text-xs font-bold text-white/30 bg-black/40 px-3 py-1 rounded-lg border border-white/5">
                                    {stats.unlockedBadges.length} / {ALL_MILESTONES.length}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {ALL_MILESTONES.map((badge, i) => {
                                    const unlocked = stats.unlockedBadges.some(b => b.id === badge.id);
                                    return (
                                        <motion.div
                                            key={badge.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            title={badge.desc}
                                            className={cn(
                                                "relative overflow-hidden p-5 rounded-2xl border flex items-center gap-4 transition-all duration-500",
                                                unlocked
                                                    ? "bg-yellow-500/10 border-yellow-500/20 shadow-[0_0_20px_rgba(234,179,8,0.1)]"
                                                    : "bg-black/40 border-white/5 opacity-50 grayscale"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner",
                                                unlocked ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" : "bg-white/5 text-white/20 border border-white/10"
                                            )}>
                                                {unlocked ? badge.icon : <Lock size={16} />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className={cn("text-xs font-black uppercase tracking-wider truncate mb-1", unlocked ? "text-white" : "text-white/40")}>{badge.label}</p>
                                                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest truncate">{badge.desc}</p>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
                            {/* Priority Targets */}
                            <div className="bg-[#0f1423]/60 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5 flex flex-col">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                                    <Zap className="text-blue-400" size={18} /> Most Played
                                </h3>
                                <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                    {stats.topGames.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-white/20">
                                            <Gamepad2 size={32} className="mb-2 opacity-50" />
                                            <span className="text-xs font-bold uppercase tracking-widest">No Data</span>
                                        </div>
                                    ) : (
                                        stats.topGames.map((g) => (
                                            <div key={g.id} onClick={() => navigate(`/game/${g.id}`)} className="flex items-center gap-4 bg-black/40 p-3 rounded-2xl border border-white/5 hover:bg-white/5 cursor-pointer transition-colors group">
                                                <div className="w-10 h-12 bg-black/50 rounded-lg overflow-hidden border border-white/10 shrink-0">
                                                    {g.cover_image_path ? <img src={convertFileSrc(g.cover_image_path)} className="w-full h-full object-cover" /> : <Gamepad2 className="w-full h-full p-2 text-white/20" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-xs font-bold truncate group-hover:text-accent transition-colors">{g.title}</p>
                                                    <p className="text-white/30 text-[10px] font-mono mt-1">{formatPlaytime(g.playtime_seconds)}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Taxonomy Chart */}
                            <div className="bg-[#0f1423]/60 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5 flex flex-col">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                                    <Hexagon className="text-green-400" size={18} /> Top Genres
                                </h3>
                                <div className="space-y-5 flex-1 flex flex-col justify-center">
                                    {stats.topGenres.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center text-white/20">
                                            <BarChart3 size={32} className="mb-2 opacity-50" />
                                            <span className="text-xs font-bold uppercase tracking-widest">No Data</span>
                                        </div>
                                    ) : (
                                        stats.topGenres.map(([genre, count], i) => {
                                            const max = stats.topGenres[0][1];
                                            const colors = ["bg-accent", "bg-purple-400", "bg-blue-400", "bg-green-400", "bg-yellow-400"];
                                            return (
                                                <div key={genre} className="space-y-2">
                                                    <div className="flex justify-between text-[10px] font-black tracking-widest uppercase">
                                                        <span className="text-white/60 truncate pr-4">{genre}</span>
                                                        <span className="text-white/40">{count}</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                                                        <motion.div
                                                            className={cn("h-full rounded-full", colors[i] || "bg-white/20")}
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${(count / max) * 100}%` }}
                                                            transition={{ duration: 1, delay: i * 0.1 }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}