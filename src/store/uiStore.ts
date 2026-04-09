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
    isTorrentModalOpen: boolean;
    isAppIdModalOpen: boolean; // NEW
    isFirstLaunch: boolean;
    currentMagnet: string | null;
    currentBg: string | null;

    setAddGameModalOpen: (open: boolean) => void;
    setEditGameModalOpen: (open: boolean, game?: Game | null) => void;
    setScannerModalOpen: (open: boolean) => void;
    setFolderModalOpen: (open: boolean, folder?: Folder | null) => void;
    setLibrarySettingsModalOpen: (open: boolean) => void;
    setTorrentModalOpen: (open: boolean, magnetUrl?: string | null) => void;
    setAppIdModalOpen: (open: boolean) => void; // NEW
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
    isTorrentModalOpen: false,
    isAppIdModalOpen: false,
    isFirstLaunch: false,
    currentMagnet: null,
    currentBg: null,

    setAddGameModalOpen: (open) => set({ isAddGameModalOpen: open }),
    setEditGameModalOpen: (open, game = null) => set({ isEditGameModalOpen: open, gameToEdit: game ?? null }),
    setScannerModalOpen: (open) => set({ isScannerModalOpen: open }),
    setFolderModalOpen: (open, folder = null) => set({ isFolderModalOpen: open, folderToEdit: folder ?? null }),
    setLibrarySettingsModalOpen: (open) => set({ isLibrarySettingsModalOpen: open }),
    setTorrentModalOpen: (open, magnetUrl = null) => set({ isTorrentModalOpen: open, currentMagnet: magnetUrl ?? null }),
    setAppIdModalOpen: (open) => set({ isAppIdModalOpen: open }),
    setFirstLaunch: (first) => set({ isFirstLaunch: first }),
    setCurrentBg: (bg) => set({ currentBg: bg }),
}));