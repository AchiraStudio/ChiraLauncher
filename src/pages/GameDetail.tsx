import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    ArrowLeft, Play, Square, Heart, Pencil, RefreshCcw, MoreHorizontal, Clock, CalendarDays, Trophy, Layers, User2, Building2,
    Tag, Hash, ShieldAlert, Gamepad2, Loader2, HardDrive,
} from "lucide-react";
import { useGameStore } from "../store/gameStore";
import { useProcessStore } from "../store/processStore";
import { useUiStore } from "../store/uiStore";
import { openContextMenu } from "../store/menuStore";
import { useGameActions } from "../hooks/useGameActions";
import { useGameExtras } from "../hooks/useGameExtras";
import { useElapsed } from "../hooks/useElapsed";
import { useLocalImage } from "../hooks/useLocalImage";
import { splitFocal } from "../hooks/useGames";
import { smartAudio } from "../services/SmartAudio";
import { formatBytes, formatDate, formatElapsed, formatPlaytime, timeAgo } from "../lib/format";
import { Cover } from "../components/game/Cover";
import { AchievementGrid } from "../components/game/AchievementGrid";
import { AboutSection } from "../components/library/AboutSection";
import { SteamDetails } from "../components/library/SteamDetails";
import { Button, IconButton } from "../components/ui/Button";
import { Badge, EmptyState, ProgressBar, Segmented } from "../components/ui/controls";
import { cn } from "../lib/utils";

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className="surface px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-xs text-fg-mute">{icon}{label}</div>
            <div className="mt-1.5 truncate text-lg font-semibold tabular-nums leading-none">{value}</div>
            {sub && <div className="mt-1.5 truncate text-xs text-fg-mute">{sub}</div>}
        </div>
    );
}

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex gap-4 py-2.5 text-[13px]">
            <dt className="w-36 shrink-0 text-fg-mute">{label}</dt>
            <dd className={cn("min-w-0 break-all text-fg-soft", mono && "font-mono text-xs")}>{value}</dd>
        </div>
    );
}

export default function GameDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const game = useGameStore((s) => (id ? s.gamesById[id] : undefined));
    const loaded = useGameStore((s) => s.loaded);
    const refreshing = useGameStore((s) => (id ? s.isRefreshing[id] : false));
    const running = useProcessStore((s) => (id ? s.running[id] : undefined));
    const busy = useProcessStore((s) => (id ? !!(s.launching[id] || s.stopping[id]) : false));
    const editGame = useUiStore((s) => s.editGame);
    const { play, menu } = useGameActions();
    const elapsed = useElapsed(running?.startTime);
    const [tab, setTab] = useState<"overview" | "achievements">("overview");
    const scrollRef = useRef<HTMLDivElement>(null);

    const { achievements, achievementsLoading, details, reviews } = useGameExtras(game, !!running);

    // Per-game background music while you're looking at the game (global playlist resumes when you leave).
    const bgmKey = game ? (game.custom_bgm_paths?.length ? game.custom_bgm_paths : game.custom_bgm_path ? [game.custom_bgm_path] : []).join("|") : "";
    useEffect(() => {
        if (!game) return;
        const paths = bgmKey ? bgmKey.split("|") : [];
        void smartAudio.playGameBGM(game.id, paths);
    }, [game?.id, bgmKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { setTab("overview"); scrollRef.current?.scrollTo({ top: 0 }); }, [id]);

    const { src: bgFocal, pos } = splitFocal(game?.background_path);
    const { src: bgSrc } = useLocalImage(bgFocal ?? game?.cover_path);
    const { src: logoSrc } = useLocalImage(game?.logo_path);
    const [logoFailed, setLogoFailed] = useState(false);
    useEffect(() => setLogoFailed(false), [game?.logo_path]);

    const earned = useMemo(() => achievements.filter((a) => a.earned).length, [achievements]);
    const achPct = achievements.length ? (earned / achievements.length) * 100 : 0;

    if (!game) {
        return (
            <div className="grid h-full place-items-center">
                {loaded ? (
                    <EmptyState icon={<Gamepad2 size={26} />} title="Game not found" description="It may have been removed from your library."
                        actions={<Button variant="primary" onClick={() => navigate("/library")}>Back to library</Button>} />
                ) : <Loader2 className="animate-spin text-fg-mute" />}
            </div>
        );
    }

    const year = game.release_date ? new Date(game.release_date).getFullYear() : null;
    const genres = (game.genre ?? "").split(",").map((g) => g.trim()).filter(Boolean).slice(0, 4);

    return (
        <div ref={scrollRef} className="h-full overflow-y-auto">
            {/* Hero */}
            <div className="relative h-[340px] overflow-hidden">
                {bgSrc && <img src={bgSrc} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-60" style={{ objectPosition: pos === "center" ? "center 20%" : pos }} />}
                <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/50 to-bg" />
                <div className="absolute inset-0 bg-gradient-to-r from-bg/70 via-transparent to-transparent" />
                <Button variant="secondary" size="sm" icon={<ArrowLeft size={15} />} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/library"))}
                    className="absolute left-6 top-5 !bg-black/40 hover:!bg-black/60">Back</Button>
            </div>

            <div className="relative mx-auto -mt-[170px] max-w-[1180px] px-8 pb-14">
                <div className="flex flex-col gap-7 sm:flex-row sm:items-end">
                    <div className="aspect-[2/3] w-[184px] shrink-0 overflow-hidden rounded-2xl border border-line-strong shadow-[0_24px_60px_-18px_rgb(0_0_0/0.9)]">
                        <Cover title={game.title} path={game.cover_path} eager />
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                        {logoSrc && !logoFailed ? (
                            <img src={logoSrc} alt={game.title} onError={() => setLogoFailed(true)} className="max-h-[92px] max-w-[min(420px,100%)] object-contain object-left drop-shadow-[0_4px_18px_rgb(0_0_0/0.7)]" />
                        ) : (
                            <h1 className="text-balance text-[34px] font-bold leading-[1.1] tracking-tight drop-shadow-[0_2px_12px_rgb(0_0_0/0.6)]">{game.title}</h1>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-fg-soft">
                            {game.developer && <span className="inline-flex items-center gap-1.5"><User2 size={14} className="text-fg-mute" />{game.developer}</span>}
                            {game.publisher && game.publisher !== game.developer && <span className="inline-flex items-center gap-1.5"><Building2 size={14} className="text-fg-mute" />{game.publisher}</span>}
                            {year && !isNaN(year) && <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-fg-mute" />{year}</span>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {genres.map((g) => <Badge key={g}>{g}</Badge>)}
                            {game.steam_app_id && <Badge tone="accent" icon={<Hash size={11} />} title="Steam App ID">{game.steam_app_id}</Badge>}
                            {game.crack_type && game.crack_type !== "unknown" && <Badge tone="warn" icon={<ShieldAlert size={11} />} title="Detected emulator">{game.crack_type}</Badge>}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-7 flex flex-wrap items-center gap-3">
                    <Button
                        variant={running ? "danger" : "primary"}
                        size="lg"
                        data-no-press-sound
                        loading={busy}
                        icon={running ? <Square size={17} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        onClick={() => void play(game)}
                        className="min-w-[170px]"
                    >
                        {running ? `Stop · ${formatElapsed(elapsed)}` : "Play"}
                    </Button>
                    <IconButton label={game.is_favorite ? "Remove from favorites" : "Add to favorites"} size="lg" active={game.is_favorite}
                        onClick={() => void useGameStore.getState().toggleFavorite(game.id)} className="border border-line-strong">
                        <Heart size={18} fill={game.is_favorite ? "currentColor" : "none"} className={game.is_favorite ? "text-rose-400" : ""} />
                    </IconButton>
                    <IconButton label="Edit details" size="lg" onClick={() => editGame(game)} className="border border-line-strong"><Pencil size={17} /></IconButton>
                    <IconButton label="Sync metadata from Steam" size="lg" disabled={refreshing} onClick={() => void useGameStore.getState().refreshMetadata(game.id)} className="border border-line-strong">
                        <RefreshCcw size={17} className={refreshing ? "animate-spin" : ""} />
                    </IconButton>
                    <IconButton label="More actions" size="lg" className="border border-line-strong"
                        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openContextMenu({ preventDefault() { }, clientX: r.left, clientY: r.bottom + 6 }, menu(game)); }}>
                        <MoreHorizontal size={18} />
                    </IconButton>
                </div>

                {/* Stats */}
                <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat icon={<Clock size={13} />} label="Playtime" value={formatPlaytime(game.playtime_seconds)} sub={game.session_count ? `${game.session_count} sessions` : "No sessions yet"} />
                    <Stat icon={<CalendarDays size={13} />} label="Last played" value={timeAgo(game.last_played)} sub={game.first_played ? `First played ${formatDate(game.first_played)}` : undefined} />
                    <button onClick={() => achievements.length && setTab("achievements")} className="text-left" disabled={!achievements.length}>
                        <div className={cn("surface h-full px-4 py-3.5", achievements.length && "transition-colors hover:border-line-strong")}>
                            <div className="flex items-center gap-1.5 text-xs text-fg-mute"><Trophy size={13} />Achievements</div>
                            <div className="mt-1.5 text-lg font-semibold tabular-nums leading-none">
                                {achievementsLoading ? "…" : achievements.length ? <>{earned}<span className="text-sm text-fg-mute"> / {achievements.length}</span></> : "-"}
                            </div>
                            {achievements.length > 0 && <ProgressBar value={achPct} tone={achPct === 100 ? "ok" : "warn"} height={4} className="mt-2.5" />}
                        </div>
                    </button>
                    <Stat icon={<HardDrive size={13} />} label="Size on disk" value={game.installed_size ? formatBytes(game.installed_size) : "-"} sub={game.added_at ? `Added ${formatDate(game.added_at)}` : undefined} />
                </div>

                {/* Tabs */}
                <div className="mt-8 border-b border-line pb-3">
                    <Segmented value={tab} onChange={setTab} options={[
                        { value: "overview", label: "Overview", icon: <Layers size={14} /> },
                        { value: "achievements", label: <>Achievements{achievements.length > 0 && <span className="ml-1 text-fg-mute">{achievements.length}</span>}</>, icon: <Trophy size={14} /> },
                    ]} />
                </div>

                <div className="mt-7">
                    {tab === "achievements" ? (
                        achievementsLoading
                            ? <div className="grid place-items-center py-20 text-fg-mute"><Loader2 className="animate-spin" /></div>
                            : <AchievementGrid achievements={achievements} gameName={game.title} />
                    ) : (
                        <div className="space-y-10">
                            {game.description ? <AboutSection description={game.description} /> : (
                                <p className="text-sm text-fg-mute">No description yet. Add a Steam App ID and sync metadata, or write your own in Edit details.</p>
                            )}
                            <SteamDetails steamDetails={details} reviews={reviews} />
                            <section>
                                <h3 className="caption mb-2 flex items-center gap-1.5"><Tag size={12} /> Technical details</h3>
                                <dl className="divide-y divide-line rounded-card border border-line bg-panel px-4">
                                    <DetailRow label="Executable" value={game.executable_path} mono />
                                    <DetailRow label="Install folder" value={game.install_dir} mono />
                                    <DetailRow label="Launch arguments" value={game.launch_args} mono />
                                    <DetailRow label="Launch method" value={String(game.execution_method).replace(/_/g, " ")} />
                                    <DetailRow label="Run as administrator" value={game.run_as_admin ? "Yes" : ""} />
                                    <DetailRow label="Game ID" value={game.id} mono />
                                </dl>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
