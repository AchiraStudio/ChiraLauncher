import { create } from "zustand";

export interface RunningGame {
    gameId: string;
    source: "Launcher" | "AutoAttach";
    /** Unix seconds. Elapsed time is derived from this, so there is no global ticker. */
    startTime: number;
}

interface ProcessState {
    running: Record<string, RunningGame>;
    launching: Record<string, boolean>;
    stopping: Record<string, boolean>;

    setGameStarted: (gameId: string, data: RunningGame) => void;
    setGameStopped: (gameId: string) => void;
    setLaunching: (gameId: string, v: boolean) => void;
    setStopping: (gameId: string, v: boolean) => void;
}

export const useProcessStore = create<ProcessState>((set) => ({
    running: {},
    launching: {},
    stopping: {},

    setGameStarted: (gameId, data) =>
        set((s) => ({
            running: { ...s.running, [gameId]: data },
            launching: { ...s.launching, [gameId]: false },
        })),

    setGameStopped: (gameId) =>
        set((s) => {
            const { [gameId]: _r, ...running } = s.running;
            return { running, stopping: { ...s.stopping, [gameId]: false }, launching: { ...s.launching, [gameId]: false } };
        }),

    setLaunching: (gameId, v) => set((s) => ({ launching: { ...s.launching, [gameId]: v } })),
    setStopping: (gameId, v) => set((s) => ({ stopping: { ...s.stopping, [gameId]: v } })),
}));
