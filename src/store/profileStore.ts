import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AchievementPayload } from "../components/overlay/overlay-types";

export interface UserProfile {
    id: string;
    username: string;
    steam_id: string | null;
    avatar_url: string | null;
    xp: number; // NEW
}

interface ProfileState {
    profile: UserProfile | null;
    isLoading: boolean;
    fetchProfile: () => Promise<void>;
    updateProfile: (username: string, steamId?: string | null, avatarUrl?: string | null) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
    profile: null,
    isLoading: true,
    fetchProfile: async () => {
        set({ isLoading: true });
        try {
            const profile = await invoke<UserProfile | null>("get_profile");
            set({ profile });
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        } finally {
            set({ isLoading: false });
        }
    },
    updateProfile: async (username: string, steamId: string | null = null, avatarUrl: string | null = null) => {
        try {
            const profile = await invoke<UserProfile>("update_profile", {
                username,
                steamId,
                avatarUrl,
            });
            set({ profile });
        } catch (error) {
            console.error("Failed to update profile:", error);
            throw error;
        }
    },
}));

// Real-time synchronization
if (window.__TAURI_INTERNALS__) {
    listen<AchievementPayload>('achievement-unlocked', (event) => {
        useProfileStore.setState((state) => {
            if (state.profile) {
                // Instantly sync the XP gained from the popup into our store
                return { profile: { ...state.profile, xp: state.profile.xp + (event.payload.xp || 0) } };
            }
            return state;
        });
    });
}