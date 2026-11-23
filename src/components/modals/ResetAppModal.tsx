import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useUiStore } from "../../store/uiStore";
import { call, errMsg } from "../../lib/tauri";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/controls";

const PHRASE = "FACTORY RESET";

export function ResetAppModal() {
    const setOpen = useUiStore((s) => s.setResetOpen);
    const [text, setText] = useState("");
    const [keepProgress, setKeepProgress] = useState(true);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        try {
            await call("reset_application", { keepProgress });
            localStorage.clear(); sessionStorage.clear(); // the backend restarts the app
        } catch (e) { toast.error("Reset failed", { description: errMsg(e) }); setBusy(false); }
    };

    return (
        <Modal
            open onClose={() => !busy && setOpen(false)} dismissable={!busy} size="sm" title="Factory reset" icon={<ShieldAlert size={19} className="text-danger" />}
            footer={<><span /><div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="danger" loading={busy} disabled={text !== PHRASE} onClick={() => void run()}>Erase everything</Button></div></>}
        >
            <div className="space-y-4 text-sm">
                <p className="leading-relaxed text-fg-soft">This deletes your library, settings and image caches, then restarts ChiraLauncher. <span className="font-medium text-fg">Your game files on disk are not touched.</span></p>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 transition-colors hover:bg-white/[0.04]">
                    <input type="checkbox" checked={keepProgress} onChange={(e) => setKeepProgress(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
                    <span><span className="block font-medium">Keep my progress</span><span className="text-xs text-fg-mute">Preserve playtime, achievements and XP so they come back if you re-add games.</span></span>
                </label>
                <div className="space-y-2"><p className="text-xs text-fg-mute">Type <span className="font-mono text-fg">{PHRASE}</span> to confirm.</p><TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder={PHRASE} disabled={busy} /></div>
            </div>
        </Modal>
    );
}
