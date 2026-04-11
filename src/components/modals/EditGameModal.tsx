import { useState, useEffect, useCallback } from "react";
import { useUiStore } from "../../store/uiStore";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/gameStore";
import { fetchSteamMetadata, parseSteamDate, fetchSteamAchievementPercentages } from "../../services/steamService";
import { toast } from "sonner";
import {
    X, FolderOpen, Image, Monitor, User2, Calendar,
    Save, Gamepad2, FileText, StickyNote, Pencil, Globe, Hash
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useLocalImage } from "../../hooks/useLocalImage";

function ImagePreview({ path, aspect, placeholder, isLogo = false }: { path: string; aspect: string; placeholder: string; isLogo?: boolean }) {
    // FIX: Safely strip the ?pos= modifier BEFORE asking the hook to load the file
    const cleanPath = path ? path.split("?pos=")[0] : "";
    const { src, error } = useLocalImage(cleanPath);
    
    const [, focalStr] = path ? path.split("?pos=") : ["", ""];
    const objectPosition = focalStr?.replace("-", " ") || "center";

    return (
        <div className={cn("rounded-xl bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center text-white/10 shrink-0 relative", aspect)}>
            {src && !error ? (
                <img src={src} alt="" className={cn("absolute inset-0 w-full h-full", isLogo ? "object-contain p-2" : "object-cover")} style={{ objectPosition }} />
            ) : (
                <span className="relative z-10 text-2xl select-none">{placeholder}</span>
            )}
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-white/35 text-[10px] font-black tracking-widest uppercase block mb-2">{children}</label>;
}

const inputCls = "w-full bg-black/30 border border-white/10 focus:border-accent/60 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none transition-all placeholder:text-white/15";

type Tab = "general" | "images" | "extra";

export function EditGameModal() {
    const isOpen = useUiStore((s: any) => s.isEditGameModalOpen);
    const gameToEdit = useUiStore((s: any) => s.gameToEdit);
    const setEditGameModalOpen = useUiStore((s: any) => s.setEditGameModalOpen);
    const fetchGames = useGameStore((s: any) => s.fetchGames);

    const [tab, setTab] = useState<Tab>("general");
    const [title, setTitle] = useState("");
    const [exePath, setExePath] = useState("");
    const [coverPath, setCoverPath] = useState("");
    const [backgroundPath, setBackgroundPath] = useState("");
    const [logoPath, setLogoPath] = useState("");
    const [focalPoint, setFocalPoint] = useState("center");
    const [developer, setDeveloper] = useState("");
    const [publisher, setPublisher] = useState("");
    const [releaseDate, setReleaseDate] = useState("");
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    const [genre, setGenre] = useState("");
    const [appIdInput, setAppIdInput] = useState("");

    const [isSaving, setIsSaving] = useState(false);
    const [isFetching, setIsFetching] = useState(false);

    useEffect(() => {
        if (gameToEdit) {
            setTab("general");
            setTitle(gameToEdit.title || "");
            setExePath(gameToEdit.executable_path || "");
            setCoverPath(gameToEdit.cover_image_path || (gameToEdit as any).cover_path || "");
            setLogoPath(gameToEdit.logo_path || "");

            const rawBg = gameToEdit.background_image_path || (gameToEdit as any).background_path || "";
            const [urlPart, posPart] = rawBg.split("?pos=");
            setBackgroundPath(urlPart);
            setFocalPoint(posPart || "center");

            setDeveloper(gameToEdit.developer || "");
            setPublisher(gameToEdit.publisher || "");
            setReleaseDate(gameToEdit.release_date || "");
            setDescription(gameToEdit.description || "");
            setNotes(gameToEdit.notes || "");
            setGenre(gameToEdit.genre || "");
            setAppIdInput(gameToEdit.steam_app_id?.toString() || "");
        }
    }, [gameToEdit?.id]);

    const close = useCallback(() => setEditGameModalOpen(false), [setEditGameModalOpen]);

    const [steamDataToImport, setSteamDataToImport] = useState<any>(null);
    const [importOptions, setImportOptions] = useState({
        title: true,
        details: true,
        description: true,
        images: true
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
                cover_image_path: finalCover || null,
                background_image_path: finalBg || null,
                logo_path: finalLogo || null,
                cover_path: finalCover || null,
                background_path: finalBg || null,
                developer: developer || null,
                publisher: publisher || null,
                release_date: releaseDate || null,
                description: description || null,
                notes: notes || null,
                genre: genre || null,
                steam_app_id: appIdInput ? parseInt(appIdInput) : null,
            };

            await invoke("update_game", { game: updatedGame });
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

        if (importOptions.title && data.name) {
            setTitle(data.name);
        }
        if (importOptions.description) {
            setDescription(data.detailed_description || data.short_description || description);
        }
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

        setSteamDataToImport(null);
        toast.success("Metadata Placed", { description: "Review and save your changes." });
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

    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "general", label: "General", icon: <Gamepad2 size={14} /> },
        { id: "images", label: "Images", icon: <Image size={14} /> },
        { id: "extra", label: "Details", icon: <FileText size={14} /> },
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

                        <div className="px-7 pt-4 flex gap-1 shrink-0">
                            {TABS.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
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
                                                <Label>Executable Path</Label>
                                                <div className="flex gap-2">
                                                    <input type="text" value={exePath} onChange={(e) => setExePath(e.target.value)} className={cn(inputCls, "flex-1 font-mono text-xs")} />
                                                    <button onClick={handlePickExe} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-4 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-2">
                                                        <FolderOpen size={14} /> Browse
                                                    </button>
                                                </div>
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

                                    {tab === "images" && (
                                        <motion.div key="images" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">
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
                                                        <button onClick={() => setCoverPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1">
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
                                                        <select value={focalPoint} onChange={(e) => setFocalPoint(e.target.value)} className="bg-white/5 border border-white/10 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded outline-none text-white/60">
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
                                                        <button onClick={() => setBackgroundPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1">
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
                                                        <button onClick={() => setLogoPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1">
                                                            <X size={11} /> Clear
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