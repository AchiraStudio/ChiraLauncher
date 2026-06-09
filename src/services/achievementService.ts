import { invoke } from "@tauri-apps/api/core";

export interface Achievement {
    api_name: string;
    display_name: string;
    description: string;
    hidden: boolean;
    earned: boolean;
    earned_time: number | null;
    icon_path: string | null;
    icon_gray_path: string | null;
    global_percent: number | null;
}



export async function getAchievements(gameId: string): Promise<Achievement[]> {
    try {
        return await invoke<Achievement[]>("get_achievements", { gameId });
    } catch (e) {
        console.error(`Failed to fetch achievements for game ${gameId}:`, e);
        return [];
    }
}

