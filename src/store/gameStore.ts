import { create } from "zustand";
import type { Game } from "../types/game";
import { call, errMsg } from "../lib/tauri";
import { toast } from "sonner";

interface GameState {
    gamesById: Record<string, Game>;
    /** False until the first fetch finished (lets pages show skeletons instead of an empty state). */
    loaded: boolean;
    isRefreshing: Record<string, boolean>;

    fetchGames: () => Promise<void>;
    patchGame: (id: string, patch: Partial<Game>) => void;
    /** Called when the backend reports a finished session. */
    recordSession: (id: string, seconds: number) => void;
    refreshMetadata: (id: string) => Promise<void>;
    toggleFavorite: (id: string) => Promise<void>;
    /** Persist a new manual order for the given ids (index = sort_order). */
    reorderGames: (orderedIds: string[]) => Promise<void>;
    removeGame: (id: string) => Promise<void>;
    /**
     * Writes go through the backend's queued DB writer, so a fetch right after add/update
     * can read stale data. Polls (fast) until the game shows up, instead of a fixed sleep.
     */
    awaitGame: (id: string, timeoutMs?: number) => Promise<boolean>;
}

const ARRAY_KEYS = new Set<keyof Game>(["custom_bgm_paths"]);

/** Shallow field-by-field equality so unchanged games keep their object identity. */
function sameGame(a: Game, b: Game): boolean {
    for (const k of Object.keys(b) as (keyof Game)[]) {
        if (ARRAY_KEYS.has(k)) {
            const x = a[k] as unknown as string[];
            const y = b[k] as unknown as string[];
            if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
        } else if (a[k] !== b[k]) return false;
    }
    return true;
}

export const useGameStore = create<GameState>((set, get) => ({
    gamesById: {},
    loaded: false,
    isRefreshing: {},

    fetchGames: async () => {
        try {
            const list = await call<Game[]>("get_all_games");
            set((state) => {
                const next: Record<string, Game> = {};
                for (const g of list) {
                    const prev = state.gamesById[g.id];
                    // Keep the old reference when nothing changed -> memoised cards don't re-render
                    next[g.id] = prev && sameGame(prev, g) ? prev : g;
                }
                return { gamesById: next, loaded: true };
            });
        } catch (e) {
            console.error("Failed to fetch games:", e);
            set({ loaded: true });
        }
    },

    patchGame: (id, patch) =>
        set((s) => (s.gamesById[id] ? { gamesById: { ...s.gamesById, [id]: { ...s.gamesById[id], ...patch } } } : s)),

    recordSession: (id, seconds) =>
        set((s) => {
            const g = s.gamesById[id];
            if (!g) return s;
            const now = new Date().toISOString();
            return {
                gamesById: {
                    ...s.gamesById,
                    [id]: {
                        ...g,
                        playtime_seconds: g.playtime_seconds + seconds,
                        last_played: now,
                        first_played: g.first_played ?? now,
                        session_count: (g.session_count ?? 0) + 1,
                    },
                },
            };
        }),

    refreshMetadata: async (id) => {
        if (get().isRefreshing[id]) return;
        set((s) => ({ isRefreshing: { ...s.isRefreshing, [id]: true } }));
        try {
            await call("refresh_game_metadata", { gameId: id });
            await get().fetchGames();
            toast.success("Metadata updated");
        } catch (e) {
            toast.error("Metadata refresh failed", { description: errMsg(e) });
        } finally {
            set((s) => ({ isRefreshing: { ...s.isRefreshing, [id]: false } }));
        }
    },

    toggleFavorite: async (id) => {
        const game = get().gamesById[id];
        if (!game) return;
        get().patchGame(id, { is_favorite: !game.is_favorite });
        try {
            await call("toggle_favorite", { id });
        } catch (e) {
            get().patchGame(id, { is_favorite: game.is_favorite });
            toast.error("Couldn't update favorite", { description: errMsg(e) });
        }
    },

    reorderGames: async (orderedIds) => {
        const orders = orderedIds.map((id, i) => [id, i] as [string, number]);
        set((s) => {
            const next = { ...s.gamesById };
            for (const [id, order] of orders) if (next[id] && next[id].sort_order !== order) next[id] = { ...next[id], sort_order: order };
            return { gamesById: next };
        });
        try {
            await call("update_game_orders", { orders });
        } catch (e) {
            toast.error("Couldn't save order", { description: errMsg(e) });
            await get().fetchGames();
        }
    },

    awaitGame: async (id, timeoutMs = 3000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            await get().fetchGames();
            if (get().gamesById[id]) return true;
            await new Promise((r) => setTimeout(r, 120));
        }
        return false;
    },

    removeGame: async (id) => {
        await call("delete_game", { id });
        set((s) => {
            const { [id]: _removed, ...rest } = s.gamesById;
            return { gamesById: rest };
        });
        // The backend delete is queued through the DB writer; reconcile shortly after.
        setTimeout(() => void get().fetchGames(), 400);
    },
}));
