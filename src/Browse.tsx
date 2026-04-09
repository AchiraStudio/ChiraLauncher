import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FolderSearch, Settings, Sparkles, Gamepad2, Trophy, Clock, Play, Square, ChevronRight, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn, formatElapsedSeconds } from "./lib/utils";
import { formatPlaytime } from "./lib/format";
import { useGameStore } from "./store/gameStore";
import { useProcessStore } from "./store/processStore";
import { useProfileStore } from "./store/profileStore";
import { launchGame, forceStopGame } from "./services/gameService";
import type { Game } from "./types/game";
import { useLocalImage } from "./hooks/useLocalImage";

// ─── Quick Action Card ────────────────────────────────────────────────────────
interface QuickActionProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    to: string;
    color: string;
}

function QuickAction({ icon, title, description, to, color }: QuickActionProps) {
    return (
        <Link to={to} className="group relative">
            <div className={cn(
                "h-full p-6 rounded-[2rem] glass-panel border border-white/5 transition-all duration-500 hover:scale-[1.02] hover:bg-white/[0.04] hover:border-white/10 flex flex-col gap-4",
                "hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
            )}>
                <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-3",
                    color
                )}>
                    {icon}
                </div>
                <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">{title}</h3>
                    <p className="text-white/40 text-xs font-medium leading-relaxed">{description}</p>
                </div>
                <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-normal uppercase text-white/20 group-hover:text-accent transition-colors">Launch Action</span>
                    <Plus size={14} className="text-white/10 group-hover:text-accent group-hover:rotate-90 transition-all duration-500" />
                </div>
            </div>
        </Link>
    );
}

// ─── Recent Game Card ─────────────────────────────────────────────────────────
function RecentGameCard({ game, index }: { game: Game; index: number }) {
    const navigate = useNavigate();
    const runningInfo = useProcessStore((s) => s.running[game.id]);
    const isRunning = !!runningInfo;
    const elapsed = useProcessStore((s) => isRunning ? s.elapsedTimeMap[game.id] : undefined);

    // Prefer background image for these wide cards, fallback to cover
    const { src: bgUrl } = useLocalImage(game.background_image_path || (game as any).background_path || game.cover_image_path || (game as any).cover_path);

    const handleAction = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isRunning) {
            await forceStopGame(game.id);
        } else {
            await launchGame(game.id);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            onClick={() => navigate(`/library`)}
            className="group relative flex-shrink-0 w-[340px] h-[200px] rounded-[2rem] overflow-hidden cursor-pointer border border-white/5 bg-surface/40 hover:border-white/15 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
        >
            {/* Background Image */}
            {bgUrl ? (
                <img
                    src={bgUrl}
                    alt={game.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 brightness-[0.55] group-hover:brightness-[0.7] saturate-125"
                />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-zinc-900 flex items-center justify-center">
                    <Gamepad2 size={48} className="text-white/10" />
                </div>
            )}

            {/* Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

            {/* Content */}
            <div className="absolute inset-0 p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    {/* Live Indicator */}
                    <AnimatePresence>
                        {isRunning && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center gap-1.5 bg-green-500/20 backdrop-blur-md border border-green-500/30 px-3 py-1.5 rounded-xl"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">
                                    {elapsed !== undefined ? formatElapsedSeconds(elapsed) : "Running"}
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Quick Play Button (shows on hover) */}
                    <button
                        onClick={handleAction}
                        className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-md transition-all duration-300 shadow-xl opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 ml-auto",
                            isRunning
                                ? "bg-red-500/80 text-white hover:bg-red-500 hover:scale-110"
                                : "bg-accent/80 text-white hover:bg-accent hover:scale-110"
                        )}
                    >
                        {isRunning ? <Square size={18} fill="currentColor" /> : <Play size={20} fill="currentColor" className="translate-x-0.5" />}
                    </button>
                </div>

                <div>
                    <h3 className="text-xl font-black text-white leading-tight drop-shadow-lg line-clamp-2 mb-1 group-hover:text-accent transition-colors">
                        {game.title}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/50 tracking-widest uppercase">
                        <Clock size={12} className="text-white/30" />
                        {formatPlaytime(game.playtime_seconds || 0)}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export function Browse() {
    const { gamesById } = useGameStore();
    const { profile } = useProfileStore();

    // Compute real statistics
    const stats = useMemo(() => {
        const allGames = Object.values(gamesById);
        const totalGames = allGames.length;
        const totalPlaytime = allGames.reduce((acc, g) => acc + (g.playtime_seconds || 0), 0);

        // Sort by last_played (descending), fallback to playtime
        const recentGames = [...allGames]
            .filter(g => g.last_played || g.playtime_seconds > 0)
            .sort((a, b) => {
                const dateA = a.last_played ? new Date(a.last_played).getTime() : 0;
                const dateB = b.last_played ? new Date(b.last_played).getTime() : 0;
                if (dateA === dateB) return b.playtime_seconds - a.playtime_seconds;
                return dateB - dateA;
            })
            .slice(0, 8); // Grab up to 8 recent games for the carousel

        // Basic level calculation based on playtime & library size
        const xp = totalGames * 100 + Math.floor(totalPlaytime / 3600) * 50;
        const level = Math.max(1, Math.floor(xp / 500) + 1);

        return { totalGames, totalPlaytime, recentGames, level };
    }, [gamesById]);

    return (
        <div className="min-h-full w-full bg-background relative overflow-y-auto overflow-x-hidden custom-scrollbar">
            {/* Background Decorative Blobs */}
            <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-accent/20 blur-[150px] rounded-full animate-pulse opacity-40 pointer-events-none" />
            <div className="absolute top-[40%] left-[-10%] w-[600px] h-[600px] bg-purple-500/10 blur-[150px] rounded-full opacity-30 pointer-events-none" />

            <div className="relative z-10 px-14 pt-20 pb-32 max-w-[1440px] mx-auto w-full">
                {/* ── Header ────────────────────────────────────────────────── */}
                <header className="mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-px w-12 bg-accent/50" />
                            <span className="text-accent text-[10px] font-black tracking-widest uppercase">Welcome back to the Nexus</span>
                        </div>
                        <h1 className="text-7xl lg:text-8xl font-black text-white tracking-tighter leading-none uppercase mb-6">
                            Next-Gen <br /> <span className="drop-shadow-[0_0_40px_rgba(102,192,244,0.3)]">Gaming Hub</span>
                        </h1>
                        <p className="text-white/40 max-w-xl text-sm md:text-base font-medium leading-relaxed">
                            Manage your local library, track achievements, and launch your favorite titles
                            with a seamless, high-performance interface designed for gamers.
                        </p>
                    </motion.div>
                </header>

                {/* ── Quick Actions Grid ────────────────────────────────────── */}
                <section className="mb-20">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <QuickAction
                            icon={<Gamepad2 size={24} className="text-white" />}
                            title="My Library"
                            description="Browse and launch your installed games effortlessly."
                            to="/library"
                            color="bg-accent/20 border border-accent/20"
                        />
                        <QuickAction
                            icon={<FolderSearch size={24} className="text-white" />}
                            title="Scan Folders"
                            description="Automatically discover games installed on your system."
                            to="/library" // Better to point to library where scanner modal is available
                            color="bg-white/5 border border-white/10"
                        />
                        <QuickAction
                            icon={<Trophy size={24} className="text-white" />}
                            title="Identity & Stats"
                            description="View your progress, milestones, and user profile."
                            to="/user"
                            color="bg-purple-500/20 border border-purple-500/20"
                        />
                        <QuickAction
                            icon={<Settings size={24} className="text-white" />}
                            title="Settings"
                            description="Configure launcher behavior and integrations."
                            to="/settings"
                            color="bg-white/10 border border-white/10"
                        />
                    </div>
                </section>

                {/* ── Dashboard Lower Section ───────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Recent Activity Carousel */}
                    <div className="col-span-1 lg:col-span-8 flex flex-col">
                        <div className="flex items-center justify-between mb-8 px-2">
                            <h2 className="text-lg font-black tracking-widest uppercase text-white flex items-center gap-3">
                                <Clock size={20} className="text-accent" /> Continue Playing
                            </h2>
                            {stats.recentGames.length > 0 && (
                                <Link to="/library" className="flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-white/30 hover:text-accent transition-colors group">
                                    View All <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                </Link>
                            )}
                        </div>

                        <div className="flex-1 glass-panel rounded-[2.5rem] p-8 border border-white/5 flex items-center bg-surface/30">
                            {stats.recentGames.length === 0 ? (
                                <div className="w-full py-16 flex flex-col items-center justify-center text-center">
                                    <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-6">
                                        <Gamepad2 size={32} className="text-white/10" />
                                    </div>
                                    <h4 className="text-white/60 font-bold mb-2 text-lg">No recent sessions</h4>
                                    <p className="text-white/20 text-sm max-w-sm mb-8">Your recent gameplay activity will appear here once you start launching games.</p>
                                    <Link to="/library" className="px-8 py-3 rounded-xl bg-accent text-white text-[11px] font-black tracking-widest uppercase transition-all shadow-lg shadow-accent/20 hover:scale-105 active:scale-95">
                                        Go to Library
                                    </Link>
                                </div>
                            ) : (
                                <div className="w-full overflow-x-auto pb-4 pt-2 custom-scrollbar flex gap-6 snap-x snap-mandatory">
                                    {stats.recentGames.map((game, i) => (
                                        <div key={game.id} className="snap-start shrink-0">
                                            <RecentGameCard game={game} index={i} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stats / Profile Mini Card */}
                    <div className="col-span-1 lg:col-span-4 flex flex-col">
                        <div className="flex items-center mb-8 px-2">
                            <h2 className="text-lg font-black tracking-widest uppercase text-white flex items-center gap-3">
                                <User size={20} className="text-purple-400" /> Identity
                            </h2>
                        </div>

                        <div className="flex-1 glass-panel rounded-[2.5rem] p-8 border border-white/5 bg-gradient-to-br from-purple-500/5 to-transparent flex flex-col justify-center relative overflow-hidden">
                            {/* Decorative background flair */}
                            <div className="absolute -right-12 -top-12 w-48 h-48 bg-purple-500/10 blur-[50px] rounded-full pointer-events-none" />

                            <div className="flex items-center gap-5 mb-10 relative z-10">
                                <div className="w-20 h-20 rounded-[1.2rem] bg-surface-elevated border border-white/10 flex items-center justify-center shadow-2xl overflow-hidden shrink-0">
                                    {profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <Sparkles size={32} className="text-accent" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tight truncate">
                                        {profile?.username || "Guest_Pilot"}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="px-2 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 text-[9px] font-black uppercase tracking-widest">
                                            Level {stats.level}
                                        </span>
                                        <span className="text-white/30 text-[10px] font-black uppercase tracking-widest truncate">
                                            Node Operator
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 relative z-10">
                                <div className="bg-black/30 rounded-2xl p-5 border border-white/5 shadow-inner">
                                    <div className="flex items-center gap-3 mb-1">
                                        <Gamepad2 size={16} className="text-accent" />
                                        <span className="text-[11px] font-black uppercase text-white/40 tracking-widest">Library Size</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight mt-1 pl-7">
                                        {stats.totalGames} <span className="text-sm text-white/20">Titles</span>
                                    </div>
                                </div>

                                <div className="bg-black/30 rounded-2xl p-5 border border-white/5 shadow-inner">
                                    <div className="flex items-center gap-3 mb-1">
                                        <Clock size={16} className="text-purple-400" />
                                        <span className="text-[11px] font-black uppercase text-white/40 tracking-widest">Total Playtime</span>
                                    </div>
                                    <div className="text-2xl font-black text-white tracking-tight mt-1 pl-7">
                                        {formatPlaytime(stats.totalPlaytime).replace(' played', '')}
                                    </div>
                                </div>
                            </div>

                            <Link
                                to="/user"
                                className="mt-8 w-full py-4 rounded-xl border border-white/10 text-center text-xs font-black text-white/50 uppercase tracking-widest hover:bg-white/5 hover:text-white transition-colors relative z-10"
                            >
                                View Full Identity
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}