import { toast } from "sonner";
import { call, errMsg } from "../lib/tauri";
import { useProcessStore } from "../store/processStore";

/** Launch a game; the backend later emits `game-started`, which clears the launching flag. */
export async function launchGame(id: string): Promise<void> {
    const ps = useProcessStore.getState();
    if (ps.running[id] || ps.launching[id]) return;
    ps.setLaunching(id, true);
    try {
        await call("launch_game", { id });
        // Safety net: if the process never reports in, don't leave the button stuck on "Launching"
        setTimeout(() => useProcessStore.getState().setLaunching(id, false), 20000);
    } catch (e) {
        useProcessStore.getState().setLaunching(id, false);
        console.error(`Failed to launch game ${id}:`, e);
        toast.error("Couldn't launch game", { description: errMsg(e) });
        throw e;
    }
}

export async function forceStopGame(id: string): Promise<void> {
    useProcessStore.getState().setStopping(id, true);
    try {
        await call("force_stop_game", { id });
    } catch (e) {
        useProcessStore.getState().setStopping(id, false);
        console.error(`Failed to stop game ${id}:`, e);
        toast.error("Couldn't stop game", { description: errMsg(e) });
        throw e;
    }
}
