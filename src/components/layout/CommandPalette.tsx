import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
    Search, Gamepad2, Plus, FolderSearch, RefreshCw, Home, Library, Heart, Download, Settings, User, PanelLeft, CornerDownLeft, Play,
} from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { useUpdateStore } from "../../store/updateStore";
import { useGames, matchesQuery, sortGames } from "../../hooks/useGames";
import { launchGame } from "../../services/gameService";
import { useLocalImage } from "../../hooks/useLocalImage";
import { cn } from "../../lib/utils";
import { Kbd } from "../ui/controls";
import type { Game } from "../../types/game";

interface Entry {
    id: string;
    group: "Games" | "Actions" | "Go to";
    label: string;
    hint?: string;
    icon?: React.ReactNode;
    game?: Game;
    run: () => void;
}

function Thumb({ game }: { game: Game }) {
    const { src } = useLocalImage(game.cover_path);
    return (
        <span className="grid h-9 w-6 shrink-0 place-items-center overflow-hidden rounded bg-raised">
            {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Gamepad2 size={13} className="text-fg-mute" />}
        </span>
    );
}

export function CommandPalette() {
    const open = useUiStore((s) => s.paletteOpen);
    const setOpen = useUiStore((s) => s.setPaletteOpen);
    const ui = useUiStore;
    const navigate = useNavigate();
    const games = useGames();
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (open) { setQuery(""); setIndex(0); } }, [open]);

    const entries = useMemo<Entry[]>(() => {
        const close = () => setOpen(false);
        const go = (path: string) => () => { close(); navigate(path); };
        const actions: Entry[] = [
            { id: "a-add", group: "Actions", label: "Add a game", icon: <Plus size={16} />, run: () => { close(); ui.getState().setAddGameOpen(true); } },
            { id: "a-scan", group: "Actions", label: "Scan a folder for games", icon: <FolderSearch size={16} />, run: () => { close(); ui.getState().setScannerOpen(true); } },
            {
                id: "a-update", group: "Actions", label: "Check for updates", icon: <RefreshCw size={16} />,
                run: () => { close(); ui.getState().setUpdateDialogOpen(true); void useUpdateStore.getState().checkForUpdates(); },
            },
            { id: "a-sidebar", group: "Actions", label: "Toggle sidebar", icon: <PanelLeft size={16} />, run: () => { close(); ui.getState().toggleSidebar(); } },
        ];
        const nav: Entry[] = [
            { id: "n-home", group: "Go to", label: "Home", icon: <Home size={16} />, run: go("/") },
            { id: "n-lib", group: "Go to", label: "Library", icon: <Library size={16} />, run: go("/library") },
            { id: "n-fav", group: "Go to", label: "Favorites", icon: <Heart size={16} />, run: go("/library?filter=favorites") },
            { id: "n-dl", group: "Go to", label: "Downloads", icon: <Download size={16} />, run: go("/downloads") },
            { id: "n-prof", group: "Go to", label: "Profile", icon: <User size={16} />, run: go("/profile") },
            { id: "n-set", group: "Go to", label: "Settings", icon: <Settings size={16} />, run: go("/settings") },
        ];
        const q = query.trim();
        const pool = q ? games.filter((g) => matchesQuery(g, q)) : sortGames(games, "recent").filter((g) => g.last_played);
        const gameEntries: Entry[] = pool.slice(0, q ? 8 : 5).map((g) => ({
            id: `g-${g.id}`, group: "Games", label: g.title, hint: g.developer ?? undefined, game: g, run: go(`/game/${g.id}`),
        }));
        const match = (e: Entry) => !q || e.label.toLowerCase().includes(q.toLowerCase());
        return [...gameEntries, ...actions.filter(match), ...nav.filter(match)];
    }, [games, query, navigate, setOpen, ui]);

    useEffect(() => setIndex(0), [query]);
    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" });
    }, [index]);

    if (!open) return null;

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, entries.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
        else if (e.key === "Enter") {
            e.preventDefault();
            const entry = entries[index];
            if (!entry) return;
            if (e.ctrlKey && entry.game) { setOpen(false); void launchGame(entry.game.id).catch(() => { }); }
            else entry.run();
        } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    };

    let lastGroup = "";
    return createPortal(
        <div className="fixed inset-0 z-[250] flex animate-fade-in items-start justify-center bg-black/60 px-4 pt-[14vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div role="dialog" aria-label="Command palette" className="w-full max-w-[600px] animate-pop-in overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-pop">
                <div className="flex items-center gap-3 border-b border-line px-4">
                    <Search size={17} className="text-fg-mute" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Search games, jump to a page, run an action…"
                        className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-mute"
                        aria-label="Search"
                    />
                    <Kbd>Esc</Kbd>
                </div>
                <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
                    {entries.length === 0 && <div className="px-4 py-10 text-center text-sm text-fg-mute">No results for "{query}"</div>}
                    {entries.map((e, i) => {
                        const header = e.group !== lastGroup ? (lastGroup = e.group) : null;
                        return (
                            <div key={e.id}>
                                {header && <div className="caption px-3 pb-1 pt-3 first:pt-1">{header}</div>}
                                <button
                                    data-i={i}
                                    onMouseMove={() => setIndex(i)}
                                    onClick={() => e.run()}
                                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === index ? "bg-accent/15" : "hover:bg-white/[0.05]")}
                                >
                                    {e.game ? <Thumb game={e.game} /> : <span className="grid h-6 w-6 place-items-center text-fg-mute">{e.icon}</span>}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-fg">{e.label}</span>
                                        {e.hint && <span className="block truncate text-xs text-fg-mute">{e.hint}</span>}
                                    </span>
                                    {i === index && (
                                        <span className="flex items-center gap-2 text-xs text-fg-mute">
                                            {e.game && <span className="flex items-center gap-1"><Kbd>Ctrl</Kbd><CornerDownLeft size={11} /> <Play size={11} /> play</span>}
                                            {!e.game && <CornerDownLeft size={13} />}
                                        </span>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body,
    );
}
