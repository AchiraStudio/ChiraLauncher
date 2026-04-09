import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';

export interface ExtensionInfo {
    id: string;
    name: string;
    version: string;
    kind: 'theme' | 'plugin';
    checksum: string;
    enabled: boolean;
    consent_given: boolean;
    permissions: string[];
}

interface ExtensionState {
    extensions: ExtensionInfo[];
    isLoading: boolean;
    fetchExtensions: () => Promise<void>;
    toggleExtension: (id: string, enabled: boolean) => Promise<void>;
    installExtension: (path: string) => Promise<void>;
}

export const useExtensionStore = create<ExtensionState>((set) => ({
    extensions: [],
    isLoading: false,

    fetchExtensions: async () => {
        if (!window.__TAURI_INTERNALS__) return; // Guard for web browser testing

        set({ isLoading: true });
        try {
            const extensions = await invoke<ExtensionInfo[]>('get_extensions');
            set({ extensions });
        } catch (error) {
            console.error('Failed to fetch extensions:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    toggleExtension: async (id: string, enabled: boolean) => {
        try {
            await invoke('toggle_extension', { extensionId: id, enabled });
            set((state) => ({
                extensions: state.extensions.map((ext) =>
                    ext.id === id ? { ...ext, enabled } : ext
                ),
            }));
            toast.success(`${enabled ? 'Enabled' : 'Disabled'} extension`);
        } catch (error) {
            toast.error('Failed to toggle extension');
            throw error;
        }
    },

    installExtension: async (path: string) => {
        try {
            const info = await invoke<ExtensionInfo>('install_extension', { sourcePath: path });
            set((state) => ({
                extensions: [...state.extensions.filter(e => e.id !== info.id), info],
            }));
            toast.success('Extension installed successfully');
        } catch (error: any) {
            toast.error(`Install failed: ${error}`);
            throw error;
        }
    },
}));

// Only attach native listeners if running in the Tauri window
if (window.__TAURI_INTERNALS__) {
    listen<string>('theme-changed', (event) => {
        const styleTag = document.getElementById('chira-dynamic-theme');
        if (styleTag) {
            styleTag.innerHTML = event.payload;
            toast.info('Theme hot-reloaded');
        }
    }).catch(console.error);

    listen<string>('theme-error', (event) => {
        toast.error(`Theme Error: ${event.payload}`);
    }).catch(console.error);
}