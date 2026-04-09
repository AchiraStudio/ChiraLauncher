import { useState, useEffect } from "react";
import { appLogDir } from "@tauri-apps/api/path";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "./store/settingsStore";
import { useGameStore } from "./store/gameStore";
import { useUiStore } from "./store/uiStore";
import { AchievementDebugPanel } from "./components/settings/AchievementDebugPanel";
import { fetchSteamMetadata, parseSteamDate } from "./services/steamService";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { cn } from "./lib/utils";
import {
    Settings as SettingsIcon, Download, Volume2, Palette, Plug, Trophy, Cpu, Monitor,
    Bell, Inbox, Music, Terminal, Folder, Zap, Share2, CheckCircle2, AlertTriangle, RefreshCcw, Gamepad2, ShieldCheck, Globe, Loader2, Image, Hash
} from "lucide-react";

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
        <div onClick={onChange} className={cn("relative w-11 h-6 rounded-full cursor-pointer transition-all duration-300 flex-shrink-0", checked ? "bg-accent shadow-[0_0_15px_rgba(192,38,211,0.3)]" : "bg-white/5 border border-white/5")}>
            <div className={cn("absolute top-1 w-4 h-4 rounded-full shadow-sm transition-all duration-300", checked ? "left-6 bg-white" : "left-1 bg-white/20")} />
        </div>
    );
}

function SettingRow({ icon, title, description, children, onClick }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode; onClick?: () => void }) {
    return (
        <div onClick={onClick} className={cn("flex items-center gap-5 p-5 transition-colors rounded-2xl mx-1 my-0.5 group", onClick ? "cursor-pointer hover:bg-white/[0.05] active:scale-[0.99]" : "hover:bg-white/[0.02]")}>
            <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/40 group-hover:text-accent group-hover:border-accent/20 transition-all flex-shrink-0 shadow-inner">
                {icon}
            </div>
            <div className="flex-1 min-w-0 mr-6">
                <p className="font-bold text-white text-[13px] tracking-wide uppercase ">{title}</p>
                <p className="text-[11px] text-white/30 mt-1 leading-relaxed font-medium">{description}</p>
            </div>
            <div className="flex-shrink-0" onClick={(e) => onClick && e.stopPropagation()}>{children}</div>
        </div>
    );
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode, title: string; description?: string }) {
    return (
        <div className="mb-8 px-2">
            <div className="flex items-center gap-4">
                <div className="text-accent drop-shadow-md">{icon}</div>
                <h2 className="text-xl font-black tracking-normal text-white uppercase ">{title}</h2>
                <div className="flex-1 h-px bg-white/5 ml-4" />
            </div>
            {description && <p className="text-white/20 text-[11px] font-bold mt-2 ml-10 uppercase tracking-widest leading-loose">{description}</p>}
        </div>
    );
}

type TabId = "general" | "downloads" | "audio" | "interface" | "integrations" | "overlay" | "advanced";

const TABS: { id: TabId; icon: React.ReactNode; label: string; desc: string }[] = [
    { id: "general", icon: <SettingsIcon size={18} />, label: "General", desc: "System behavior" },
    { id: "downloads", icon: <Download size={18} />, label: "Downloads", desc: "Storage & Speed" },
    { id: "audio", icon: <Volume2 size={18} />, label: "Audio", desc: "Sound & Music" },
    { id: "interface", icon: <Palette size={18} />, label: "Interface", desc: "Visual theme" },
    { id: "integrations", icon: <Plug size={18} />, label: "Integrations", desc: "API Connectivity" },
    { id: "overlay", icon: <Monitor size={18} />, label: "Overlay", desc: "Achievement HUD" },
    { id: "advanced", icon: <Cpu size={18} />, label: "Advanced", desc: "Dev & Debug" },
];

export function Settings() {
    const { settings, isLoading, error, updateSetting } = useSettingsStore();
    const { gamesById, fetchGames } = useGameStore();
    const setAppIdModalOpen = useUiStore((s) => s.setAppIdModalOpen);
    const [activeTab, setActiveTab] = useState<TabId>("general");
    const [isBulkSyncing, setIsBulkSyncing] = useState(false);

    // Isolated state for sliders to prevent DB overload
    const [localSfx, setLocalSfx] = useState(settings?.volume_sfx || 80);
    const [localBgm, setLocalBgm] = useState(settings?.volume_bgm || 50);

    useEffect(() => {
        if (settings) {
            setLocalSfx(settings.volume_sfx);
            setLocalBgm(settings.volume_bgm);
        }
    }, [settings]);

    const handleBulkSync = async () => {
        if (!window.confirm("This will overwrite metadata for ALL games that have a Steam App ID attached. Proceed?")) return;
        setIsBulkSyncing(true);
        const games = Object.values(gamesById);
        let successCount = 0;
        let failCount = 0;

        for (const game of games) {
            if (!game.steam_app_id) continue;
            try {
                const data = await fetchSteamMetadata(game.steam_app_id.toString());
                const bgPref = localStorage.getItem("steam_bg_pref") || "hero";
                const bgUrl = bgPref === "hero"
                    ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.steam_app_id}/library_hero.jpg`
                    : data.header_image;

                const updatedGame = {
                    ...game,
                    title: data.name,
                    description: data.detailed_description || data.short_description,
                    developer: data.developers?.[0] || game.developer,
                    publisher: data.publishers?.[0] || game.publisher,
                    release_date: parseSteamDate(data.release_date?.date),
                    genre: data.genres?.map(g => g.description).join(", ") || game.genre,
                    cover_image_path: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.steam_app_id}/library_600x900.jpg`,
                    background_image_path: bgUrl,
                };

                await invoke("update_game", { game: updatedGame });
                successCount++;
            } catch (e) {
                failCount++;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        await fetchGames();
        setIsBulkSyncing(false);
        toast.success("Bulk Sync Complete", { description: `${successCount} updated, ${failCount} failed.` });
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-4 px-12 pt-12 max-w-[1000px] mx-auto w-full">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-20 rounded-2xl glass-panel animate-pulse bg-white/5" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-white p-12 flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
                <div className="w-20 h-20 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500 mb-2 border border-red-500/20">
                    <AlertTriangle size={40} />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-widest">Configuration Error</h1>
                    <p className="text-white/40 mt-2 max-w-sm text-sm font-medium leading-relaxed">{error}</p>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-8 py-3 bg-accent text-white rounded-2xl text-[11px] font-black tracking-normal uppercase transition-all shadow-xl hover:scale-105 active:scale-95"
                >
                    <RefreshCcw size={14} className="inline mr-2" /> Restart System
                </button>
            </div>
        );
    }

    if (!settings) return null;

    return (
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="flex flex-col min-h-full px-14 pt-14 pb-32 max-w-[1440px] mx-auto w-full">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-14">
                    <h1 className="text-5xl font-black tracking-tight text-white mb-2 uppercase ">Settings</h1>
                    <p className="text-white/20 text-[10px] font-black tracking-normal uppercase">Control Center — v1.0.4</p>
                </motion.div>

                <div className="flex gap-14 items-start">
                    {/* SIDEBAR PILL NAV */}
                    <div className="w-60 flex-shrink-0 space-y-1 sticky top-14">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all text-left group relative outline-none",
                                    activeTab === tab.id ? "bg-white/[0.04] border border-white/10 shadow-2xl" : "bg-transparent border border-transparent hover:bg-white/[0.02] hover:border-white/5"
                                )}
                            >
                                {activeTab === tab.id && (
                                    <motion.div layoutId="nav-pill" className="absolute inset-0 bg-accent/5 rounded-2xl -z-10" />
                                )}
                                <span className={cn("transition-all duration-300", activeTab === tab.id ? "text-accent scale-110 drop-shadow-[0_0_8px_rgba(192,38,211,0.4)]" : "text-white/20 group-hover:text-white/40")}>
                                    {tab.icon}
                                </span>
                                <div>
                                    <p className={cn("font-black tracking-widest text-[11px] uppercase ", activeTab === tab.id ? "text-white" : "text-white/30 group-hover:text-white/60")}>
                                        {tab.label}
                                    </p>
                                    <p className={cn("text-[9px] font-bold mt-0.5 tracking-wider truncate", activeTab === tab.id ? "text-accent/60" : "text-white/10 group-hover:text-white/20")}>
                                        {tab.desc}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* MAIN CONTENT AREA */}
                    <div className="flex-1 max-w-[850px] mb-20">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.25 }}
                                className="glass-panel p-10 rounded-[2.5rem] border border-white/5 shadow-3xl bg-surface/30 backdrop-blur-3xl"
                            >
                                {/* GENERAL */}
                                {activeTab === "general" && (
                                    <>
                                        <SectionHeader icon={<SettingsIcon size={24} />} title="System Engine" description="Manage core launcher lifecycle and behavior." />
                                        <div className="space-y-1">
                                            <SettingRow icon={<Terminal size={20} />} title="Boot Sequence" description="Start ChiraLauncher automatically when Windows session begins." onClick={() => updateSetting("auto_launch_on_boot", !settings.auto_launch_on_boot)}>
                                                <Toggle checked={settings.auto_launch_on_boot} onChange={() => updateSetting("auto_launch_on_boot", !settings.auto_launch_on_boot)} />
                                            </SettingRow>
                                            <SettingRow icon={<Bell size={20} />} title="OS Presence" description="Allow system notifications for finished downloads and unlocked achievements." onClick={() => updateSetting("enable_notifications", !settings.enable_notifications)}>
                                                <Toggle checked={settings.enable_notifications} onChange={() => updateSetting("enable_notifications", !settings.enable_notifications)} />
                                            </SettingRow>
                                            <SettingRow icon={<Inbox size={20} />} title="Stealth Mode" description="Automatically minimize to system tray when the main window is closed." onClick={() => updateSetting("minimize_to_tray", !settings.minimize_to_tray)}>
                                                <Toggle checked={settings.minimize_to_tray} onChange={() => updateSetting("minimize_to_tray", !settings.minimize_to_tray)} />
                                            </SettingRow>
                                        </div>
                                    </>
                                )}

                                {/* DOWNLOADS */}
                                {activeTab === "downloads" && (
                                    <>
                                        <SectionHeader icon={<Download size={24} />} title="Storage & Network" description="Transmission protocols and decentralized storage routing." />
                                        <div className="space-y-1">
                                            <SettingRow icon={<Folder size={20} />} title="Primary Vault" description={settings.download_path}>
                                                <button
                                                    onClick={async () => {
                                                        const selected = await openDialog({ directory: true });
                                                        if (selected && typeof selected === "string") updateSetting("download_path", selected);
                                                    }}
                                                    className="px-6 py-2.5 bg-white/[0.04] rounded-xl border border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all text-[10px] font-black tracking-widest uppercase text-white/50 hover:text-white"
                                                >
                                                    Relocate
                                                </button>
                                            </SettingRow>
                                            <SettingRow icon={<Zap size={20} />} title="Bandwidth Intake" description="Maximum download bit-rate (KB/s). Set to 0 for max throughput.">
                                                <input type="number" min="0" value={settings.max_download_speed_kbps} onChange={(e) => updateSetting("max_download_speed_kbps", parseInt(e.target.value) || 0)} className="w-28 bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-accent font-mono shadow-inner text-right" />
                                            </SettingRow>
                                            <SettingRow icon={<Share2 size={20} />} title="Uplink Pressure" description="Maximum upload bit-rate (KB/s). Set to 0 for max throughput.">
                                                <input type="number" min="0" value={settings.max_upload_speed_kbps} onChange={(e) => updateSetting("max_upload_speed_kbps", parseInt(e.target.value) || 0)} className="w-28 bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-accent font-mono shadow-inner text-right" />
                                            </SettingRow>
                                            <SettingRow icon={<RefreshCcw size={20} />} title="Concurrent Tasks" description="Number of parallel transmission streams (1-10).">
                                                <input type="number" min="1" max="10" value={settings.max_concurrent_downloads} onChange={(e) => updateSetting("max_concurrent_downloads", Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))} className="w-28 bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-accent font-mono shadow-inner text-right" />
                                            </SettingRow>
                                            <SettingRow icon={<CheckCircle2 size={20} />} title="Sequential Flow" description="Force data pieces to download in chronological order. Safe for storage, slower speed." onClick={() => updateSetting("sequential_download", !settings.sequential_download)}>
                                                <Toggle checked={settings.sequential_download} onChange={() => updateSetting("sequential_download", !settings.sequential_download)} />
                                            </SettingRow>
                                            <SettingRow icon={<Gamepad2 size={20} />} title="Neural Sync" description="Automatically index and add completed downloads to game library." onClick={() => updateSetting("auto_add_to_library", !settings.auto_add_to_library)}>
                                                <Toggle checked={settings.auto_add_to_library} onChange={() => updateSetting("auto_add_to_library", !settings.auto_add_to_library)} />
                                            </SettingRow>
                                        </div>
                                    </>
                                )}

                                {/* AUDIO */}
                                {activeTab === "audio" && (
                                    <>
                                        <SectionHeader icon={<Volume2 size={24} />} title="Acoustic Fidelity" description="Internal soundscape and interaction feedback." />
                                        <div className="space-y-1">
                                            <SettingRow icon={<Volume2 size={20} />} title="Interaction SFX" description={`Main menu and click audio feedback — ${localSfx}%`}>
                                                <input
                                                    type="range"
                                                    min="0" max="100"
                                                    value={localSfx}
                                                    onChange={(e) => setLocalSfx(parseInt(e.target.value))}
                                                    onMouseUp={() => updateSetting("volume_sfx", localSfx)}
                                                    className="w-44 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent"
                                                />
                                            </SettingRow>
                                            <SettingRow icon={<Music size={20} />} title="Atmospheric BGM" description={`Background ambient score volume — ${localBgm}%`}>
                                                <input
                                                    type="range"
                                                    min="0" max="100"
                                                    value={localBgm}
                                                    onChange={(e) => setLocalBgm(parseInt(e.target.value))}
                                                    onMouseUp={() => updateSetting("volume_bgm", localBgm)}
                                                    className="w-44 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent"
                                                />
                                            </SettingRow>
                                        </div>
                                    </>
                                )}

                                {/* INTERFACE */}
                                {activeTab === "interface" && (
                                    <>
                                        <SectionHeader icon={<Palette size={24} />} title="Visual Cortex" description="Modify the aesthetic resonance of the system." />
                                        <div className="space-y-1">
                                            <SettingRow icon={<Palette size={20} />} title="Accent Color" description="Customize the primary UI highlight color globally.">
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="color"
                                                        value={settings.accent_color}
                                                        onChange={(e) => updateSetting("accent_color", e.target.value)}
                                                        className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
                                                    />
                                                    <button
                                                        onClick={() => updateSetting("accent_color", "#22d3ee")}
                                                        className="text-[10px] bg-white/5 px-3 py-1.5 rounded-lg text-white/40 hover:text-white transition-colors uppercase font-bold tracking-widest border border-white/5"
                                                    >
                                                        Reset
                                                    </button>
                                                </div>
                                            </SettingRow>
                                        </div>
                                    </>
                                )}

                                {/* INTEGRATIONS */}
                                {activeTab === "integrations" && (
                                    <>
                                        <SectionHeader icon={<Plug size={24} />} title="External Bridges" description="Data hooks for Steam API and automatic metadata sync." />
                                        <div className="space-y-1">
                                            <SettingRow icon={<ShieldCheck size={20} />} title="Steam Web API Key" description="Required to pull official Global Achievement Percentages.">
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="password" value={settings.steam_api_key}
                                                        onChange={(e) => updateSetting("steam_api_key", e.target.value)}
                                                        placeholder="API KEY"
                                                        className="w-56 bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-accent font-mono placeholder-white/10"
                                                    />
                                                </div>
                                            </SettingRow>
                                            <SettingRow icon={<Hash size={20} />} title="App ID Manager" description="Bulk detect and edit Steam App IDs for your entire collection.">
                                                <button
                                                    onClick={() => setAppIdModalOpen(true)}
                                                    className="px-6 py-2.5 bg-white/[0.04] hover:bg-white/10 rounded-xl border border-white/10 text-[10px] font-black tracking-widest uppercase text-white/70 hover:text-white transition-all"
                                                >
                                                    Manage IDs
                                                </button>
                                            </SettingRow>
                                            <SettingRow icon={<Image size={20} />} title="Preferred Background" description="Which image type to pull from Steam when adding games.">
                                                <select
                                                    value={localStorage.getItem("steam_bg_pref") || "hero"}
                                                    onChange={(e) => {
                                                        localStorage.setItem("steam_bg_pref", e.target.value);
                                                        window.dispatchEvent(new Event("storage"));
                                                    }}
                                                    className="px-5 py-3 bg-black/40 rounded-2xl border border-white/5 text-[10px] font-black tracking-widest uppercase outline-none cursor-pointer focus:border-accent text-white "
                                                >
                                                    <option value="hero">Library Hero (Cinematic)</option>
                                                    <option value="header">Store Header (With Logo)</option>
                                                </select>
                                            </SettingRow>
                                            <SettingRow icon={<Globe size={20} />} title="Bulk Synchronization" description="Force update all games with a Steam App ID with fresh metadata and artwork.">
                                                <button
                                                    onClick={handleBulkSync}
                                                    disabled={isBulkSyncing}
                                                    className="px-6 py-2.5 bg-accent hover:bg-accent/80 disabled:opacity-50 rounded-xl font-black text-[10px] uppercase tracking-widest text-white transition-all shadow-lg flex items-center gap-2"
                                                >
                                                    {isBulkSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                                                    Sync All
                                                </button>
                                            </SettingRow>
                                        </div>
                                    </>
                                )}

                                {/* OVERLAY */}
                                {activeTab === "overlay" && (
                                    <>
                                        <SectionHeader icon={<Monitor size={24} />} title="In-Game HUD" description="Configuration for achievement toasts and performance metrics." />
                                        <div className="space-y-1">
                                            <SettingRow icon={<Trophy size={20} />} title="Toast Alerts" description="Render achievement unlock notifications inside the active game process." onClick={() => {
                                                const val = localStorage.getItem("enable_achievement_overlay") !== "false";
                                                localStorage.setItem("enable_achievement_overlay", (!val).toString());
                                                window.dispatchEvent(new Event("storage"));
                                            }}>
                                                <Toggle checked={localStorage.getItem("enable_achievement_overlay") !== "false"} onChange={() => {
                                                    const val = localStorage.getItem("enable_achievement_overlay") !== "false";
                                                    localStorage.setItem("enable_achievement_overlay", (!val).toString());
                                                    window.dispatchEvent(new Event("storage"));
                                                }} />
                                            </SettingRow>
                                            <SettingRow icon={<Zap size={20} />} title="Quadrant" description="Display quadrant for achievement notifications.">
                                                <select
                                                    value={localStorage.getItem("overlay_position") || "Top Right"}
                                                    onChange={(e) => {
                                                        localStorage.setItem("overlay_position", e.target.value);
                                                        window.dispatchEvent(new Event("storage"));
                                                    }}
                                                    className="px-5 py-3 bg-black/40 rounded-2xl border border-white/5 text-[10px] font-black tracking-widest uppercase outline-none cursor-pointer focus:border-accent text-white "
                                                >
                                                    <option value="Top Left">Top Left</option>
                                                    <option value="Top Right">Top Right</option>
                                                    <option value="Bottom Left">Bottom Left</option>
                                                    <option value="Bottom Right">Bottom Right</option>
                                                </select>
                                            </SettingRow>
                                            <SettingRow icon={<Music size={20} />} title="Unlock Audible" description="Play achievement system tone on successful unlock event." onClick={() => {
                                                const val = localStorage.getItem("achievement_sound") !== "false";
                                                localStorage.setItem("achievement_sound", (!val).toString());
                                                window.dispatchEvent(new Event("storage"));
                                            }}>
                                                <Toggle checked={localStorage.getItem("achievement_sound") !== "false"} onChange={() => {
                                                    const val = localStorage.getItem("achievement_sound") !== "false";
                                                    localStorage.setItem("achievement_sound", (!val).toString());
                                                    window.dispatchEvent(new Event("storage"));
                                                }} />
                                            </SettingRow>
                                        </div>
                                    </>
                                )}

                                {/* ADVANCED */}
                                {activeTab === "advanced" && (
                                    <>
                                        <SectionHeader icon={<Cpu size={24} />} title="Neural Control" description="Deep application debugging and process management." />
                                        <div className="space-y-1 mb-10">
                                            <SettingRow icon={<Cpu size={20} />} title="Developer Mode" description="Expose underlying game processes, subprocess stdout/stderr and raw API traces." onClick={() => updateSetting("developer_mode", !settings.developer_mode)}>
                                                <Toggle checked={settings.developer_mode} onChange={() => updateSetting("developer_mode", !settings.developer_mode)} />
                                            </SettingRow>
                                            <SettingRow icon={<Monitor size={20} />} title="Kernel Traces" description="Access raw Tauri application logs and performance statistics.">
                                                <button
                                                    onClick={async () => {
                                                        try { const logPath = await appLogDir(); await openShell(logPath); } catch (e) { console.error(e); }
                                                    }}
                                                    className="px-6 py-2.5 bg-white/[0.04] rounded-xl border border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all text-[10px] font-black tracking-widest uppercase text-white/50 hover:text-white"
                                                >
                                                    Open Traces
                                                </button>
                                            </SettingRow>
                                        </div>
                                        {settings.developer_mode && (
                                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-black/40 rounded-3xl border border-white/5 p-2 overflow-hidden">
                                                <AchievementDebugPanel />
                                            </motion.div>
                                        )}
                                    </>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}