import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "../lib/supabase";
import type { AchievementPayload } from "../components/overlay/overlay-types";

export interface UserProfile {
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
    session: any | null;
    fetchProfile: () => Promise<void>;
    updateProfile: (username: string, steamId?: string | null, avatarUrl?: string | null, supabaseUserId?: string | null, isCloudSynced?: boolean) => Promise<void>;
    initAuthListener: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
    profile: null,
    isLoading: true,
    session: null,

    fetchProfile: async () => {
        set({ isLoading: true });
        try {
            const localProfile = await invoke<UserProfile | null>("get_profile");

            // ── SMART XP SYNC ──
            if (localProfile?.is_cloud_synced && localProfile.supabase_user_id) {
                const { data: cloudProfile } = await supabase
                    .from("profiles")
                    .select("xp")
                    .eq("id", localProfile.supabase_user_id)
                    .single();

                if (cloudProfile) {
                    if (localProfile.xp > cloudProfile.xp) {
                        // Local is ahead (played offline), push to cloud
                        await supabase.from("profiles").update({ xp: localProfile.xp }).eq("id", localProfile.supabase_user_id);
                    } else if (cloudProfile.xp > localProfile.xp) {
                        // Cloud is ahead (played on another PC), pull to local
                        localProfile.xp = cloudProfile.xp;
                        await invoke("update_profile", {
                            username: localProfile.username,
                            steamId: localProfile.steam_id,
                            avatarUrl: localProfile.avatar_url,
                            supabaseUserId: localProfile.supabase_user_id,
                            isCloudSynced: true
                        });
                    }
                }
            }

            set({ profile: localProfile });
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

    initAuthListener: () => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            set({ session });
        });

        supabase.auth.onAuthStateChange((_event, session) => {
            set({ session });
        });
    }
}));

if (window.__TAURI_INTERNALS__) {
    listen<AchievementPayload>('achievement-unlocked', (event) => {
        // EXTREME STRICT MODE: Nullify any XP gained from tests or bugged payloads
        if (event.payload.is_debug === true || event.payload.xp === 0) return;

        useProfileStore.setState((state) => {
            if (state.profile) {
                return { profile: { ...state.profile, xp: state.profile.xp + (event.payload.xp || 0) } };
            }
            return state;
        });
    });
}