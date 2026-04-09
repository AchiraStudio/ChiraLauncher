import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface OsIntegration {
    game_id: string;
    has_desktop_shortcut: boolean;
    has_start_menu_shortcut: boolean;
    has_registry_entry: boolean;
}

interface OsIntegrationState {
    integrations: Record<string, OsIntegration>;
    isLoading: boolean;
    fetchIntegration: (gameId: string) => Promise<void>;
    toggleIntegration: (gameId: string, type: 'desktop' | 'start_menu' | 'registry') => Promise<void>;
    removeIntegration: (gameId: string) => void;
}

export const useOsIntegrationStore = create<OsIntegrationState>((set) => ({
    integrations: {},
    isLoading: false,

    fetchIntegration: async (gameId: string) => {
        set({ isLoading: true });
        try {
            const integration = await invoke<OsIntegration>('get_os_integration', { gameId });
            set((state) => ({
                integrations: {
                    ...state.integrations,
                    [gameId]: integration,
                },
            }));
        } catch (error) {
            console.error('Failed to fetch OS integration:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    toggleIntegration: async (gameId: string, type: 'desktop' | 'start_menu' | 'registry') => {
        try {
            const updated = await invoke<OsIntegration>('toggle_os_integration', {
                gameId,
                integrationType: type,
            });
            set((state) => ({
                integrations: {
                    ...state.integrations,
                    [gameId]: updated,
                },
            }));
        } catch (error) {
            console.error(`Failed to toggle ${type} integration:`, error);
            throw error;
        }
    },

    removeIntegration: (gameId: string) => {
        set((state) => ({
            integrations: {
                ...state.integrations,
                [gameId]: {
                    game_id: gameId,
                    has_desktop_shortcut: false,
                    has_start_menu_shortcut: false,
                    has_registry_entry: false,
                },
            },
        }));
    },
}));

// Listen for backend-initiated removal (triggered by --remove-game CLI / uninstall)
listen<string>('os-integration-removed', (event) => {
    useOsIntegrationStore.getState().removeIntegration(event.payload);
    console.log(`OS integration removed for game: ${event.payload}`);
}).catch(console.error);
