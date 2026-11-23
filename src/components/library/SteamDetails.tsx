import { ThumbsUp, ThumbsDown, User2 } from "lucide-react";
import type { SteamAppDetails, SteamReviewsResponse } from "../../services/steamService";
import { sanitizeHtml } from "../../lib/sanitize";
import { interceptLinks } from "../../lib/external";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/controls";

const reqCss = [
    "text-[13px] leading-relaxed text-fg-soft",
    "[&_strong]:font-semibold [&_strong]:text-fg",
    "[&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0",
    "[&_li]:border-b [&_li]:border-line [&_li]:py-1.5 [&_li:last-child]:border-0",
].join(" ");

export function SteamDetails({ steamDetails, reviews }: { steamDetails: SteamAppDetails | null; reviews: SteamReviewsResponse | null }) {
    if (!steamDetails && !reviews) return null;
    const req = steamDetails?.pc_requirements;
    const meta = steamDetails?.metacritic;

    return (
        <div className="space-y-8">
            {(meta || steamDetails?.genres?.length || steamDetails?.categories?.length) && (
                <section className="space-y-3">
                    <h3 className="caption">About this game</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        {meta && (
                            <span title="Metacritic score" className={cn(
                                "mr-2 grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-black",
                                meta.score >= 75 ? "bg-ok" : meta.score >= 50 ? "bg-warn" : "bg-danger",
                            )}>{meta.score}</span>
                        )}
                        {steamDetails?.genres?.map((g) => <Badge key={g.description} tone="accent">{g.description}</Badge>)}
                        {steamDetails?.categories?.slice(0, 8).map((c) => <Badge key={c.description}>{c.description}</Badge>)}
                    </div>
                </section>
            )}

            {req && (req.minimum || req.recommended) && (
                <section className="space-y-3">
                    <h3 className="caption">System requirements</h3>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {req.minimum && <div className={cn("surface p-5", reqCss)} onClick={interceptLinks} dangerouslySetInnerHTML={{ __html: sanitizeHtml(req.minimum) }} />}
                        {req.recommended && <div className={cn("surface p-5", reqCss)} onClick={interceptLinks} dangerouslySetInnerHTML={{ __html: sanitizeHtml(req.recommended) }} />}
                    </div>
                </section>
            )}

            {reviews && reviews.reviews.length > 0 && (
                <section className="space-y-3">
                    <div className="flex items-baseline gap-3">
                        <h3 className="caption">Player reviews</h3>
                        <span className="text-sm text-fg-soft">
                            <span className="font-medium text-accent">{reviews.query_summary.review_score_desc}</span>
                            <span className="text-fg-mute"> · {reviews.query_summary.total_reviews.toLocaleString()} reviews</span>
                        </span>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        {reviews.reviews.slice(0, 4).map((r, i) => (
                            <article key={i} className="surface p-4">
                                <header className="mb-3 flex items-center gap-3">
                                    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-raised">
                                        {r.author.avatar ? <img src={r.author.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <User2 size={16} className="text-fg-mute" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">{r.author.personaname || "Steam user"}</div>
                                        <div className="text-xs text-fg-mute">{Math.round((r.author.playtime_forever ?? 0) / 60)}h on record</div>
                                    </div>
                                    {r.voted_up ? <ThumbsUp size={16} className="text-ok" /> : <ThumbsDown size={16} className="text-danger" />}
                                </header>
                                <p className="line-clamp-5 whitespace-pre-line text-[13px] leading-relaxed text-fg-soft">{r.review}</p>
                                <footer className="mt-3 text-xs text-fg-mute">{r.votes_up.toLocaleString()} found this helpful</footer>
                            </article>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
