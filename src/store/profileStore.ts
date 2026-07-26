import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface UserProfile {
    id: string;
    username: string;
    steam_id: string | null;
    avatar_url: string | null;
    xp: number;
    supabase_user_id: string | null;
    is_cloud_synced: boolean;
    private_key: string | null;
    public_key: string | null;
}

interface ProfileState {
    profile: UserProfile | null;
    isLoading: boolean;
    fetchProfile: () => Promise<void>;
    updateProfile: (username: string, steamId?: string | null, avatarUrl?: string | null, supabaseUserId?: string | null, isCloudSynced?: boolean) => Promise<void>;
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

    updateProfile: async (username, steamId = null, avatarUrl = null, supabaseUserId = null, isCloudSynced = false) => {
        try {
            const profile = await invoke<UserProfile>("update_profile", {
                username,
                steamId,
                avatarUrl,
                supabaseUserId,
                isCloudSynced
            });
            set({ profile });
        } catch (error) {
            console.error("Failed to update profile:", error);
            throw error;
        }
    },
}));