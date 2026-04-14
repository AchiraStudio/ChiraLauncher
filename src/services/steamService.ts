import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../lib/supabase";

export interface SteamAppDetails {
    name: string;
    detailed_description: string;
    short_description: string;
    header_image: string;
    pc_requirements?: { minimum?: string; recommended?: string };
    developers?: string[];
    publishers?: string[];
    genres?: { description: string }[];
    categories?: { description: string }[];
    release_date?: { date: string };
    metacritic?: { score: number };
}

export interface SteamReview {
    author: {
        personaname: string;
        playtime_forever: number;
        avatar: string;
    };
    review: string;
    voted_up: boolean;
    votes_up: number;
    timestamp_created: number;
}

export interface SteamReviewsResponse {
    query_summary: {
        review_score_desc: string;
        total_positive: number;
        total_reviews: number;
    };
    reviews: SteamReview[];
}

export async function fetchSteamMetadata(appId: string): Promise<SteamAppDetails> {
    // Phase 4: Unlisted Game ID Mapper
    // Automatically checks Supabase to see if an Anadius/custom ID maps to a real Steam ID
    let targetAppId = appId;
    try {
        const { data: mapping } = await supabase
            .from("unlisted_games_map")
            .select("steam_app_id")
            .eq("unlisted_id", appId)
            .maybeSingle();

        if (mapping?.steam_app_id) {
            targetAppId = mapping.steam_app_id.toString();
        }
    } catch (e) {
        console.warn("Could not check Supabase ID mapping:", e);
    }

    const res = await invoke<any>("fetch_steam_app_details", { appId: targetAppId });
    if (res?.[targetAppId]?.success) {
        return res[targetAppId].data as SteamAppDetails;
    }
    throw new Error("Invalid Steam response or App ID not found");
}

export async function fetchSteamReviews(appId: string): Promise<SteamReviewsResponse | null> {
    let targetAppId = appId;
    try {
        const { data: mapping } = await supabase
            .from("unlisted_games_map")
            .select("steam_app_id")
            .eq("unlisted_id", appId)
            .maybeSingle();

        if (mapping?.steam_app_id) {
            targetAppId = mapping.steam_app_id.toString();
        }
    } catch (e) {
        console.warn("Could not check Supabase ID mapping:", e);
    }

    try {
        const res = await invoke<any>("fetch_steam_reviews", { appId: targetAppId });
        if (res?.success === 1) {
            return res as SteamReviewsResponse;
        }
        return null;
    } catch (e) {
        console.error("Failed to fetch reviews", e);
        return null;
    }
}

export function parseSteamDate(steamDateStr: string | undefined): string {
    if (!steamDateStr) return "";
    try {
        const d = new Date(steamDateStr);
        if (isNaN(d.getTime())) return "";
        return d.toISOString().split('T')[0];
    } catch {
        return "";
    }
}

export async function fetchSteamAchievementPercentages(appId: string): Promise<Record<string, number>> {
    let targetAppId = appId;
    try {
        const { data: mapping } = await supabase
            .from("unlisted_games_map")
            .select("steam_app_id")
            .eq("unlisted_id", appId)
            .maybeSingle();

        if (mapping?.steam_app_id) {
            targetAppId = mapping.steam_app_id.toString();
        }
    } catch (e) {
        console.warn("Could not check Supabase ID mapping:", e);
    }

    try {
        const res = await invoke<any>("fetch_global_achievement_percentages", { appId: targetAppId });
        const percentages: Record<string, number> = {};

        const list = res?.achievementpercentages?.achievements;
        if (Array.isArray(list)) {
            for (const ach of list) {
                if (ach.name && ach.percent !== undefined) {
                    percentages[ach.name] = parseFloat(ach.percent);
                }
            }
        }
        return percentages;
    } catch (e) {
        console.error("Failed to fetch achievement percentages:", e);
        return {};
    }
}