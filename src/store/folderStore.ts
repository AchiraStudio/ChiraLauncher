import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { invoke } from "@tauri-apps/api/core";

export interface Folder {
    id: string;
    name: string;
    icon: string;
    bgImage: string;
    gradientStart: string;
    gradientEnd: string;
    filterType: "all" | "recent" | "favorites" | "installed" | "nonsteam" | "manual";
    gameIds: string[]; // For manual folders
}

export interface LibrarySettings {
    globalBgImage: string;
    globalBgOpacity: number;
    globalBgBlur: number;
}

interface FolderState {
    customFolders: Folder[];
    settings: LibrarySettings;

    // Actions
    addCustomFolder: (folder: Omit<Folder, "id" | "gameIds">) => void;
    removeCustomFolder: (id: string) => void;
    updateCustomFolder: (id: string, folder: Partial<Folder>) => void;
    addGameToFolder: (folderId: string, gameId: string) => void;
    removeGameFromFolder: (folderId: string, gameId: string) => void;
    updateSettings: (newSettings: Partial<LibrarySettings>) => void;
    load: () => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
    customFolders: [],
    settings: {
        globalBgImage: "",
        globalBgOpacity: 0.6,
        globalBgBlur: 10,
    },

    load: async () => {
        try {
            const dataStr = await invoke<string>("load_folders");
            const data = JSON.parse(dataStr);
            set({
                customFolders: data.customFolders || [],
                settings: { ...get().settings, ...(data.settings || {}) }
            });
        } catch (error) {
            console.error("Failed to load folder store:", error);
        }
    },

    addCustomFolder: (folder) =>
        set((state) => ({
            customFolders: [...state.customFolders, { ...folder, id: uuidv4(), gameIds: [] }],
        })),

    removeCustomFolder: (id) =>
        set((state) => ({
            customFolders: state.customFolders.filter((f) => f.id !== id),
        })),

    updateCustomFolder: (id, updates) =>
        set((state) => ({
            customFolders: state.customFolders.map((f) =>
                f.id === id ? { ...f, ...updates } : f
            ),
        })),

    addGameToFolder: (folderId, gameId) =>
        set((state) => ({
            customFolders: state.customFolders.map((f) => {
                if (f.id === folderId && !f.gameIds.includes(gameId)) {
                    // Converting any folder type to 'manual' on first explicit game add
                    // so gameIds take effect immediately
                    return { ...f, filterType: "manual", gameIds: [...f.gameIds, gameId] };
                }
                return f;
            }),
        })),

    removeGameFromFolder: (folderId, gameId) =>
        set((state) => ({
            customFolders: state.customFolders.map((f) => {
                if (f.id === folderId) {
                    return { ...f, gameIds: f.gameIds.filter((id) => id !== gameId) };
                }
                return f;
            }),
        })),

    updateSettings: (newSettings: Partial<LibrarySettings>) =>
        set((state) => ({
            settings: { ...state.settings, ...newSettings },
        })),
}));

useFolderStore.subscribe((state) => {
    invoke("save_folders", {
        data: JSON.stringify({
            customFolders: state.customFolders,
            settings: state.settings,
        })
    }).catch((e) => console.error("Failed to save folder store:", e));
});


