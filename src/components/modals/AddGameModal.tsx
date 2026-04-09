import { useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/gameStore";
import { v4 as uuidv4 } from "uuid";
import type { NewGame } from "../../types/game";
import { autoFetchSteamAchievements } from "../../services/gameService";
import {
    FolderOpen,
    Gamepad2,
    CheckCircle2,
    X,
    ChevronLeft,
    Activity,
    Hash,
    FileText,
    Info
} from "lucide-react";
import { cn } from "../../lib/utils";

type AddStep = "PICK_FILE" | "DETAILS" | "CONFIRM";

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
    const [isScanning, setIsScanning] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // Detected data
    const [detectedCrackType, setDetectedCrackType] = useState<string | null>(null);
    const [detectedAppId, setDetectedAppId] = useState<string | null>(null);
    const [manualAchievementPath, setManualAchievementPath] = useState<string | null>(null);

    if (!isAddGameModalOpen) return null;

    const reset = () => {
        setStep("PICK_FILE");
        setExePath("");
        setTitle("");
        setIsImporting(false);
        setIsScanning(false);
        setDetectedCrackType(null);
        setDetectedAppId(null);
        setManualAchievementPath(null);
        setAddGameModalOpen(false);
    };

    const handlePickFile = async () => {
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

                    // Determine manual achievement path from scanner
                    const achPath = result.achievements_json || result.achievements_ini || result.achievements_xml || null;
                    if (achPath) {
                        // Keep the exact file path found by the scanner, exactly like CPlay
                        setManualAchievementPath(achPath);
                    }

                } catch (e) {
                    console.error("Scanner failed:", e);
                    // Fallback to simple title cleaning if scanner fails
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

    const handleConfirmImport = async () => {
        setIsImporting(true);
        try {
            const newGame: NewGame = {
                id: uuidv4(),
                title: title,
                executable_path: exePath,
                cover_path: null,
                background_path: null,
                description: null,
                developer: null,
                publisher: null,
                release_date: null,
                genre: null,
                genres: null,
                tags: null,
                metacritic_score: null,
                platforms: null,
                source: "manual",
                added_at: new Date().toISOString(),
                installed_size: null,
                install_dir: installDir,
                repack_info: null,
                run_as_admin: false,
                steam_app_id: detectedAppId ? parseInt(detectedAppId) : null,
                crack_type: detectedCrackType,
                app_id: detectedAppId,
                manual_achievement_path: manualAchievementPath,
            };

            await invoke("add_game", { game: newGame });

            // Trigger automatic sync
            if (newGame.id) {
                autoFetchSteamAchievements(newGame.id, newGame.install_dir || "");
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
            await fetchGames();
            reset();
        } catch (e) {
            console.error(e);
            setIsImporting(false);
        }
    };

    const stepLabel = {
        PICK_FILE: "Phase 1: Selection",
        DETAILS: "Phase 2: Game Analysis",
        CONFIRM: "Phase 3: Finalize",
    }[step];

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center pointer-events-auto p-6 font-outfit">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                className="bg-[#12141c] w-full max-w-[800px] max-h-[90vh] rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.8)] border border-white/5 flex flex-col overflow-hidden relative"
            >
                {/* Background glow */}
                <div className="absolute top-0 left-1/4 w-1/2 h-1 bg-accent/40 blur-2xl" />

                {/* Header */}
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

                {/* Progress bar */}
                <div className="px-10 mb-4">
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-accent shadow-[0_0_15px_rgba(192,38,211,0.5)]"
                            initial={{ width: "0%" }}
                            animate={{
                                width: step === "PICK_FILE" ? "33%" : step === "DETAILS" ? "66%" : "100%"
                            }}
                            transition={{ duration: 0.5, ease: "circOut" }}
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="p-10 flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
                    <AnimatePresence mode="wait">
                        {/* STEP 1: Pick File */}
                        {step === "PICK_FILE" && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex flex-col items-center justify-center py-12 gap-10"
                            >
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

                                <button
                                    onClick={handlePickFile}
                                    className="group relative bg-white text-black px-12 py-5 rounded-2xl font-black text-xs tracking-normal uppercase transition-all shadow-xl hover:scale-[1.02] active:scale-95 overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-accent/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    <span className="relative z-10">Select Executable</span>
                                </button>
                            </motion.div>
                        )}

                        {/* STEP 2: Details & Scan Result */}
                        {step === "DETAILS" && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex flex-col flex-1 gap-8"
                            >
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
                                        {/* File Path Display */}
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

                                        {/* Metadata Inputs */}
                                        <div className="grid grid-cols-1 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-white/30 text-[10px] font-black tracking-normal uppercase ml-1">Library Display Name</label>
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-accent/50 group-focus-within:text-accent transition-colors">
                                                        <Gamepad2 size={20} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={title}
                                                        onChange={(e) => setTitle(e.target.value)}
                                                        className="w-full bg-white/[0.03] border-2 border-white/5 focus:border-accent/40 rounded-2xl pl-14 pr-6 py-5 text-white font-black text-lg outline-none transition-all placeholder:text-white/10"
                                                        placeholder="Enter game title..."
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>

                                            {/* Detected Stats Cards */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white/[0.03] border border-white/5 p-5 rounded-3xl relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 p-4 text-accent/10 group-hover:text-accent/20 transition-colors">
                                                        <Activity size={40} />
                                                    </div>
                                                    <p className="text-white/25 text-[9px] font-black tracking-normal uppercase mb-2">Engine / Crack</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white font-black text-base uppercase ">{detectedCrackType || "UNKNOWN"}</span>
                                                        {detectedCrackType && detectedCrackType !== "unknown" && (
                                                            <CheckCircle2 size={14} className="text-green-500" />
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="bg-white/[0.03] border border-white/5 p-5 rounded-3xl relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 p-4 text-accent/10 group-hover:text-accent/20 transition-colors">
                                                        <Hash size={40} />
                                                    </div>
                                                    <p className="text-white/25 text-[9px] font-black tracking-normal uppercase mb-2">APP ID</p>
                                                    <p className="text-white font-black text-base tabular-nums">{detectedAppId || "NOT DETECTED"}</p>
                                                </div>
                                            </div>

                                            {/* Achievement Path Details */}
                                            <div className="bg-accent/5 border border-accent/10 p-6 rounded-[2rem] space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                                                        <FileText size={16} />
                                                    </div>
                                                    <h4 className="text-white font-black text-xs tracking-widest uppercase ">Achievement Pipeline</h4>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-white/30 text-[9px] font-black uppercase tracking-widest">Manual Watch Path</span>
                                                        <div className={cn(
                                                            "text-xs font-mono p-3 rounded-xl break-all",
                                                            manualAchievementPath ? "bg-black/40 text-accent/80" : "bg-red-500/10 text-red-400"
                                                        )}>
                                                            {manualAchievementPath || "No achievement config file detected in this directory tree."}
                                                        </div>
                                                    </div>

                                                    {manualAchievementPath && (
                                                        <div className="flex items-start gap-2 bg-accent/10 p-3 rounded-xl border border-accent/5">
                                                            <Info size={14} className="text-accent shrink-0 mt-0.5" />
                                                            <p className="text-[10px] text-white/50 leading-relaxed">
                                                                Achievements will be tracked automatically from this location.
                                                                Overlay notifications are enabled.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                            <button
                                                onClick={() => setStep("PICK_FILE")}
                                                className="flex items-center gap-2 px-6 py-2 rounded-xl text-white/40 hover:text-white font-black transition-all text-xs tracking-widest uppercase"
                                            >
                                                <ChevronLeft size={16} />
                                                Reselect File
                                            </button>

                                            <button
                                                onClick={() => setStep("CONFIRM")}
                                                className="bg-accent hover:brightness-110 text-white px-10 py-4 rounded-2xl font-black tracking-normal uppercase text-[10px] transition-all shadow-lg shadow-accent/20 active:scale-95"
                                            >
                                                Confirm Scan Results
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* STEP 3: Confirm & Import */}
                        {step === "CONFIRM" && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex flex-col flex-1 items-center justify-center py-10 gap-10"
                            >
                                <div className="relative group">
                                    <div className="w-40 h-56 rounded-[2.5rem] bg-gradient-to-br from-white/[0.08] to-transparent border border-white/10 flex flex-col items-center justify-center p-8 text-center shadow-2xl relative z-10 group-hover:scale-105 transition-transform duration-500">
                                        <div className="w-16 h-16 rounded-3xl bg-accent/10 flex items-center justify-center text-accent mb-4 shadow-inner">
                                            <Gamepad2 size={32} />
                                        </div>
                                        <span className="font-black text-white text-sm leading-tight uppercase tracking-tighter">{title}</span>
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
                                    <button
                                        onClick={() => setStep("DETAILS")}
                                        className="px-10 py-4 rounded-2xl text-white/40 font-black tracking-widest uppercase text-[10px] hover:bg-white/5 transition-all"
                                    >
                                        Back
                                    </button>

                                    <button
                                        onClick={handleConfirmImport}
                                        disabled={isImporting}
                                        className="relative bg-white text-black px-12 py-4 rounded-2xl font-black tracking-normal uppercase text-[10px] transition-all shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-3"
                                    >
                                        {isImporting ? (
                                            <><div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" /> Finalizing...</>
                                        ) : (
                                            <>Import to Library</>
                                        )}
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
