import { create } from "zustand";
import type { ReactNode } from "react";

export interface MenuItem {
    label?: string;
    icon?: ReactNode;
    danger?: boolean;
    separator?: boolean;
    disabled?: boolean;
    shortcut?: string;
    onClick?: () => void;
}

interface MenuState {
    menu: { x: number; y: number; items: MenuItem[] } | null;
    open: (x: number, y: number, items: MenuItem[]) => void;
    close: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
    menu: null,
    open: (x, y, items) => set({ menu: { x, y, items } }),
    close: () => set({ menu: null }),
}));

/** Convenience for onContextMenu handlers. Marks the event handled so the global fallback menu skips it. */
export function openContextMenu(e: { preventDefault(): void; clientX: number; clientY: number }, items: MenuItem[]) {
    e.preventDefault();
    useMenuStore.getState().open(e.clientX, e.clientY, items);
}
