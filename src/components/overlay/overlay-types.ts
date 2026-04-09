export interface AchievementPayload {
    api_name: string;
    display_name: string;
    description: string;
    icon: string | null;
    icon_gray: string | null;
    xp?: number;
    global_percent: number | null; // NEW: Triggers Rarity logic
    earned_time: number;
}

export interface GameStartPayload {
    title: string;
    coverBase64: string | null;
}

export type QueueItem =
    | { id: string; type: "achievement"; payload: AchievementPayload }
    | { id: string; type: "game_start"; payload: GameStartPayload };
