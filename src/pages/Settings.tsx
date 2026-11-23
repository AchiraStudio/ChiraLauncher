import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
    MonitorSmartphone, Paintbrush, Volume2, HardDrive, Key, Bell, ArrowUpCircle, FolderOpen, X, Play, Trophy, Rocket, Eye, EyeOff,
    CheckCircle2, XCircle, RefreshCw, AlertOctagon, Zap, ExternalLink, Check, Shuffle,
} from "lucide-react";
import { useSettingsStore, type AppSettings } from "../store/settingsStore";
import { useUiStore } from "../store/uiStore";
import { useUpdateStore } from "../store/updateStore";
import { call, errMsg } from "../lib/tauri";
import { ACCENT_PRESETS } from "../lib/theme";
import { openExternal } from "../lib/external";
import { smartAudio } from "../services/SmartAudio";
import { timeAgo } from "../lib/format";
import { TrackList } from "../components/settings/TrackList";
import { Button } from "../components/ui/Button";
import { Badge, Card, SettingRow, Slider, Switch, TextInput } from "../components/ui/controls";
import { Spinner } from "../components/ui/Spinner";
import { cn } from "../lib/utils";

const REPO = "https://github.com/AchiraStudio/ChiraLauncher";
const AUDIO_FILTER = [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] }];

type TabId = "general" | "appearance" | "audio" | "downloads" | "integrations" | "overlay" | "updates";
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <MonitorSmartphone size={17} /> },
    { id: "appearance", label: "Appearance", icon: <Paintbrush size={17} /> },
    { id: "audio", label: "Audio", icon: <Volume2 size={17} /> },
    { id: "downloads", label: "Downloads", icon: <HardDrive size={17} /> },
    { id: "integrations", label: "Steam & achievements", icon: <Key size={17} /> },
    { id: "overlay", label: "Overlay", icon: <Bell size={17} /> },
    { id: "updates", label: "Updates & about", icon: <ArrowUpCircle size={17} /> },
];

/** A path input with Browse / Clear, used all over settings. */
function PathField({ value, onChange, onBrowse, placeholder, icon, onPreview }: {
    value: string; onChange: (v: string) => void; onBrowse: () => void; placeholder?: string; icon?: React.ReactNode; onPreview?: () => void;
}) {
    return (
        <div className="flex gap-2">
            <TextInput mono icon={icon} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
            {onPreview && value && <Button variant="secondary" icon={<Play size={14} fill="currentColor" />} onClick={onPreview} aria-label="Preview" />}
            <Button variant="secondary" icon={<FolderOpen size={15} />} onClick={onBrowse}>Browse</Button>
            {value && <Button variant="ghost" icon={<X size={15} />} onClick={() => onChange("")} aria-label="Clear" />}
        </div>
    );
}

export default function SettingsPage() {
    const { settings, updateSettings, isLoading } = useSettingsStore();
    const set = (u: Partial<AppSettings>) => updateSettings(u).catch(() => { /* toast shown by store */ });
    const [params, setParams] = useSearchParams();
    const tab = (params.get("tab") as TabId) || "general";
    const setTab = (t: TabId) => setParams({ tab: t }, { replace: true });
    const setResetOpen = useUiStore((s) => s.setResetOpen);

    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [validating, setValidating] = useState(false);
    const [keyStatus, setKeyStatus] = useState<"idle" | "valid" | "invalid">("idle");
    useEffect(() => { if (settings) setApiKey(settings.steam_api_key); }, [settings?.steam_api_key]); // eslint-disable-line react-hooks/exhaustive-deps

    const update = useUpdateStore();

    if (isLoading || !settings) return <div className="grid h-full place-items-center text-fg-mute"><Spinner size={22} /></div>;

    const pick = async (opts: Parameters<typeof openDialog>[0]) => {
        try { const r = await openDialog(opts); return r ?? null; } catch (e) { toast.error("Couldn't open the file picker", { description: errMsg(e) }); return null; }
    };

    const validateKey = async () => {
        if (!apiKey.trim()) return;
        setValidating(true); setKeyStatus("idle");
        try {
            const ok = await call<boolean>("validate_steam_api_key", { apiKey: apiKey.trim() });
            setKeyStatus(ok ? "valid" : "invalid");
            if (ok) { await set({ steam_api_key: apiKey.trim() }); toast.success("Steam API key validated and saved"); }
            else toast.error("That Steam API key isn't valid");
        } catch (e) { setKeyStatus("invalid"); toast.error("Validation failed", { description: errMsg(e) }); }
        finally { setValidating(false); }
    };

    const fireTest = (formatType: string) =>
        call("debug_fire_achievement", { formatType }).then(() => toast.success(`Sent a ${formatType} test achievement`)).catch((e) => toast.error("Overlay test failed", { description: errMsg(e) }));

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1040px] px-8 pb-14 pt-8">
                <header className="mb-6">
                    <h1 className="text-[26px] font-semibold tracking-tight">Settings</h1>
                    <p className="mt-0.5 text-sm text-fg-mute">Changes are saved automatically.</p>
                </header>

                <div className="grid gap-8 lg:grid-cols-[210px_1fr]">
                    <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-0 lg:flex-col lg:self-start lg:overflow-visible" aria-label="Settings sections">
                        {TABS.map((t) => (
                            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id}
                                className={cn("relative flex h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 text-sm font-medium transition-colors",
                                    tab === t.id ? "bg-accent/14 text-accent" : "text-fg-soft hover:bg-white/[0.06] hover:text-fg")}>
                                {t.icon}{t.label}
                                {t.id === "updates" && (update.phase === "available") && <span className="ml-auto h-2 w-2 rounded-full bg-accent" />}
                            </button>
                        ))}
                    </nav>

                    <div className="min-w-0 space-y-5">
                        {tab === "general" && (<>
                            <Card title="Behaviour">
                                <SettingRow title="Launch with Windows" description="Start ChiraLauncher quietly in the tray when you sign in.">
                                    <Switch checked={settings.auto_launch_on_boot} onChange={(v) => set({ auto_launch_on_boot: v })} label="Launch with Windows" />
                                </SettingRow>
                                <SettingRow title="Close button hides to tray" description="Keep the launcher running in the background (needed for playtime and achievements while the window is closed).">
                                    <Switch checked={settings.minimize_to_tray} onChange={(v) => set({ minimize_to_tray: v })} label="Close hides to tray" />
                                </SettingRow>
                                <SettingRow title="Hide launcher while playing" description="Minimise ChiraLauncher to the tray whenever a game starts.">
                                    <Switch checked={settings.auto_close_launcher} onChange={(v) => set({ auto_close_launcher: v })} label="Hide while playing" />
                                </SettingRow>
                                <SettingRow stacked title="Default secondary launcher" description="Used when a game needs a launcher but has no specific path set (for example Steam.exe).">
                                    <PathField icon={<Rocket size={15} />} value={settings.default_launcher_path} onChange={(v) => set({ default_launcher_path: v })}
                                        placeholder="C:\Program Files (x86)\Steam\Steam.exe"
                                        onBrowse={async () => { const r = await pick({ multiple: false, filters: [{ name: "Executable", extensions: ["exe"] }] }); if (typeof r === "string") set({ default_launcher_path: r }); }} />
                                </SettingRow>
                            </Card>
                            <section className="rounded-card border border-danger/25 bg-danger/[0.05] p-5">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-danger"><AlertOctagon size={16} /> Danger zone</h3>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                                    <p className="max-w-lg text-[13px] leading-relaxed text-fg-mute">Erase the library database and image caches and return ChiraLauncher to a clean slate. Your game files are not touched.</p>
                                    <Button variant="danger" onClick={() => setResetOpen(true)}>Factory reset…</Button>
                                </div>
                            </section>
                        </>)}

                        {tab === "appearance" && (
                            <Card title="Theme">
                                <SettingRow stacked title="Accent colour" description="Used for buttons, highlights and the overlay.">
                                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                        {ACCENT_PRESETS.map((c) => (
                                            <button key={c.value} onClick={() => set({ accent_color: c.value })} title={c.name} aria-label={c.name} aria-pressed={settings.accent_color === c.value}
                                                className={cn("grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-panel transition", settings.accent_color === c.value ? "ring-2 ring-white" : "hover:scale-110")}
                                                style={{ background: c.value }}>
                                                {settings.accent_color === c.value && <Check size={16} className="text-white mix-blend-difference" />}
                                            </button>
                                        ))}
                                        <label className="relative ml-1 grid h-9 cursor-pointer place-items-center rounded-full border border-dashed border-line-strong px-3 text-xs text-fg-soft hover:text-fg" title="Pick a custom colour">
                                            Custom
                                            <input type="color" value={/^#[0-9a-f]{6}$/i.test(settings.accent_color) ? settings.accent_color : "#3b82f6"} onChange={(e) => set({ accent_color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                                        </label>
                                    </div>
                                </SettingRow>
                                <SettingRow stacked title="Game background art" description="Which official Steam image to use when metadata is synced.">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {[{ v: "hero", t: "Hero banner", d: "Wide, cinematic art (recommended)" }, { v: "store", t: "Store header", d: "Standard header with the logo built in" }].map((o) => (
                                            <button key={o.v} onClick={() => set({ steam_bg_pref: o.v })} aria-pressed={settings.steam_bg_pref === o.v}
                                                className={cn("rounded-xl border p-4 text-left transition-colors", settings.steam_bg_pref === o.v ? "border-accent/50 bg-accent/10" : "border-line hover:border-line-strong hover:bg-white/[0.03]")}>
                                                <div className="text-sm font-medium">{o.t}</div>
                                                <div className="mt-0.5 text-xs text-fg-mute">{o.d}</div>
                                            </button>
                                        ))}
                                    </div>
                                </SettingRow>
                            </Card>
                        )}

                        {tab === "audio" && (<>
                            <Card title="Volume">
                                <SettingRow stacked title="Sound effects" description="Clicks, launch sounds and achievement pops.">
                                    <Slider label="Sound effects volume" value={settings.volume_sfx} onChange={(v) => set({ volume_sfx: v })} format={(v) => `${v}%`} />
                                </SettingRow>
                                <SettingRow stacked title="Background music">
                                    <Slider label="Music volume" value={settings.volume_bgm} onChange={(v) => set({ volume_bgm: v })} format={(v) => `${v}%`} />
                                </SettingRow>
                            </Card>
                            <Card title="Launcher playlist" description="Music that plays while you browse (games can override it).">
                                <SettingRow stacked title="Tracks">
                                    <TrackList paths={settings.launcher_bgm_paths} onChange={(p) => set({ launcher_bgm_paths: p })} emptyHint="No music yet. Add some tracks."
                                        onAdd={async () => { const r = await pick({ multiple: true, filters: AUDIO_FILTER }); if (Array.isArray(r)) { set({ launcher_bgm_paths: [...settings.launcher_bgm_paths, ...r] }); toast.success(`${r.length} track${r.length > 1 ? "s" : ""} added`); } }} />
                                </SettingRow>
                                <SettingRow title={<span className="inline-flex items-center gap-2"><Shuffle size={14} className="text-fg-mute" />Shuffle</span>}><Switch checked={settings.bgm_shuffle} onChange={(v) => set({ bgm_shuffle: v })} label="Shuffle" /></SettingRow>
                                <SettingRow title="Keep playing when unfocused" description="Otherwise music fades out when you switch to another window."><Switch checked={settings.bgm_play_unfocused} onChange={(v) => set({ bgm_play_unfocused: v })} label="Play unfocused" /></SettingRow>
                                <SettingRow title="Keep playing in the tray"><Switch checked={settings.bgm_play_in_tray} onChange={(v) => set({ bgm_play_in_tray: v })} label="Play in tray" /></SettingRow>
                            </Card>
                            <Card title="Achievements">
                                <SettingRow stacked title="Unlock sound" description="Games with their own sound in Edit details ignore this default.">
                                    <PathField icon={<Trophy size={15} />} value={settings.default_ach_sound_path} onChange={(v) => set({ default_ach_sound_path: v })}
                                        placeholder="C:\Sounds\unlock.wav" onPreview={() => void smartAudio.playAchievement(settings.default_ach_sound_path)}
                                        onBrowse={async () => { const r = await pick({ multiple: false, filters: AUDIO_FILTER }); if (typeof r === "string") set({ default_ach_sound_path: r }); }} />
                                </SettingRow>
                            </Card>
                        </>)}

                        {tab === "downloads" && (
                            <Card title="Downloads">
                                <SettingRow stacked title="Download folder" description="Where new downloads are saved by default.">
                                    <div className="flex gap-2">
                                        <div className="flex h-9 min-w-0 flex-1 items-center truncate rounded-ctl border border-line-strong bg-raised px-3 font-mono text-[13px] text-fg-soft" title={settings.download_path}>{settings.download_path || "No folder selected"}</div>
                                        <Button variant="secondary" icon={<FolderOpen size={15} />} onClick={async () => { const r = await pick({ directory: true, multiple: false }); if (typeof r === "string") set({ download_path: r }); }}>Browse</Button>
                                    </div>
                                </SettingRow>
                                <SettingRow stacked title="Speed limit" description="Caps the combined download speed. 0 means unlimited.">
                                    <Slider label="Download speed limit" value={settings.max_download_speed_kbps} min={0} max={20000} step={250}
                                        onChange={(v) => set({ max_download_speed_kbps: v })} format={(v) => (v === 0 ? "Unlimited" : v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 2 : 0)} MB/s` : `${v} KB/s`)} />
                                </SettingRow>
                                <SettingRow title="Simultaneous downloads" description="How many files download at the same time.">
                                    <div className="w-44"><Slider label="Simultaneous downloads" value={settings.max_concurrent_downloads} min={1} max={10} onChange={(v) => { set({ max_concurrent_downloads: v }); call("set_max_concurrent_downloads", { limit: v }).catch(() => { }); }} /></div>
                                </SettingRow>
                            </Card>
                        )}

                        {tab === "integrations" && (
                            <Card title="Steam Web API" description="Needed to generate achievement files for games.">
                                <SettingRow stacked title="API key" description={<>Get a free key at <button onClick={() => void openExternal("https://steamcommunity.com/dev/apikey")} className="text-accent hover:underline">steamcommunity.com/dev/apikey</button>. It's stored locally.</>}>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <TextInput mono type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => { setApiKey(e.target.value); setKeyStatus("idle"); }}
                                                onBlur={() => { if (apiKey !== settings.steam_api_key) set({ steam_api_key: apiKey }); }} placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" className="pr-10" />
                                            <button onClick={() => setShowKey(!showKey)} aria-label={showKey ? "Hide key" : "Show key"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-mute hover:text-fg">{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                                        </div>
                                        <Button variant="secondary" loading={validating} disabled={!apiKey.trim()} onClick={() => void validateKey()}>Validate</Button>
                                    </div>
                                    {keyStatus === "valid" && <p className="mt-2 flex items-center gap-1.5 text-xs text-ok"><CheckCircle2 size={14} /> Key is valid</p>}
                                    {keyStatus === "invalid" && <p className="mt-2 flex items-center gap-1.5 text-xs text-danger"><XCircle size={14} /> Key was rejected</p>}
                                </SettingRow>
                                <SettingRow title="Generate achievements automatically" description="When a game with a Steam App ID is added and a valid key is set, write its achievements file for you.">
                                    <Switch checked={settings.auto_fetch_achievements} onChange={(v) => set({ auto_fetch_achievements: v })} label="Auto-generate achievements" />
                                </SettingRow>
                            </Card>
                        )}

                        {tab === "overlay" && (
                            <Card title="Achievement overlay" description="Fire a fake unlock to check that the overlay appears above your game.">
                                <div className="grid gap-3 py-4 sm:grid-cols-3">
                                    {[{ id: "goldberg", name: "Goldberg" }, { id: "codex", name: "CODEX" }, { id: "anadius", name: "Anadius" }].map((o) => (
                                        <button key={o.id} onClick={() => void fireTest(o.id)} className="flex items-center gap-3 rounded-xl border border-line p-4 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.06]">
                                            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent"><Zap size={17} /></span>
                                            <span><span className="block text-sm font-medium">Test {o.name}</span><span className="text-xs text-fg-mute">Send sample unlock</span></span>
                                        </button>
                                    ))}
                                </div>
                                <p className="pb-4 text-[13px] leading-relaxed text-fg-mute">Games running in <span className="text-fg-soft">exclusive fullscreen</span> can hide the overlay. Switch the game to borderless windowed if you don't see it.</p>
                            </Card>
                        )}

                        {tab === "updates" && (<>
                            <Card title="ChiraLauncher updates"
                                action={update.phase === "available" ? <Badge tone="accent">v{update.version} available</Badge> : update.phase === "uptodate" ? <Badge tone="ok" icon={<Check size={12} />}>Up to date</Badge> : undefined}>
                                <SettingRow title={`Version ${update.currentVersion || "-"}`}
                                    description={update.phase === "unsupported" ? update.unsupportedReason : update.lastChecked ? `Last checked ${timeAgo(new Date(update.lastChecked).toISOString())}` : "Not checked yet"}>
                                    {update.phase === "available" ? (
                                        <Button variant="primary" icon={<ArrowUpCircle size={16} />} onClick={() => useUiStore.getState().setUpdateDialogOpen(true)}>View update</Button>
                                    ) : (
                                        <Button variant="secondary" icon={<RefreshCw size={15} className={update.phase === "checking" ? "animate-spin" : ""} />}
                                            disabled={update.phase === "checking" || update.phase === "unsupported" || update.phase === "downloading"} onClick={() => void update.checkForUpdates()}>
                                            {update.phase === "checking" ? "Checking…" : "Check for updates"}
                                        </Button>
                                    )}
                                </SettingRow>
                                {update.phase === "error" && update.error && <div className="py-3 text-[13px] text-danger">Last check failed: {update.error}</div>}
                                <SettingRow title="Check automatically" description="Look for a new version when the launcher starts and every few hours. You always choose when to install.">
                                    <Switch checked={update.autoCheck} onChange={update.setAutoCheck} disabled={update.phase === "unsupported"} label="Check automatically" />
                                </SettingRow>
                                {update.skippedVersion && (
                                    <SettingRow title={`Skipped version ${update.skippedVersion}`} description="You chose to skip this release.">
                                        <Button size="sm" variant="ghost" onClick={() => { localStorage.removeItem("update.skipped"); useUpdateStore.setState({ skippedVersion: null }); void update.checkForUpdates(); }}>Stop skipping</Button>
                                    </SettingRow>
                                )}
                            </Card>
                            <Card title="About">
                                <SettingRow title="ChiraLauncher" description="A personal game launcher built with Tauri, Rust and React.">
                                    <Button variant="secondary" size="sm" icon={<ExternalLink size={14} />} onClick={() => void openExternal(`${REPO}/releases`)}>Release notes</Button>
                                </SettingRow>
                                <SettingRow title="Source code & issues"><Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={() => void openExternal(REPO)}>GitHub</Button></SettingRow>
                            </Card>
                        </>)}
                    </div>
                </div>
            </div>
        </div>
    );
}
