import { create } from "zustand";
import { call } from "../lib/tauri";
import { debounce } from "../lib/utils";

/**
 * User collections (manual groups of games). Persisted through the existing
 * `load_folders` / `save_folders` commands, so data saved by older versions that
 * used the "folders" feature is picked up automatically.
 */
export interface Collection {
    id: string;
    name: string;
    gameIds: string[];
}

interface CollectionState {
    collections: Collection[];
    ready: boolean;
    load: () => Promise<void>;
    create: (name: string, gameId?: string) => string;
    rename: (id: string, name: string) => void;
    remove: (id: string) => void;
    toggleGame: (collectionId: string, gameId: string) => void;
    forgetGame: (gameId: string) => void;
}

const save = debounce((collections: Collection[], passthrough: Record<string, unknown>) => {
    call("save_folders", { data: JSON.stringify({ ...passthrough, customFolders: collections }) }).catch((e) =>
        console.error("Failed to save collections:", e));
}, 500);

// Preserves any keys written by older versions (e.g. library background settings)
let passthrough: Record<string, unknown> = {};

export const useCollectionStore = create<CollectionState>((set, get) => {
    const commit = (collections: Collection[]) => {
        set({ collections });
        if (get().ready) save(collections, passthrough);
    };
    return {
        collections: [],
        ready: false,

        load: async () => {
            try {
                const raw = JSON.parse(await call<string>("load_folders") || "{}") as Record<string, unknown>;
                const list = Array.isArray(raw.customFolders) ? (raw.customFolders as Partial<Collection>[]) : [];
                passthrough = raw;
                set({
                    ready: true,
                    collections: list
                        .filter((f) => f && typeof f.id === "string" && typeof f.name === "string")
                        .map((f) => ({ id: f.id!, name: f.name!, gameIds: Array.isArray(f.gameIds) ? f.gameIds : [] })),
                });
            } catch (e) {
                console.error("Failed to load collections:", e);
                set({ ready: true });
            }
        },

        create: (name, gameId) => {
            const id = crypto.randomUUID();
            commit([...get().collections, { id, name: name.trim() || "New collection", gameIds: gameId ? [gameId] : [] }]);
            return id;
        },
        rename: (id, name) => commit(get().collections.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c))),
        remove: (id) => commit(get().collections.filter((c) => c.id !== id)),
        toggleGame: (cid, gid) =>
            commit(get().collections.map((c) =>
                c.id !== cid ? c : { ...c, gameIds: c.gameIds.includes(gid) ? c.gameIds.filter((x) => x !== gid) : [...c.gameIds, gid] })),
        forgetGame: (gid) => {
            if (get().collections.some((c) => c.gameIds.includes(gid)))
                commit(get().collections.map((c) => ({ ...c, gameIds: c.gameIds.filter((x) => x !== gid) })));
        },
    };
});
