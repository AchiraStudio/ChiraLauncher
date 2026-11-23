import { FolderOpen } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { ExecutionMethod } from "../../types/game";
import { Button } from "../ui/Button";
import { Field, TextInput } from "../ui/controls";
import { cn } from "../../lib/utils";

const OPTIONS: { value: ExecutionMethod; label: string; desc: string }[] = [
    { value: "direct", label: "Direct launch", desc: "Starts the executable and tracks its process. Right for most games." },
    { value: "official_steam", label: "Steam (steam://)", desc: "Launches through Steam so DRM applies. Playtime attaches once the game loads." },
    { value: "unreal_engine", label: "Unreal Engine", desc: "Ignores the bootstrap exe and attaches to the real Win64-Shipping.exe." },
    { value: "auto_launcher", label: "Launcher, then game", desc: "Starts the launcher, waits 5 seconds, then starts the game." },
    { value: "manual_launcher", label: "Launcher only", desc: "Starts the launcher; you click Play. The game is detected automatically." },
];

export function ExecutionMethodSettings({
    executionMethod, setExecutionMethod, launcherPath, setLauncherPath,
}: {
    executionMethod: ExecutionMethod | string;
    setExecutionMethod: (v: ExecutionMethod) => void;
    launcherPath: string;
    setLauncherPath: (v: string) => void;
}) {
    const needsLauncher = executionMethod === "auto_launcher" || executionMethod === "manual_launcher";
    return (
        <div className="space-y-4">
            <div className="grid gap-2">
                {OPTIONS.map((o) => (
                    <button key={o.value} type="button" onClick={() => setExecutionMethod(o.value)} aria-pressed={executionMethod === o.value}
                        className={cn("flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors", executionMethod === o.value ? "border-accent/50 bg-accent/10" : "border-line hover:border-line-strong hover:bg-white/[0.03]")}>
                        <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", executionMethod === o.value ? "border-accent bg-accent" : "border-line-strong")}>
                            {executionMethod === o.value && <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" />}
                        </span>
                        <span>
                            <span className="block text-sm font-medium">{o.label}</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-fg-mute">{o.desc}</span>
                        </span>
                    </button>
                ))}
            </div>
            {needsLauncher && (
                <Field label="Launcher executable">
                    <div className="flex gap-2">
                        <TextInput mono value={launcherPath} onChange={(e) => setLauncherPath(e.target.value)} placeholder="C:\Games\Launcher.exe" />
                        <Button variant="secondary" icon={<FolderOpen size={15} />} onClick={async () => {
                            const r = await openDialog({ multiple: false, filters: [{ name: "Executables", extensions: ["exe"] }] }).catch(() => null);
                            if (typeof r === "string") setLauncherPath(r);
                        }}>Browse</Button>
                    </div>
                </Field>
            )}
        </div>
    );
}
