export interface AchievementPayload {
    api_name: string;
    display_name: string;
    game_title: string;
    description: string;
    icon: string | null;
    icon_gray: string | null;
    global_percent: number | null;
    earned_time: number;
    xp: number; // For triggering the XP visual on the toast
}

export interface GameStartPayload {
    title: string;
    coverBase64: string | null;
}

export type QueueItem =
    | { id: string; type: "achievement"; payload: AchievementPayload }
    | { id: string; type: "game_start"; payload: GameStartPayload };