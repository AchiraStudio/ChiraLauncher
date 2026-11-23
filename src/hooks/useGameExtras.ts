import { useEffect, useState } from "react";
import type { Game } from "../types/game";
import { getAchievements, type Achievement } from "../services/achievementService";
import {
    fetchSteamAchievementPercentages, fetchSteamMetadata, fetchSteamReviews,
    type SteamAppDetails, type SteamReviewsResponse,
} from "../services/steamService";

interface Extras {
    achievements: Achievement[];
    achievementsLoading: boolean;
    details: SteamAppDetails | null;
    reviews: SteamReviewsResponse | null;
}

/**
 * Per-game data that isn't in the library table: local achievements (merged with
 * Steam's global rarity) and Steam store details/reviews. Everything is cancelled
 * on navigation, and Steam calls are cached by the service, so flicking between
 * games no longer re-downloads the same data.
 * `refreshKey` lets callers force a re-read (e.g. after a play session ends).
 */
export function useGameExtras(game: Game | undefined, refreshKey: unknown = 0): Extras {
    const [state, setState] = useState<Extras>({ achievements: [], achievementsLoading: false, details: null, reviews: null });
    const id = game?.id;
    const appId = game?.steam_app_id ? String(game.steam_app_id) : null;

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setState((s) => ({ ...s, achievementsLoading: true }));

        (async () => {
            const local = await getAchievements(id);
            if (cancelled) return;
            setState((s) => ({ ...s, achievements: local, achievementsLoading: false }));
            if (appId && local.length > 0) {
                const pcts = await fetchSteamAchievementPercentages(appId);
                if (cancelled || Object.keys(pcts).length === 0) return;
                setState((s) => ({
                    ...s,
                    achievements: local.map((a) => ({ ...a, global_percent: a.global_percent ?? pcts[a.api_name] ?? null })),
                }));
            }
        })().catch(() => !cancelled && setState((s) => ({ ...s, achievements: [], achievementsLoading: false })));

        return () => { cancelled = true; };
    }, [id, appId, refreshKey]);

    useEffect(() => {
        setState((s) => ({ ...s, details: null, reviews: null }));
        if (!appId) return;
        let cancelled = false;
        fetchSteamMetadata(appId).then((d) => !cancelled && setState((s) => ({ ...s, details: d }))).catch(() => { });
        fetchSteamReviews(appId).then((r) => !cancelled && setState((s) => ({ ...s, reviews: r }))).catch(() => { });
        return () => { cancelled = true; };
    }, [appId]);

    return state;
}
