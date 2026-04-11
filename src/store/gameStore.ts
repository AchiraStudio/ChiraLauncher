import { create } from "zustand";
import type { Game } from "../types/game";
import { invoke } from "@tauri-apps/api/core";

interface GameState {
    gamesById: Record<string, Game>;
    isLoading: boolean;
    isRefreshing: Record<string, boolean>;

    // Actions
    fetchGames: () => Promise<void>;
    updateGamePlaytime: (gameId: string, elapsedDelta: number) => void;
    refreshMetadata: (gameId: string) => Promise<void>;
    toggleFavorite: (gameId: string) => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
    gamesById: {},
    isLoading: true,
    isRefreshing: {},

    fetchGames: async () => {
        set({ isLoading: true });
        try {
            const dbGames = await invoke<Game[]>("get_all_games");
            const gamesById = dbGames.reduce((acc, game) => {
                acc[game.id] = game;
                return acc;
            }, {} as Record<string, Game>);

            set({ gamesById, isLoading: false });
        } catch (e) {
            console.error("Failed to fetch games:", e);
            set({ isLoading: false });
        }
    },

    updateGamePlaytime: (gameId, elapsedDelta) => set((state) => {
        const game = state.gamesById[gameId];
        if (!game) return state;

        return {
            gamesById: {
                ...state.gamesById,
                [gameId]: {
                    ...game,
                    playtime_seconds: game.playtime_seconds + elapsedDelta,
                    last_played: new Date().toISOString()
                }
            }
        };
    }),

    refreshMetadata: async (gameId: string) => {
        set((state) => ({ isRefreshing: { ...state.isRefreshing, [gameId]: true } }));
        try {
            await invoke("refresh_game_metadata", { gameId });
            // Re-fetch all games to get updated metadata (background, cover, appId)
            // Use get() instead of self-referencing useGameStore to avoid TDZ issues
            await get().fetchGames();
        } catch (e) {
            console.error("Refresh failed:", e);
        } finally {
            // Always reset — even on error — so the spinner never stays permanently stuck
            set((state) => ({ isRefreshing: { ...state.isRefreshing, [gameId]: false } }));
        }
    },

    toggleFavorite: async (gameId: string) => {
        const game = get().gamesById[gameId];
        if (!game) return;

        // Optimistic update
        set((state) => ({
            gamesById: {
                ...state.gamesById,
                [gameId]: { ...game, is_favorite: !game.is_favorite }
            }
        }));

        try {
            await invoke("toggle_favorite", { id: gameId });
        } catch (e) {
            console.error("Failed to toggle favorite:", e);
            // Rollback on error
            set((state) => ({
                gamesById: {
                    ...state.gamesById,
                    [gameId]: game
                }
            }));
        }
    }
}));
