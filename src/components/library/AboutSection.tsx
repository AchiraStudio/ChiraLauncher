import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { cn } from "../../lib/utils";

export const steamHtml = [
    "text-white/65 text-[14px] leading-[1.9] font-normal",
    "[&_h1]:text-white [&_h1]:text-2xl [&_h1]:font-black [&_h1]:uppercase [&_h1]:tracking-tight",
    "[&_h1]:border-b [&_h1]:border-white/10 [&_h1]:pb-3 [&_h1]:mt-12 [&_h1]:mb-5 [&_h1:first-child]:mt-0",
    "[&_h2]:text-white [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3",
    "[&_h3]:text-white/90 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2",
    "[&_p]:mb-4 [&_p]:text-white/60",
    "[&_strong]:text-white/90 [&_strong]:font-semibold",
    "[&_b]:text-white/90 [&_b]:font-semibold",
    "[&_i]:text-white/40 [&_em]:text-white/40",
    "[&_.bb_ul]:list-none [&_.bb_ul]:ml-0 [&_.bb_ul]:mb-5 [&_.bb_ul]:space-y-1.5",
    "[&_.bb_ul>li]:text-white/60 [&_.bb_ul>li]:flex [&_.bb_ul>li]:items-start [&_.bb_ul>li]:gap-2.5",
    "[&_.bb_ul>li]:before:content-['▸'] [&_.bb_ul>li]:before:text-accent [&_.bb_ul>li]:before:text-xs [&_.bb_ul>li]:before:shrink-0 [&_.bb_ul>li]:before:mt-1",
    "[&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-5 [&_ul]:space-y-1.5 [&_li]:text-white/60",
    "[&_.bb_img_ctn]:block [&_.bb_img_ctn]:my-6",
    "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_img]:border [&_img]:border-white/10 [&_img]:block [&_img]:shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
    "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2",
    "[&_br]:leading-none",
].join(" ");

export function AboutSection({ description }: { description: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="relative mt-8 border-t border-white/10 pt-16">
            <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
                <Info size={15} className="text-cyan-400" /> About this game
            </p>
            <div className={cn(
                "relative bg-black/40 backdrop-blur-3xl px-10 pt-10 rounded-[2rem] border border-white/10 shadow-2xl transition-all duration-500 overflow-hidden",
                expanded ? "max-h-[5000px] pb-10" : "max-h-[350px] pb-0"
            )}>
                <div className={cn(steamHtml, "max-w-4xl")} dangerouslySetInnerHTML={{ __html: description }} />

                {!expanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0b0e14] via-[#0b0e14]/80 to-transparent flex items-end justify-center pb-6">
                        <button onClick={() => setExpanded(true)} className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-lg flex items-center gap-2">
                            Read More <ChevronDown size={14} />
                        </button>
                    </div>
                )}
                {expanded && (
                    <div className="mt-8 flex justify-center border-t border-white/5 pt-8">
                        <button onClick={() => setExpanded(false)} className="bg-white/5 hover:bg-white/10 border border-white/5 text-white/50 hover:text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2">
                            Show Less <ChevronUp size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
