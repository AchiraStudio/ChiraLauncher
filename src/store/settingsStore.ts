import { create } from "zustand";
import { AppSettings, getAppSettings, updateAppSettings } from "../services/settingsService";

interface SettingsState {
    settings: AppSettings | null;
    isLoading: boolean;
    error: string | null;

    initialize: () => Promise<void>;
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: null,
    isLoading: true,
    error: null,

    initialize: async () => {
        try {
            set({ isLoading: true, error: null });
            const settings = await getAppSettings();
            set({ settings, isLoading: false });
        } catch (error: any) {
            console.error("Failed to load settings:", error);
            set({ error: error.message || "Failed to load settings", isLoading: false });
        }
    },

    updateSetting: async (key, value) => {
        const { settings } = get();
        if (!settings) return;

        // Optimistic update
        const newSettings = { ...settings, [key]: value };
        set({ settings: newSettings });

        try {
            await updateAppSettings(newSettings);
        } catch (error: any) {
            console.error(`Failed to update setting ${key}:`, error);
            // Revert optimistic update
            set({ settings });
            set({ error: error.message || "Failed to save setting" });
        }
    }
}));
