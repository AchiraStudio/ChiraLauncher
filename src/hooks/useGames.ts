import { useMemo } from "react";
import { useGameStore } from "../store/gameStore";
import type { Game } from "../types/game";

/** All games in the user's manual order (sort_order, then title). Recomputed only when a game changes. */
export function useGames(): Game[] {
    const byId = useGameStore((s) => s.gamesById);
    return useMemo(
        () => Object.values(byId).sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)),
        [byId],
    );
}

export type SortKey = "custom" | "name" | "recent" | "playtime" | "added";

export const SORT_LABELS: Record<SortKey, string> = {
    custom: "Custom order",
    name: "Name",
    recent: "Recently played",
    playtime: "Most played",
    added: "Recently added",
};

const ts = (iso: string | null) => (iso ? new Date(iso).getTime() || 0 : 0);

export function sortGames(games: Game[], key: SortKey): Game[] {
    const arr = [...games];
    switch (key) {
        case "name": return arr.sort((a, b) => a.title.localeCompare(b.title));
        case "recent": return arr.sort((a, b) => ts(b.last_played) - ts(a.last_played) || a.title.localeCompare(b.title));
        case "playtime": return arr.sort((a, b) => b.playtime_seconds - a.playtime_seconds || a.title.localeCompare(b.title));
        case "added": return arr.sort((a, b) => ts(b.added_at) - ts(a.added_at));
        default: return arr; // already in custom order
    }
}

/** Case/diacritic-insensitive match across the fields people actually search by. */
export function matchesQuery(g: Game, q: string): boolean {
    if (!q) return true;
    const hay = `${g.title} ${g.developer ?? ""} ${g.publisher ?? ""} ${g.genre ?? ""}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((part) => hay.includes(part));
}

/** Asset path -> URL the webview can load; strips the `?pos=` focal-point suffix. */
export function splitFocal(path: string | null | undefined): { src: string | null; pos: string } {
    if (!path) return { src: null, pos: "center" };
    const [src, pos] = path.split("?pos=");
    return { src: src || null, pos: pos ? pos.replace("-", " ") : "center" };
}
