import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { sanitizeHtml } from "../../lib/sanitize";
import { interceptLinks } from "../../lib/external";
import { cn } from "../../lib/utils";

const prose = [
    "text-[14px] leading-[1.75] text-fg-soft",
    "[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-fg",
    "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg",
    "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-fg",
    "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
    "[&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg",
    "[&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline [&_strong]:text-fg",
].join(" ");

/** Game description: sanitised, collapsed by default with a fade, expandable. */
export function AboutSection({ description }: { description: string }) {
    const [open, setOpen] = useState(false);
    const html = useMemo(() => sanitizeHtml(description), [description]);
    const long = description.length > 700;

    return (
        <section>
            <h3 className="caption mb-3">About</h3>
            <div className="relative">
                <div
                    onClick={interceptLinks}
                    className={cn(prose, "overflow-hidden transition-[max-height] duration-300", long && !open ? "max-h-[170px]" : "max-h-[4000px]")}
                    dangerouslySetInnerHTML={{ __html: html }}
                />
                {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg to-transparent" />}
            </div>
            {long && (
                <button onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                    {open ? "Show less" : "Read more"} <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
                </button>
            )}
        </section>
    );
}
