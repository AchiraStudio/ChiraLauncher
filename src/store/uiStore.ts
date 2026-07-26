import { create } from "zustand";
import type { Folder } from "./folderStore";
import type { Game } from "../types/game";

interface UiState {
    isAddGameModalOpen: boolean;
    isEditGameModalOpen: boolean;
    gameToEdit: Game | null;
    isScannerModalOpen: boolean;
    isFolderModalOpen: boolean;
    folderToEdit: Folder | null;
    isLibrarySettingsModalOpen: boolean;
    isAppIdModalOpen: boolean;
    isResetModalOpen: boolean;
    isFirstLaunch: boolean;
    currentBg: string | null;

    setAddGameModalOpen: (open: boolean) => void;
    setEditGameModalOpen: (open: boolean, game?: Game | null) => void;
    setScannerModalOpen: (open: boolean) => void;
    setFolderModalOpen: (open: boolean, folder?: Folder | null) => void;
    setLibrarySettingsModalOpen: (open: boolean) => void;
    setAppIdModalOpen: (open: boolean) => void;
    setResetModalOpen: (open: boolean) => void;
    setFirstLaunch: (first: boolean) => void;
    setCurrentBg: (bg: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
    isAddGameModalOpen: false,
    isEditGameModalOpen: false,
    gameToEdit: null,
    isScannerModalOpen: false,
    isFolderModalOpen: false,
    folderToEdit: null,
    isLibrarySettingsModalOpen: false,
    isAppIdModalOpen: false,
    isResetModalOpen: false,
    isFirstLaunch: false,
    currentBg: null,

    setAddGameModalOpen: (open) => set({ isAddGameModalOpen: open }),
    setEditGameModalOpen: (open, game = null) => set({ isEditGameModalOpen: open, gameToEdit: game ?? null }),
    setScannerModalOpen: (open) => set({ isScannerModalOpen: open }),
    setFolderModalOpen: (open, folder = null) => set({ isFolderModalOpen: open, folderToEdit: folder ?? null }),
    setLibrarySettingsModalOpen: (open) => set({ isLibrarySettingsModalOpen: open }),
    setAppIdModalOpen: (open) => set({ isAppIdModalOpen: open }),
    setResetModalOpen: (open) => set({ isResetModalOpen: open }),
    setFirstLaunch: (first) => set({ isFirstLaunch: first }),
    setCurrentBg: (bg) => set({ currentBg: bg }),
}));