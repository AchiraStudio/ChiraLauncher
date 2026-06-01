import { useState, useEffect, useCallback } from "react";
import { useUiStore } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/gameStore";
import { fetchSteamMetadata, parseSteamDate, fetchSteamAchievementPercentages } from "../../services/steamService";
import { toast } from "sonner";
import {
    X, FolderOpen, Image, Monitor, User2, Calendar,
    Save, Gamepad2, FileText, StickyNote, Pencil, Globe, Hash, Link2,
    Trophy, Activity, Terminal, RefreshCcw, Play, Zap, Rocket, Music, ArrowUp, ArrowDown, Plus, ChevronDown
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useLocalImage } from "../../hooks/useLocalImage";
import { smartAudio } from "../../services/SmartAudio";

type Tab = "general" | "execution" | "media" | "extra" | "achievements" | "diagnostics";

interface AchievementDiagnostics {
    emulator: string;
    app_id: string | null;
    metadata_path: string | null;
    metadata_valid: boolean;
    metadata_count: number;
    earned_state_path: string | null;
    earned_state_format: string | null;
    earned_count: number;
    probe_log: string[];
}

function ImagePreview({ path, aspect, placeholder, isLogo = false }: { path: string; aspect: string; placeholder: string; isLogo?: boolean }) {
    const cleanPath = path ? path.split("?pos=")[0] : "";
    const { src, error } = useLocalImage(cleanPath);

    const [, focalStr] = path ? path.split("?pos=") : ["", ""];
    const objectPosition = focalStr?.replace("-", " ") || "center";

    return (
        <div className={cn("rounded-xl bg-black/45 border border-white/5 overflow-hidden flex items-center justify-center text-white/10 shrink-0 relative shadow-inner", aspect)}>
            {src && !error ? (
                <>
                    {isLogo && (
                        <img
                            src={src}
                            alt=""
                            className="absolute inset-0 w-full h-full object-contain blur-xl opacity-20 brightness-150 p-4 pointer-events-none"
                        />
                    )}
                    <img
                        src={src}
                        alt=""
                        className={cn(
                            "absolute inset-0 w-full h-full transition-transform duration-500",
                            isLogo ? "object-contain p-4 drop-shadow-lg" : "object-cover"
                        )}
                        style={{ objectPosition }}
                    />
                </>
            ) : (
                <span className="relative z-10 text-2xl font-black opacity-20 select-none uppercase tracking-tighter italic">{placeholder}</span>
            )}
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-white/35 text-[10px] font-black tracking-widest uppercase block mb-2">{children}</label>;
}

function DiagItem({ label, value, sub }: { label: string; value: any; sub?: string }) {
    return (
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-xs font-bold text-white/90 truncate">{value}</p>
            {sub && <p className="text-[8px] font-black text-accent/50 uppercase tracking-wider mt-0.5">{sub}</p>}
        </div>
    );
}

function DiagPath({ label, path }: { label: string; path: string | null }) {
    return (
        <div className="space-y-1">
            <p className="text-[8px] font-black text-white/15 uppercase tracking-widest ml-1">{label}</p>
            <div className="px-3 py-2 bg-black/40 border border-white/5 rounded-lg text-[9px] text-white/30 truncate font-mono select-all">
                {path || "Automatic Search"}
            </div>
        </div>
    );
}

const inputCls = "w-full bg-black/30 border border-white/10 focus:border-accent/60 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none transition-all placeholder:text-white/15";

const EXEC_OPTIONS: { value: string; label: string; desc: string }[] = [
    { value: "direct", label: "Standard Direct Launch", desc: "Spawns the executable directly and tracks its PID." },
    { value: "official_steam", label: "Official Steam Game (via steam://)", desc: "Launches via steam:// so Steam applies DRM and args correctly. AutoAttach catches the process." },
    { value: "unreal_engine", label: "Unreal Engine (Bypass Bootstrap)", desc: "Ignores the bootstrap when it dies. AutoAttach catches Win64-Shipping.exe." },
    { value: "auto_launcher", label: "Auto-Launcher (Launcher → Wait 5s → Game)", desc: "Spawns the Launcher, waits 5s, then spawns the game automatically." },
    { value: "manual_launcher", label: "Manual Launcher (Wait for Play click)", desc: "Spawns the Launcher and waits for you to click Play. AutoAttach intercepts the game." },
];

export function EditGameModal() {
    const isOpen = useUiStore((s: any) => s.isEditGameModalOpen);
    const gameToEdit = useUiStore((s: any) => s.gameToEdit);
    const setEditGameModalOpen = useUiStore((s: any) => s.setEditGameModalOpen);
    const fetchGames = useGameStore((s: any) => s.fetchGames);

    const [tab, setTab] = useState<Tab>("general");
    const [title, setTitle] = useState("");
    const [exePath, setExePath] = useState("");
    const [launchArgs, setLaunchArgs] = useState("");

    const [executionMethod, setExecutionMethod] = useState<"direct" | "auto_launcher" | "manual_launcher" | "unreal_engine" | "official_steam">("direct");
    const [launcherPath, setLauncherPath] = useState("");

    const [coverPath, setCoverPath] = useState("");
    const [backgroundPath, setBackgroundPath] = useState("");
    const [logoPath, setLogoPath] = useState("");
    const [focalPoint, setFocalPoint] = useState("center");
    const [customAchSoundPath, setCustomAchSoundPath] = useState("");

    const [customBgmPaths, setCustomBgmPaths] = useState<string[]>([]);

    const [developer, setDeveloper] = useState("");
    const [publisher, setPublisher] = useState("");
    const [releaseDate, setReleaseDate] = useState("");
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    const [genre, setGenre] = useState("");
    const [appIdInput, setAppIdInput] = useState("");

    const [manualAchPath, setManualAchPath] = useState("");
    const [manualSavePath, setManualSavePath] = useState("");
    const [diagnostics, setDiagnostics] = useState<AchievementDiagnostics | null>(null);
    const [isRefreshingDiag, setIsRefreshingDiag] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [isGeneratingAch, setIsGeneratingAch] = useState(false);

    useEffect(() => {
        if (gameToEdit) {
            setTab("general");
            setTitle(gameToEdit.title || "");
            setExePath(gameToEdit.executable_path || "");
            setLaunchArgs(gameToEdit.launch_args || "");

            setExecutionMethod((gameToEdit.execution_method as any) || "direct");
            setLauncherPath(gameToEdit.launcher_path || "");

            setCoverPath(gameToEdit.cover_image_path || (gameToEdit as any).cover_path || "");
            setLogoPath(gameToEdit.logo_path || "");

            const rawBg = gameToEdit.background_image_path || (gameToEdit as any).background_path || "";
            const [urlPart, posPart] = rawBg.split("?pos=");
            setBackgroundPath(urlPart);
            setFocalPoint(posPart || "center");

            setCustomAchSoundPath(gameToEdit.custom_ach_sound_path || "");

            const paths = gameToEdit.custom_bgm_paths?.length > 0
                ? gameToEdit.custom_bgm_paths
                : (gameToEdit.custom_bgm_path ? [gameToEdit.custom_bgm_path] : []);
            setCustomBgmPaths(paths);

            setDeveloper(gameToEdit.developer || "");
            setPublisher(gameToEdit.publisher || "");
            setReleaseDate(gameToEdit.release_date || "");
            setDescription(gameToEdit.description || "");
            setNotes(gameToEdit.notes || "");
            setGenre(gameToEdit.genre || "");
            setAppIdInput(gameToEdit.steam_app_id?.toString() || "");
            setManualAchPath(gameToEdit.manual_achievement_path || "");
            setManualSavePath(gameToEdit.manual_save_path || "");
            setDiagnostics(null);
        }
    }, [gameToEdit?.id]);

    const refreshDiagnostics = async () => {
        if (!gameToEdit) return;
        setIsRefreshingDiag(true);
        try {
            const result = await invoke<AchievementDiagnostics>("get_achievement_diagnostics", { gameId: gameToEdit.id });
            setDiagnostics(result);
        } catch (e) {
            console.error("Failed to fetch diagnostics", e);
        } finally {
            setIsRefreshingDiag(false);
        }
    };

    const close = useCallback(() => setEditGameModalOpen(false), [setEditGameModalOpen]);

    const [steamDataToImport, setSteamDataToImport] = useState<any>(null);
    const [importOptions, setImportOptions] = useState({
        title: true,
        details: true,
        description: true,
        images: true,
        achievements: true
    });

    if (!isOpen || !gameToEdit) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const originalCover = gameToEdit.cover_image_path || (gameToEdit as any).cover_path || "";
            const originalBg = (gameToEdit.background_image_path || (gameToEdit as any).background_path || "").split("?pos=")[0];
            const originalLogo = gameToEdit.logo_path || "";

            const processImage = async (current: string, original: string, type: string) => {
                if (!current || current === original || current.startsWith("data:")) return current;
                try {
                    if (current.startsWith("http")) {
                        return await invoke<string>("download_url_to_cache", { url: current, imageType: type });
                    } else {
                        return await invoke<string>(`upload_custom_${type}`, { gameId: gameToEdit.id, filePath: current });
                    }
                } catch (e) {
                    console.error(`Failed to process ${type}:`, e);
                    return current;
                }
            };

            const finalCover = await processImage(coverPath, originalCover, "cover");
            const finalBgRaw = await processImage(backgroundPath, originalBg, "background");
            const finalLogo = await processImage(logoPath, originalLogo, "logo");
            const finalBg = finalBgRaw ? `${finalBgRaw}?pos=${focalPoint}` : null;

            const exeChanged = exePath !== gameToEdit.executable_path;
            const newInstallDir = exeChanged
                ? exePath.substring(0, Math.max(exePath.lastIndexOf("\\"), exePath.lastIndexOf("/")))
                : gameToEdit.install_dir;

            const updatedGame = {
                ...gameToEdit,
                title,
                executable_path: exePath,
                install_dir: newInstallDir,
                launch_args: launchArgs || null,
                cover_image_path: finalCover || null,
                background_image_path: finalBg || null,
                logo_path: finalLogo || null,
                cover_path: finalCover || null,
                background_path: finalBg || null,
                custom_ach_sound_path: customAchSoundPath || null,
                custom_bgm_paths: customBgmPaths,
                developer: developer || null,
                publisher: publisher || null,
                release_date: releaseDate || null,
                description: description || null,
                notes: notes || null,
                genre: genre || null,
                steam_app_id: appIdInput ? parseInt(appIdInput) : null,
                manual_achievement_path: manualAchPath.trim() || null,
                manual_save_path: manualSavePath.trim() || null,
                execution_method: executionMethod,
                launcher_path: launcherPath || null,
            };

            await invoke("update_game", { game: updatedGame });

            if (manualAchPath !== gameToEdit.manual_achievement_path) {
                await invoke("set_manual_achievement_path", { gameId: gameToEdit.id, path: manualAchPath.trim() || null });
            }
            if (manualSavePath !== gameToEdit.manual_save_path) {
                await invoke("set_manual_save_path", { gameId: gameToEdit.id, path: manualSavePath.trim() || null });
            }

            await fetchGames();
            close();
        } catch (e) {
            console.error(e);
            toast.error("Failed to update game metadata");
        } finally {
            setIsSaving(false);
        }
    };

    const handleFetchSteam = async () => {
        if (!appIdInput) {
            toast.error("No Steam App ID found", { description: "Please enter an App ID in the General tab." });
            return;
        }

        setIsFetching(true);
        try {
            const data = await fetchSteamMetadata(appIdInput);
            setSteamDataToImport(data);
        } catch (error) {
            toast.error("Failed to pull from Steam", { description: "Please ensure the App ID is correct." });
        } finally {
            setIsFetching(false);
        }
    };

    const applySteamData = async () => {
        if (!steamDataToImport) return;
        const data = steamDataToImport;

        if (importOptions.title && data.name) setTitle(data.name);
        if (importOptions.description) setDescription(data.detailed_description || data.short_description || description);
        if (importOptions.details) {
            setDeveloper(data.developers?.[0] || developer);
            setPublisher(data.publishers?.[0] || publisher);
            setReleaseDate(parseSteamDate(data.release_date?.date) || releaseDate);
            setGenre(data.genres?.map((g: any) => g.description).join(", ") || genre);
        }
        if (importOptions.images) {
            const bgPref = localStorage.getItem("steam_bg_pref") || "hero";
            setCoverPath(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdInput}/library_600x900.jpg`);
            setBackgroundPath(bgPref === "hero" ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdInput}/library_hero.jpg` : data.header_image);
            setLogoPath(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appIdInput}/logo_2x.png`);
            setFocalPoint("center");
        }

        try {
            const pcts = await fetchSteamAchievementPercentages(appIdInput);
            if (Object.keys(pcts).length > 0 && gameToEdit) {
                await invoke("patch_achievement_percentages", {
                    gameId: gameToEdit.id,
                    percentages: pcts
                });
            }
        } catch (e) {
            console.error("Failed to patch achievement rarity:", e);
        }

        if (importOptions.achievements && appIdInput) {
            const apiKey = useSettingsStore.getState().settings?.steam_api_key;
            if (apiKey) {
                invoke("fetch_and_write_achievements", {
                    appId: appIdInput,
                    gameDir: gameToEdit.install_dir || "",
                    apiKey
                }).then(() => toast.success("Achievements generated in steam_settings"))
                    .catch(e => toast.error("Failed to generate achievements", { description: String(e) }));
            } else {
                toast.warning("Cannot generate achievements: No Steam API Key configured.");
            }
        }

        setSteamDataToImport(null);
        toast.success("Metadata Placed", { description: "Review and save your changes." });
    };

    const handleCreateShortcuts = async () => {
        try {
            await invoke("create_all_shortcuts", {
                gameId: gameToEdit.id,
                title: gameToEdit.title,
                exePath: exePath || gameToEdit.executable_path,
                installDir: gameToEdit.install_dir || ""
            });
            toast.success("Shortcuts Created", { description: "Added to Desktop and Start Menu." });
        } catch (e) {
            toast.error("Failed to create shortcuts", { description: String(e) });
        }
    };

    const handleRemoveShortcuts = async () => {
        try {
            await invoke("remove_all_shortcuts", { gameId: gameToEdit.id });
            toast.success("Shortcuts Removed", { description: "Removed from Desktop and Start Menu." });
        } catch (e) {
            toast.error("Failed to remove shortcuts", { description: String(e) });
        }
    };

    const handlePickExe = async () => {
        const selected = await openDialog({ multiple: false, filters: [{ name: "Executables", extensions: ["exe"] }] });
        if (selected && typeof selected === "string") setExePath(selected);
    };

    const handlePickImage = async (type: "cover" | "bg" | "logo") => {
        const selected = await openDialog({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
        if (selected && typeof selected === "string") {
            if (type === "cover") setCoverPath(selected);
            else if (type === "bg") setBackgroundPath(selected);
            else setLogoPath(selected);
        }
    };

    const handlePickAudio = async (type: "bgm" | "achievement") => {
        if (type === "bgm") {
            const selected = await openDialog({ multiple: true, filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac"] }] });
            if (selected && Array.isArray(selected)) {
                setCustomBgmPaths(prev => [...prev, ...selected]);
            } else if (selected && typeof selected === "string") {
                setCustomBgmPaths(prev => [...prev, selected]);
            }
        } else {
            const selected = await openDialog({ multiple: false, filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac"] }] });
            if (selected && typeof selected === "string") {
                setCustomAchSoundPath(selected);
            }
        }
    };

    const handlePickAchMeta = async () => {
        const selected = await openDialog({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
        if (selected && typeof selected === "string") setManualAchPath(selected);
    };

    const handlePickAchSave = async () => {
        const selected = await openDialog({ multiple: false, filters: [{ name: "Achievement Progress", extensions: ["ini", "json", "xml"] }] });
        if (selected && typeof selected === "string") setManualSavePath(selected);
    };

    const moveTrack = (index: number, direction: -1 | 1) => {
        setCustomBgmPaths(prev => {
            const newPaths = [...prev];
            if (index + direction < 0 || index + direction >= newPaths.length) return prev;
            const temp = newPaths[index];
            newPaths[index] = newPaths[index + direction];
            newPaths[index + direction] = temp;
            return newPaths;
        });
    };

    const removeTrack = (index: number) => {
        setCustomBgmPaths(prev => {
            const newPaths = [...prev];
            newPaths.splice(index, 1);
            return newPaths;
        });
    };

    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "general", label: "General", icon: <Gamepad2 size={14} /> },
        { id: "execution", label: "Execution", icon: <Zap size={14} /> },
        { id: "media", label: "Media & Assets", icon: <Image size={14} /> },
        { id: "extra", label: "Details", icon: <FileText size={14} /> },
        { id: "achievements", label: "Achievements", icon: <Trophy size={14} /> },
        { id: "diagnostics", label: "Diagnostics", icon: <Activity size={14} /> },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center pointer-events-auto p-6"
                    onClick={(e) => { if (e.target === e.currentTarget) close(); }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="bg-[#161a26] w-full max-w-[620px] max-h-[88vh] rounded-2xl shadow-2xl border border-white/8 flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-7 pt-6 pb-5 border-b border-white/5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                                    <Pencil size={16} />
                                </div>
                                <div>
                                    <h2 className="text-base font-black tracking-wide text-white">Edit Game</h2>
                                    <p className="text-white/30 text-xs font-semibold mt-0.5 truncate max-w-[300px]">{gameToEdit.title}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleRemoveShortcuts} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase transition-colors shadow-lg border border-red-500/10">
                                    <X size={12} /> Remove Shortcuts
                                </button>
                                <button onClick={handleCreateShortcuts} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] font-bold uppercase transition-colors shadow-lg border border-white/10">
                                    <Link2 size={12} /> Shortcuts
                                </button>
                                {appIdInput && (
                                    <button onClick={handleFetchSteam} disabled={isFetching} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-[10px] font-bold uppercase transition-colors shadow-lg">
                                        <Globe size={12} /> {isFetching ? "Syncing..." : "Steam Sync"}
                                    </button>
                                )}
                                <button onClick={close} className="text-white/20 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">
                                    <X size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>

                        <div className="px-7 pt-4 flex gap-1 shrink-0 border-b border-white/5 overflow-x-auto custom-scrollbar pb-1">
                            {TABS.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                                        tab === t.id ? "bg-accent/15 text-accent border border-accent/25" : "text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent"
                                    )}
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-7 space-y-5">
                            {steamDataToImport ? (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                                    <div className="p-5 bg-black/40 border border-white/10 rounded-2xl">
                                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Import Metadata from Steam</h3>
                                        <div className="space-y-4">
                                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-transparent hover:border-white/10 cursor-pointer transition-colors">
                                                <input type="checkbox" checked={importOptions.title} onChange={(e) => setImportOptions(o => ({ ...o, title: e.target.checked }))} className="w-4 h-4 accent-accent" />
                                                <span className="text-sm font-bold text-white">Title</span>
                                            </label>
                                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-transparent hover:border-white/10 cursor-pointer transition-colors">
                                                <input type="checkbox" checked={importOptions.details} onChange={(e) => setImportOptions(o => ({ ...o, details: e.target.checked }))} className="w-4 h-4 accent-accent" />
                                                <span className="text-sm font-bold text-white">Details (Developer, Date, Genre)</span>
                                            </label>
                                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-transparent hover:border-white/10 cursor-pointer transition-colors">
                                                <input type="checkbox" checked={importOptions.description} onChange={(e) => setImportOptions(o => ({ ...o, description: e.target.checked }))} className="w-4 h-4 accent-accent" />
                                                <span className="text-sm font-bold text-white">Rich Description</span>
                                            </label>
                                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-transparent hover:border-white/10 cursor-pointer transition-colors">
                                                <input type="checkbox" checked={importOptions.images} onChange={(e) => setImportOptions(o => ({ ...o, images: e.target.checked }))} className="w-4 h-4 accent-accent" />
                                                <span className="text-sm font-bold text-white">Assets (Cover, Hero, & Logo)</span>
                                            </label>
                                            <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-transparent hover:border-white/10 cursor-pointer transition-colors">
                                                <input type="checkbox" checked={importOptions.achievements} onChange={(e) => setImportOptions(o => ({ ...o, achievements: e.target.checked }))} className="w-4 h-4 accent-accent" />
                                                <span className="text-sm font-bold text-white">Generate steam_settings achievements</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 mt-6">
                                        <button onClick={() => setSteamDataToImport(null)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-colors border border-white/10">Discard</button>
                                        <button onClick={applySteamData} className="flex-[2] py-3 rounded-xl bg-accent hover:brightness-110 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-accent/20 transition-transform active:scale-95">Apply Selected</button>
                                    </div>
                                </motion.div>
                            ) : (
                                <AnimatePresence mode="wait">
                                    {tab === "general" && (
                                        <motion.div key="general" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-5">
                                            <div>
                                                <Label>Game Title</Label>
                                                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
                                            </div>
                                            <div>
                                                <Label>Main Game Executable</Label>
                                                <div className="flex gap-2">
                                                    <input type="text" value={exePath} onChange={(e) => setExePath(e.target.value)} className={cn(inputCls, "flex-1 font-mono text-xs")} />
                                                    <button onClick={handlePickExe} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-4 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-2">
                                                        <FolderOpen size={14} /> Browse
                                                    </button>
                                                </div>
                                                <p className="text-white/30 text-[10px] mt-1 ml-1">The primary game executable (e.g. Game.exe, or Shipping.exe for Unreal Engine).</p>
                                            </div>

                                            <div>
                                                <Label>Custom Launch Arguments</Label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={launchArgs}
                                                        onChange={(e) => setLaunchArgs(e.target.value)}
                                                        className={cn(inputCls, "font-mono text-sm placeholder:text-white/20")}
                                                        placeholder="-novid -high -fullscreen"
                                                    />
                                                </div>
                                                <p className="text-white/30 text-[10px] mt-1 ml-1">Optional parameters appended when starting the executable.</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <Label>Steam App ID</Label>
                                                    <div className="relative">
                                                        <Hash size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                                                        <input type="number" value={appIdInput} onChange={(e) => setAppIdInput(e.target.value)} className={cn(inputCls, "pl-9 font-mono")} placeholder="e.g. 123456" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label>Developer</Label>
                                                    <div className="relative">
                                                        <User2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                                                        <input type="text" value={developer} onChange={(e) => setDeveloper(e.target.value)} className={cn(inputCls, "pl-9")} />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <Label>Release Date</Label>
                                                    <div className="relative">
                                                        <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                                                        <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className={cn(inputCls, "pl-9 [color-scheme:dark]")} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label>Genre / Publisher</Label>
                                                    <div className="relative">
                                                        <Monitor size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                                                        <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} className={cn(inputCls, "pl-9")} />
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {tab === "execution" && (
                                        <motion.div key="execution" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">
                                            <div className="bg-accent/5 border border-accent/15 p-5 rounded-2xl flex gap-4 items-start shadow-inner">
                                                <Rocket className="text-accent shrink-0 mt-0.5" size={24} />
                                                <div>
                                                    <h4 className="text-accent text-sm font-black uppercase tracking-widest mb-1.5">Engine Routing</h4>
                                                    <p className="text-white/50 text-xs leading-relaxed font-medium">
                                                        Does this game require a secondary launcher, or is it built on an engine that spawns child processes? Configure how ChiraLauncher tracks the execution flow here.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <Label>Execution Method</Label>
                                                    <div className="relative">
                                                        <select
                                                            value={executionMethod}
                                                            onChange={(e) => setExecutionMethod(e.target.value as any)}
                                                            className={cn(inputCls, "appearance-none cursor-pointer pr-10")}
                                                        >
                                                            {EXEC_OPTIONS.map(o => (
                                                                <option key={o.value} value={o.value}>{o.label}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                                                    </div>
                                                    {/* Description badge for selected method */}
                                                    <p className="text-white/30 text-[10px] mt-1.5 ml-1">
                                                        {EXEC_OPTIONS.find(o => o.value === executionMethod)?.desc}
                                                    </p>
                                                </div>

                                                <AnimatePresence>
                                                    {(executionMethod === "auto_launcher" || executionMethod === "manual_launcher") && (
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: "auto" }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="pt-2">
                                                                <Label>Secondary Launcher Executable</Label>
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={launcherPath}
                                                                        onChange={(e) => setLauncherPath(e.target.value)}
                                                                        className={cn(inputCls, "flex-1 font-mono text-xs border-dashed bg-black/20")}
                                                                        placeholder="C:\Games\Launcher.exe"
                                                                    />
                                                                    <button
                                                                        onClick={async () => {
                                                                            const selected = await openDialog({ multiple: false, filters: [{ name: "Executables", extensions: ["exe"] }] });
                                                                            if (selected && typeof selected === "string") setLauncherPath(selected);
                                                                        }}
                                                                        className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-4 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-2"
                                                                    >
                                                                        <FolderOpen size={14} /> Browse
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                <div className="p-4 bg-black/40 rounded-xl border border-white/5 mt-4">
                                                    <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">How it works</h4>
                                                    <ul className="text-xs text-white/50 space-y-2 list-disc pl-4 marker:text-white/20">
                                                        {executionMethod === "direct" && <li>Spawns the <span className="text-white/80 font-mono">Executable Path</span> directly and tracks its PID.</li>}
                                                        {executionMethod === "official_steam" && <li>Launches via the <span className="text-white/80 font-mono">steam://</span> protocol so Steam can apply DRM and custom arguments correctly. AutoAttach catches the game once it loads.</li>}
                                                        {executionMethod === "unreal_engine" && <li>Spawns the executable, but ignores it when it immediately dies. AutoAttach will intercept the real <span className="text-white/80 font-mono">Win64-Shipping.exe</span> automatically.</li>}
                                                        {executionMethod === "auto_launcher" && <li>Spawns the <span className="text-white/80 font-mono">Launcher Executable</span>, waits 5 seconds, then spawns the <span className="text-white/80 font-mono">Main Game Executable</span> automatically.</li>}
                                                        {executionMethod === "manual_launcher" && <li>Spawns the <span className="text-white/80 font-mono">Launcher Executable</span> and leaves it up to you to click "Play". AutoAttach intercepts the main game when it appears.</li>}
                                                    </ul>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {tab === "media" && (
                                        <motion.div key="media" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">

                                            <div className="flex gap-5 items-start">
                                                <ImagePreview path={coverPath} aspect="w-20 h-28" placeholder="🖼️" />
                                                <div className="flex-1 space-y-2">
                                                    <Label>Cover Image</Label>
                                                    <div className="flex gap-2">
                                                        <input type="text" value={coverPath} onChange={(e) => setCoverPath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} />
                                                        <button onClick={() => handlePickImage("cover")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                            <FolderOpen size={13} />
                                                        </button>
                                                    </div>
                                                    {coverPath && (
                                                        <button onClick={() => setCoverPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1 mt-1">
                                                            <X size={11} /> Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="border-t border-white/5" />

                                            <div className="flex gap-5 items-start">
                                                <ImagePreview path={backgroundPath ? `${backgroundPath}?pos=${focalPoint}` : ""} aspect="w-32 h-20" placeholder="🌄" />
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <Label>Background / Hero Image</Label>
                                                        <select value={focalPoint} onChange={(e) => setFocalPoint(e.target.value)} className="bg-white/5 border border-white/10 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded outline-none text-white/60 [&>option]:bg-[#0f1423] [&>option]:text-white">
                                                            <option value="center">Center</option>
                                                            <option value="top">Top</option>
                                                            <option value="bottom">Bottom</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input type="text" value={backgroundPath} onChange={(e) => setBackgroundPath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} />
                                                        <button onClick={() => handlePickImage("bg")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                            <FolderOpen size={13} />
                                                        </button>
                                                    </div>
                                                    {backgroundPath && (
                                                        <button onClick={() => setBackgroundPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1 mt-1">
                                                            <X size={11} /> Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="border-t border-white/5" />

                                            <div className="flex gap-5 items-start">
                                                <ImagePreview path={logoPath} aspect="w-32 h-16" placeholder="✨" isLogo />
                                                <div className="flex-1 space-y-2">
                                                    <Label>Transparent Logo (Optional)</Label>
                                                    <div className="flex gap-2">
                                                        <input type="text" value={logoPath} onChange={(e) => setLogoPath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} />
                                                        <button onClick={() => handlePickImage("logo")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                            <FolderOpen size={13} />
                                                        </button>
                                                    </div>
                                                    {logoPath && (
                                                        <button onClick={() => setLogoPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1 mt-1">
                                                            <X size={11} /> Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="border-t border-white/5" />

                                            <div className="space-y-5">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <Label>Custom Background Music Playlist</Label>
                                                        <button onClick={() => handlePickAudio("bgm")} className="bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                            <Plus size={14} /> Add Tracks
                                                        </button>
                                                    </div>

                                                    <div className="bg-black/40 border border-white/5 rounded-2xl p-2 max-h-[150px] overflow-y-auto custom-scrollbar shadow-inner space-y-1">
                                                        {customBgmPaths.length === 0 ? (
                                                            <div className="py-6 flex flex-col items-center justify-center text-white/20 gap-2">
                                                                <Music size={20} />
                                                                <span className="text-[10px] font-bold uppercase tracking-widest">No Custom Tracks</span>
                                                            </div>
                                                        ) : (
                                                            customBgmPaths.map((path, i) => (
                                                                <div key={i} className="flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.04] p-2.5 rounded-xl border border-white/5 group transition-colors">
                                                                    <Music size={12} className="text-accent/60 shrink-0" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-xs font-mono text-white/70 truncate">{path.split('\\').pop()?.split('/').pop()}</p>
                                                                    </div>
                                                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                                                                        <button onClick={() => moveTrack(i, -1)} disabled={i === 0} className="p-1.5 text-white/40 hover:text-white disabled:opacity-30 rounded-md hover:bg-white/10"><ArrowUp size={12} /></button>
                                                                        <button onClick={() => moveTrack(i, 1)} disabled={i === customBgmPaths.length - 1} className="p-1.5 text-white/40 hover:text-white disabled:opacity-30 rounded-md hover:bg-white/10"><ArrowDown size={12} /></button>
                                                                        <div className="w-px h-4 bg-white/10 mx-1" />
                                                                        <button onClick={() => removeTrack(i)} className="p-1.5 text-red-400/60 hover:text-red-400 rounded-md hover:bg-red-500/10"><X size={12} /></button>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                    {customBgmPaths.length > 0 && (
                                                        <div className="flex justify-end gap-2 mt-2">
                                                            <button onClick={() => smartAudio.playGameBGM(gameToEdit.id, customBgmPaths)} className="bg-accent/10 hover:bg-accent/20 text-accent px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all border border-accent/20 flex items-center gap-2">
                                                                <Play size={12} fill="currentColor" /> Preview Playlist
                                                            </button>
                                                            <button onClick={() => { setCustomBgmPaths([]); smartAudio.playGlobalBGM(); }} className="text-red-400/60 hover:text-red-400 px-4 py-2 bg-red-500/5 hover:bg-red-500/10 rounded-xl border border-red-500/10 transition-colors text-[10px] font-bold uppercase tracking-widest">
                                                                Clear All
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    <Label>Custom Achievement Sound</Label>
                                                    <div className="flex gap-2">
                                                        <Trophy size={16} className="mt-2.5 text-yellow-500/40 shrink-0" />
                                                        <input type="text" value={customAchSoundPath} onChange={(e) => setCustomAchSoundPath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} placeholder="C:\Sounds\unlock.wav" />
                                                        {customAchSoundPath && (
                                                            <button onClick={() => smartAudio.playAchievement(customAchSoundPath)} className="shrink-0 bg-accent/10 hover:bg-accent/20 text-accent px-4 py-3 rounded-xl font-bold text-xs transition-all border border-accent/20 flex items-center justify-center" title="Preview Sound">
                                                                <Play size={14} fill="currentColor" />
                                                            </button>
                                                        )}
                                                        <button onClick={() => handlePickAudio("achievement")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                            <FolderOpen size={13} />
                                                        </button>
                                                    </div>
                                                    <p className="text-white/30 text-[10px] ml-6">The toast duration will automatically match the length of this sound file (minimum 3 seconds).</p>
                                                    {customAchSoundPath && (
                                                        <button onClick={() => setCustomAchSoundPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1 ml-6 mt-1">
                                                            <X size={11} /> Clear Sound
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                        </motion.div>
                                    )}

                                    {tab === "extra" && (
                                        <motion.div key="extra" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-5">
                                            <div>
                                                <Label>Description / Summary</Label>
                                                <div className="relative">
                                                    <FileText size={14} className="absolute left-3.5 top-3.5 text-white/20" />
                                                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={cn(inputCls, "pl-9 resize-none")} />
                                                </div>
                                            </div>
                                            <div>
                                                <Label>Personal Notes</Label>
                                                <div className="relative">
                                                    <StickyNote size={14} className="absolute left-3.5 top-3.5 text-white/20" />
                                                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={cn(inputCls, "pl-9 resize-none")} />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {tab === "achievements" && (
                                        <motion.div key="achievements" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">

                                            {/* ── Generator Panel ─────────────────────────────── */}
                                            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-5 space-y-4">
                                                <div className="flex items-start gap-4">
                                                    <Trophy className="text-yellow-400 shrink-0 mt-0.5" size={18} />
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-yellow-400 text-xs font-black uppercase tracking-widest mb-1">Generate Achievement Data</h4>
                                                        <p className="text-white/40 text-[11px] leading-relaxed">
                                                            Fetches the achievement schema from Steam and writes <span className="font-mono text-white/60">achievements.json</span> to the game's <span className="font-mono text-white/60">steam_settings/</span> folder. Requires a valid Steam App ID, install directory, and API key.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                                                    <div className="bg-black/40 rounded-xl px-3 py-2 border border-white/5 truncate">
                                                        <p className="text-white/20 font-black uppercase tracking-widest mb-0.5">App ID</p>
                                                        <p className="text-white/60 truncate">{appIdInput || "Not set"}</p>
                                                    </div>
                                                    <div className="bg-black/40 rounded-xl px-3 py-2 border border-white/5 truncate">
                                                        <p className="text-white/20 font-black uppercase tracking-widest mb-0.5">Install Dir</p>
                                                        <p className="text-white/60 truncate">{gameToEdit.install_dir || "Not set"}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        const apiKey = useSettingsStore.getState().settings?.steam_api_key;
                                                        if (!apiKey) {
                                                            toast.warning("No Steam API Key", { description: "Configure one in Settings → Integrations." });
                                                            return;
                                                        }
                                                        if (!appIdInput) {
                                                            toast.error("No App ID set", { description: "Enter a Steam App ID in the General tab first." });
                                                            return;
                                                        }
                                                        if (!gameToEdit.install_dir) {
                                                            toast.error("No install directory", { description: "The game must have a valid install directory." });
                                                            return;
                                                        }
                                                        setIsGeneratingAch(true);
                                                        try {
                                                            const result = await invoke<{ count: number; has_global_pcts: boolean }>("fetch_and_write_achievements", {
                                                                appId: appIdInput,
                                                                gameDir: gameToEdit.install_dir,
                                                                apiKey
                                                            });
                                                            toast.success(`Generated ${result.count} achievements`, {
                                                                description: `Written to steam_settings/achievements.json${result.has_global_pcts ? ' with global rarity data.' : '.'}`
                                                            });
                                                        } catch (e: any) {
                                                            toast.error("Generation failed", { description: String(e) });
                                                        } finally {
                                                            setIsGeneratingAch(false);
                                                        }
                                                    }}
                                                    disabled={isGeneratingAch || !appIdInput}
                                                    className="w-full py-3 bg-yellow-500/10 hover:bg-yellow-500/20 disabled:opacity-40 border border-yellow-500/20 text-yellow-400 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                >
                                                    {isGeneratingAch ? (
                                                        <><div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /> Generating...</>
                                                    ) : (
                                                        <><Trophy size={14} /> Generate steam_settings/achievements.json</>
                                                    )}
                                                </button>
                                            </div>

                                            {/* ── Manual Override Paths ─────────────────────────── */}
                                            <div className="bg-accent/5 border border-accent/15 p-5 rounded-2xl flex gap-4 items-start shadow-inner">
                                                <Trophy className="text-accent shrink-0 mt-0.5" size={18} />
                                                <div>
                                                    <h4 className="text-accent text-xs font-black uppercase tracking-widest mb-1.5">Manual Path Overrides</h4>
                                                    <p className="text-white/40 text-[11px] leading-relaxed font-semibold">
                                                        Point the launcher directly to your definition and progress files if auto-detection doesn't find them automatically.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label>Metadata Path (achievements.json)</Label>
                                                    <div className="flex gap-2">
                                                        <input type="text" value={manualAchPath} onChange={(e) => setManualAchPath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} placeholder="C:\Games\...\achievements.json" />
                                                        <button onClick={handlePickAchMeta} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                            <FolderOpen size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label>Progress File (achievements.ini / .json / .xml)</Label>
                                                    <div className="flex gap-2">
                                                        <input type="text" value={manualSavePath} onChange={(e) => setManualSavePath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} placeholder="C:\...\achievements.ini" />
                                                        <button onClick={handlePickAchSave} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                            <FolderOpen size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-4 flex justify-end gap-3">
                                                <button onClick={() => { setManualAchPath(""); setManualSavePath(""); }} disabled={!manualAchPath && !manualSavePath} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-30">
                                                    <RefreshCcw size={12} /> Reset to Auto
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {tab === "diagnostics" && (
                                        <motion.div key="diagnostics" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Terminal className="text-white/30" size={16} />
                                                    <h3 className="text-white/80 font-black uppercase text-[10px] tracking-widest">Scanner Logs</h3>
                                                </div>
                                                <button onClick={refreshDiagnostics} disabled={isRefreshingDiag} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/30 hover:text-accent disabled:opacity-50">
                                                    <RefreshCcw size={14} className={cn(isRefreshingDiag && "animate-spin")} />
                                                </button>
                                            </div>

                                            {diagnostics ? (
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <DiagItem label="Emulator" value={diagnostics.emulator} />
                                                        <DiagItem label="App ID" value={diagnostics.app_id || "None"} />
                                                        <DiagItem label="Defs Found" value={diagnostics.metadata_count} sub={diagnostics.metadata_valid ? "Valid JSON" : "Invalid/None"} />
                                                        <DiagItem label="Earned" value={diagnostics.earned_count} sub={diagnostics.earned_state_format?.toUpperCase() || "N/A"} />
                                                    </div>

                                                    <div className="bg-black/80 rounded-2xl p-4 border border-white/5 font-mono text-[10px] leading-relaxed text-white/40 max-h-[160px] overflow-y-auto no-scrollbar shadow-inner">
                                                        {diagnostics.probe_log.map((line, i) => (
                                                            <div key={i} className="mb-1 flex gap-2"><span className="text-accent/30 shrink-0">›</span><span className="truncate">{line}</span></div>
                                                        ))}
                                                        {diagnostics.probe_log.length === 0 && <div className="italic text-white/10">No logs generated.</div>}
                                                    </div>

                                                    <div className="space-y-3 pt-2">
                                                        <DiagPath label="Metadata Path" path={diagnostics.metadata_path} />
                                                        <DiagPath label="Save Path" path={diagnostics.earned_state_path} />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-16 text-white/10">
                                                    <Activity size={32} className="mb-4 animate-pulse" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Analyzing Data...</p>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            )}
                        </div>

                        <div className="px-7 py-5 bg-black/20 border-t border-white/5 flex items-center justify-between shrink-0 gap-3">
                            <button onClick={close} className="px-5 py-2.5 rounded-xl text-white/40 hover:text-white font-bold text-sm transition-colors hover:bg-white/5">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="bg-accent hover:brightness-110 disabled:opacity-50 text-white px-7 py-2.5 rounded-xl font-black text-sm tracking-wide transition-all shadow-lg shadow-accent/20 active:scale-95 flex items-center gap-2">
                                {isSaving ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Saving…</> : <><Save size={15} /> Save Changes</>}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}