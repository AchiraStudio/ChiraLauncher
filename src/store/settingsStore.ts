import { create } from "zustand";
import { call, errMsg } from "../lib/tauri";
import { applyAccent } from "../lib/theme";
import { smartAudio } from "../services/SmartAudio";
import { debounce } from "../lib/utils";
import { toast } from "sonner";

export interface AppSettings {
    download_path: string;
    accent_color: string;
    steam_bg_pref: string;
    auto_launch_on_boot: boolean;
    minimize_to_tray: boolean;
    steam_api_key: string;

    launcher_bgm_path: string;
    default_ach_sound_path: string;

    launcher_bgm_paths: string[];
    bgm_play_unfocused: boolean;
    bgm_play_in_tray: boolean;
    bgm_shuffle: boolean;
    default_launcher_path: string;
    auto_close_launcher: boolean;

    volume_sfx: number;
    volume_bgm: number;

    max_download_speed_kbps: number;
    max_upload_speed_kbps: number;
    max_concurrent_downloads: number;
    sequential_download: boolean;
    auto_fetch_achievements: boolean;
}

interface SettingsStore {
    settings: AppSettings | null;
    isLoading: boolean;
    initialize: () => Promise<void>;
    /**
     * Applies the change to the UI immediately and persists it after a short
     * debounce, so dragging a slider is one DB write instead of one per pixel.
     * Resolves once the write has been attempted.
     */
    updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

let lastSaved: AppSettings | null = null;
let waiters: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

const persist = debounce(async (get: () => AppSettings | null) => {
    const next = get();
    const pending = waiters;
    waiters = [];
    if (!next) return pending.forEach((w) => w.resolve());
    try {
        await call("update_app_settings", { settings: next });
        lastSaved = next;
        pending.forEach((w) => w.resolve());
    } catch (e) {
        // Roll the UI back to what is actually stored
        if (lastSaved) useSettingsStore.setState({ settings: lastSaved });
        if (lastSaved) {
            applyAccent(lastSaved.accent_color);
            smartAudio.applySettings(lastSaved as unknown as Record<string, unknown>);
        }
        toast.error("Couldn't save settings", { description: errMsg(e) });
        pending.forEach((w) => w.reject(e));
    }
}, 250);

export const useSettingsStore = create<SettingsStore>((set, get) => ({
    settings: null,
    isLoading: true,

    initialize: async () => {
        try {
            const settings = await call<AppSettings>("get_app_settings");
            lastSaved = settings;
            set({ settings, isLoading: false });
            applyAccent(settings.accent_color);
            smartAudio.applySettings(settings as unknown as Record<string, unknown>);
            if (settings.steam_bg_pref) localStorage.setItem("steam_bg_pref", settings.steam_bg_pref);
        } catch (e) {
            console.error("Failed to load settings:", e);
            set({ isLoading: false });
        }
    },

    updateSettings: (updates) => {
        const current = get().settings;
        if (!current) return Promise.resolve();
        const next = { ...current, ...updates };
        set({ settings: next });

        if (updates.accent_color) applyAccent(updates.accent_color);
        if (updates.steam_bg_pref) localStorage.setItem("steam_bg_pref", updates.steam_bg_pref);
        smartAudio.applySettings(next as unknown as Record<string, unknown>);
        void smartAudio.updateLiveVolume();

        return new Promise<void>((resolve, reject) => {
            waiters.push({ resolve, reject });
            persist(() => get().settings);
        });
    },
}));
