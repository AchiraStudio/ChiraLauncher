import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
    download_path: string;
    accent_color: string;
    steam_bg_pref: string;
    auto_launch_on_boot: boolean;
    minimize_to_tray: boolean;
    steam_api_key: string;
    launcher_bgm_path: string;
    default_ach_sound_path: string;
    volume_sfx: number;
    volume_bgm: number;
}

interface SettingsStore {
    settings: AppSettings | null;
    isLoading: boolean;
    initialize: () => Promise<void>;
    updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
    settings: null,
    isLoading: true,

    initialize: async () => {
        try {
            const settings = await invoke<AppSettings>("get_app_settings");
            set({ settings, isLoading: false });

            if (settings.accent_color) {
                document.documentElement.style.setProperty('--color-accent', settings.accent_color);
            }
            if (settings.steam_bg_pref) {
                localStorage.setItem("steam_bg_pref", settings.steam_bg_pref);
            }
        } catch (e) {
            console.error("Failed to load settings:", e);
            set({ isLoading: false });
        }
    },

    updateSettings: async (updates: Partial<AppSettings>) => {
        const current = get().settings;
        if (!current) return;

        const next = { ...current, ...updates };
        set({ settings: next });

        try {
            await invoke("update_app_settings", { settings: next });

            if (updates.accent_color) {
                document.documentElement.style.setProperty('--color-accent', updates.accent_color);
            }
            if (updates.steam_bg_pref) {
                localStorage.setItem("steam_bg_pref", updates.steam_bg_pref);
            }

            // Auto update live audio volume without refreshing if playing
            import("../services/SmartAudio").then(m => m.smartAudio.updateLiveVolume());
        } catch (e) {
            console.error("Failed to save settings to DB:", e);
            set({ settings: current });
            throw e;
        }
    }
}));