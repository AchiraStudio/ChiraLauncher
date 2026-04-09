/**
 * overlay-types.ts
 *
 * Shared type definitions for the achievement and game-start overlay system.
 * Extracted to break the circular dependency between AchievementOverlay.tsx
 * (which imports the toast components) and the toast components (which need
 * the payload types).
 *
 * Import chain BEFORE fix (circular — causes TDZ crash in production build):
 *   AchievementOverlay → AchievementToast → AchievementOverlay (for AchievementPayload)
 *
 * Import chain AFTER fix (linear — no cycle):
 *   overlay-types ← AchievementOverlay
 *   overlay-types ← AchievementToast
 *   overlay-types ← GameStartToast
 */

export interface AchievementPayload {
    api_name: string;
    display_name: string;
    description: string;
    icon: string | null;
    icon_gray: string | null;
    xp?: number;
    rarity?: "common" | "rare" | "epic" | "legendary";
    earned_time: number;
}

export interface GameStartPayload {
    title: string;
    coverBase64: string | null;
}

export type QueueItem =
    | { id: string; type: "achievement"; payload: AchievementPayload }
    | { id: string; type: "game_start"; payload: GameStartPayload };
