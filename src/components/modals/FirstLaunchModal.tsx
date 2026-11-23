import { useState } from "react";
import { Rocket, User } from "lucide-react";
import { toast } from "sonner";
import { useUiStore } from "../../store/uiStore";
import { useProfileStore } from "../../store/profileStore";
import { errMsg } from "../../lib/tauri";
import { Button } from "../ui/Button";
import { Field, TextInput } from "../ui/controls";

/** One-time welcome screen shown before the shell, so it renders full-window. */
export function FirstLaunchModal() {
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const setFirstLaunch = useUiStore((s) => s.setFirstLaunch);
    const updateProfile = useProfileStore((s) => s.updateProfile);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
            await updateProfile(name.trim(), null, null, null, false);
            setFirstLaunch(false);
            toast.success(`Welcome, ${name.trim()}!`, { description: "Your library is ready." });
        } catch (err) { toast.error("Couldn't create your profile", { description: errMsg(err) }); }
        finally { setBusy(false); }
    };

    return (
        <div className="grid h-screen w-screen place-items-center bg-bg p-6 text-fg">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_380px_at_50%_0%,color-mix(in_oklab,var(--color-accent)_14%,transparent),transparent)]" />
            <form onSubmit={submit} className="surface relative w-full max-w-[420px] animate-slide-up space-y-6 p-8">
                <div className="text-center">
                    <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-accent/14 text-accent"><Rocket size={30} /></div>
                    <h1 className="text-2xl font-semibold tracking-tight">Welcome to ChiraLauncher</h1>
                    <p className="mt-2 text-sm text-fg-mute">Everything stays on your PC. Pick a name to get started.</p>
                </div>
                <Field label="Display name"><TextInput data-autofocus autoFocus icon={<User size={15} />} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="What should we call you?" /></Field>
                <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!name.trim()}>Get started</Button>
            </form>
        </div>
    );
}
