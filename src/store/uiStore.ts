import { create } from "zustand";
import type { Game } from "../types/game";

interface UiState {
    addGameOpen: boolean;
    scannerOpen: boolean;
    resetOpen: boolean;
    paletteOpen: boolean;
    updateDialogOpen: boolean;
    gameToEdit: Game | null;
    isFirstLaunch: boolean;
    sidebarCollapsed: boolean;

    setAddGameOpen: (v: boolean) => void;
    setScannerOpen: (v: boolean) => void;
    setResetOpen: (v: boolean) => void;
    setPaletteOpen: (v: boolean) => void;
    setUpdateDialogOpen: (v: boolean) => void;
    editGame: (game: Game | null) => void;
    setFirstLaunch: (v: boolean) => void;
    toggleSidebar: () => void;
}

const readCollapsed = () => {
    try { return localStorage.getItem("ui.sidebarCollapsed") === "1"; } catch { return false; }
};

export const useUiStore = create<UiState>((set, get) => ({
    addGameOpen: false,
    scannerOpen: false,
    resetOpen: false,
    paletteOpen: false,
    updateDialogOpen: false,
    gameToEdit: null,
    isFirstLaunch: false,
    sidebarCollapsed: readCollapsed(),

    setAddGameOpen: (v) => set({ addGameOpen: v }),
    setScannerOpen: (v) => set({ scannerOpen: v }),
    setResetOpen: (v) => set({ resetOpen: v }),
    setPaletteOpen: (v) => set({ paletteOpen: v }),
    setUpdateDialogOpen: (v) => set({ updateDialogOpen: v }),
    editGame: (game) => set({ gameToEdit: game }),
    setFirstLaunch: (v) => set({ isFirstLaunch: v }),
    toggleSidebar: () => {
        const next = !get().sidebarCollapsed;
        try { localStorage.setItem("ui.sidebarCollapsed", next ? "1" : "0"); } catch { /* storage unavailable */ }
        set({ sidebarCollapsed: next });
    },
}));
