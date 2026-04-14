import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "./store/settingsStore";
import { useUiStore } from "./store/uiStore";
import { toast } from "sonner";
import {
    Settings2, Paintbrush, HardDrive, Gamepad2,
    FolderOpen, MonitorSmartphone, Bell, Zap, AlertOctagon, Volume2, Music, Trophy, X, Play
} from "lucide-react";
import { cn } from "./lib/utils";
import { smartAudio } from "./services/SmartAudio";

const ACCENT_COLORS = [
    { name: "Chira Blue", value: "#3b82f6" },
    { name: "Cyber Cyan", value: "#06b6d4" },
    { name: "Neon Purple", value: "#a855f7" },
    { name: "Toxic Pink", value: "#ec4899" },
    { name: "Matrix Green", value: "#10b981" },
    { name: "Warning Yellow", value: "#eab308" },
    { name: "Blood Red", value: "#ef4444" },
    { name: "Stealth Gray", value: "#94a3b8" },
];

type Tab = "general" | "appearance" | "audio" | "downloads" | "overlay";

export function Settings() {
    const { settings, updateSettings, isLoading } = useSettingsStore();
    const setResetModalOpen = useUiStore((s) => s.setResetModalOpen);
    const [activeTab, setActiveTab] = useState<Tab>("appearance");

    if (isLoading || !settings) {
        return <div className="h-full w-full flex items-center justify-center text-white/20">Loading Core Systems...</div>;
    }

    const handlePickDownloadDir = async () => {
        try {
            const selected = await openDialog({ directory: true, multiple: false });
            if (selected && typeof selected === "string") {
                await updateSettings({ download_path: selected });
                toast.success("Download path updated successfully");
            }
        } catch (e) {
            toast.error("Failed to select directory");
        }
    };

    const handlePickAudio = async (type: "launcher_bgm" | "default_ach") => {
        try {
            const selected = await openDialog({ multiple: false, filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac"] }] });
            if (selected && typeof selected === "string") {
                if (type === "launcher_bgm") {
                    await updateSettings({ launcher_bgm_path: selected });
                    toast.success("Launcher BGM updated.");
                    // Immediately trigger playback of new bgm if we are on global bgm
                    smartAudio.playGlobalBGM();
                } else {
                    await updateSettings({ default_ach_sound_path: selected });
                    toast.success("Default Achievement sound updated.");
                }
            }
        } catch (e) {
            toast.error("Failed to select audio file");
        }
    };

    const handleTestAchievement = async (formatType: string) => {
        try {
            await invoke("debug_fire_achievement", { formatType });
            toast.success(`Fired ${formatType.toUpperCase()} test achievement`);
        } catch (e: any) {
            toast.error("Overlay Test Failed", { description: e.toString() });
        }
    };

    const TABS = [
        { id: "appearance", label: "Appearance", icon: <Paintbrush size={18} /> },
        { id: "general", label: "System Behavior", icon: <MonitorSmartphone size={18} /> },
        { id: "audio", label: "Audio & Acoustics", icon: <Volume2 size={18} /> },
        { id: "downloads", label: "Storage & Paths", icon: <HardDrive size={18} /> },
        { id: "overlay", label: "Overlay & Tracking", icon: <Gamepad2 size={18} /> },
    ] as const;

    return (
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-accent/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none" />

            <div className="flex flex-col min-h-full px-10 md:px-14 pt-14 pb-32 max-w-[1440px] mx-auto w-full relative z-10">

                <header className="mb-12 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center shadow-[0_0_30px_rgba(var(--color-accent),0.2)]">
                        <Settings2 className="text-accent w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Control Panel</h1>
                        <p className="text-white/40 text-[11px] font-bold uppercase tracking-widest mt-1">Configure ChiraLauncher Parameters</p>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    <div className="lg:col-span-3 flex flex-col gap-2">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-3 px-5 py-4 rounded-2xl transition-all duration-300 font-bold text-sm tracking-wide text-left",
                                    activeTab === tab.id
                                        ? "bg-accent/15 text-accent border border-accent/30 shadow-[0_0_20px_rgba(var(--color-accent),0.1)]"
                                        : "bg-white/[0.02] text-white/50 border border-transparent hover:bg-white/[0.05] hover:text-white"
                                )}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="lg:col-span-9 bg-[#0f1423]/80 backdrop-blur-3xl border border-white/[0.08] rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-purple-500" />

                        <AnimatePresence mode="wait">

                            {activeTab === "appearance" && (
                                <motion.div key="appearance" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-10">
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">Global Accent Color</h3>
                                            <p className="text-xs text-white/40 font-medium">Select the primary glowing color for buttons, borders, and overlays.</p>
                                        </div>
                                        <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
                                            {ACCENT_COLORS.map((color) => (
                                                <button
                                                    key={color.value}
                                                    onClick={() => updateSettings({ accent_color: color.value })}
                                                    className={cn(
                                                        "w-12 h-12 rounded-2xl transition-all flex items-center justify-center shadow-lg",
                                                        settings.accent_color === color.value ? "scale-110 ring-4 ring-white/20" : "hover:scale-105 opacity-80 hover:opacity-100"
                                                    )}
                                                    style={{ backgroundColor: color.value, boxShadow: settings.accent_color === color.value ? `0 0 20px ${color.value}80` : 'none' }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="h-px w-full bg-white/5" />

                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">Library Background Art</h3>
                                            <p className="text-xs text-white/40 font-medium">Choose which official Steam image to use as the backdrop when inspecting a game.</p>
                                        </div>
                                        <div className="flex gap-4">
                                            <button
                                                onClick={() => updateSettings({ steam_bg_pref: "hero" })}
                                                className={cn("flex-1 p-5 rounded-2xl border transition-all text-left", settings.steam_bg_pref === "hero" ? "bg-accent/10 border-accent text-accent" : "bg-black/40 border-white/10 text-white/60 hover:border-white/20 hover:text-white")}
                                            >
                                                <p className="font-bold text-sm mb-1">Hero Banner</p>
                                                <p className="text-xs opacity-70">Wider, cinematic landscape art (Default)</p>
                                            </button>
                                            <button
                                                onClick={() => updateSettings({ steam_bg_pref: "store" })}
                                                className={cn("flex-1 p-5 rounded-2xl border transition-all text-left", settings.steam_bg_pref === "store" ? "bg-accent/10 border-accent text-accent" : "bg-black/40 border-white/10 text-white/60 hover:border-white/20 hover:text-white")}
                                            >
                                                <p className="font-bold text-sm mb-1">Store Header</p>
                                                <p className="text-xs opacity-70">Standard game header with built-in logo</p>
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === "audio" && (
                                <motion.div key="audio" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-10">
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">Global Sounds & BGM</h3>
                                            <p className="text-xs text-white/40 font-medium">Personalize the launcher's background music and default achievement unlock effect.</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/40 tracking-widest uppercase">Launcher Background Music</label>
                                            <div className="flex gap-2 items-center">
                                                <Music size={16} className="text-accent/60 shrink-0 ml-1" />
                                                <input
                                                    type="text"
                                                    value={settings.launcher_bgm_path}
                                                    onChange={e => updateSettings({ launcher_bgm_path: e.target.value })}
                                                    className="flex-1 bg-black/40 border border-white/10 focus:border-accent rounded-xl px-4 py-3 text-xs text-white outline-none transition-colors font-mono"
                                                    placeholder="C:\Music\launcher_theme.mp3"
                                                />
                                                <button onClick={() => handlePickAudio("launcher_bgm")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-4 py-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                    <FolderOpen size={14} /> Browse
                                                </button>
                                                {settings.launcher_bgm_path && (
                                                    <button onClick={() => { updateSettings({ launcher_bgm_path: "" }); smartAudio.playGlobalBGM(); }} className="text-red-400/60 hover:text-red-400 p-3 bg-red-500/5 hover:bg-red-500/10 rounded-xl border border-red-500/10 transition-colors">
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/40 tracking-widest uppercase">Default Achievement Sound</label>
                                            <div className="flex gap-2 items-center">
                                                <Trophy size={16} className="text-yellow-500/60 shrink-0 ml-1" />
                                                <input
                                                    type="text"
                                                    value={settings.default_ach_sound_path}
                                                    onChange={e => updateSettings({ default_ach_sound_path: e.target.value })}
                                                    className="flex-1 bg-black/40 border border-white/10 focus:border-accent rounded-xl px-4 py-3 text-xs text-white outline-none transition-colors font-mono"
                                                    placeholder="C:\Sounds\xbox_rare_unlock.wav"
                                                />
                                                {settings.default_ach_sound_path && (
                                                    <button onClick={() => smartAudio.playAchievement(settings.default_ach_sound_path)} className="shrink-0 bg-accent/10 hover:bg-accent/20 text-accent px-4 py-3 rounded-xl font-bold text-xs transition-all border border-accent/20 flex items-center justify-center" title="Preview Sound">
                                                        <Play size={16} fill="currentColor" />
                                                    </button>
                                                )}
                                                <button onClick={() => handlePickAudio("default_ach")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-4 py-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                    <FolderOpen size={14} /> Browse
                                                </button>
                                                {settings.default_ach_sound_path && (
                                                    <button onClick={() => updateSettings({ default_ach_sound_path: "" })} className="text-red-400/60 hover:text-red-400 p-3 bg-red-500/5 hover:bg-red-500/10 rounded-xl border border-red-500/10 transition-colors">
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-white/20 text-[10px] ml-7">Games with specific sound overrides in Edit Metadata will ignore this default.</p>
                                        </div>
                                    </div>

                                    <div className="h-px w-full bg-white/5" />

                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">Volume Mixer</h3>
                                            <p className="text-xs text-white/40 font-medium">Control the acoustics of the engine.</p>
                                        </div>
                                        <div className="space-y-2 max-w-md">
                                            <div className="flex justify-between items-center">
                                                <label className="text-xs font-bold text-white/60 tracking-widest uppercase">SFX / Overlays</label>
                                                <span className="text-accent font-bold text-xs">{settings.volume_sfx}%</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="100"
                                                value={settings.volume_sfx}
                                                onChange={e => updateSettings({ volume_sfx: parseInt(e.target.value) })}
                                                className="w-full h-2 bg-black/50 rounded-lg appearance-none cursor-pointer accent-accent border border-white/5"
                                            />
                                        </div>
                                        <div className="space-y-2 max-w-md">
                                            <div className="flex justify-between items-center">
                                                <label className="text-xs font-bold text-white/60 tracking-widest uppercase">Background Music (BGM)</label>
                                                <span className="text-accent font-bold text-xs">{settings.volume_bgm}%</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="100"
                                                value={settings.volume_bgm}
                                                onChange={e => updateSettings({ volume_bgm: parseInt(e.target.value) })}
                                                className="w-full h-2 bg-black/50 rounded-lg appearance-none cursor-pointer accent-accent border border-white/5"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === "general" && (
                                <motion.div key="general" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6">
                                    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <h4 className="text-white font-bold text-sm">Run on System Startup</h4>
                                            <p className="text-white/40 text-xs mt-1">Boot ChiraLauncher silently in the system tray when Windows starts.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={settings.auto_launch_on_boot}
                                                onChange={(e) => updateSettings({ auto_launch_on_boot: e.target.checked })}
                                            />
                                            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent border border-white/10"></div>
                                        </label>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <h4 className="text-white font-bold text-sm">Start Minimized</h4>
                                            <p className="text-white/40 text-xs mt-1">Skip the main window and start directly in the tray background.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={settings.minimize_to_tray}
                                                onChange={(e) => updateSettings({ minimize_to_tray: e.target.checked })}
                                            />
                                            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent border border-white/10"></div>
                                        </label>
                                    </div>

                                    {/* DANGER ZONE */}
                                    <div className="mt-10 pt-10 border-t border-red-500/20">
                                        <h3 className="text-lg font-black text-red-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <AlertOctagon size={20} /> Danger Zone
                                        </h3>
                                        <div className="bg-red-500/5 border border-red-500/20 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                                            <div>
                                                <h4 className="text-white font-bold text-sm">Factory Reset Application</h4>
                                                <p className="text-white/40 text-xs mt-1 max-w-md">Erase local database, wipe image caches, and restore the engine to a clean slate. Game installations are unharmed.</p>
                                            </div>
                                            <button
                                                onClick={() => setResetModalOpen(true)}
                                                className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border border-red-500/30 whitespace-nowrap active:scale-95"
                                            >
                                                Initiate Reset
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === "downloads" && (
                                <motion.div key="downloads" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-10">
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">Download Directory</h3>
                                            <p className="text-xs text-white/40 font-medium">Where incoming game repacks and P2P files should be saved.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="flex-1 bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-sm font-mono text-white/70 overflow-hidden text-ellipsis whitespace-nowrap shadow-inner">
                                                {settings.download_path || "No path selected"}
                                            </div>
                                            <button
                                                onClick={handlePickDownloadDir}
                                                className="bg-accent hover:brightness-110 text-black px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                            >
                                                <FolderOpen size={16} /> Browse
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === "overlay" && (
                                <motion.div key="overlay" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-10">
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1 flex items-center gap-2">
                                                <Bell className="text-accent" size={20} /> Achievement Overlay Testing
                                            </h3>
                                            <p className="text-xs text-white/40 font-medium leading-relaxed max-w-2xl">
                                                Trigger a mock achievement to ensure your Windows Desktop Window Manager (DWM) is allowing the transparent overlay to render over your game. <br />
                                                <span className="text-yellow-400 font-bold">Note:</span> If your game is in Exclusive Fullscreen, you may not see the overlay. Switch to Borderless Windowed.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                                            <button
                                                onClick={() => handleTestAchievement("goldberg")}
                                                className="bg-[#0f1423] border border-white/10 hover:border-accent hover:bg-accent/5 p-5 rounded-2xl transition-all group flex flex-col items-center justify-center gap-3 shadow-lg"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-transform"><Zap size={20} /></div>
                                                <span className="font-bold text-white text-sm">Test Goldberg</span>
                                            </button>
                                            <button
                                                onClick={() => handleTestAchievement("codex")}
                                                className="bg-[#0f1423] border border-white/10 hover:border-purple-400 hover:bg-purple-400/5 p-5 rounded-2xl transition-all group flex flex-col items-center justify-center gap-3 shadow-lg"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-purple-400/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform"><Zap size={20} /></div>
                                                <span className="font-bold text-white text-sm">Test CODEX</span>
                                            </button>
                                            <button
                                                onClick={() => handleTestAchievement("anadius")}
                                                className="bg-[#0f1423] border border-white/10 hover:border-green-400 hover:bg-green-400/5 p-5 rounded-2xl transition-all group flex flex-col items-center justify-center gap-3 shadow-lg"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center text-green-400 group-hover:scale-110 transition-transform"><Zap size={20} /></div>
                                                <span className="font-bold text-white text-sm">Test Anadius</span>
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}