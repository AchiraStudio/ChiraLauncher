import { useState, useEffect } from "react";
import { useUiStore } from "../../store/uiStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/gameStore";
import { v4 as uuidv4 } from "uuid";
import type { NewGame } from "../../types/game";

type ScannerStep = "PICK_DIR" | "SCANNING" | "RESULTS";

interface ScanProgress {
    files_scanned: number;
    candidates_found: number;
    percentage: number;
}

interface ScannedGame {
    executable_path: string;
    guessed_title: string;
    install_dir: string;
    crack_type: "codex" | "goldberg" | "anadius" | "voices38" | "unknown";
    app_id: string;
}

export function DirectoryScannerModal() {
    const isScannerModalOpen = useUiStore((s: any) => s.isScannerModalOpen);
    const setScannerModalOpen = useUiStore((s: any) => s.setScannerModalOpen);
    const fetchGames = useGameStore((s: any) => s.fetchGames);

    const [step, setStep] = useState<ScannerStep>("PICK_DIR");
    const [scanPath, setScanPath] = useState("");
    const [progress, setProgress] = useState<ScanProgress>({ files_scanned: 0, candidates_found: 0, percentage: 0 });
    const [results, setResults] = useState<ScannedGame[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [isImporting, setIsImporting] = useState(false);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        if (step === "SCANNING") {
            listen<ScanProgress>("scan_progress", (event) => {
                setProgress(event.payload);
            }).then((f) => {
                unlisten = f;
            });
        }
        return () => {
            if (unlisten) unlisten();
        };
    }, [step]);

    if (!isScannerModalOpen) return null;

    const reset = () => {
        setStep("PICK_DIR");
        setScanPath("");
        setProgress({ files_scanned: 0, candidates_found: 0, percentage: 0 });
        setResults([]);
        setSelectedPaths(new Set());
        setScannerModalOpen(false);
    };

    const handlePickDir = async () => {
        try {
            const selected = await openDialog({
                directory: true,
                multiple: false,
            });
            if (selected && typeof selected === "string") {
                setScanPath(selected);
                setStep("SCANNING");
                setProgress({ files_scanned: 0, candidates_found: 0, percentage: 0 });

                const found: ScannedGame[] = await invoke("scan_directory", { path: selected });
                setResults(found);
                setSelectedPaths(new Set(found.map((g) => g.executable_path)));
                setStep("RESULTS");
            }
        } catch (e) {
            console.error(e);
            reset();
        }
    };

    const toggleSelection = (path: string) => {
        const next = new Set(selectedPaths);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        setSelectedPaths(next);
    };

    const handleImport = async () => {
        setIsImporting(true);
        try {
            const selectedGames = results.filter((g) => selectedPaths.has(g.executable_path));
            for (const g of selectedGames) {
                const dir = g.install_dir || g.executable_path.substring(0, g.executable_path.lastIndexOf("\\"));
                const newGame: NewGame = {
                    id: uuidv4(),
                    title: g.guessed_title,
                    executable_path: g.executable_path,
                    cover_path: null,
                    background_path: null,
                    logo_path: null,
                    description: null,
                    developer: null,
                    genre: null,
                    source: "scanner",
                    added_at: new Date().toISOString(),
                    installed_size: null,
                    install_dir: dir,
                    crack_type: g.crack_type,
                    app_id: g.app_id || null,
                    is_favorite: false,
                    run_as_admin: false,
                    publisher: null,
                    release_date: null,
                    genres: null,
                    tags: null,
                    metacritic_score: null,
                    platforms: null,
                    repack_info: null,
                    manual_achievement_path: null,
                    steam_app_id: null,
                    detected_metadata_path: null,
                    detected_earned_state_path: null,
                };
                await invoke("add_game", { game: newGame });
            }
            await fetchGames();
            reset();
        } catch (e) {
            console.error(e);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center pointer-events-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#232833] w-[700px] min-h-[400px] rounded-xl shadow-2xl border border-white/10 flex flex-col overflow-hidden"
            >
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-surface-elevated">
                    <h2 className="text-xl font-bold tracking-wide text-white">Bulk Directory Scanner</h2>
                    <button onClick={reset} className="text-muted hover:text-white transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="p-8 flex-1 flex flex-col">
                    <AnimatePresence mode="wait">
                        {step === "PICK_DIR" && (
                            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col items-center justify-center flex-1 py-12">
                                <button onClick={handlePickDir} className="bg-surface hover:bg-surface-elevated border border-white/20 hover:border-accent text-white px-8 py-6 rounded-xl flex flex-col items-center gap-4 transition-all group w-[400px]">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-12 h-12 text-muted group-hover:text-accent transition-colors">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                    </svg>
                                    <span className="font-bold tracking-widest text-lg text-center">SELECT FOLDER TO SCAN</span>
                                    <p className="text-muted text-xs font-medium max-w-[300px] text-center">Hybrid Python scanner will search all subdirectories safely avoiding windows and system folders.</p>
                                </button>
                            </motion.div>
                        )}

                        {step === "SCANNING" && (
                            <motion.div key="step2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col flex-1 items-center justify-center py-6">
                                <h3 className="text-2xl font-bold text-white mb-2">Scanning Directory...</h3>
                                <p className="text-muted font-mono text-sm max-w-[500px] truncate text-center mb-10">{scanPath}</p>

                                <div className="w-full max-w-[400px] mb-6">
                                    <div className="flex justify-between text-xs font-bold text-muted tracking-widest mb-2">
                                        <span>{progress.percentage}%</span>
                                        <span className="text-accent">{progress.candidates_found} CANDIDATES</span>
                                    </div>
                                    <div className="h-3 bg-black/50 rounded-full overflow-hidden border border-white/10 relative">
                                        <div
                                            className="absolute top-0 left-0 bottom-0 bg-accent transition-all duration-300"
                                            style={{ width: `${progress.percentage}%` }}
                                        />
                                    </div>
                                </div>

                                <p className="text-muted font-bold text-sm tracking-widest">{progress.files_scanned.toLocaleString()} FILES PROCESSED</p>
                            </motion.div>
                        )}

                        {step === "RESULTS" && (
                            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col flex-1 h-[400px]">
                                <div className="flex justify-between items-end mb-4">
                                    <label className="text-white font-bold tracking-widest text-lg">SCAN RESULTS</label>
                                    <span className="text-accent font-bold">{selectedPaths.size} / {results.length} SELECTED</span>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                                    {results.map((res, i) => {
                                        const isSelected = selectedPaths.has(res.executable_path);
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => toggleSelection(res.executable_path)}
                                                className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${isSelected ? "border-accent bg-accent/10" : "border-transparent bg-black/20 hover:bg-black/40"}`}
                                            >
                                                <div className={`w-6 h-6 rounded flex items-center justify-center border-2 ${isSelected ? "bg-accent border-accent text-black" : "border-muted"}`}>
                                                    {isSelected && (
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="w-4 h-4">
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-white text-[15px]">{res.guessed_title}</span>
                                                    <span className="text-muted text-xs font-mono mt-0.5 truncate max-w-[450px]">{res.executable_path}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {results.length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-10 text-muted col-span-full">
                                            No games detected. Try a different folder.
                                        </div>
                                    )}
                                </div>

                                <div className="mt-auto flex justify-between gap-4 pt-6 border-t border-white/5 mt-4">
                                    <button onClick={() => setStep("PICK_DIR")} className="px-6 py-2.5 rounded text-white font-bold hover:bg-white/5 transition-colors">CANCEL</button>
                                    <button
                                        onClick={handleImport}
                                        disabled={selectedPaths.size === 0 || isImporting}
                                        className="px-8 py-2.5 bg-green-500 disabled:opacity-50 hover:bg-green-400 rounded text-black font-black tracking-widest shadow-lg flex items-center gap-2"
                                    >
                                        {isImporting ? "IMPORTING..." : `IMPORT ${selectedPaths.size} GAMES`}
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