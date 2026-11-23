import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Square, Clock, Library, Trophy, Heart, Plus, FolderSearch, Gamepad2, ChevronRight } from "lucide-react";
import { useGames, sortGames, splitFocal } from "../hooks/useGames";
import { useGameActions } from "../hooks/useGameActions";
import { useGameStore } from "../store/gameStore";
import { useProcessStore } from "../store/processStore";
import { useProfileStore } from "../store/profileStore";
import { useUiStore } from "../store/uiStore";
import { useLocalImage } from "../hooks/useLocalImage";
import { useElapsed } from "../hooks/useElapsed";
import { openContextMenu } from "../store/menuStore";
import { formatElapsed, formatHours, timeAgo } from "../lib/format";
import { GameCard } from "../components/game/GameCard";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/controls";
import type { Game } from "../types/game";

function greeting(): string {
    const h = new Date().getHours();
    return h < 5 ? "Night owl mode" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Hero({ game }: { game: Game }) {
    const { play, open } = useGameActions();
    const running = useProcessStore((s) => s.running[game.id]);
    const busy = useProcessStore((s) => !!(s.launching[game.id] || s.stopping[game.id]));
    const elapsed = useElapsed(running?.startTime);
    const { src: bgFocal, pos } = splitFocal(game.background_path);
    const { src } = useLocalImage(bgFocal ?? game.cover_path);
    const { src: logo } = useLocalImage(game.logo_path);

    return (
        <section className="relative isolate h-[300px] overflow-hidden rounded-2xl border border-line-strong">
            {src && <img src={src} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" style={{ objectPosition: pos === "center" ? "center 25%" : pos }} />}
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-bg via-bg/65 to-transparent" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-bg/80 to-transparent" />
            <div className="flex h-full max-w-[560px] flex-col justify-end p-8">
                <div className="mb-3 text-xs font-medium text-fg-soft">
                    {running ? <span className="inline-flex items-center gap-1.5 text-ok"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />Playing now · {formatElapsed(elapsed)}</span>
                        : game.last_played ? `Continue playing · ${timeAgo(game.last_played)}` : "Jump in"}
                </div>
                {logo ? <img src={logo} alt={game.title} className="mb-4 max-h-[84px] max-w-[320px] object-contain object-left drop-shadow-[0_4px_16px_rgb(0_0_0/0.7)]" onError={(e) => (e.currentTarget.style.display = "none")} />
                    : <h2 className="mb-4 text-balance text-[32px] font-bold leading-tight tracking-tight">{game.title}</h2>}
                <div className="flex items-center gap-3">
                    <Button variant={running ? "danger" : "primary"} size="lg" loading={busy} data-no-press-sound
                        icon={running ? <Square size={16} fill="currentColor" /> : <Play size={17} fill="currentColor" />} onClick={() => void play(game)}>
                        {running ? "Stop" : "Play"}
                    </Button>
                    <Button variant="secondary" size="lg" onClick={() => open(game)} className="!bg-black/30">Details</Button>
                </div>
            </div>
        </section>
    );
}

function Rail({ title, games, to, icon }: { title: string; games: Game[]; to?: string; icon?: React.ReactNode }) {
    const navigate = useNavigate();
    const { open, play, menu } = useGameActions();
    if (games.length === 0) return null;
    return (
        <section>
            <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold">{icon}{title}</h2>
                {to && <button onClick={() => navigate(to)} className="inline-flex items-center gap-0.5 text-[13px] text-fg-mute hover:text-fg">See all <ChevronRight size={14} /></button>}
            </div>
            <div className="no-scrollbar -mx-2 flex gap-4 overflow-x-auto px-2 pb-3">
                {games.map((g) => (
                    <div key={g.id} className="w-[148px] shrink-0">
                        <GameCard game={g} onOpen={open} onPlay={play} onContext={(e, game) => openContextMenu(e, menu(game))} />
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function Home() {
    const games = useGames();
    const loaded = useGameStore((s) => s.loaded);
    const running = useProcessStore((s) => s.running);
    const username = useProfileStore((s) => s.profile?.username);
    const setAddGameOpen = useUiStore((s) => s.setAddGameOpen);
    const setScannerOpen = useUiStore((s) => s.setScannerOpen);

    const data = useMemo(() => {
        const recent = sortGames(games.filter((g) => g.last_played), "recent");
        const runningGame = games.find((g) => running[g.id]);
        const unlocked = games.reduce((n, g) => n + (g.achievements_unlocked ?? 0), 0);
        return {
            hero: runningGame ?? recent[0] ?? games[0],
            recent: recent.slice(0, 12),
            favorites: games.filter((g) => g.is_favorite).slice(0, 12),
            added: sortGames(games, "added").slice(0, 12),
            total: games.reduce((n, g) => n + g.playtime_seconds, 0),
            unlocked,
            favCount: games.filter((g) => g.is_favorite).length,
        };
    }, [games, running]);

    if (loaded && games.length === 0) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState
                    icon={<Gamepad2 size={30} />}
                    title={`Welcome${username ? `, ${username}` : ""}`}
                    description="Your library is empty. Add your first game, or scan a folder and ChiraLauncher will detect your installed games, achievements and artwork."
                    actions={<>
                        <Button variant="primary" size="lg" icon={<Plus size={18} />} onClick={() => setAddGameOpen(true)}>Add a game</Button>
                        <Button variant="secondary" size="lg" icon={<FolderSearch size={18} />} onClick={() => setScannerOpen(true)}>Scan a folder</Button>
                    </>}
                />
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1180px] space-y-9 px-8 pb-12 pt-8">
                <header>
                    <h1 className="text-[26px] font-semibold tracking-tight">{greeting()}{username ? `, ${username}` : ""}</h1>
                    <p className="mt-0.5 text-sm text-fg-mute">Here's where you left off.</p>
                </header>

                {!loaded ? <div className="skeleton h-[300px] rounded-2xl" /> : data.hero && <Hero game={data.hero} />}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                        { icon: <Library size={15} />, label: "Games", value: games.length.toLocaleString() },
                        { icon: <Clock size={15} />, label: "Hours played", value: formatHours(data.total) },
                        { icon: <Trophy size={15} />, label: "Achievements", value: data.unlocked.toLocaleString() },
                        { icon: <Heart size={15} />, label: "Favorites", value: data.favCount.toLocaleString() },
                    ].map((s) => (
                        <div key={s.label} className="surface px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-xs text-fg-mute">{s.icon}{s.label}</div>
                            <div className="mt-2 text-2xl font-semibold tabular-nums leading-none">{s.value}</div>
                        </div>
                    ))}
                </div>

                <Rail title="Recently played" icon={<Clock size={16} className="text-fg-mute" />} games={data.recent} to="/library?filter=recent" />
                <Rail title="Favorites" icon={<Heart size={16} className="text-rose-400" />} games={data.favorites} to="/library?filter=favorites" />
                <Rail title="Recently added" icon={<Plus size={16} className="text-fg-mute" />} games={data.added} to="/library" />
            </div>
        </div>
    );
}
