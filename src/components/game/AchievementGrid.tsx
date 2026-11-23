import { memo, useMemo, useState, useDeferredValue } from "react";
import { Lock, Search, Trophy, EyeOff } from "lucide-react";
import type { Achievement } from "../../services/achievementService";
import { useLocalImage } from "../../hooks/useLocalImage";
import { Segmented, ProgressBar, EmptyState } from "../ui/controls";
import { cn } from "../../lib/utils";

type Filter = "all" | "unlocked" | "locked";
type Sort = "rarity" | "recent" | "name";

interface Tier { name: string; color: string; bg: string; border: string }

/** Rarity tiers from Steam's global unlock percentage. */
function tierOf(percent: number | null): Tier {
    if (percent === null) return { name: "Unknown", color: "text-fg-mute", bg: "bg-white/[0.04]", border: "border-line" };
    if (percent > 50) return { name: "Common", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30" };
    if (percent > 25) return { name: "Uncommon", color: "text-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/30" };
    if (percent > 10) return { name: "Rare", color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/30" };
    if (percent > 5) return { name: "Very rare", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/35" };
    return { name: "Ultra rare", color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/40" };
}

const fmtDate = (ts: number | null) =>
    ts ? new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

const AchievementCard = memo(function AchievementCard({ a }: { a: Achievement }) {
    const hiddenLocked = a.hidden && !a.earned;
    const { src } = useLocalImage(a.earned ? a.icon_path : a.icon_gray_path ?? a.icon_path);
    const tier = tierOf(a.global_percent);

    return (
        <div className={cn("cv-auto flex gap-3.5 rounded-xl border p-3.5 transition-colors", a.earned ? cn(tier.border, tier.bg) : "border-line bg-white/[0.02] opacity-70 hover:opacity-100")}>
            <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/30">
                {src && !hiddenLocked ? (
                    <img src={src} alt="" loading="lazy" decoding="async" className={cn("h-full w-full object-cover", !a.earned && "grayscale")} />
                ) : (
                    hiddenLocked ? <EyeOff size={20} className="text-fg-mute" /> : <Trophy size={20} className="text-fg-mute" />
                )}
                {!a.earned && !hiddenLocked && <Lock size={12} className="absolute bottom-1 right-1 text-white/70" />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-fg">{hiddenLocked ? "Hidden achievement" : a.display_name}</div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-fg-mute">{hiddenLocked ? "Keep playing to discover this one." : a.description}</p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className={cn("font-medium", tier.color)}>
                        {tier.name}{a.global_percent !== null && ` · ${a.global_percent.toFixed(1)}%`}
                    </span>
                    {a.earned && <span className="text-fg-mute">{fmtDate(a.earned_time)}</span>}
                </div>
            </div>
        </div>
    );
});

export function AchievementGrid({ achievements }: { achievements: Achievement[]; gameName?: string }) {
    const [filter, setFilter] = useState<Filter>("all");
    const [sort, setSort] = useState<Sort>("rarity");
    const [query, setQuery] = useState("");
    const q = useDeferredValue(query.trim().toLowerCase());

    const unlocked = useMemo(() => achievements.filter((a) => a.earned).length, [achievements]);
    const pct = achievements.length ? (unlocked / achievements.length) * 100 : 0;

    const list = useMemo(() => {
        let l = achievements;
        if (filter === "unlocked") l = l.filter((a) => a.earned);
        else if (filter === "locked") l = l.filter((a) => !a.earned);
        if (q) l = l.filter((a) => !(a.hidden && !a.earned) && (a.display_name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)));
        const arr = [...l];
        if (sort === "name") arr.sort((a, b) => a.display_name.localeCompare(b.display_name));
        else if (sort === "recent") arr.sort((a, b) => (b.earned_time ?? 0) - (a.earned_time ?? 0) || Number(b.earned) - Number(a.earned));
        else arr.sort((a, b) => Number(b.earned) - Number(a.earned) || (a.global_percent ?? 101) - (b.global_percent ?? 101));
        return arr;
    }, [achievements, filter, sort, q]);

    if (achievements.length === 0) {
        return (
            <EmptyState
                icon={<Trophy size={26} />}
                title="No achievements yet"
                description="This game has no achievements file. Open Edit details → Achievements to point at one, or generate it from Steam."
            />
        );
    }

    return (
        <div className="space-y-5">
            <div className="surface flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
                <div>
                    <div className="text-2xl font-semibold tabular-nums">{unlocked}<span className="text-base text-fg-mute"> / {achievements.length}</span></div>
                    <div className="text-xs text-fg-mute">achievements unlocked</div>
                </div>
                <div className="min-w-[200px] flex-1">
                    <div className="mb-1.5 flex justify-between text-xs"><span className="text-fg-mute">Completion</span><span className="font-medium tabular-nums text-fg-soft">{Math.round(pct)}%</span></div>
                    <ProgressBar value={pct} tone={pct === 100 ? "ok" : "accent"} height={8} />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Segmented
                    value={filter}
                    onChange={setFilter}
                    size="sm"
                    options={[
                        { value: "all", label: `All ${achievements.length}` },
                        { value: "unlocked", label: `Unlocked ${unlocked}` },
                        { value: "locked", label: `Locked ${achievements.length - unlocked}` },
                    ]}
                />
                <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-mute" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search achievements"
                        aria-label="Search achievements"
                        className="h-8 w-52 rounded-ctl border border-line-strong bg-raised pl-8 pr-2 text-[13px] outline-none placeholder:text-fg-mute focus:border-accent/60"
                    />
                </div>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort achievements" className="h-8 !py-0 text-[13px]">
                    <option value="rarity">Rarest first</option>
                    <option value="recent">Recently unlocked</option>
                    <option value="name">Name</option>
                </select>
            </div>

            {list.length === 0 ? (
                <p className="py-10 text-center text-sm text-fg-mute">No achievements match.</p>
            ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                    {list.map((a) => <AchievementCard key={a.api_name} a={a} />)}
                </div>
            )}
        </div>
    );
}
