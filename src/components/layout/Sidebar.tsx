import { memo, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Home, Library, Download, Settings, User, Plus, PanelLeftClose, PanelLeftOpen, Square, ArrowUpCircle } from "lucide-react";
import { useHttpStore, isActiveStatus } from "../../store/httpStore";
import { useUiStore } from "../../store/uiStore";
import { useProcessStore } from "../../store/processStore";
import { useGameStore } from "../../store/gameStore";
import { useUpdateStore } from "../../store/updateStore";
import { useElapsed } from "../../hooks/useElapsed";
import { formatElapsed } from "../../lib/format";
import { forceStopGame } from "../../services/gameService";
import { useLocalImage } from "../../hooks/useLocalImage";
import { cn } from "../../lib/utils";
import { Tooltip } from "../ui/controls";

interface NavDef { to: string; label: string; icon: React.ReactNode; end?: boolean }

const NAV: NavDef[] = [
    { to: "/", label: "Home", icon: <Home size={19} />, end: true },
    { to: "/library", label: "Library", icon: <Library size={19} /> },
    { to: "/downloads", label: "Downloads", icon: <Download size={19} /> },
    { to: "/profile", label: "Profile", icon: <User size={19} /> },
];

function NavItem({ item, collapsed, badge }: { item: NavDef; collapsed: boolean; badge?: number }) {
    const link = (
        <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
                cn(
                    "relative flex h-10 items-center gap-3 rounded-[10px] text-sm font-medium transition-colors",
                    collapsed ? "w-10 justify-center" : "px-3",
                    isActive ? "bg-accent/14 text-accent" : "text-fg-soft hover:bg-white/[0.06] hover:text-fg",
                )
            }
        >
            {({ isActive }) => (
                <>
                    {isActive && <span className="absolute -left-3 top-2.5 h-5 w-[3px] rounded-r-full bg-accent" />}
                    {item.icon}
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!!badge && badge > 0 && (
                        collapsed
                            ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-panel" />
                            : <span className="rounded-md bg-accent/20 px-1.5 text-[11px] font-semibold tabular-nums text-accent">{badge}</span>
                    )}
                </>
            )}
        </NavLink>
    );
    return collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link;
}

/** Shows the (first) running game with a live timer and a stop button. */
const NowPlaying = memo(function NowPlaying({ collapsed }: { collapsed: boolean }) {
    const running = useProcessStore((s) => s.running);
    const first = Object.values(running)[0];
    const game = useGameStore((s) => (first ? s.gamesById[first.gameId] : undefined));
    const elapsed = useElapsed(first?.startTime);
    const { src } = useLocalImage(game?.cover_path);
    const navigate = useNavigate();
    if (!first || !game) return null;
    const count = Object.keys(running).length;

    if (collapsed) {
        return (
            <Tooltip label={`Playing ${game.title}`}>
                <button onClick={() => navigate(`/game/${game.id}`)} className="relative h-10 w-10 overflow-hidden rounded-[10px] ring-2 ring-ok/60" aria-label={`Playing ${game.title}`}>
                    {src && <img src={src} alt="" className="h-full w-full object-cover" />}
                    <span className="absolute bottom-0.5 right-0.5 h-2 w-2 animate-pulse rounded-full bg-ok" />
                </button>
            </Tooltip>
        );
    }
    return (
        <div className="rounded-xl border border-ok/25 bg-ok/[0.07] p-2.5">
            <div className="flex items-center gap-2.5">
                <button onClick={() => navigate(`/game/${game.id}`)} className="h-11 w-8 shrink-0 overflow-hidden rounded-md bg-raised" aria-label={game.title}>
                    {src && <img src={src} alt="" className="h-full w-full object-cover" />}
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-ok">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" /> Now playing{count > 1 && ` · +${count - 1}`}
                    </div>
                    <div className="truncate text-[13px] font-medium text-fg">{game.title}</div>
                    <div className="font-mono text-[11px] text-fg-mute">{formatElapsed(elapsed)}</div>
                </div>
                <button
                    onClick={() => void forceStopGame(game.id)}
                    aria-label={`Stop ${game.title}`}
                    title="Stop game"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-danger/15 text-danger transition-colors hover:bg-danger/25"
                >
                    <Square size={12} fill="currentColor" />
                </button>
            </div>
        </div>
    );
});

export function Sidebar() {
    const collapsed = useUiStore((s) => s.sidebarCollapsed);
    const toggle = useUiStore((s) => s.toggleSidebar);
    const setAddGameOpen = useUiStore((s) => s.setAddGameOpen);
    const setUpdateDialogOpen = useUiStore((s) => s.setUpdateDialogOpen);
    const gameCount = useGameStore((s) => Object.keys(s.gamesById).length);
    const downloads = useHttpStore((s) => s.downloads);
    const activeDownloads = useMemo(() => downloads.filter((d) => isActiveStatus(d.status)).length, [downloads]);
    const updatePhase = useUpdateStore((s) => s.phase);
    const updateVersion = useUpdateStore((s) => s.version);
    const hasUpdate = updatePhase === "available" || updatePhase === "downloading";

    return (
        <aside
            className={cn(
                "relative z-30 flex shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-200 ease-out",
                collapsed ? "w-[68px] px-3" : "w-[224px] px-3",
            )}
        >
            <div className="pb-2 pt-3">
                {collapsed ? (
                    <Tooltip label="Add game">
                        <button onClick={() => setAddGameOpen(true)} aria-label="Add game" className="grid h-10 w-10 place-items-center rounded-[10px] bg-accent text-accent-fg transition hover:brightness-110">
                            <Plus size={19} />
                        </button>
                    </Tooltip>
                ) : (
                    <button onClick={() => setAddGameOpen(true)} className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-accent text-sm font-semibold text-accent-fg shadow-[0_8px_22px_-10px_var(--color-accent)] transition hover:brightness-110">
                        <Plus size={17} /> Add game
                    </button>
                )}
            </div>

            <nav className="flex flex-col gap-1 pt-2" aria-label="Main">
                {NAV.map((item) => (
                    <NavItem
                        key={item.to}
                        item={item}
                        collapsed={collapsed}
                        badge={item.to === "/downloads" ? activeDownloads : item.to === "/library" ? undefined : undefined}
                    />
                ))}
                {!collapsed && (
                    <div className="mt-1 px-3 text-[11px] text-fg-mute">
                        {gameCount} {gameCount === 1 ? "game" : "games"} in library
                    </div>
                )}
            </nav>

            <div className="mt-auto flex flex-col gap-2 pb-3">
                <NowPlaying collapsed={collapsed} />

                {hasUpdate && (
                    collapsed ? (
                        <Tooltip label={`Update ${updateVersion ?? ""} available`}>
                            <button onClick={() => setUpdateDialogOpen(true)} aria-label="Update available" className="relative grid h-10 w-10 place-items-center rounded-[10px] bg-accent/15 text-accent hover:bg-accent/25">
                                <ArrowUpCircle size={19} />
                                <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-accent" />
                            </button>
                        </Tooltip>
                    ) : (
                        <button onClick={() => setUpdateDialogOpen(true)} className="flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 text-left transition-colors hover:bg-accent/18">
                            <ArrowUpCircle size={18} className="shrink-0 text-accent" />
                            <div className="min-w-0 leading-tight">
                                <div className="text-[13px] font-semibold text-fg">Update available</div>
                                <div className="truncate text-[11px] text-fg-mute">v{updateVersion} · click to install</div>
                            </div>
                        </button>
                    )
                )}

                <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
                    <div className={collapsed ? undefined : "min-w-0 flex-1"}>
                        <NavItem item={{ to: "/settings", label: "Settings", icon: <Settings size={19} /> }} collapsed={collapsed} />
                    </div>
                    <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side={collapsed ? "right" : "top"}>
                        <button onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="grid h-10 w-10 place-items-center rounded-[10px] text-fg-mute transition-colors hover:bg-white/[0.06] hover:text-fg">
                            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                        </button>
                    </Tooltip>
                </div>
            </div>
        </aside>
    );
}
