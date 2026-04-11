import { useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/gameStore";
import { v4 as uuidv4 } from "uuid";
import type { NewGame } from "../../types/game";
import { autoFetchSteamAchievements } from "../../services/gameService";
import { fetchSteamMetadata, parseSteamDate, SteamAppDetails } from "../../services/steamService";
import { toast } from "sonner";
import {
    FolderOpen, Gamepad2, CheckCircle2, X, ChevronLeft, Activity,
    Hash, Globe, Sparkles
} from "lucide-react";
import { cn } from "../../lib/utils"; // ⬅️ THIS FIXES THE 'cn' ERROR

type AddStep = "PICK_FILE" | "DETAILS" | "METADATA" | "CONFIRM";

interface SingleScanResult {
    executable_path: string;
    guessed_title: string;
    install_dir: string;
    crack_type: string;
    app_id: string;
    achievements_ini?: string;
    achievements_json?: string;
    achievements_xml?: string;
}

export function AddGameModal() {
    const isAddGameModalOpen = useUiStore((s: any) => s.isAddGameModalOpen);
    const setAddGameModalOpen = useUiStore((s: any) => s.setAddGameModalOpen);
    const fetchGames = useGameStore((s: any) => s.fetchGames);

    const [step, setStep] = useState<AddStep>("PICK_FILE");
    const [exePath, setExePath] = useState("");
    const [installDir, setInstallDir] = useState("");

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [coverPath, setCoverPath] = useState<string | null>(null);
    const [backgroundPath, setBackgroundPath] = useState<string | null>(null);
    const [logoPath, setLogoPath] = useState<string | null>(null);
    const [developer, setDeveloper] = useState("");
    const [publisher, setPublisher] = useState("");
    const [releaseDate, setReleaseDate] = useState("");
    const [genre, setGenre] = useState("");

    const [isScanning, setIsScanning] = useState(false);
    const [isFetchingSteam, setIsFetchingSteam] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const [detectedCrackType, setDetectedCrackType] = useState<string | null>(null);
    const [detectedAppId, setDetectedAppId] = useState<string | null>(null);
    const [manualAchievementPath, setManualAchievementPath] = useState<string | null>(null);

    const [steamData, setSteamData] = useState<SteamAppDetails | null>(null);
    const [applySteamData, setApplySteamData] = useState(true);

    if (!isAddGameModalOpen) return null;

    const reset = () => {
        setStep("PICK_FILE");
        setExePath("");
        setTitle("");
        setDescription("");
        setCoverPath(null);
        setBackgroundPath(null);
        setLogoPath(null);
        setDeveloper("");
        setPublisher("");
        setReleaseDate("");
        setGenre("");
        setIsImporting(false);
        setIsScanning(false);
        setIsFetchingSteam(false);
        setDetectedCrackType(null);
        setDetectedAppId(null);
        setManualAchievementPath(null);
        setSteamData(null);
        setAddGameModalOpen(false);
    };

    const handlePickFile = async () => {
        if (!window.__TAURI_INTERNALS__) return;

        try {
            const selected = await openDialog({
                multiple: false,
                filters: [{ name: "Executables", extensions: ["exe"] }],
            });

            if (selected && typeof selected === "string") {
                setExePath(selected);
                setIsScanning(true);
                setStep("DETAILS");

                try {
                    const result = await invoke<SingleScanResult>("scan_single_game", { path: selected });

                    setTitle(result.guessed_title);
                    setInstallDir(result.install_dir);
                    setDetectedCrackType(result.crack_type);
                    setDetectedAppId(result.app_id);

                    const achPath = result.achievements_json || result.achievements_ini || result.achievements_xml || null;
                    if (achPath) {
                        setManualAchievementPath(achPath);
                    }

                } catch (e) {
                    console.error("Scanner failed:", e);
                    const filename = selected.split("\\").pop() || "";
                    const cleaned: string = await invoke("clean_title", { filename });
                    setTitle(cleaned);
                } finally {
                    setIsScanning(false);
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchMetadata = async () => {
        if (!detectedAppId) {
            setStep("CONFIRM");
            return;
        }

        setIsFetchingSteam(true);
        setStep("METADATA");
        try {
            const data = await fetchSteamMetadata(detectedAppId);
            setSteamData(data);

            setTitle(data.name);
            setDescription(data.detailed_description || data.short_description);
            setDeveloper(data.developers?.[0] || "");
            setPublisher(data.publishers?.[0] || "");
            setReleaseDate(parseSteamDate(data.release_date?.date));
            setGenre(data.genres?.map((g: any) => g.description).join(", ") || "");

            const bgPref = localStorage.getItem("steam_bg_pref") || "hero";
            setCoverPath(`https://cdn.cloudflare.steamstatic.com/steam/apps/${detectedAppId}/library_600x900.jpg`);
            setBackgroundPath(bgPref === "hero" ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${detectedAppId}/library_hero.jpg` : data.header_image);
            setLogoPath(`https://cdn.cloudflare.steamstatic.com/steam/apps/${detectedAppId}/logo_2x.png`);
        } catch (error) {
            toast.error("Could not fetch Steam metadata");
        } finally {
            setIsFetchingSteam(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!window.__TAURI_INTERNALS__) return;

        setIsImporting(true);
        try {
            const processUrl = async (url: string | null, type: string) => {
                if (!url || !url.startsWith("http")) return url;
                try {
                    return await invoke<string>("download_url_to_cache", { url, imageType: type });
                } catch {
                    return url;
                }
            };

            const finalCover = applySteamData ? await processUrl(coverPath, "cover") : null;
            const finalBg = applySteamData ? await processUrl(backgroundPath, "background") : null;
            const finalLogo = applySteamData ? await processUrl(logoPath, "logo") : null;

            const newGame: NewGame = {
                id: uuidv4(),
                title: applySteamData && steamData ? steamData.name : title,
                executable_path: exePath,
                cover_path: finalCover,
                background_path: finalBg,
                logo_path: finalLogo,
                description: applySteamData ? description : null,
                developer: applySteamData ? developer : null,
                publisher: applySteamData ? publisher : null,
                release_date: applySteamData ? releaseDate : null,
                genre: applySteamData ? genre : null,
                source: "manual",
                added_at: new Date().toISOString(),
                installed_size: null,
                install_dir: installDir,
                steam_app_id: detectedAppId ? parseInt(detectedAppId) : null,
                crack_type: detectedCrackType,
                app_id: detectedAppId,
                manual_achievement_path: manualAchievementPath,
                is_favorite: false,
                run_as_admin: false,
                genres: null,
                tags: null,
                metacritic_score: null,
                platforms: null,
                repack_info: null,
                detected_metadata_path: null,
                detected_earned_state_path: null,
            };

            await invoke("add_game", { game: newGame });

            if (newGame.id) {
                autoFetchSteamAchievements(newGame.id, newGame.install_dir || "");
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
            await fetchGames();
            reset();
            toast.success("Game added successfully");
        } catch (e: any) {
            console.error(e);
            toast.error("Failed to add game", { description: String(e) });
        } finally {
            setIsImporting(false);
        }
    };

    const stepLabel = {
        PICK_FILE: "Phase 1: Selection",
        DETAILS: "Phase 2: Game Analysis",
        METADATA: "Phase 3: Deep Sync",
        CONFIRM: "Phase 4: Finalize",
    }[step];

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center pointer-events-auto p-6 font-outfit">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                className="bg-[#12141c] w-full max-w-[800px] max-h-[90vh] rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.8)] border border-white/5 flex flex-col overflow-hidden relative"
            >
                <div className="absolute top-0 left-1/4 w-1/2 h-1 bg-accent/40 blur-2xl" />

                <div className="px-10 py-8 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black tracking-tight text-white uppercase ">Add Native Game</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                            <p className="text-white/30 text-[10px] font-black tracking-normal uppercase">{stepLabel}</p>
                        </div>
                    </div>
                    <button
                        onClick={reset}
                        className="text-white/20 hover:text-white transition-all w-12 h-12 flex items-center justify-center rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/10"
                    >
                        <X size={24} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="px-10 mb-4">
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-accent shadow-[0_0_15px_rgba(192,38,211,0.5)]"
                            initial={{ width: "0%" }}
                            animate={{
                                width: step === "PICK_FILE" ? "25%" : step === "DETAILS" ? "50%" : step === "METADATA" ? "75%" : "100%"
                            }}
                            transition={{ duration: 0.5, ease: "circOut" }}
                        />
                    </div>
                </div>

                <div className="p-10 flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
                    <AnimatePresence mode="wait">
                        {step === "PICK_FILE" && (
                            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col items-center justify-center py-12 gap-10">
                                <div className="relative">
                                    <div className="w-24 h-24 rounded-[2rem] bg-accent/10 flex items-center justify-center text-accent relative z-10 border border-accent/20">
                                        <FolderOpen size={40} strokeWidth={2} />
                                    </div>
                                    <div className="absolute inset-0 bg-accent blur-[60px] opacity-20" />
                                </div>
                                <div className="text-center max-w-md">
                                    <h3 className="text-white font-black text-2xl mb-2 ">Select Executable</h3>
                                    <p className="text-white/40 text-sm leading-relaxed">
                                        Choose the main <span className="text-accent font-bold">.exe</span> file for the game you want to add.
                                        We will automatically scan for patches and achievements.
                                    </p>
                                </div>
                                <button onClick={handlePickFile} className="group relative bg-white text-black px-12 py-5 rounded-2xl font-black text-xs tracking-normal uppercase transition-all shadow-xl hover:scale-[1.02] active:scale-95 overflow-hidden">
                                    <div className="absolute inset-0 bg-accent/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    <span className="relative z-10">Select Executable</span>
                                </button>
                            </motion.div>
                        )}

                        {step === "DETAILS" && (
                            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col flex-1 gap-8">
                                {isScanning ? (
                                    <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8">
                                        <div className="relative">
                                            <div className="w-20 h-20 border-4 border-accent/10 border-t-accent rounded-full animate-spin" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Activity className="text-accent/40 animate-pulse" size={24} />
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-white font-black text-xl uppercase tracking-widest">Analyzing Game Files</p>
                                            <p className="text-white/30 text-xs mt-2 font-bold tracking-widest uppercase">Detecting crack engines & achievement paths...</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        <div className="space-y-3">
                                            <label className="text-white/30 text-[10px] font-black tracking-normal uppercase ml-1">Installation Directory</label>
                                            <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 shrink-0">
                                                    <FolderOpen size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-white/60 text-xs font-mono truncate">{exePath}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-white/30 text-[10px] font-black tracking-normal uppercase ml-1">Detected Title</label>
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-accent/50">
                                                        <Gamepad2 size={20} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={title}
                                                        onChange={(e) => setTitle(e.target.value)}
                                                        className={cn("w-full bg-white/[0.03] border-2 border-white/5 focus:border-accent/40 rounded-2xl pl-14 pr-6 py-5 text-white font-black text-lg outline-none transition-all placeholder:text-white/10")}
                                                        placeholder="Enter game title..."
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white/[0.03] border border-white/5 p-5 rounded-3xl relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 p-4 text-accent/10 group-hover:text-accent/20 transition-colors"><Activity size={40} /></div>
                                                    <p className="text-white/25 text-[9px] font-black tracking-normal uppercase mb-2">Engine / Crack</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white font-black text-base uppercase ">{detectedCrackType || "UNKNOWN"}</span>
                                                        {detectedCrackType && detectedCrackType !== "unknown" && <CheckCircle2 size={14} className="text-green-500" />}
                                                    </div>
                                                </div>
                                                <div className="bg-white/[0.03] border border-white/5 p-5 rounded-3xl relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 p-4 text-accent/10 group-hover:text-accent/20 transition-colors"><Hash size={40} /></div>
                                                    <p className="text-white/25 text-[9px] font-black tracking-normal uppercase mb-2">APP ID</p>
                                                    <p className="text-white font-black text-base tabular-nums">{detectedAppId || "NOT DETECTED"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                                            <button onClick={() => setStep("PICK_FILE")} className="flex items-center gap-2 px-6 py-2 rounded-xl text-white/40 hover:text-white font-black transition-all text-xs tracking-widest uppercase">
                                                <ChevronLeft size={16} /> Reselect
                                            </button>
                                            <button onClick={fetchMetadata} className="bg-accent hover:brightness-110 text-white px-10 py-4 rounded-2xl font-black tracking-normal uppercase text-[10px] transition-all shadow-lg shadow-accent/20 active:scale-95 flex items-center gap-2">
                                                <Globe size={16} /> {detectedAppId ? "Fetch Metadata" : "Next Step"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {step === "METADATA" && (
                            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col flex-1 gap-8">
                                {isFetchingSteam ? (
                                    <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8">
                                        <div className="w-20 h-20 border-4 border-accent/10 border-t-accent rounded-full animate-spin" />
                                        <p className="text-white font-black text-xl uppercase tracking-widest">Contacting Steam API...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="bg-gradient-to-r from-accent/20 to-transparent border border-accent/20 p-5 rounded-2xl flex items-start gap-4">
                                            <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center text-accent shrink-0"><Sparkles size={20} /></div>
                                            <div>
                                                <h3 className="text-white font-bold mb-1">Steam Data Located</h3>
                                                <p className="text-white/60 text-xs">We pulled official artwork, descriptions, and metadata for {title}. You can choose to apply this data now.</p>
                                            </div>
                                            <button
                                                onClick={() => setApplySteamData(!applySteamData)}
                                                className={cn("ml-auto mt-2 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all", applySteamData ? "bg-accent text-white shadow-lg" : "bg-white/10 text-white/50 hover:bg-white/20")}
                                            >
                                                {applySteamData ? "Will Apply" : "Ignored"}
                                            </button>
                                        </div>

                                        {steamData && (
                                            <div className={cn("grid grid-cols-3 gap-6 transition-opacity", !applySteamData && "opacity-30 pointer-events-none")}>
                                                <div className="col-span-1 space-y-4">
                                                    <div className="w-full aspect-[2/3] rounded-xl overflow-hidden border border-white/10 relative">
                                                        <img src={coverPath!} className="w-full h-full object-cover" />
                                                        <div className="absolute top-2 left-2 bg-black/80 px-2 py-1 rounded text-[9px] font-bold text-white/50 uppercase border border-white/10">Cover Preview</div>
                                                    </div>
                                                </div>
                                                <div className="col-span-2 space-y-4">
                                                    <div className="w-full h-32 rounded-xl overflow-hidden border border-white/10 relative">
                                                        <img src={backgroundPath!} className="w-full h-full object-cover" />
                                                        <div className="absolute top-2 left-2 bg-black/80 px-2 py-1 rounded text-[9px] font-bold text-white/50 uppercase border border-white/10">Hero Preview</div>
                                                    </div>
                                                    <div className="w-full h-16 rounded-xl overflow-hidden border border-white/10 relative bg-black/40 flex items-center justify-center p-2">
                                                        <img src={logoPath!} className="w-auto h-full object-contain" />
                                                        <div className="absolute top-2 left-2 bg-black/80 px-2 py-1 rounded text-[9px] font-bold text-white/50 uppercase border border-white/10">Logo Preview</div>
                                                    </div>
                                                    <div className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-2 text-xs text-white/70">
                                                        <p><strong className="text-white/40">Title:</strong> {title}</p>
                                                        <p><strong className="text-white/40">Dev:</strong> {developer}</p>
                                                        <p><strong className="text-white/40">Genre:</strong> {genre}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                                            <button onClick={() => setStep("DETAILS")} className="px-6 py-2 rounded-xl text-white/40 hover:text-white font-black text-xs uppercase tracking-widest transition-all">Back</button>
                                            <button onClick={() => setStep("CONFIRM")} className="bg-accent hover:brightness-110 text-white px-10 py-4 rounded-2xl font-black text-[10px] tracking-widest uppercase transition-all shadow-lg shadow-accent/20 active:scale-95">
                                                Review & Finalize
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {step === "CONFIRM" && (
                            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col flex-1 items-center justify-center py-10 gap-10">
                                <div className="relative group">
                                    <div className="w-40 h-56 rounded-[2.5rem] bg-gradient-to-br from-white/[0.08] to-transparent border border-white/10 flex flex-col items-center justify-center p-8 text-center shadow-2xl relative z-10 group-hover:scale-105 transition-transform duration-500 overflow-hidden">
                                        {applySteamData && coverPath ? (
                                            <img src={coverPath} className="absolute inset-0 w-full h-full object-cover brightness-75" />
                                        ) : (
                                            <div className="w-16 h-16 rounded-3xl bg-accent/10 flex items-center justify-center text-accent mb-4 shadow-inner">
                                                <Gamepad2 size={32} />
                                            </div>
                                        )}
                                        {applySteamData && logoPath ? (
                                            <img src={logoPath} className="relative z-10 w-full object-contain" />
                                        ) : (
                                            <span className="font-black text-white text-sm leading-tight uppercase tracking-tighter relative z-10 drop-shadow-md">{title}</span>
                                        )}
                                    </div>
                                    <div className="absolute inset-0 bg-accent/20 blur-[80px] opacity-0 group-hover:opacity-40 transition-opacity duration-700" />
                                </div>

                                <div className="text-center space-y-4">
                                    <h3 className="text-3xl font-black text-white uppercase tracking-tight ">Ready to Import</h3>
                                    <div className="flex flex-col gap-2">
                                        <p className="text-white/40 text-[11px] font-black uppercase tracking-normal">Full path verified</p>
                                        <div className="px-4 py-2 bg-white/5 rounded-full text-white/30 font-mono text-[10px] max-w-[400px] truncate">
                                            {exePath}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 w-full justify-center">
                                    <button onClick={() => setStep(detectedAppId ? "METADATA" : "DETAILS")} className="px-10 py-4 rounded-2xl text-white/40 font-black tracking-widest uppercase text-[10px] hover:bg-white/5 transition-all">Back</button>
                                    <button onClick={handleConfirmImport} disabled={isImporting} className="relative bg-white text-black px-12 py-4 rounded-2xl font-black tracking-normal uppercase text-[10px] transition-all shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-3">
                                        {isImporting ? <><div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" /> Finalizing...</> : <>Import to Library</>}
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}