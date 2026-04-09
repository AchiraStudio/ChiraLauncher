import { useMemo } from "react";
import { cn } from "../../lib/utils";

const GRADIENTS = [
    "from-slate-800 to-slate-900",
    "from-zinc-800 to-stone-900",
    "from-neutral-800 to-zinc-900",
    "from-gray-800 to-zinc-950",
    "from-slate-700 to-slate-950",
    "from-stone-800 to-neutral-950",
    "from-zinc-700 to-neutral-900",
    "from-neutral-700 to-slate-900",
];

export function PlaceholderCover({ title, className }: { title: string; className?: string }) {
    const gradient = useMemo(() => {
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            hash = (hash << 5) - hash + title.charCodeAt(i);
            hash |= 0;
        }
        const gradientIndex = Math.abs(hash) % GRADIENTS.length;
        return GRADIENTS[gradientIndex];
    }, [title]);

    return (
        <div
            className={cn(
                "w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br relative overflow-hidden",
                gradient,
                className
            )}
        >
            {/* Background design elements */}
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none select-none">
                <div className="absolute -top-1/4 -left-1/4 w-full h-full border-[1px] border-white rotate-45" />
                <div className="absolute -bottom-1/4 -right-1/4 w-full h-full border-[1px] border-white rotate-45" />
            </div>

            <div className="relative z-10 w-full text-center">
                <h3 className="text-xl font-black text-white leading-tight drop-shadow-2xl uppercase tracking-tighter filter blur-[0.3px]">
                    {title}
                </h3>
                <div className="h-1 w-8 bg-white/30 mx-auto mt-4 rounded-full" />
            </div>
        </div>
    );
}
