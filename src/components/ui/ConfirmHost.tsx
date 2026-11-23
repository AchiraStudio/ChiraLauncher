import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useConfirmStore } from "../../store/confirmStore";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { TextInput } from "./controls";

export function ConfirmHost() {
    const current = useConfirmStore((s) => s.current);
    const settle = useConfirmStore((s) => s.settle);
    const [typed, setTyped] = useState("");
    useEffect(() => setTyped(""), [current]);

    if (!current) return null;
    const blocked = !!current.requireText && typed !== current.requireText;
    return (
        <Modal
            open
            size="sm"
            onClose={() => settle(false)}
            icon={current.danger ? <AlertTriangle size={18} className="text-danger" /> : undefined}
            title={current.title}
            footer={
                <>
                    <span />
                    <div className="flex gap-2">
                        {/* Destructive prompts focus Cancel, so a stray Enter can never confirm a deletion */}
                        <Button variant="secondary" data-autofocus={current.danger ? true : undefined} onClick={() => settle(false)}>{current.cancelLabel ?? "Cancel"}</Button>
                        <Button variant={current.danger ? "danger" : "primary"} disabled={blocked} data-autofocus={current.danger ? undefined : true} onClick={() => settle(true)}>
                            {current.confirmLabel ?? "Confirm"}
                        </Button>
                    </div>
                </>
            }
        >
            {current.description && <div className="text-sm leading-relaxed text-fg-soft">{current.description}</div>}
            {current.requireText && (
                <div className="mt-4 space-y-2">
                    <p className="text-xs text-fg-mute">Type <span className="font-mono text-fg">{current.requireText}</span> to continue.</p>
                    <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={current.requireText} />
                </div>
            )}
        </Modal>
    );
}
