/**
 * XP & levelling utilities shared between UserPage and Discover.
 */

export interface LevelInfo {
    level: number;
    xpProgress: number;      // 0–100 percentage toward next level
    xpForCurrentLevel: number;
    xpForNextLevel: number;
}

/** Returns the XP threshold required to reach `level`. */
function xpForLevel(level: number): number {
    return Math.pow(level, 2) * 50;
}

/** Computes the current level and progress from a raw XP value. */
export function computeLevel(xp: number): LevelInfo {
    let level = 1;
    while (xp >= xpForLevel(level)) {
        level++;
    }
    const xpForCurrentLevel = xpForLevel(level - 1);
    const xpForNextLevel = xpForLevel(level);
    const xpProgress = Math.min(
        Math.max(((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100, 0),
        100
    );
    return { level, xpProgress, xpForCurrentLevel, xpForNextLevel };
}
