import { cn } from "../../lib/utils";
import { User2, ThumbsUp, ThumbsDown } from "lucide-react";
import type { SteamAppDetails, SteamReviewsResponse, SteamReview } from "../../services/steamService";

const reqHtml = [
    "text-xs text-white/50 leading-relaxed",
    "[&>strong]:text-accent [&>strong]:block [&>strong]:mb-3 [&>strong]:text-[9px] [&>strong]:font-black [&>strong]:uppercase [&>strong]:tracking-widest",
    "[&_ul]:list-none [&_ul]:m-0 [&_ul]:p-0",
    "[&_ul>li]:py-1.5 [&_ul>li]:border-b [&_ul>li]:border-white/[0.05] [&_ul>li:last-child]:border-0",
    "[&_ul>li>strong]:text-white/75 [&_ul>li>strong]:font-semibold [&_ul>li>strong]:mr-1.5",
].join(" ");

export function SteamDetails({ steamDetails, reviews }: { steamDetails: SteamAppDetails | null; reviews: SteamReviewsResponse | null }) {
    if (!steamDetails && !reviews) return null;

    return (
        <>
            {steamDetails?.pc_requirements && (steamDetails.pc_requirements.minimum || steamDetails.pc_requirements.recommended) && (
                <div className="mt-16 border-t border-white/10 pt-16">
                    <h2 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-10">System Requirements</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {steamDetails.pc_requirements.minimum && (
                            <div
                                className={cn("p-10 shadow-2xl tech-card min-h-[300px]", reqHtml)}
                                dangerouslySetInnerHTML={{ __html: steamDetails.pc_requirements.minimum }}
                            />
                        )}
                        {steamDetails.pc_requirements.recommended && (
                            <div
                                className={cn("p-10 shadow-2xl tech-card min-h-[300px]", reqHtml)}
                                dangerouslySetInnerHTML={{ __html: steamDetails.pc_requirements.recommended }}
                            />
                        )}
                    </div>
                </div>
            )}

            {steamDetails && (steamDetails.metacritic || steamDetails.genres?.length || steamDetails.categories?.length) && (
                <div className="mt-16 border-t border-white/10 pt-16 flex flex-wrap gap-16">
                    {steamDetails.metacritic && (
                        <div>
                            <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-5">Metacritic</p>
                            <div className="flex items-center gap-5">
                                <div className={cn(
                                    "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-2xl border border-white/10",
                                    steamDetails.metacritic.score >= 75 ? "bg-green-500" :
                                        steamDetails.metacritic.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                                )}>
                                    {steamDetails.metacritic.score}
                                </div>
                                <span className="text-white/50 text-xs font-bold uppercase tracking-[0.2em] leading-tight">Critic<br />Score</span>
                            </div>
                        </div>
                    )}
                    {steamDetails.genres && steamDetails.genres.length > 0 && (
                        <div>
                            <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-5">Genres</p>
                            <div className="flex flex-wrap gap-3">
                                {steamDetails.genres.map((g: { description: string }) => (
                                    <span key={g.description} className="bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest shadow-sm backdrop-blur-md">
                                        {g.description}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {reviews && reviews.reviews.length > 0 && (
                <div className="mt-16 border-t border-white/10 pt-16 pb-20">
                    <div className="mb-10">
                        <h2 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-3 flex items-center gap-3">
                            <ThumbsUp size={15} className="text-green-400" /> Player Reviews
                        </h2>
                        <p className="text-sm text-white/40 font-medium">
                            <span className="text-cyan-400 font-bold">{reviews.query_summary.review_score_desc}</span>
                            {" · "}{reviews.query_summary.total_reviews.toLocaleString()} reviews
                        </p>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {reviews.reviews.slice(0, 4).map((rev: SteamReview, i: number) => (
                            <div key={i} className="bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 hover:bg-black/60 transition-colors shadow-2xl">
                                <div className="flex items-center justify-between mb-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-black/40 overflow-hidden border border-white/10 shrink-0 shadow-inner flex items-center justify-center">
                                            {rev.author.avatar ? (
                                                <img src={rev.author.avatar} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User2 size={20} className="text-white/30" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-bold">{rev.author.personaname}</p>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">{Math.round(rev.author.playtime_forever / 60)}h played</p>
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest shadow-md backdrop-blur-md",
                                        rev.voted_up ? "bg-cyan-400/10 border-cyan-400/20 text-cyan-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                                    )}>
                                        {rev.voted_up ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}
                                        <span>{rev.voted_up ? "Yes" : "No"}</span>
                                    </div>
                                </div>
                                <p className="text-white/60 text-sm leading-relaxed line-clamp-4">{rev.review}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
