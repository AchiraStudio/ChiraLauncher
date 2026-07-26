import { create } from "zustand";

export interface LogEntry {
    id: string;
    timestamp: string;
    type: "info" | "warn" | "error" | "backend";
    source: "Frontend" | "Backend" | "System";
    message: string;
    details?: string;
}

interface DevConsoleState {
    logs: LogEntry[];
    isOpen: boolean;
    showDevButtons: boolean;
    filter: "all" | "error" | "warn" | "backend" | "frontend";
    search: string;

    addLog: (type: LogEntry["type"], source: LogEntry["source"], message: string, details?: any) => void;
    clearLogs: () => void;
    setIsOpen: (isOpen: boolean) => void;
    toggle: () => void;
    toggleDevButtons: () => boolean;
    setShowDevButtons: (show: boolean) => void;
    setFilter: (filter: DevConsoleState["filter"]) => void;
    setSearch: (search: string) => void;
}

export const useDevConsoleStore = create<DevConsoleState>((set, get) => ({
    logs: [],
    isOpen: false,
    showDevButtons: false,
    filter: "all",
    search: "",

    addLog: (type, source, message, details) => set((state) => {
        let detailStr: string | undefined;
        if (details !== undefined && details !== null) {
            if (typeof details === "string") {
                detailStr = details;
            } else if (details instanceof Error) {
                detailStr = `${details.message}\n${details.stack || ""}`;
            } else {
                try {
                    detailStr = JSON.stringify(details, null, 2);
                } catch {
                    detailStr = String(details);
                }
            }
        }

        const now = new Date();
        const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;

        const newEntry: LogEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: timeStr,
            type,
            source,
            message: typeof message === "string" ? message : String(message),
            details: detailStr
        };

        // Keep last 500 logs
        const updatedLogs = [...state.logs, newEntry].slice(-500);
        return { logs: updatedLogs };
    }),

    clearLogs: () => set({ logs: [] }),
    setIsOpen: (isOpen) => set({ isOpen }),
    toggle: () => set((state) => ({ isOpen: !state.isOpen })),
    toggleDevButtons: () => {
        const next = !get().showDevButtons;
        set({ showDevButtons: next });
        return next;
    },
    setShowDevButtons: (showDevButtons) => set({ showDevButtons }),
    setFilter: (filter) => set({ filter }),
    setSearch: (search) => set({ search })
}));

