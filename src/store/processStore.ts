import { create } from "zustand";

interface RunningGame {
    gameId: string;
    pid: number;
    source: "Launcher" | "AutoAttach";
    startTime: number; // Unix timestamp for drift-free elapsed calculation
}

interface ProcessState {
    // Dictionary of actively running games keyed by their game_id
    running: Record<string, RunningGame>;

    // Intermediate transition states
    launching: Record<string, boolean>;
    stopping: Record<string, boolean>;

    // Computed on the fly via tick, prevents accumulation desync
    // UI simply rendering processStore.elapsedTimeMap[gameId]
    elapsedTimeMap: Record<string, number>;

    // Actions
    setGameStarted: (gameId: string, data: RunningGame) => void;
    setGameStopped: (gameId: string) => void;
    setLaunching: (gameId: string, isLaunching: boolean) => void;
    setStopping: (gameId: string, isStopping: boolean) => void;

    // Safely recalculate the elapsed time derived purely from startTime
    tickElapsed: () => void;
}

export const useProcessStore = create<ProcessState>((set, get) => ({
    running: {},
    launching: {},
    stopping: {},
    elapsedTimeMap: {},

    setGameStarted: (gameId, data) => set((state) => ({
        running: { ...state.running, [gameId]: data },
        launching: { ...state.launching, [gameId]: false }, // reset launching when started
        elapsedTimeMap: { ...state.elapsedTimeMap, [gameId]: 0 }
    })),

    setGameStopped: (gameId) => set((state) => {
        const { [gameId]: _, ...restRunning } = state.running;
        const { [gameId]: __, ...restElapsed } = state.elapsedTimeMap;
        return {
            running: restRunning,
            stopping: { ...state.stopping, [gameId]: false }, // reset stopping when stopped
            elapsedTimeMap: restElapsed,
        };
    }),

    setLaunching: (gameId, isLaunching) => set((state) => ({
        launching: { ...state.launching, [gameId]: isLaunching }
    })),

    setStopping: (gameId, isStopping) => set((state) => ({
        stopping: { ...state.stopping, [gameId]: isStopping }
    })),

    tickElapsed: () => {
        const { running, elapsedTimeMap } = get();
        const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

        // If no games are running, this is effectively a no-op that just returns empty object
        if (Object.keys(running).length === 0) return;

        const newElapsed: Record<string, number> = {};
        let hasChanges = false;

        for (const [id, game] of Object.entries(running)) {
            const newVal = Math.max(0, now - game.startTime);
            if (elapsedTimeMap[id] !== newVal) hasChanges = true;
            newElapsed[id] = newVal;
        }

        // Only update state if something actually calculated to prevent mass empty renders
        if (hasChanges) {
            set({ elapsedTimeMap: newElapsed });
        }
    }
}));
