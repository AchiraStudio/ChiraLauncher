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
    X, Image, Save, Gamepad2, FileText, Pencil, Globe, Link2, Trophy, Activity, Zap
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ExecutionMethodSettings } from "../game/ExecutionMethodSettings";
import { EditGameGeneralTab } from "./edit/EditGameGeneralTab";
import { EditGameMediaTab } from "./edit/EditGameMediaTab";
import { EditGameAchievementsTab } from "./edit/EditGameAchievementsTab";
import { EditGameExtraTab } from "./edit/EditGameExtraTab";
import { EditGameDiagnosticsTab } from "./edit/EditGameDiagnosticsTab";

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
    const [isSyncingSteam, setIsSyncingSteam] = useState(false);

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
            const selected = await openDialog({ multiple: true, filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] }] });
            if (selected && Array.isArray(selected)) {
                setCustomBgmPaths(prev => [...prev, ...selected]);
            } else if (selected && typeof selected === "string") {
                setCustomBgmPaths(prev => [...prev, selected]);
            }
        } else {
            const selected = await openDialog({ multiple: false, filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] }] });
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
                                            <EditGameGeneralTab
                                                title={title} setTitle={setTitle}
                                                exePath={exePath} setExePath={setExePath}
                                                launchArgs={launchArgs} setLaunchArgs={setLaunchArgs}
                                                appIdInput={appIdInput} setAppIdInput={setAppIdInput}
                                                developer={developer} setDeveloper={setDeveloper}
                                                releaseDate={releaseDate} setReleaseDate={setReleaseDate}
                                                genre={genre} setGenre={setGenre}
                                                handlePickExe={handlePickExe}
                                            />
                                        </motion.div>
                                    )}

                                    {tab === "execution" && (
                                        <motion.div key="execution" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">
                                            <ExecutionMethodSettings
                                                executionMethod={executionMethod}
                                                setExecutionMethod={setExecutionMethod as any}
                                                launcherPath={launcherPath}
                                                setLauncherPath={setLauncherPath}
                                            />
                                        </motion.div>
                                    )}

                                    {tab === "media" && (
                                        <motion.div key="media" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">
                                            <EditGameMediaTab
                                                coverPath={coverPath} setCoverPath={setCoverPath}
                                                backgroundPath={backgroundPath} setBackgroundPath={setBackgroundPath}
                                                logoPath={logoPath} setLogoPath={setLogoPath}
                                                focalPoint={focalPoint} setFocalPoint={setFocalPoint}
                                                customAchSoundPath={customAchSoundPath} setCustomAchSoundPath={setCustomAchSoundPath}
                                                customBgmPaths={customBgmPaths} setCustomBgmPaths={setCustomBgmPaths}
                                                handlePickImage={handlePickImage} handlePickAudio={handlePickAudio}
                                                moveTrack={moveTrack} removeTrack={removeTrack}
                                                gameId={gameToEdit.id}
                                            />
                                        </motion.div>
                                    )}

                                    {tab === "extra" && (
                                        <motion.div key="extra" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-5">
                                            <EditGameExtraTab
                                                description={description} setDescription={setDescription}
                                                notes={notes} setNotes={setNotes}
                                            />
                                        </motion.div>
                                    )}

                                    {tab === "achievements" && (
                                        <motion.div key="achievements" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">
                                            <EditGameAchievementsTab
                                                gameToEdit={gameToEdit}
                                                appIdInput={appIdInput}
                                                isGeneratingAch={isGeneratingAch} setIsGeneratingAch={setIsGeneratingAch}
                                                isSyncingSteam={isSyncingSteam} setIsSyncingSteam={setIsSyncingSteam}
                                                manualAchPath={manualAchPath} setManualAchPath={setManualAchPath}
                                                manualSavePath={manualSavePath} setManualSavePath={setManualSavePath}
                                                handlePickAchMeta={handlePickAchMeta} handlePickAchSave={handlePickAchSave}
                                            />
                                        </motion.div>
                                    )}

                                    {tab === "diagnostics" && (
                                        <motion.div key="diagnostics" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">
                                            <EditGameDiagnosticsTab
                                                diagnostics={diagnostics}
                                                refreshDiagnostics={refreshDiagnostics}
                                                isRefreshingDiag={isRefreshingDiag}
                                            />
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