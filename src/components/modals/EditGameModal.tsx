import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
    Pencil, Gamepad2, Zap, Image as ImageIcon, FileText, Trophy, Activity, Globe, FolderOpen, X, Play, Link2, Unlink, RefreshCcw, Save, Hash,
} from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { useGameStore } from "../../store/gameStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useGameActions } from "../../hooks/useGameActions";
import { confirm as askConfirm } from "../../store/confirmStore";
import { call, errMsg } from "../../lib/tauri";
import { dirname } from "../../lib/utils";
import { fetchSteamAchievementPercentages, fetchSteamMetadata, steamArtwork, steamToFields, type SteamAppDetails } from "../../services/steamService";
import { smartAudio } from "../../services/SmartAudio";
import { useLocalImage } from "../../hooks/useLocalImage";
import type { Game } from "../../types/game";
import { ExecutionMethodSettings } from "../game/ExecutionMethodSettings";
import { TrackList } from "../settings/TrackList";
import { Modal } from "../ui/Modal";
import { Button, IconButton } from "../ui/Button";
import { Field, TextArea, TextInput } from "../ui/controls";
import { cn } from "../../lib/utils";

type Tab = "general" | "launch" | "media" | "details" | "achievements" | "diagnostics";

interface Form {
    title: string; exePath: string; launchArgs: string; appId: string;
    method: string; launcherPath: string;
    cover: string; background: string; logo: string; focal: string; achSound: string; bgm: string[];
    developer: string; publisher: string; releaseDate: string; genre: string; description: string;
    manualAch: string; manualSave: string;
}

const FOCALS = ["center", "top", "bottom", "left", "right", "left-top", "right-top", "left-bottom", "right-bottom"];
const AUDIO = [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] }];
const IMAGES = [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }];

function toForm(g: Game): Form {
    const [bg, focal] = (g.background_path ?? "").split("?pos=");
    return {
        title: g.title, exePath: g.executable_path, launchArgs: g.launch_args ?? "", appId: g.steam_app_id?.toString() ?? "",
        method: g.execution_method || "direct", launcherPath: g.launcher_path ?? "",
        cover: g.cover_path ?? "", background: bg ?? "", logo: g.logo_path ?? "", focal: focal || "center",
        achSound: g.custom_ach_sound_path ?? "",
        bgm: g.custom_bgm_paths?.length ? g.custom_bgm_paths : g.custom_bgm_path ? [g.custom_bgm_path] : [],
        developer: g.developer ?? "", publisher: g.publisher ?? "", releaseDate: g.release_date ?? "", genre: g.genre ?? "", description: g.description ?? "",
        manualAch: g.manual_achievement_path ?? "", manualSave: g.manual_save_path ?? "",
    };
}

function ImageField({ label, value, onChange, aspect, hint, children }: { label: string; value: string; onChange: (v: string) => void; aspect: string; hint?: string; children?: React.ReactNode }) {
    const { src } = useLocalImage(value || null);
    const browse = async () => { const r = await openDialog({ multiple: false, filters: IMAGES }).catch(() => null); if (typeof r === "string") onChange(r); };
    return (
        <div className="flex gap-4">
            <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-black/30 text-fg-mute", aspect)}>
                {src ? <img src={src} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} /> : <ImageIcon size={20} />}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-fg-soft">{label}</span>{children}</div>
                <div className="flex gap-2">
                    <TextInput mono value={value} onChange={(e) => onChange(e.target.value)} placeholder="File path or https:// URL" />
                    <Button variant="secondary" icon={<FolderOpen size={15} />} onClick={() => void browse()} aria-label={`Browse ${label}`} />
                    {value && <Button variant="ghost" icon={<X size={15} />} onClick={() => onChange("")} aria-label={`Clear ${label}`} />}
                </div>
                {hint && <p className="text-xs text-fg-mute">{hint}</p>}
            </div>
        </div>
    );
}

function PathRow({ label, value, onChange, onBrowse, placeholder }: { label: string; value: string; onChange: (v: string) => void; onBrowse: () => void; placeholder?: string }) {
    return (
        <Field label={label}>
            <div className="flex gap-2">
                <TextInput mono value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
                <Button variant="secondary" icon={<FolderOpen size={15} />} onClick={onBrowse} aria-label={`Browse ${label}`} />
            </div>
        </Field>
    );
}

export function EditGameModal() {
    const game = useUiStore((s) => s.gameToEdit)!;
    const editGame = useUiStore((s) => s.editGame);
    const { createShortcuts, removeShortcuts } = useGameActions();
    const [tab, setTab] = useState<Tab>("general");
    const [f, setF] = useState<Form>(() => toForm(game));
    const [saving, setSaving] = useState(false);
    const [steam, setSteam] = useState<{ data: SteamAppDetails } | null>(null);
    const [steamBusy, setSteamBusy] = useState(false);
    const [importOpts, setImportOpts] = useState({ title: true, details: true, description: true, images: true, achievements: true });
    const [achBusy, setAchBusy] = useState<"" | "gen" | "sam">("");
    const [diag, setDiag] = useState<Record<string, any> | null>(null);
    const [diagBusy, setDiagBusy] = useState(false);

    useEffect(() => { setF(toForm(game)); setTab("general"); setDiag(null); setSteam(null); }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const up = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
    const close = () => editGame(null);
    const dirty = useMemo(() => JSON.stringify(f) !== JSON.stringify(toForm(game)), [f, game]);

    const requestClose = async () => {
        if (!dirty || await askConfirm({ title: "Discard your changes?", description: "Anything you edited will be lost.", confirmLabel: "Discard", danger: true })) close();
    };

    const save = async () => {
        if (!f.title.trim()) return toast.error("Title can't be empty");
        setSaving(true);
        try {
            const orig = toForm(game);
            const process = async (cur: string, was: string, type: "cover" | "background" | "logo") => {
                if (!cur || cur === was || cur.startsWith("data:")) return cur;
                try {
                    return cur.startsWith("http")
                        ? await call<string>("download_url_to_cache", { url: cur, imageType: type })
                        : await call<string>(`upload_custom_${type}`, { gameId: game.id, filePath: cur });
                } catch (e) { console.error(`Failed to process ${type}:`, e); return cur; }
            };
            const [cover, bgRaw, logo] = await Promise.all([process(f.cover, orig.cover, "cover"), process(f.background, orig.background, "background"), process(f.logo, orig.logo, "logo")]);
            const exeChanged = f.exePath !== game.executable_path;
            const updated: Game = {
                ...game,
                title: f.title.trim(), executable_path: f.exePath, install_dir: exeChanged ? dirname(f.exePath) : game.install_dir,
                launch_args: f.launchArgs.trim() || null,
                cover_path: cover || null, background_path: bgRaw ? `${bgRaw}?pos=${f.focal}` : null, logo_path: logo || null,
                custom_cover: game.custom_cover || (!!cover && cover !== orig.cover),
                custom_ach_sound_path: f.achSound || null, custom_bgm_paths: f.bgm,
                developer: f.developer || null, publisher: f.publisher || null, release_date: f.releaseDate || null,
                description: f.description || null, genre: f.genre || null,
                steam_app_id: f.appId ? parseInt(f.appId, 10) || null : null,
                manual_achievement_path: f.manualAch.trim() || null, manual_save_path: f.manualSave.trim() || null,
                execution_method: f.method, launcher_path: f.launcherPath || null,
            };
            await call("update_game", { game: updated });
            if ((updated.manual_achievement_path ?? "") !== (game.manual_achievement_path ?? ""))
                await call("set_manual_achievement_path", { gameId: game.id, path: updated.manual_achievement_path });
            if ((updated.manual_save_path ?? "") !== (game.manual_save_path ?? ""))
                await call("set_manual_save_path", { gameId: game.id, path: updated.manual_save_path });

            // Show the change immediately; the backend persists through a queue, so reconcile shortly after
            useGameStore.getState().patchGame(game.id, updated);
            setTimeout(() => void useGameStore.getState().fetchGames(), 500);
            toast.success("Changes saved");
            close();
        } catch (e) { toast.error("Couldn't save changes", { description: errMsg(e) }); }
        finally { setSaving(false); }
    };

    const pullSteam = async () => {
        if (!f.appId) return toast.error("Enter a Steam App ID first");
        setSteamBusy(true);
        try { setSteam({ data: await fetchSteamMetadata(f.appId) }); }
        catch { toast.error("Couldn't pull from Steam", { description: "Check that the App ID is correct." }); }
        finally { setSteamBusy(false); }
    };

    const applySteam = async () => {
        if (!steam) return;
        const d = steam.data, fields = steamToFields(d);
        setF((p) => ({
            ...p,
            title: importOpts.title && fields.title ? fields.title : p.title,
            description: importOpts.description ? fields.description || p.description : p.description,
            developer: importOpts.details ? fields.developer || p.developer : p.developer,
            publisher: importOpts.details ? fields.publisher || p.publisher : p.publisher,
            releaseDate: importOpts.details ? fields.releaseDate || p.releaseDate : p.releaseDate,
            genre: importOpts.details ? fields.genre || p.genre : p.genre,
            ...(importOpts.images ? { cover: steamArtwork(f.appId, d.header_image).cover, background: steamArtwork(f.appId, d.header_image).background, logo: steamArtwork(f.appId, d.header_image).logo, focal: "center" } : {}),
        }));
        fetchSteamAchievementPercentages(f.appId).then((pcts) => { if (Object.keys(pcts).length) return call("patch_achievement_percentages", { gameId: game.id, percentages: pcts }); }).catch(console.error);
        if (importOpts.achievements) {
            const apiKey = useSettingsStore.getState().settings?.steam_api_key;
            if (!apiKey) toast.warning("Add a Steam API key in Settings to generate achievements");
            else call("fetch_and_write_achievements", { appId: f.appId, gameDir: game.install_dir || "", apiKey })
                .then(() => toast.success("Achievements generated")).catch((e) => toast.error("Couldn't generate achievements", { description: errMsg(e) }));
        }
        setSteam(null);
        toast.success("Steam data applied", { description: "Review it, then save your changes." });
    };

    const pickFile = async (opts: Parameters<typeof openDialog>[0]) => { const r = await openDialog(opts).catch(() => null); return r ?? null; };

    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "general", label: "General", icon: <Gamepad2 size={14} /> }, { id: "launch", label: "Launch", icon: <Zap size={14} /> },
        { id: "media", label: "Media", icon: <ImageIcon size={14} /> }, { id: "details", label: "Details", icon: <FileText size={14} /> },
        { id: "achievements", label: "Achievements", icon: <Trophy size={14} /> }, { id: "diagnostics", label: "Diagnostics", icon: <Activity size={14} /> },
    ];

    return (
        <Modal
            open onClose={() => void requestClose()} size="lg" icon={<Pencil size={18} />} title="Edit game" subtitle={game.title}
            bodyClassName="!p-0"
            actions={<>
                <IconButton label="Create shortcuts" size="sm" onClick={() => void createShortcuts({ ...game, executable_path: f.exePath || game.executable_path })}><Link2 size={15} /></IconButton>
                <IconButton label="Remove shortcuts" size="sm" onClick={() => void removeShortcuts(game)}><Unlink size={15} /></IconButton>
                {f.appId && <Button size="sm" variant="secondary" icon={<Globe size={14} />} loading={steamBusy} onClick={() => void pullSteam()}>Steam sync</Button>}
            </>}
            footer={<>
                <span className="text-xs text-fg-mute">{dirty ? "Unsaved changes" : ""}</span>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => void requestClose()}>Cancel</Button>
                    <Button variant="primary" icon={<Save size={15} />} loading={saving} disabled={!dirty} onClick={() => void save()}>Save changes</Button>
                </div>
            </>}
        >
            <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-5 py-2.5">
                {TABS.map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors", tab === t.id ? "bg-accent/15 text-accent" : "text-fg-mute hover:bg-white/[0.05] hover:text-fg-soft")}>{t.icon}{t.label}</button>
                ))}
            </div>

            <div className="space-y-5 p-5">
                {steam ? (
                    <div className="space-y-4">
                        <div><h3 className="text-sm font-semibold">Import from Steam</h3><p className="text-[13px] text-fg-mute">Choose what to copy from “{steam.data.name}”. Nothing is saved until you press Save.</p></div>
                        <div className="grid gap-2">
                            {([["title", "Title"], ["details", "Developer, publisher, date and genre"], ["description", "Description"], ["images", "Cover, background and logo"], ["achievements", "Generate achievements file"]] as const).map(([k, label]) => (
                                <label key={k} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 text-sm transition-colors hover:bg-white/[0.04]">
                                    <input type="checkbox" checked={importOpts[k]} onChange={(e) => setImportOpts((o) => ({ ...o, [k]: e.target.checked }))} className="h-4 w-4 accent-[var(--color-accent)]" />{label}
                                </label>
                            ))}
                        </div>
                        <div className="flex gap-2"><Button variant="secondary" onClick={() => setSteam(null)}>Discard</Button><Button variant="primary" className="flex-1" onClick={() => void applySteam()}>Apply selected</Button></div>
                    </div>
                ) : <>
                    {tab === "general" && <>
                        <Field label="Title"><TextInput value={f.title} onChange={(e) => up("title", e.target.value)} /></Field>
                        <PathRow label="Executable" value={f.exePath} onChange={(v) => up("exePath", v)} placeholder="C:\Games\Game\game.exe"
                            onBrowse={async () => { const r = await pickFile({ multiple: false, filters: [{ name: "Executables", extensions: ["exe"] }] }); if (typeof r === "string") up("exePath", r); }} />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Steam App ID" hint="Enables artwork, descriptions and achievements."><TextInput mono icon={<Hash size={14} />} value={f.appId} onChange={(e) => up("appId", e.target.value.replace(/\D/g, ""))} /></Field>
                            <Field label="Launch arguments"><TextInput mono value={f.launchArgs} onChange={(e) => up("launchArgs", e.target.value)} placeholder="-windowed" /></Field>
                        </div>
                    </>}

                    {tab === "launch" && <ExecutionMethodSettings executionMethod={f.method} setExecutionMethod={(v) => up("method", v)} launcherPath={f.launcherPath} setLauncherPath={(v) => up("launcherPath", v)} />}

                    {tab === "media" && <>
                        <ImageField label="Cover (2:3)" aspect="h-28 w-[75px]" value={f.cover} onChange={(v) => up("cover", v)} />
                        <ImageField label="Background" aspect="h-20 w-36" value={f.background} onChange={(v) => up("background", v)} hint="Wide artwork shown behind the game page.">
                            <select value={f.focal} onChange={(e) => up("focal", e.target.value)} aria-label="Focal point" className="!h-7 !py-0 !text-xs">{FOCALS.map((x) => <option key={x} value={x}>Focus: {x.replace("-", " ")}</option>)}</select>
                        </ImageField>
                        <ImageField label="Logo" aspect="h-16 w-36" value={f.logo} onChange={(v) => up("logo", v)} hint="Transparent PNG shown over the background." />
                        <div className="space-y-2 border-t border-line pt-5">
                            <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-fg-soft">Game music</span>
                                {f.bgm.length > 0 && <Button size="sm" variant="ghost" icon={<Play size={13} fill="currentColor" />} onClick={() => void smartAudio.playGameBGM(game.id, f.bgm)}>Preview</Button>}</div>
                            <TrackList paths={f.bgm} onChange={(p) => up("bgm", p)} emptyHint="Plays while you view this game"
                                onAdd={async () => { const r = await pickFile({ multiple: true, filters: AUDIO }); if (r) up("bgm", [...f.bgm, ...(Array.isArray(r) ? r : [r])]); }} />
                        </div>
                        <div className="space-y-2 border-t border-line pt-5">
                            <span className="text-[13px] font-medium text-fg-soft">Achievement sound</span>
                            <div className="flex gap-2">
                                <TextInput mono value={f.achSound} onChange={(e) => up("achSound", e.target.value)} placeholder="Overrides the default unlock sound" />
                                {f.achSound && <Button variant="secondary" icon={<Play size={14} fill="currentColor" />} onClick={() => void smartAudio.playAchievement(f.achSound)} aria-label="Preview" />}
                                <Button variant="secondary" icon={<FolderOpen size={15} />} aria-label="Browse" onClick={async () => { const r = await pickFile({ multiple: false, filters: AUDIO }); if (typeof r === "string") up("achSound", r); }} />
                                {f.achSound && <Button variant="ghost" icon={<X size={15} />} onClick={() => up("achSound", "")} aria-label="Clear" />}
                            </div>
                        </div>
                    </>}

                    {tab === "details" && <>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Developer"><TextInput value={f.developer} onChange={(e) => up("developer", e.target.value)} /></Field>
                            <Field label="Publisher"><TextInput value={f.publisher} onChange={(e) => up("publisher", e.target.value)} /></Field>
                            <Field label="Release date"><TextInput type="date" value={f.releaseDate} onChange={(e) => up("releaseDate", e.target.value)} /></Field>
                            <Field label="Genres" hint="Comma separated."><TextInput value={f.genre} onChange={(e) => up("genre", e.target.value)} placeholder="Action, RPG" /></Field>
                        </div>
                        <Field label="Description" hint="Basic HTML from Steam is supported."><TextArea rows={9} value={f.description} onChange={(e) => up("description", e.target.value)} /></Field>
                    </>}

                    {tab === "achievements" && <>
                        <div className="space-y-3 rounded-xl border border-warn/25 bg-warn/[0.05] p-4">
                            <div className="flex items-start gap-3"><Trophy size={17} className="mt-0.5 shrink-0 text-warn" /><div className="text-[13px] leading-relaxed text-fg-mute"><span className="font-medium text-warn">Generate achievement data.</span> Fetches the schema from Steam and writes <code className="font-mono text-fg-soft">steam_settings/achievements.json</code> into the game folder. Needs an App ID, an install folder and a Steam API key.</div></div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" icon={<Trophy size={14} />} loading={achBusy === "gen"} disabled={!f.appId || achBusy !== ""} onClick={async () => {
                                    const apiKey = useSettingsStore.getState().settings?.steam_api_key;
                                    if (!apiKey) return toast.warning("Add a Steam API key in Settings first");
                                    if (!game.install_dir) return toast.error("This game has no install folder");
                                    setAchBusy("gen");
                                    try { const r = await call<{ count: number; has_global_pcts: boolean }>("fetch_and_write_achievements", { appId: f.appId, gameDir: game.install_dir, apiKey }); toast.success(`Generated ${r.count} achievements`, { description: r.has_global_pcts ? "Includes global rarity data." : undefined }); }
                                    catch (e) { toast.error("Generation failed", { description: errMsg(e) }); } finally { setAchBusy(""); }
                                }}>Generate achievements.json</Button>
                                <Button variant="secondary" icon={<RefreshCcw size={14} />} loading={achBusy === "sam"} disabled={!f.appId || achBusy !== ""} onClick={async () => {
                                    if (!game.install_dir) return toast.error("This game has no install folder");
                                    setAchBusy("sam");
                                    try { await call("sync_steam_achievements", { id: game.id, steamAppId: f.appId, installDir: game.install_dir }); toast.success("Synced from the Steam client"); }
                                    catch (e) { toast.error("Sync failed", { description: errMsg(e) }); } finally { setAchBusy(""); }
                                }}>Sync from Steam client</Button>
                            </div>
                        </div>
                        <p className="text-[13px] text-fg-mute">If auto-detection misses your files, point the launcher at them directly.</p>
                        <PathRow label="Definitions (achievements.json)" value={f.manualAch} onChange={(v) => up("manualAch", v)} placeholder="C:\Games\…\achievements.json"
                            onBrowse={async () => { const r = await pickFile({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] }); if (typeof r === "string") up("manualAch", r); }} />
                        <PathRow label="Progress (achievements.ini / .json / .xml)" value={f.manualSave} onChange={(v) => up("manualSave", v)} placeholder="C:\…\achievements.ini"
                            onBrowse={async () => { const r = await pickFile({ multiple: false, filters: [{ name: "Progress", extensions: ["ini", "json", "xml"] }] }); if (typeof r === "string") up("manualSave", r); }} />
                        {(f.manualAch || f.manualSave) && <Button size="sm" variant="ghost" icon={<RefreshCcw size={13} />} onClick={() => { up("manualAch", ""); up("manualSave", ""); }}>Reset to auto-detect</Button>}
                    </>}

                    {tab === "diagnostics" && <>
                        <div className="flex items-center justify-between"><p className="text-[13px] text-fg-mute">Shows how ChiraLauncher found (or failed to find) this game's achievement files.</p>
                            <Button variant="secondary" size="sm" icon={<RefreshCcw size={13} className={diagBusy ? "animate-spin" : ""} />} disabled={diagBusy} onClick={async () => {
                                setDiagBusy(true);
                                try { setDiag(await call("get_achievement_diagnostics", { gameId: game.id })); } catch (e) { toast.error("Diagnostics failed", { description: errMsg(e) }); } finally { setDiagBusy(false); }
                            }}>Run diagnostics</Button></div>
                        {diag && <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {[["Emulator", diag.emulator], ["App ID", diag.app_id ?? "None"], ["Definitions", `${diag.metadata_count} ${diag.metadata_valid ? "(valid)" : "(none)"}`], ["Earned", `${diag.earned_count} ${(diag.earned_state_format ?? "").toUpperCase()}`]].map(([k, v]) => (
                                    <div key={k as string} className="rounded-xl border border-line bg-black/20 p-3"><div className="text-xs text-fg-mute">{k}</div><div className="mt-1 truncate text-sm font-medium">{String(v)}</div></div>
                                ))}
                            </div>
                            {[["Metadata path", diag.metadata_path], ["Save path", diag.earned_state_path]].map(([k, v]) => (
                                <div key={k as string}><div className="mb-1 text-xs text-fg-mute">{k}</div><div className="break-all rounded-lg border border-line bg-black/20 px-3 py-2 font-mono text-xs text-fg-soft">{(v as string) || "Not found"}</div></div>
                            ))}
                            <div><div className="mb-1 text-xs text-fg-mute">Probe log</div>
                                <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-fg-soft">{(diag.probe_log as string[]).join("\n") || "No log lines."}</pre></div>
                        </div>}
                    </>}
                </>}
            </div>
        </Modal>
    );
}
