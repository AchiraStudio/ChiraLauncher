import { Music, ArrowUp, ArrowDown, X } from "lucide-react";

interface TrackListItemProps {
    path: string;
    index: number;
    totalTracks: number;
    onMove: (index: number, direction: -1 | 1) => void;
    onRemove: (index: number) => void;
    size?: 12 | 14;
}

export function TrackListItem({ path, index, totalTracks, onMove, onRemove, size = 14 }: TrackListItemProps) {
    return (
        <div className={`flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.04] ${size === 12 ? 'p-2.5' : 'p-3'} rounded-xl border border-white/5 group transition-colors`}>
            <Music size={size} className="text-accent/60 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-white/70 truncate">{path.split('\\').pop()?.split('/').pop()}</p>
            </div>
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                <button onClick={() => onMove(index, -1)} disabled={index === 0} className={`p-1.5 text-white/40 hover:text-white disabled:opacity-30 rounded-md hover:bg-white/10`}>
                    <ArrowUp size={size} />
                </button>
                <button onClick={() => onMove(index, 1)} disabled={index === totalTracks - 1} className={`p-1.5 text-white/40 hover:text-white disabled:opacity-30 rounded-md hover:bg-white/10`}>
                    <ArrowDown size={size} />
                </button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button onClick={() => onRemove(index)} className={`p-1.5 text-red-400/60 hover:text-red-400 rounded-md hover:bg-red-500/10`}>
                    <X size={size} />
                </button>
            </div>
        </div>
    );
}
