import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { FolderOpen, Gamepad2, Hash, Sparkles, ChevronLeft, Activity, CheckCircle2, Globe } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { useGameStore } from "../../store/gameStore";
import { call, errMsg } from "../../lib/tauri";
import { fetchSteamMetadata, steamArtwork, steamToFields, type SteamAppDetails } from "../../services/steamService";
import type { ExecutionMethod, NewGame } from "../../types/game";
import { ExecutionMethodSettings } from "../game/ExecutionMethodSettings";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge, Field, ProgressBar, TextInput } from "../ui/controls";
import { Spinner } from "../ui/Spinner";
import { cn } from "../../lib/utils";

type Step = "pick" | "details" | "metadata" | "confirm";
const STEPS: Step[] = ["pick", "details", "metadata", "confirm"];
const STEP_LABEL: Record<Step, string> = { pick: "Choose executable", details: "Game details", metadata: "Artwork & info", confirm: "Review" };

interface ScanResult {
    executable_path: string; guessed_title: string; install_dir: string; crack_type: string; app_id: string;
    achievements_ini?: string; achievements_json?: string; achievements_xml?: string;
}

interface Meta { title: string; description: string; developer: string; publisher: string; releaseDate: string; genre: string; cover: string; background: string; logo: string }

export function AddGameModal() {
    const setOpen = useUiStore((s) => s.setAddGameOpen);
    const [step, setStep] = useState<Step>("pick");
    const [busy, setBusy] = useState<"" | "scan" | "steam" | "import">("");

    const [exePath, setExePath] = useState("");
    const [installDir, setInstallDir] = useState("");
    const [title, setTitle] = useState("");
    const [launchArgs, setLaunchArgs] = useState("");
    const [method, setMethod] = useState<ExecutionMethod>("direct");
    const [launcherPath, setLauncherPath] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [crack, setCrack] = useState<string | null>(null);
    const [appId, setAppId] = useState("");
    const [achPath, setAchPath] = useState<string | null>(null);

    const [steam, setSteam] = useState<SteamAppDetails | null>(null);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [applyMeta, setApplyMeta] = useState(true);

    const close = () => setOpen(false);

    const loadSteam = async (id: string, quiet = false) => {
        if (!id.trim()) return;
        setBusy("steam");
        try {
            const data = await fetchSteamMetadata(id.trim());
            const f = steamToFields(data);
            const art = steamArtwork(id.trim(), data.header_image);
            setSteam(data);
            setMeta({ title: f.title, description: f.description, developer: f.developer, publisher: f.publisher, releaseDate: f.releaseDate, genre: f.genre, cover: art.cover, background: art.background, logo: art.logo });
            if (f.title) setTitle(f.title);
            return true;
        } catch {
            if (!quiet) toast.error("Couldn't find that game on Steam", { description: "Check the App ID and try again." });
            return false;
        } finally { setBusy(""); }
    };

    const pick = async () => {
        const sel = await openDialog({ multiple: false, filters: [{ name: "Executables", extensions: ["exe"] }] }).catch(() => null);
        if (typeof sel !== "string") return;
        setExePath(sel); setBusy("scan"); setStep("details");
        try {
            const r = await call<ScanResult>("scan_single_game", { path: sel });
            setExePath(r.executable_path); setTitle(r.guessed_title); setInstallDir(r.install_dir);
            setCrack(r.crack_type); setAppId(r.app_id || "");
            setAchPath(r.achievements_json || r.achievements_ini || r.achievements_xml || null);
            if (r.app_id) await loadSteam(r.app_id, true);
        } catch (e) {
            console.error("Scanner failed:", e);
            const cleaned = await call<string>("clean_title", { filename: sel.split(/[\\/]/).pop() || "" }).catch(() => "");
            setTitle(cleaned);
        } finally { setBusy(""); }
    };

    const next = async () => {
        if (step === "details") {
            if (!title.trim()) return toast.error("Give the game a title");
            if (appId.trim() && !steam) await loadSteam(appId);
            setStep(appId.trim() ? "metadata" : "confirm");
        } else if (step === "metadata") setStep("confirm");
    };
    const back = () => setStep((s) => (s === "confirm" ? (appId.trim() ? "metadata" : "details") : s === "metadata" ? "details" : "pick"));

    const importGame = async () => {
        setBusy("import");
        try {
            const cache = async (url: string | null | undefined, type: string) => {
                if (!url || !url.startsWith("http")) return url ?? null;
                return call<string>("download_url_to_cache", { url, imageType: type }).catch(() => url);
            };
            const use = applyMeta && meta;
            const [cover, bg, logo] = use ? await Promise.all([cache(meta.cover, "cover"), cache(meta.background, "background"), cache(meta.logo, "logo")]) : [null, null, null];
            const game: NewGame = {
                id: crypto.randomUUID(), title: title.trim(), executable_path: exePath, source: "manual",
                added_at: new Date().toISOString(), is_favorite: false, run_as_admin: false,
                cover_path: cover, background_path: bg, logo_path: logo,
                description: use ? meta.description : null, developer: use ? meta.developer : null, publisher: use ? meta.publisher : null,
                release_date: use ? meta.releaseDate : null, genre: use ? meta.genre : null,
                install_dir: installDir, steam_app_id: appId.trim() ? parseInt(appId, 10) || null : null,
                crack_type: crack, app_id: appId.trim() || null, manual_achievement_path: achPath,
                custom_bgm_paths: [], execution_method: method, launcher_path: launcherPath || null,
                launch_args: launchArgs.trim() || null,
            };
            await call("add_game", { game });
            await useGameStore.getState().awaitGame(game.id);
            toast.success("Game added", { description: game.title });
            close();
        } catch (e) { toast.error("Couldn't add game", { description: errMsg(e) }); setBusy(""); }
    };

    const idx = STEPS.indexOf(step);
    const showMetaStep = !!appId.trim();

    return (
        <Modal
            open onClose={() => busy !== "import" && close()} size="lg" icon={<Gamepad2 size={19} />}
            title="Add a game" subtitle={`Step ${idx + 1} of ${STEPS.length} · ${STEP_LABEL[step]}`}
            footer={step === "pick" ? <><span /><Button variant="secondary" onClick={close}>Cancel</Button></> : (
                <>
                    <Button variant="ghost" icon={<ChevronLeft size={15} />} onClick={back} disabled={busy !== ""}>Back</Button>
                    {step === "confirm" ? (
                        <Button variant="primary" loading={busy === "import"} onClick={() => void importGame()}>Add to library</Button>
                    ) : (
                        <Button variant="primary" loading={busy === "steam"} disabled={busy === "scan"} onClick={() => void next()}>
                            {step === "details" && !showMetaStep ? "Review" : "Continue"}
                        </Button>
                    )}
                </>
            )}
        >
            <ProgressBar value={((idx + 1) / STEPS.length) * 100} height={3} className="mb-6" />

            {step === "pick" && (
                <div className="flex flex-col items-center gap-5 py-10 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent/12 text-accent"><FolderOpen size={28} /></div>
                    <div className="max-w-sm">
                        <h3 className="text-lg font-semibold">Pick the game's .exe</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-fg-mute">We'll detect the title, Steam App ID, emulator and achievements automatically. To add many games at once, use <span className="text-fg-soft">Scan folder</span> instead.</p>
                    </div>
                    <Button variant="primary" size="lg" icon={<FolderOpen size={17} />} onClick={() => void pick()}>Choose executable</Button>
                </div>
            )}

            {step === "details" && (busy === "scan" ? (
                <div className="grid place-items-center gap-4 py-16 text-center">
                    <Spinner size={30} className="text-accent" />
                    <div><p className="font-medium">Analysing game files…</p><p className="mt-1 text-xs text-fg-mute">Detecting emulator, App ID and achievement files</p></div>
                </div>
            ) : (
                <div className="space-y-5">
                    <div className="truncate rounded-ctl border border-line bg-black/20 px-3 py-2 font-mono text-xs text-fg-mute" title={exePath}>{exePath}</div>
                    <Field label="Title"><TextInput data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Game title" icon={<Gamepad2 size={15} />} /></Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Steam App ID" hint="Used for artwork, descriptions and achievements.">
                            <TextInput mono icon={<Hash size={14} />} value={appId} onChange={(e) => { setAppId(e.target.value.replace(/\D/g, "")); setSteam(null); setMeta(null); }} placeholder="e.g. 1245620" />
                        </Field>
                        <Field label="Launch arguments"><TextInput mono value={launchArgs} onChange={(e) => setLaunchArgs(e.target.value)} placeholder="-windowed -novid" /></Field>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={crack && crack !== "unknown" ? "ok" : "neutral"} icon={crack && crack !== "unknown" ? <CheckCircle2 size={11} /> : <Activity size={11} />}>Emulator: {crack ?? "unknown"}</Badge>
                        {achPath && <Badge tone="warn">Achievements file found</Badge>}
                    </div>
                    <div>
                        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-[13px] font-medium text-accent hover:underline">{showAdvanced ? "Hide" : "Show"} launch options</button>
                        {showAdvanced && <div className="mt-3"><ExecutionMethodSettings executionMethod={method} setExecutionMethod={setMethod} launcherPath={launcherPath} setLauncherPath={setLauncherPath} /></div>}
                    </div>
                </div>
            ))}

            {step === "metadata" && (busy === "steam" ? (
                <div className="grid place-items-center gap-4 py-16"><Spinner size={30} className="text-accent" /><p className="font-medium">Contacting Steam…</p></div>
            ) : !meta ? (
                <div className="py-12 text-center text-sm text-fg-mute">
                    <Globe size={26} className="mx-auto mb-3" />Couldn't load Steam data for App ID {appId}. You can still add the game without it.
                    <div className="mt-4"><Button variant="secondary" onClick={() => void loadSteam(appId)}>Try again</Button></div>
                </div>
            ) : (
                <div className="space-y-5">
                    <div className="flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.07] p-3.5">
                        <Sparkles size={18} className="shrink-0 text-accent" />
                        <div className="min-w-0 flex-1 text-[13px]"><div className="font-medium">Steam data found for {steam?.name}</div><div className="text-fg-mute">Artwork, description, developer and genres.</div></div>
                        <Button size="sm" variant={applyMeta ? "primary" : "secondary"} onClick={() => setApplyMeta(!applyMeta)}>{applyMeta ? "Applying" : "Skipped"}</Button>
                    </div>
                    <div className={cn("grid grid-cols-[130px_1fr] gap-5 transition-opacity", !applyMeta && "pointer-events-none opacity-35")}>
                        <img src={meta.cover} alt="Cover" className="aspect-[2/3] w-full rounded-lg border border-line object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                        <div className="min-w-0 space-y-3">
                            <img src={meta.background} alt="Background" className="h-28 w-full rounded-lg border border-line object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                            <dl className="space-y-1.5 text-[13px]">
                                <div className="flex gap-3"><dt className="w-20 shrink-0 text-fg-mute">Developer</dt><dd className="truncate">{meta.developer || "-"}</dd></div>
                                <div className="flex gap-3"><dt className="w-20 shrink-0 text-fg-mute">Genre</dt><dd className="truncate">{meta.genre || "-"}</dd></div>
                                <div className="flex gap-3"><dt className="w-20 shrink-0 text-fg-mute">Released</dt><dd>{meta.releaseDate || "-"}</dd></div>
                            </dl>
                        </div>
                    </div>
                </div>
            ))}

            {step === "confirm" && (
                <div className="space-y-5 py-2 text-center">
                    <div className="relative mx-auto h-56 w-[150px] overflow-hidden rounded-xl border border-line-strong bg-raised shadow-pop">
                        {applyMeta && meta?.cover ? <img src={meta.cover} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-fg-mute"><Gamepad2 size={34} /></div>}
                    </div>
                    <div><h3 className="text-xl font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-md truncate font-mono text-xs text-fg-mute" title={exePath}>{exePath}</p></div>
                    <p className="text-[13px] text-fg-mute">Desktop and Start Menu shortcuts will be created for you.</p>
                </div>
            )}
        </Modal>
    );
}
