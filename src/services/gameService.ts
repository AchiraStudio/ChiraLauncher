import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export async function launchGame(id: string): Promise<void> {
    try {
        await invoke("launch_game", { id });
    } catch (e: any) {
        console.error(`Failed to launch game ${id}:`, e);
        toast.error("Failed to launch game", { description: String(e) });
        throw e;
    }
}

export async function forceStopGame(id: string): Promise<void> {
    try {
        await invoke("force_stop_game", { id });
    } catch (e: any) {
        console.error(`Failed to forcefully stop game ${id}:`, e);
        toast.error("Failed to stop game", { description: String(e) });
        throw e;
    }
}
