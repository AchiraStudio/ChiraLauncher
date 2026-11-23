import { call } from "../lib/tauri";

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
    author: { personaname: string; playtime_forever: number; avatar: string };
    review: string;
    voted_up: boolean;
    votes_up: number;
    timestamp_created: number;
}

export interface SteamReviewsResponse {
    query_summary: { review_score_desc: string; total_positive: number; total_reviews: number };
    reviews: SteamReview[];
}

/**
 * Tiny TTL cache that also de-duplicates concurrent identical requests.
 * Before this, opening a game fired three Steam requests every single time
 * you clicked it, and flicking through the library hammered the API.
 */
const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value as T);
    const running = pending.get(key);
    if (running) return running as Promise<T>;
    const p = load()
        .then((value) => {
            cache.set(key, { at: Date.now(), value });
            return value;
        })
        .finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
}

export function fetchSteamMetadata(appId: string): Promise<SteamAppDetails> {
    return cached(`details:${appId}`, async () => {
        const res = await call<Record<string, { success: boolean; data: SteamAppDetails }>>("fetch_steam_app_details", { appId });
        if (res?.[appId]?.success) return res[appId].data;
        throw new Error("Invalid Steam response or App ID not found");
    });
}

export async function fetchSteamReviews(appId: string): Promise<SteamReviewsResponse | null> {
    try {
        return await cached(`reviews:${appId}`, async () => {
            const res = await call<{ success?: number } & SteamReviewsResponse>("fetch_steam_reviews", { appId });
            return res?.success === 1 ? (res as SteamReviewsResponse) : null;
        });
    } catch (e) {
        console.error("Failed to fetch reviews", e);
        return null;
    }
}

export async function fetchSteamAchievementPercentages(appId: string): Promise<Record<string, number>> {
    try {
        return await cached(`pct:${appId}`, async () => {
            const res = await call<{ achievementpercentages?: { achievements?: { name?: string; percent?: string | number }[] } }>(
                "fetch_global_achievement_percentages", { appId });
            const out: Record<string, number> = {};
            for (const a of res?.achievementpercentages?.achievements ?? []) {
                if (a.name && a.percent !== undefined) out[a.name] = parseFloat(String(a.percent));
            }
            return out;
        });
    } catch (e) {
        console.error("Failed to fetch achievement percentages:", e);
        return {};
    }
}

export function parseSteamDate(steamDateStr: string | undefined): string {
    if (!steamDateStr) return "";
    const d = new Date(steamDateStr);
    return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

/** Artwork URLs Steam serves for any app id, plus the user's hero/store background preference. */
export function steamArtwork(appId: string | number, headerImage?: string) {
    const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}`;
    const pref = localStorage.getItem("steam_bg_pref") || "hero";
    return {
        cover: `${base}/library_600x900.jpg`,
        background: pref === "hero" || !headerImage ? `${base}/library_hero.jpg` : headerImage,
        logo: `${base}/logo_2x.png`,
    };
}

/** Maps Steam's details onto our editable game fields. */
export function steamToFields(data: SteamAppDetails) {
    return {
        title: data.name,
        description: data.detailed_description || data.short_description || "",
        developer: data.developers?.[0] ?? "",
        publisher: data.publishers?.[0] ?? "",
        releaseDate: parseSteamDate(data.release_date?.date),
        genre: data.genres?.map((g) => g.description).join(", ") ?? "",
    };
}
