import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    Search, X, LayoutGrid, List, Plus, FolderSearch, Library as LibraryIcon, Heart, Play, Clock, FolderPlus, SearchX,
} from "lucide-react";
import { useGames, sortGames, matchesQuery, SORT_LABELS, type SortKey } from "../hooks/useGames";
import { useGameActions } from "../hooks/useGameActions";
import { useHotkeys } from "../hooks/useHotkeys";
import { usePersistentState } from "../hooks/usePersistentState";
import { useGameStore } from "../store/gameStore";
import { useProcessStore } from "../store/processStore";
import { useUiStore } from "../store/uiStore";
import { useCollectionStore } from "../store/collectionStore";
import { openContextMenu } from "../store/menuStore";
import { GameCard, GameRow } from "../components/game/GameCard";
import { Button } from "../components/ui/Button";
import { EmptyState, Segmented } from "../components/ui/controls";
import { confirm } from "../store/confirmStore";
import { cn } from "../lib/utils";
import type { Game } from "../types/game";

const GAP = 20;
const CAPTION_H = 54;
const ROW_H = 76;
const PAD_X = 32;

// Remember scroll position when you open a game and come back
let savedScroll = 0;

function SkeletonGrid() {
    return (
        <div className="grid gap-5 px-8 pt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {Array.from({ length: 12 }, (_, i) => (
                <div key={i}>
                    <div className="skeleton aspect-[2/3] rounded-xl" />
                    <div className="skeleton mt-3 h-3.5 w-3/4 rounded" />
                    <div className="skeleton mt-2 h-3 w-1/3 rounded" />
                </div>
            ))}
        </div>
    );
}

export default function LibraryPage() {
    const games = useGames();
    const loaded = useGameStore((s) => s.loaded);
    const running = useProcessStore((s) => s.running);
    const collections = useCollectionStore((s) => s.collections);
    const { open, play, menu } = useGameActions();
    const setAddGameOpen = useUiStore((s) => s.setAddGameOpen);
    const setScannerOpen = useUiStore((s) => s.setScannerOpen);

    const [params, setParams] = useSearchParams();
    const filter = params.get("filter") ?? "all";
    const setFilter = (f: string) => setParams((p) => { f === "all" ? p.delete("filter") : p.set("filter", f); return p; }, { replace: true });

    const [view, setView] = usePersistentState<"grid" | "list">("lib.view", "grid");
    const [sort, setSort] = usePersistentState<SortKey>("lib.sort", "custom");
    const [size, setSize] = usePersistentState<number>("lib.size", 176);
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const searchRef = useRef<HTMLInputElement>(null);
    const [renaming, setRenaming] = useState<string | null>(null);

    useHotkeys({ "/": (e) => { e.preventDefault(); searchRef.current?.focus(); } });

    // ── derive the visible list ──
    const visible = useMemo(() => {
        let list = games;
        if (filter === "favorites") list = list.filter((g) => g.is_favorite);
        else if (filter === "running") list = list.filter((g) => running[g.id]);
        else if (filter === "recent") list = list.filter((g) => g.last_played);
        else if (filter.startsWith("c:")) {
            const c = collections.find((x) => x.id === filter.slice(2));
            const ids = new Set(c?.gameIds ?? []);
            list = list.filter((g) => ids.has(g.id));
        }
        if (deferredQuery.trim()) list = list.filter((g) => matchesQuery(g, deferredQuery.trim()));
        return filter === "recent" && sort === "custom" ? sortGames(list, "recent") : sortGames(list, sort);
    }, [games, filter, running, collections, deferredQuery, sort]);

    const counts = useMemo(() => ({
        all: games.length,
        favorites: games.filter((g) => g.is_favorite).length,
        running: Object.keys(running).length,
    }), [games, running]);

    // ── drag to reorder (only meaningful on the unfiltered custom order) ──
    const canReorder = sort === "custom" && filter === "all" && !query.trim();
    const [dragId, setDragId] = useState<string | null>(null);
    const dragRef = useRef<string | null>(null);
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    useEffect(() => {
        const end = () => { dragRef.current = null; setDragId(null); };
        window.addEventListener("dragend", end);
        window.addEventListener("drop", end);
        return () => { window.removeEventListener("dragend", end); window.removeEventListener("drop", end); };
    }, []);
    const onDragStart = useCallback((e: React.DragEvent, g: Game) => {
        dragRef.current = g.id; setDragId(g.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", g.id);
    }, []);
    const onDragOver = useCallback((e: React.DragEvent) => { if (dragRef.current) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }, []);
    const onDrop = useCallback((e: React.DragEvent, target: Game) => {
        e.preventDefault();
        const from = dragRef.current;
        dragRef.current = null; setDragId(null);
        if (!from || from === target.id) return;
        const ids = visibleRef.current.map((g) => g.id);
        const a = ids.indexOf(from), b = ids.indexOf(target.id);
        if (a < 0 || b < 0) return;
        ids.splice(b, 0, ids.splice(a, 1)[0]);
        void useGameStore.getState().reorderGames(ids);
    }, []);

    const onContext = useCallback((e: React.MouseEvent, g: Game) => openContextMenu(e, menu(g)), [menu]);

    // ── virtualised layout ──
    const scrollRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(el.clientWidth - PAD_X * 2));
        ro.observe(el);
        setWidth(el.clientWidth - PAD_X * 2);
        return () => ro.disconnect();
    }, [loaded, games.length === 0]);

    const cols = view === "grid" ? Math.max(2, Math.floor((width + GAP) / (size + GAP))) : 1;
    const cardW = cols > 0 && width > 0 ? (width - GAP * (cols - 1)) / cols : size;
    const rowH = view === "grid" ? cardW * 1.5 + CAPTION_H + GAP : ROW_H;
    const rowCount = Math.ceil(visible.length / cols);

    const virt = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => rowH,
        overscan: 4,
    });
    useEffect(() => { virt.measure(); }, [rowH, virt]);

    // restore / save scroll
    useLayoutEffect(() => {
        if (width > 0 && scrollRef.current && savedScroll) scrollRef.current.scrollTop = savedScroll;
        const el = scrollRef.current;
        return () => { if (el) savedScroll = el.scrollTop; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width > 0]);

    const addCollection = () => {
        const id = useCollectionStore.getState().create("New collection");
        setFilter(`c:${id}`);
        setRenaming(id);
    };

    const chip = (id: string, label: React.ReactNode, count?: number) => (
        <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                filter === id ? "border-accent/40 bg-accent/15 text-accent" : "border-line text-fg-soft hover:border-line-strong hover:bg-white/[0.05] hover:text-fg",
            )}
        >
            {label}
            {count !== undefined && <span className={cn("text-xs tabular-nums", filter === id ? "text-accent/70" : "text-fg-mute")}>{count}</span>}
        </button>
    );

    // ── empty library ──
    if (loaded && games.length === 0) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState
                    icon={<LibraryIcon size={28} />}
                    title="Your library is empty"
                    description="Add a game by picking its executable, or point ChiraLauncher at a folder and let it find everything for you."
                    actions={<>
                        <Button variant="primary" size="lg" icon={<Plus size={18} />} onClick={() => setAddGameOpen(true)}>Add a game</Button>
                        <Button variant="secondary" size="lg" icon={<FolderSearch size={18} />} onClick={() => setScannerOpen(true)}>Scan a folder</Button>
                    </>}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <header className="shrink-0 space-y-4 px-8 pb-3 pt-7">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-[26px] font-semibold tracking-tight">Library</h1>
                        <p className="mt-0.5 text-sm text-fg-mute">
                            {visible.length === games.length ? `${games.length} games` : `${visible.length} of ${games.length} games`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" icon={<FolderSearch size={16} />} onClick={() => setScannerOpen(true)}>Scan folder</Button>
                        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddGameOpen(true)}>Add game</Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative w-full max-w-[340px] flex-1">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }}
                            placeholder="Filter by title, developer, genre…   ( / )"
                            aria-label="Filter library"
                            className="h-9 w-full rounded-ctl border border-line-strong bg-raised pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-fg-mute focus:border-accent/70"
                        />
                        {query && (
                            <button onClick={() => setQuery("")} aria-label="Clear filter" className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-fg-mute hover:text-fg">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort games" className="h-9 !py-0 text-[13px]">
                        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
                    </select>

                    <Segmented
                        value={view}
                        onChange={setView}
                        size="sm"
                        options={[
                            { value: "grid", label: <LayoutGrid size={14} aria-label="Grid view" /> },
                            { value: "list", label: <List size={14} aria-label="List view" /> },
                        ]}
                    />
                    {view === "grid" && (
                        <input
                            type="range" min={130} max={260} step={2} value={size}
                            onChange={(e) => setSize(Number(e.target.value))}
                            aria-label="Card size"
                            className="h-1 w-24 cursor-pointer"
                        />
                    )}
                </div>

                <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
                    {chip("all", "All", counts.all)}
                    {chip("favorites", <><Heart size={13} /> Favorites</>, counts.favorites)}
                    {chip("recent", <><Clock size={13} /> Played</>)}
                    {counts.running > 0 && chip("running", <><Play size={12} fill="currentColor" /> Running</>, counts.running)}
                    {collections.map((c) =>
                        renaming === c.id ? (
                            <input
                                key={c.id}
                                autoFocus
                                defaultValue={c.name}
                                onFocus={(e) => e.currentTarget.select()}
                                onBlur={(e) => { useCollectionStore.getState().rename(c.id, e.currentTarget.value); setRenaming(null); }}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }}
                                className="h-8 w-40 rounded-full border border-accent/50 bg-raised px-3.5 text-[13px] outline-none"
                            />
                        ) : (
                            <span
                                key={c.id}
                                onDoubleClick={() => setRenaming(c.id)}
                                onContextMenu={(e) => openContextMenu(e, [
                                    { label: "Rename", onClick: () => setRenaming(c.id) },
                                    {
                                        label: "Delete collection", danger: true,
                                        onClick: async () => {
                                            if (await confirm({ title: `Delete “${c.name}”?`, description: "The games stay in your library; only the collection is deleted.", confirmLabel: "Delete", danger: true })) {
                                                useCollectionStore.getState().remove(c.id);
                                                if (filter === `c:${c.id}`) setFilter("all");
                                            }
                                        },
                                    },
                                ])}
                            >
                                {chip(`c:${c.id}`, c.name, c.gameIds.length)}
                            </span>
                        ),
                    )}
                    <button onClick={addCollection} className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-line-strong px-3 text-[13px] text-fg-mute transition-colors hover:border-white/30 hover:text-fg">
                        <FolderPlus size={13} /> Collection
                    </button>
                </div>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                {!loaded ? (
                    <SkeletonGrid />
                ) : visible.length === 0 ? (
                    <EmptyState
                        icon={<SearchX size={26} />}
                        title="No games match"
                        description={query ? `Nothing matches “${query}” in this view.` : "There's nothing in this view yet."}
                        actions={<Button variant="secondary" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</Button>}
                    />
                ) : (
                    <div className="relative" style={{ height: virt.getTotalSize() + 24, margin: `0 ${PAD_X}px` }}>
                        {virt.getVirtualItems().map((vr) => {
                            const items = visible.slice(vr.index * cols, vr.index * cols + cols);
                            return (
                                <div
                                    key={vr.key}
                                    className={view === "grid" ? "grid" : undefined}
                                    style={{
                                        position: "absolute", top: 0, left: 0, width: "100%", height: vr.size,
                                        transform: `translateY(${vr.start}px)`,
                                        gridTemplateColumns: view === "grid" ? `repeat(${cols}, minmax(0, 1fr))` : undefined,
                                        columnGap: GAP,
                                        paddingBottom: view === "grid" ? GAP : 4,
                                    }}
                                >
                                    {items.map((g) =>
                                        view === "grid" ? (
                                            <GameCard
                                                key={g.id} game={g} onOpen={open} onPlay={play} onContext={onContext}
                                                draggable={canReorder} dragging={dragId === g.id}
                                                onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
                                            />
                                        ) : (
                                            <GameRow
                                                key={g.id} game={g} onOpen={open} onPlay={play} onContext={onContext}
                                                draggable={canReorder} dragging={dragId === g.id}
                                                onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
                                            />
                                        ),
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {canReorder && visible.length > 1 && (
                <div className="shrink-0 border-t border-line px-8 py-2 text-xs text-fg-mute">Drag games to arrange them in your own order.</div>
            )}
        </div>
    );
}
