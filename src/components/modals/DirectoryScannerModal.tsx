import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { FolderSearch, FolderOpen, Check, Search } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { useGameStore } from "../../store/gameStore";
import { call, errMsg, on } from "../../lib/tauri";
import { fetchSteamMetadata, steamArtwork, steamToFields } from "../../services/steamService";
import { dirname } from "../../lib/utils";
import type { NewGame } from "../../types/game";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge, ProgressBar } from "../ui/controls";
import { Spinner } from "../ui/Spinner";
import { cn } from "../../lib/utils";

interface ScanProgress { files_scanned: number; candidates_found: number; percentage: number }
interface Scanned { executable_path: string; guessed_title: string; install_dir: string; crack_type: string; app_id: string }

const IMPORT_CONCURRENCY = 3; // modest: each import hits Steam + downloads 3 images

async function toNewGame(g: Scanned): Promise<NewGame> {
    const dir = g.install_dir || dirname(g.executable_path);
    const base: NewGame = {
        id: crypto.randomUUID(), title: g.guessed_title, executable_path: g.executable_path, source: "scanner",
        added_at: new Date().toISOString(), is_favorite: false, run_as_admin: false, install_dir: dir,
        crack_type: g.crack_type, app_id: g.app_id || null, steam_app_id: g.app_id ? parseInt(g.app_id, 10) || null : null,
        custom_bgm_paths: [],
    };
    if (!g.app_id) return base;
    try {
        const data = await fetchSteamMetadata(g.app_id);
        const f = steamToFields(data), art = steamArtwork(g.app_id, data.header_image);
        const dl = (url: string, type: string) => call<string>("download_url_to_cache", { url, imageType: type }).catch(() => null);
        const [cover, bg, logo] = await Promise.all([dl(art.cover, "cover"), dl(art.background, "background"), dl(art.logo, "logo")]);
        return {
            ...base, title: f.title || base.title, developer: f.developer || null, publisher: f.publisher || null,
            description: f.description || null, release_date: f.releaseDate || null, genres: f.genre || null, genre: f.genre ? f.genre.split(",")[0].trim() : null,
            cover_path: cover, background_path: bg ? `${bg}?pos=center` : null, logo_path: logo,
        };
    } catch { return base; } // metadata is a bonus; never block the import on it
}

export function DirectoryScannerModal() {
    const setOpen = useUiStore((s) => s.setScannerOpen);
    const existing = useGameStore((s) => s.gamesById);
    const [step, setStep] = useState<"pick" | "scanning" | "results" | "importing">("pick");
    const [dir, setDir] = useState("");
    const [progress, setProgress] = useState<ScanProgress>({ files_scanned: 0, candidates_found: 0, percentage: 0 });
    const [results, setResults] = useState<Scanned[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [done, setDone] = useState(0);
    const [filter, setFilter] = useState("");

    useEffect(() => (step === "scanning" ? on<ScanProgress>("scan_progress", setProgress) : undefined), [step]);

    const known = useMemo(() => new Set(Object.values(existing).map((g) => g.executable_path.toLowerCase())), [existing]);
    const shown = useMemo(() => results.filter((r) => r.guessed_title.toLowerCase().includes(filter.toLowerCase())), [results, filter]);
    const close = () => step !== "importing" && setOpen(false);

    const scan = async () => {
        const sel = await openDialog({ directory: true, multiple: false }).catch(() => null);
        if (typeof sel !== "string") return;
        setDir(sel); setStep("scanning"); setProgress({ files_scanned: 0, candidates_found: 0, percentage: 0 });
        try {
            const found = await call<Scanned[]>("scan_directory", { path: sel });
            setResults(found);
            // Pre-select everything that isn't already in the library
            setSelected(new Set(found.filter((g) => !known.has(g.executable_path.toLowerCase())).map((g) => g.executable_path)));
            setStep("results");
        } catch (e) { toast.error("Scan failed", { description: errMsg(e) }); setStep("pick"); }
    };

    const toggle = (p: string) => setSelected((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

    const importSelected = async () => {
        const picks = results.filter((g) => selected.has(g.executable_path));
        setStep("importing"); setDone(0);
        let next = 0, added = 0;
        const failed: string[] = [];
        await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, picks.length) }, async () => {
            while (next < picks.length) {
                const g = picks[next++];
                try { await call("add_game", { game: await toNewGame(g) }); added++; }
                catch (e) { failed.push(g.guessed_title); console.error("Import failed:", g.guessed_title, e); }
                setDone((d) => d + 1);
            }
        }));
        await new Promise((r) => setTimeout(r, 400)); // let the queued DB writes land
        await useGameStore.getState().fetchGames();
        if (added) toast.success(`Imported ${added} game${added > 1 ? "s" : ""}`);
        if (failed.length) toast.error(`${failed.length} couldn't be imported`, { description: failed.slice(0, 3).join(", ") });
        setOpen(false);
    };

    return (
        <Modal
            open onClose={close} dismissable={step !== "importing" && step !== "scanning"} size="lg" icon={<FolderSearch size={19} />}
            title="Scan a folder" subtitle={dir || "Find installed games automatically"}
            footer={step === "results" ? (
                <>
                    <span className="text-xs text-fg-mute">{selected.size} of {results.length} selected</span>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setStep("pick")}>Scan another</Button>
                        <Button variant="primary" disabled={selected.size === 0} onClick={() => void importSelected()}>Import {selected.size || ""} game{selected.size === 1 ? "" : "s"}</Button>
                    </div>
                </>
            ) : step === "pick" ? <><span /><Button variant="secondary" onClick={close}>Cancel</Button></> : undefined}
        >
            {step === "pick" && (
                <div className="flex flex-col items-center gap-5 py-10 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent/12 text-accent"><FolderSearch size={28} /></div>
                    <div className="max-w-sm"><h3 className="text-lg font-semibold">Choose a games folder</h3><p className="mt-1.5 text-sm leading-relaxed text-fg-mute">ChiraLauncher searches inside it for game executables and detects titles, Steam App IDs and emulators.</p></div>
                    <Button variant="primary" size="lg" icon={<FolderOpen size={17} />} onClick={() => void scan()}>Choose folder</Button>
                </div>
            )}

            {step === "scanning" && (
                <div className="space-y-5 py-10">
                    <div className="flex items-center justify-center gap-3"><Spinner size={22} className="text-accent" /><span className="font-medium">Scanning…</span></div>
                    <ProgressBar value={progress.percentage} height={8} />
                    <div className="flex justify-between text-xs tabular-nums text-fg-mute"><span>{progress.files_scanned.toLocaleString()} files checked</span><span>{progress.candidates_found} games found</span></div>
                </div>
            )}

            {step === "results" && (results.length === 0 ? (
                <div className="py-14 text-center text-sm text-fg-mute">No games were found in this folder.<div className="mt-4"><Button variant="secondary" onClick={() => setStep("pick")}>Try another folder</Button></div></div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute" />
                            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter results" aria-label="Filter results" className="h-8 w-full rounded-ctl border border-line-strong bg-raised pl-8 pr-3 text-[13px] outline-none focus:border-accent/60" /></div>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(shown.filter((g) => !known.has(g.executable_path.toLowerCase())).map((g) => g.executable_path)))}>Select new</Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>None</Button>
                    </div>
                    <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
                        {shown.map((g) => {
                            const on = selected.has(g.executable_path), have = known.has(g.executable_path.toLowerCase());
                            return (
                                <li key={g.executable_path}>
                                    <button onClick={() => toggle(g.executable_path)} aria-pressed={on} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors", on ? "border-accent/40 bg-accent/[0.07]" : "border-line hover:bg-white/[0.04]")}>
                                        <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-accent bg-accent text-accent-fg" : "border-line-strong")}>{on && <Check size={13} strokeWidth={3} />}</span>
                                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{g.guessed_title}</span><span className="block truncate font-mono text-[11px] text-fg-mute">{g.executable_path}</span></span>
                                        {have && <Badge tone="ok">In library</Badge>}
                                        {g.app_id && <Badge tone="accent">#{g.app_id}</Badge>}
                                        {g.crack_type && g.crack_type !== "unknown" && <Badge>{g.crack_type}</Badge>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}

            {step === "importing" && (
                <div className="space-y-5 py-10">
                    <div className="flex items-center justify-center gap-3"><Spinner size={22} className="text-accent" /><span className="font-medium">Importing and fetching artwork…</span></div>
                    <ProgressBar value={selected.size ? (done / selected.size) * 100 : 0} height={8} />
                    <p className="text-center text-xs tabular-nums text-fg-mute">{done} of {selected.size}</p>
                </div>
            )}
        </Modal>
    );
}
