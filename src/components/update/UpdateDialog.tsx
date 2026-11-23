import { ArrowUpCircle, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useUpdateStore } from "../../store/updateStore";
import { useUiStore } from "../../store/uiStore";
import { useProcessStore } from "../../store/processStore";
import { formatBytes, formatDate, formatEta } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/controls";
import { Markdown } from "../ui/Markdown";

export function UpdateDialog() {
    const open = useUiStore((s) => s.updateDialogOpen);
    const setOpen = useUiStore((s) => s.setUpdateDialogOpen);
    const { phase, version, currentVersion, notes, date, progress, error, install, skipVersion, checkForUpdates } = useUpdateStore();
    const runningCount = useProcessStore((s) => Object.keys(s.running).length);

    const busy = phase === "downloading" || phase === "installing";
    const pct = progress.total ? (progress.downloaded / progress.total) * 100 : undefined;
    const eta = progress.total && progress.speed > 0 ? (progress.total - progress.downloaded) / progress.speed : 0;

    return (
        <Modal
            open={open}
            onClose={() => !busy && setOpen(false)}
            dismissable={!busy}
            size="md"
            icon={<ArrowUpCircle size={19} />}
            title={phase === "uptodate" ? "You're up to date" : `ChiraLauncher ${version ?? ""}`}
            subtitle={version ? `${currentVersion} → ${version}${date ? ` · ${formatDate(date)}` : ""}` : `Version ${currentVersion}`}
            footer={
                phase === "available" || phase === "error" ? (
                    <>
                        <Button variant="ghost" onClick={skipVersion} disabled={!version}>Skip this version</Button>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setOpen(false)}>Later</Button>
                            <Button variant="primary" icon={<ArrowUpCircle size={16} />} onClick={() => void install()}>
                                {phase === "error" ? "Try again" : "Install & restart"}
                            </Button>
                        </div>
                    </>
                ) : phase === "uptodate" ? (
                    <>
                        <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void checkForUpdates()}>Check again</Button>
                        <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
                    </>
                ) : null
            }
        >
            {phase === "uptodate" && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <CheckCircle2 size={40} className="text-ok" />
                    <p className="text-sm text-fg-soft">You're running the latest version of ChiraLauncher.</p>
                </div>
            )}

            {(phase === "available" || phase === "error") && (
                <div className="space-y-4">
                    {runningCount > 0 && (
                        <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/[0.08] p-3 text-[13px] text-fg-soft">
                            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warn" />
                            <span>
                                A game is running. Installing restarts the launcher, which ends playtime and achievement tracking for the current session.
                                Consider updating after you finish playing.
                            </span>
                        </div>
                    )}
                    {phase === "error" && error && (
                        <div className="rounded-xl border border-danger/30 bg-danger/[0.08] p-3 text-[13px] text-danger">{error}</div>
                    )}
                    <div className="max-h-72 overflow-y-auto rounded-xl border border-line bg-black/20 p-4">
                        <div className="caption mb-2">What's new</div>
                        {notes?.trim() ? <Markdown source={notes} /> : <p className="text-[13px] text-fg-mute">No release notes were provided for this version.</p>}
                    </div>
                </div>
            )}

            {(phase === "downloading" || phase === "installing") && (
                <div className="space-y-4 py-4">
                    <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-fg">{phase === "installing" ? "Installing…" : "Downloading update…"}</span>
                        <span className="font-mono text-xs tabular-nums text-fg-soft">{pct !== undefined ? `${pct.toFixed(0)}%` : formatBytes(progress.downloaded)}</span>
                    </div>
                    <ProgressBar value={pct} indeterminate={phase === "installing" || pct === undefined} height={8} />
                    <div className="flex justify-between text-xs text-fg-mute">
                        <span>{progress.total ? `${formatBytes(progress.downloaded)} of ${formatBytes(progress.total)}` : formatBytes(progress.downloaded)}</span>
                        <span>{phase === "downloading" && progress.speed > 0 ? `${formatBytes(progress.speed)}/s · ${formatEta(eta)} left` : ""}</span>
                    </div>
                    <p className="text-xs text-fg-mute">ChiraLauncher will close and reopen automatically when the update is installed. Don't turn off your PC.</p>
                </div>
            )}
        </Modal>
    );
}
