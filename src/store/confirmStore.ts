import { create } from "zustand";
import type { ReactNode } from "react";

export interface ConfirmOptions {
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    /** If set, the user must type this exact text to enable the confirm button. */
    requireText?: string;
}

interface ConfirmState {
    current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
    ask: (opts: ConfirmOptions) => Promise<boolean>;
    settle: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
    current: null,
    ask: (opts) =>
        new Promise<boolean>((resolve) => {
            // A second prompt while one is open cancels the first
            get().current?.resolve(false);
            set({ current: { ...opts, resolve } });
        }),
    settle: (ok) => {
        get().current?.resolve(ok);
        set({ current: null });
    },
}));

/** `if (await confirm({ title: "Delete?", danger: true })) { ... }` */
export const confirm = (opts: ConfirmOptions) => useConfirmStore.getState().ask(opts);
