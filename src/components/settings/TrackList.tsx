import { ArrowDown, ArrowUp, Music, Plus, X } from "lucide-react";
import { basename } from "../../lib/utils";
import { Button, IconButton } from "../ui/Button";

/** Editable ordered list of audio files (used for the launcher and per-game playlists). */
export function TrackList({
    paths, onChange, onAdd, emptyHint = "No tracks yet",
}: { paths: string[]; onChange: (next: string[]) => void; onAdd: () => void; emptyHint?: string }) {
    const move = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= paths.length) return;
        const next = [...paths];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };
    return (
        <div className="space-y-2">
            <div className="max-h-56 overflow-y-auto rounded-xl border border-line bg-black/20 p-1.5">
                {paths.length === 0 ? (
                    <div className="grid place-items-center gap-1.5 py-8 text-fg-mute"><Music size={20} /><span className="text-xs">{emptyHint}</span></div>
                ) : paths.map((p, i) => (
                    <div key={`${p}-${i}`} className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-white/[0.04]">
                        <Music size={14} className="shrink-0 text-accent/70" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-soft" title={p}>{basename(p)}</span>
                        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                            <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></IconButton>
                            <IconButton label="Move down" size="sm" disabled={i === paths.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></IconButton>
                            <IconButton label="Remove" size="sm" tone="danger" onClick={() => onChange(paths.filter((_, k) => k !== i))}><X size={14} /></IconButton>
                        </div>
                    </div>
                ))}
            </div>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={onAdd}>Add tracks</Button>
        </div>
    );
}
