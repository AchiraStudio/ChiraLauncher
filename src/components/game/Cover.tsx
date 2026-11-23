import { memo, useState } from "react";
import { useLocalImage } from "../../hooks/useLocalImage";
import { cn } from "../../lib/utils";

/** Deterministic hue from a string, so each game without art keeps a stable colour. */
function hueOf(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
}

function initials(title: string): string {
    const words = title.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

interface CoverProps {
    title: string;
    path: string | null | undefined;
    className?: string;
    /** Eager images skip lazy-loading (use for the one hero image on screen). */
    eager?: boolean;
    alt?: string;
}

/**
 * Game artwork with a graceful fallback. The image box is always rendered at its
 * final size by the parent (aspect ratio), so loading never shifts layout.
 */
export const Cover = memo(function Cover({ title, path, className, eager, alt }: CoverProps) {
    const { src } = useLocalImage(path);
    const [failed, setFailed] = useState<string | null>(null);
    const showImg = src && failed !== src;
    const hue = hueOf(title);

    return (
        <div className={cn("relative h-full w-full overflow-hidden bg-raised", className)}>
            {showImg ? (
                <img
                    src={src}
                    alt={alt ?? title}
                    loading={eager ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    onError={() => setFailed(src)}
                    className="h-full w-full object-cover"
                />
            ) : (
                <div
                    className="grid h-full w-full place-items-center"
                    style={{ background: `linear-gradient(145deg, hsl(${hue} 32% 20%), hsl(${(hue + 40) % 360} 36% 10%))` }}
                >
                    <span className="select-none text-[clamp(1.1rem,3.4vw,2.2rem)] font-bold tracking-tight text-white/45">{initials(title)}</span>
                </div>
            )}
        </div>
    );
});
