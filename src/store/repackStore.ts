import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface FitGirlRepack {
    title: string;
    url: string;
    thumbnail: string;
    magnets: string[];
    updates: { text: string; url: string }[];
}

interface RepackState {
    fitgirlList: FitGirlRepack[];
    isLoading: boolean;
    initialized: boolean;
    error: string | null;
    initialize: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useRepackStore = create<RepackState>((set, get) => ({
    fitgirlList: [],
    isLoading: false,
    initialized: false,
    error: null,
    initialize: () => {
        if (!initPromise) {
            initPromise = (async () => {
                if (get().initialized) return;

                set({ isLoading: true, error: null });
                try {
                    const data = await invoke<FitGirlRepack[]>("load_repacks");
                    set({ fitgirlList: data, initialized: true });
                } catch (error: any) {
                    console.error("Failed to load repacks:", error);
                    set({ error: error.message || "Unknown error occurred while fetching repacks." });
                } finally {
                    set({ isLoading: false });
                }
            })().finally(() => { initPromise = null; });
        }
        return initPromise;
    }
}));
