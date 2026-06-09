import { cn } from "../../../lib/utils";
import { Terminal, RefreshCcw, Activity } from "lucide-react";

function DiagItem({ label, value, sub }: { label: string; value: any; sub?: string }) {
    return (
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-xs font-bold text-white/90 truncate">{value}</p>
            {sub && <p className="text-[8px] font-black text-accent/50 uppercase tracking-wider mt-0.5">{sub}</p>}
        </div>
    );
}

function DiagPath({ label, path }: { label: string; path: string | null }) {
    return (
        <div className="space-y-1">
            <p className="text-[8px] font-black text-white/15 uppercase tracking-widest ml-1">{label}</p>
            <div className="px-3 py-2 bg-black/40 border border-white/5 rounded-lg text-[9px] text-white/30 truncate font-mono select-all">
                {path || "Automatic Search"}
            </div>
        </div>
    );
}

export function EditGameDiagnosticsTab({
    diagnostics, refreshDiagnostics, isRefreshingDiag
}: any) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Terminal className="text-white/30" size={16} />
                    <h3 className="text-white/80 font-black uppercase text-[10px] tracking-widest">Scanner Logs</h3>
                </div>
                <button onClick={refreshDiagnostics} disabled={isRefreshingDiag} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/30 hover:text-accent disabled:opacity-50">
                    <RefreshCcw size={14} className={cn(isRefreshingDiag && "animate-spin")} />
                </button>
            </div>

            {diagnostics ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <DiagItem label="Emulator" value={diagnostics.emulator} />
                        <DiagItem label="App ID" value={diagnostics.app_id || "None"} />
                        <DiagItem label="Defs Found" value={diagnostics.metadata_count} sub={diagnostics.metadata_valid ? "Valid JSON" : "Invalid/None"} />
                        <DiagItem label="Earned" value={diagnostics.earned_count} sub={diagnostics.earned_state_format?.toUpperCase() || "N/A"} />
                    </div>

                    <div className="bg-black/80 rounded-2xl p-4 border border-white/5 font-mono text-[10px] leading-relaxed text-white/40 max-h-[160px] overflow-y-auto no-scrollbar shadow-inner">
                        {diagnostics.probe_log.map((line: string, i: number) => (
                            <div key={i} className="mb-1 flex gap-2"><span className="text-accent/30 shrink-0">›</span><span className="truncate">{line}</span></div>
                        ))}
                        {diagnostics.probe_log.length === 0 && <div className="italic text-white/10">No logs generated.</div>}
                    </div>

                    <div className="space-y-3 pt-2">
                        <DiagPath label="Metadata Path" path={diagnostics.metadata_path} />
                        <DiagPath label="Save Path" path={diagnostics.earned_state_path} />
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-16 text-white/10">
                    <Activity size={32} className="mb-4 animate-pulse" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Analyzing Data...</p>
                </div>
            )}
        </div>
    );
}
