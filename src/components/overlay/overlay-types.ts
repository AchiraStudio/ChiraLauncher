export interface AchievementPayload {
    api_name: string;
    display_name: string;
    game_title: string;
    description: string;
    icon: string | null;
    icon_gray: string | null;
    global_percent: number | null;
    earned_time: number;
    xp: number;
    is_debug?: boolean;
    custom_sound_path?: string | null; // ── NEW ──
    duration_ms?: number; // ── NEW: Injected by frontend pre-render ──
}

export interface GameStartPayload {
    title: string;
    coverBase64: string | null;
}

export type QueueItem =
    | { id: string; type: "achievement"; payload: AchievementPayload }
    | { id: string; type: "game_start"; payload: GameStartPayload };