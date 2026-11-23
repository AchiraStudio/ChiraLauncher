import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Pencil, Check, X, Copy, Trophy, Gamepad2, Clock, Sparkles, Shield, Target, BookOpen, Database, Crown, TrendingUp, Rocket, Flame, Award, Lock, BarChart3, Hexagon,
} from "lucide-react";
import { toast } from "sonner";
import { useGameStore } from "../store/gameStore";
import { useProfileStore } from "../store/profileStore";
import { useProcessStore } from "../store/processStore";
import { computeLevel } from "../lib/xp";
import { formatHours, formatPlaytime } from "../lib/format";
import { errMsg } from "../lib/tauri";
import { Cover } from "../components/game/Cover";
import { Button } from "../components/ui/Button";
import { Field, ProgressBar, TextInput } from "../components/ui/controls";
import { cn } from "../lib/utils";

const MILESTONES = [
    { id: "first", icon: <Gamepad2 size={17} />, label: "First step", desc: "Add your first game", test: (g: number) => g >= 1 },
    { id: "collector", icon: <Target size={17} />, label: "Collector", desc: "5 games in your library", test: (g: number) => g >= 5 },
    { id: "archivist", icon: <Shield size={17} />, label: "Archivist", desc: "10 games in your library", test: (g: number) => g >= 10 },
    { id: "librarian", icon: <BookOpen size={17} />, label: "Librarian", desc: "25 games in your library", test: (g: number) => g >= 25 },
    { id: "vault", icon: <Database size={17} />, label: "Vault keeper", desc: "50 games in your library", test: (g: number) => g >= 50 },
    { id: "nexus", icon: <Crown size={17} />, label: "Nexus prime", desc: "100 games in your library", test: (g: number) => g >= 100 },
    { id: "h1", icon: <Clock size={17} />, label: "Getting started", desc: "1 hour played", test: (_: number, s: number) => s >= 3600 },
    { id: "h10", icon: <Sparkles size={17} />, label: "Time lord", desc: "10 hours played", test: (_: number, s: number) => s >= 36000 },
    { id: "h100", icon: <TrendingUp size={17} />, label: "Marathon", desc: "100 hours played", test: (_: number, s: number) => s >= 360000 },
    { id: "h500", icon: <Rocket size={17} />, label: "Ascendant", desc: "500 hours played", test: (_: number, s: number) => s >= 1800000 },
    { id: "h1000", icon: <Flame size={17} />, label: "Immortal", desc: "1,000 hours played", test: (_: number, s: number) => s >= 3600000 },
    { id: "h2500", icon: <Award size={17} />, label: "Legend", desc: "2,500 hours played", test: (_: number, s: number) => s >= 9000000 },
];

export default function Profile() {
    const navigate = useNavigate();
    const gamesById = useGameStore((s) => s.gamesById);
    const profile = useProfileStore((s) => s.profile);
    const updateProfile = useProfileStore((s) => s.updateProfile);
    const playingTitle = useProcessStore((s) => { const id = Object.keys(s.running)[0]; return id ? gamesById[id]?.title : null; });

    const [editing, setEditing] = useState(false);
    const [name, setName] = useState("");
    const [steamId, setSteamId] = useState("");
    useEffect(() => { if (profile) { setName(profile.username); setSteamId(profile.steam_id ?? ""); } }, [profile]);

    const stats = useMemo(() => {
        const games = Object.values(gamesById);
        const seconds = games.reduce((n, g) => n + g.playtime_seconds, 0);
        const top = games.filter((g) => g.playtime_seconds > 0).sort((a, b) => b.playtime_seconds - a.playtime_seconds).slice(0, 5);
        const genres = new Map<string, number>();
        for (const g of games) for (const x of (g.genre || "").split(",").map((s) => s.trim()).filter(Boolean)) genres.set(x, (genres.get(x) ?? 0) + 1);
        const topGenres = [...genres].sort((a, b) => b[1] - a[1]).slice(0, 5);
        const unlocked = games.reduce((n, g) => n + (g.achievements_unlocked ?? 0), 0);
        return { count: games.length, seconds, top, topGenres, unlocked, lvl: computeLevel(profile?.xp ?? 0) };
    }, [gamesById, profile?.xp]);

    const save = async () => {
        if (!name.trim()) return toast.error("Choose a display name");
        try {
            await updateProfile(name.trim(), steamId.trim() || null, profile?.avatar_url, null, false);
            setEditing(false);
            toast.success("Profile updated");
        } catch (e) { toast.error("Couldn't update profile", { description: errMsg(e) }); }
    };

    const earned = MILESTONES.filter((m) => m.test(stats.count, stats.seconds));
    const initial = (profile?.username ?? "?").slice(0, 1).toUpperCase();

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1100px] space-y-6 px-8 pb-12 pt-8">
                <h1 className="text-[26px] font-semibold tracking-tight">Profile</h1>

                <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
                    <div className="space-y-6">
                        <section className="surface p-6">
                            {editing ? (
                                <div className="space-y-4">
                                    <Field label="Display name"><TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={32} onKeyDown={(e) => e.key === "Enter" && void save()} /></Field>
                                    <Field label="Steam ID (optional)" hint="Your 17-digit SteamID64."><TextInput mono icon={<Shield size={14} />} value={steamId} onChange={(e) => setSteamId(e.target.value)} placeholder="76561198…" /></Field>
                                    <div className="flex gap-2 pt-1">
                                        <Button variant="secondary" className="flex-1" icon={<X size={15} />} onClick={() => { setEditing(false); setName(profile?.username ?? ""); setSteamId(profile?.steam_id ?? ""); }}>Cancel</Button>
                                        <Button variant="primary" className="flex-1" icon={<Check size={15} />} onClick={() => void save()}>Save</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="relative text-center">
                                    <button onClick={() => setEditing(true)} aria-label="Edit profile" className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-lg text-fg-mute transition-colors hover:bg-white/[0.07] hover:text-fg"><Pencil size={15} /></button>
                                    <div className="relative mx-auto h-24 w-24">
                                        <div className="grid h-full w-full place-items-center overflow-hidden rounded-full border border-line-strong bg-gradient-to-br from-accent/30 to-accent/5 text-4xl font-semibold text-accent">
                                            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initial}
                                        </div>
                                        <span className={cn("absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-panel", playingTitle ? "bg-ok" : "bg-fg-mute")} />
                                    </div>
                                    <h2 className="mt-4 text-xl font-semibold">{profile?.username ?? "Player"}</h2>
                                    <p className="mt-0.5 text-[13px] text-fg-mute">{playingTitle ? `Playing ${playingTitle}` : "Offline vault"}</p>
                                    {profile?.steam_id && (
                                        <button onClick={() => { void navigator.clipboard.writeText(profile.steam_id!); toast.success("Steam ID copied"); }} className="mx-auto mt-4 flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 font-mono text-xs text-fg-soft transition-colors hover:border-line-strong hover:text-fg">
                                            <Shield size={12} />{profile.steam_id}<Copy size={12} />
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="mt-6 border-t border-line pt-5">
                                <div className="mb-2 flex items-baseline justify-between"><span className="text-sm font-medium">Level {stats.lvl.level}</span><span className="text-xs tabular-nums text-fg-mute">{(profile?.xp ?? 0).toLocaleString()} / {stats.lvl.xpForNextLevel.toLocaleString()} XP</span></div>
                                <ProgressBar value={stats.lvl.xpProgress} height={8} />
                                <p className="mt-2 text-xs text-fg-mute">Earn XP by unlocking achievements.</p>
                            </div>
                        </section>

                        <section className="surface p-5">
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Hexagon size={15} className="text-ok" /> Top genres</h3>
                            {stats.topGenres.length === 0 ? <p className="text-[13px] text-fg-mute">Add games with genres to see a breakdown.</p> : (
                                <ul className="space-y-3">
                                    {stats.topGenres.map(([g, n]) => (
                                        <li key={g}>
                                            <div className="mb-1 flex justify-between text-[13px]"><span className="truncate">{g}</span><span className="tabular-nums text-fg-mute">{n}</span></div>
                                            <ProgressBar value={(n / stats.topGenres[0][1]) * 100} height={4} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-3 gap-3">
                            {[{ i: <Gamepad2 size={15} />, l: "Games", v: stats.count.toLocaleString() }, { i: <Clock size={15} />, l: "Hours played", v: formatHours(stats.seconds) }, { i: <Trophy size={15} />, l: "Achievements", v: stats.unlocked.toLocaleString() }].map((s) => (
                                <div key={s.l} className="surface px-4 py-3.5"><div className="flex items-center gap-1.5 text-xs text-fg-mute">{s.i}{s.l}</div><div className="mt-2 text-2xl font-semibold tabular-nums leading-none">{s.v}</div></div>
                            ))}
                        </div>

                        <section className="surface p-5">
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><BarChart3 size={15} className="text-accent" /> Most played</h3>
                            {stats.top.length === 0 ? <p className="text-[13px] text-fg-mute">Play something and it will show up here.</p> : (
                                <ul className="space-y-1">
                                    {stats.top.map((g, i) => (
                                        <li key={g.id}>
                                            <button onClick={() => navigate(`/game/${g.id}`)} className="flex w-full items-center gap-3.5 rounded-lg p-2 text-left transition-colors hover:bg-white/[0.05]">
                                                <span className="w-4 text-center text-xs tabular-nums text-fg-mute">{i + 1}</span>
                                                <span className="h-12 w-8 shrink-0 overflow-hidden rounded"><Cover title={g.title} path={g.cover_path} /></span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium">{g.title}</span>
                                                    <ProgressBar value={(g.playtime_seconds / stats.top[0].playtime_seconds) * 100} height={3} className="mt-1.5" />
                                                </span>
                                                <span className="shrink-0 text-xs tabular-nums text-fg-soft">{formatPlaytime(g.playtime_seconds)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="surface p-5">
                            <h3 className="mb-3 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><Award size={15} className="text-warn" /> Milestones</span><span className="text-xs font-normal text-fg-mute">{earned.length} / {MILESTONES.length}</span></h3>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                {MILESTONES.map((m) => {
                                    const done = earned.some((e) => e.id === m.id);
                                    return (
                                        <div key={m.id} className={cn("flex items-center gap-3 rounded-xl border p-3", done ? "border-warn/25 bg-warn/[0.06]" : "border-line opacity-55")}>
                                            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", done ? "bg-warn/15 text-warn" : "bg-white/[0.05] text-fg-mute")}>{done ? m.icon : <Lock size={15} />}</span>
                                            <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{m.label}</span><span className="block truncate text-xs text-fg-mute">{m.desc}</span></span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
