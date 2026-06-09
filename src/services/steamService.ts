import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../lib/supabase";

let unlistedTableExists = true;

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

/**
 * Resolves a potentially "unlisted" app ID to its canonical Steam App ID.
 * Checks Supabase's `unlisted_games_map` table for a mapping from Anadius/custom IDs.
 * Falls back to the original ID if the table doesn't exist or no mapping is found.
 */
async function resolveAppId(appId: string): Promise<string> {
    if (!unlistedTableExists) return appId;
    try {
        const { data: mapping, error } = await supabase
            .from("unlisted_games_map")
            .select("steam_app_id")
            .eq("unlisted_id", appId)
            .maybeSingle();

        if (error && (error.code === '404' || error.message?.includes("404") || error.code === '42P01')) {
            unlistedTableExists = false;
        } else if (mapping?.steam_app_id) {
            return mapping.steam_app_id.toString();
        }
    } catch {
        unlistedTableExists = false;
    }
    return appId;
}

export async function fetchSteamMetadata(appId: string): Promise<SteamAppDetails> {
    const targetAppId = await resolveAppId(appId);
    const res = await invoke<any>("fetch_steam_app_details", { appId: targetAppId });
    if (res?.[targetAppId]?.success) {
        return res[targetAppId].data as SteamAppDetails;
    }
    throw new Error("Invalid Steam response or App ID not found");
}

export async function fetchSteamReviews(appId: string): Promise<SteamReviewsResponse | null> {
    const targetAppId = await resolveAppId(appId);
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
    const targetAppId = await resolveAppId(appId);
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