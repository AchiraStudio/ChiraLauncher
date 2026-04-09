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

export interface SyncedAchievements {
    achievements: Achievement[];
    /** true when the data comes from the launcher's persistent cache (INI not found yet) */
    from_cache: boolean;
}

export async function getAchievements(gameId: string): Promise<Achievement[]> {
    try {
        return await invoke<Achievement[]>("get_achievements", { gameId });
    } catch (e) {
        console.error(`Failed to fetch achievements for game ${gameId}:`, e);
        return [];
    }
}

/**
 * Sync achievements from the game's INI file.
 *
 * Behaviour:
 * - INI found + has unlocks → returns live data synced from INI, `from_cache=false`
 * - INI found + empty       → returns all-locked list, `from_cache=false`
 * - INI not found yet       → returns last saved data, `from_cache=true`
 *
 * Call this on an interval (e.g. every 2 seconds) while the game is running.
 */
export async function syncGameAchievements(gameId: string): Promise<SyncedAchievements> {
    try {
        return await invoke<SyncedAchievements>("sync_game_achievements", { gameId });
    } catch (e) {
        console.error(`Failed to sync achievements for game ${gameId}:`, e);
        return { achievements: [], from_cache: false };
    }
}

export async function checkLocalAchievements(gameId: string): Promise<boolean> {
    try {
        return await invoke<boolean>("check_local_achievements", { gameId });
    } catch {
        return false;
    }
}
