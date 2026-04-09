import { useState, useEffect, useCallback } from "react";
import { useUiStore } from "../../store/uiStore";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../../store/gameStore";
import { toast } from "sonner";
import {
    X, FolderOpen, Image, Monitor, User2, Building2, Calendar,
    Save, Gamepad2, FileText, StickyNote, Pencil
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useLocalImage } from "../../hooks/useLocalImage";

// ---------- small helper ----------
function ImagePreview({ path, aspect, placeholder }: { path: string; aspect: string; placeholder: string }) {
    const { src, error } = useLocalImage(path);

    return (
        <div className={cn("rounded-xl bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center text-white/10 shrink-0 relative", aspect)}>
            {src && !error ? (
                <img
                    src={src}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                />
            ) : (
                <span className="relative z-10 text-2xl select-none">{placeholder}</span>
            )}
        </div>
    );
}

// ---------- small section label ----------
function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-white/35 text-[10px] font-black tracking-widest uppercase block mb-2">{children}</label>;
}

// ---------- shared input style ----------
const inputCls = "w-full bg-black/30 border border-white/10 focus:border-accent/60 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none transition-all placeholder:text-white/15";

type Tab = "general" | "images" | "extra";

export function EditGameModal() {
    const isOpen = useUiStore((s) => s.isEditGameModalOpen);
    const gameToEdit = useUiStore((s) => s.gameToEdit);
    const setEditGameModalOpen = useUiStore((s) => s.setEditGameModalOpen);
    const fetchGames = useGameStore((s) => s.fetchGames);

    const [tab, setTab] = useState<Tab>("general");
    const [title, setTitle] = useState("");
    const [exePath, setExePath] = useState("");
    const [coverPath, setCoverPath] = useState("");
    const [backgroundPath, setBackgroundPath] = useState("");
    const [developer, setDeveloper] = useState("");
    const [publisher, setPublisher] = useState("");
    const [releaseDate, setReleaseDate] = useState("");
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    const [genre, setGenre] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Reset to tab "general" whenever modal opens with new game
    useEffect(() => {
        if (gameToEdit) {
            setTab("general");
            setTitle(gameToEdit.title || "");
            setExePath(gameToEdit.executable_path || "");
            // Support both field names that might exist
            setCoverPath(gameToEdit.cover_image_path || (gameToEdit as any).cover_path || "");
            setBackgroundPath(gameToEdit.background_image_path || (gameToEdit as any).background_path || "");
            setDeveloper(gameToEdit.developer || "");
            setPublisher(gameToEdit.publisher || "");
            setReleaseDate(gameToEdit.release_date || "");
            setDescription(gameToEdit.description || "");
            setNotes(gameToEdit.notes || "");
            setGenre(gameToEdit.genre || "");
        }
    }, [gameToEdit?.id]);

    const close = useCallback(() => setEditGameModalOpen(false), [setEditGameModalOpen]);

    if (!isOpen || !gameToEdit) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            let finalCover = coverPath;
            let finalBg = backgroundPath;

            const originalCover = gameToEdit.cover_image_path || (gameToEdit as any).cover_path || "";
            const originalBg = gameToEdit.background_image_path || (gameToEdit as any).background_path || "";

            // If the user picked a local file AND it changed, route it through the Rust image processor
            if (finalCover && finalCover !== originalCover && !finalCover.startsWith("http") && !finalCover.startsWith("data:")) {
                try {
                    finalCover = await invoke("upload_custom_cover", { gameId: gameToEdit.id, filePath: finalCover });
                } catch (e) {
                    console.error("Cover processing failed", e);
                    toast.error("Failed to process cover image.");
                }
            }

            if (finalBg && finalBg !== originalBg && !finalBg.startsWith("http") && !finalBg.startsWith("data:")) {
                try {
                    finalBg = await invoke("upload_custom_background", { gameId: gameToEdit.id, filePath: finalBg });
                } catch (e) {
                    console.error("Background processing failed", e);
                    toast.error("Failed to process background image.");
                }
            }

            const updatedGame = {
                ...gameToEdit,
                title,
                executable_path: exePath,
                cover_image_path: finalCover || null,
                background_image_path: finalBg || null,
                cover_path: finalCover || null,
                background_path: finalBg || null,
                developer: developer || null,
                publisher: publisher || null,
                release_date: releaseDate || null,
                description: description || null,
                notes: notes || null,
                genre: genre || null,
            };

            await invoke("update_game", { game: updatedGame });
            await fetchGames();
            close();
        } catch (e) {
            console.error(e);
            toast.error("Failed to update game metadata:\n" + e);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePickExe = async () => {
        const selected = await openDialog({ multiple: false, filters: [{ name: "Executables", extensions: ["exe"] }] });
        if (selected && typeof selected === "string") setExePath(selected);
    };

    const handlePickImage = async (type: "cover" | "bg") => {
        const selected = await openDialog({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
        if (selected && typeof selected === "string") {
            if (type === "cover") setCoverPath(selected);
            else setBackgroundPath(selected);
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
                        {/* Header */}
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
                            <button onClick={close} className="text-white/20 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">
                                <X size={18} strokeWidth={2.5} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="px-7 pt-4 flex gap-1 shrink-0">
                            {TABS.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                                        tab === t.id
                                            ? "bg-accent/15 text-accent border border-accent/25"
                                            : "text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent"
                                    )}
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-7 space-y-5">
                            <AnimatePresence mode="wait">
                                {tab === "general" && (
                                    <motion.div key="general" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-5">
                                        {/* Title */}
                                        <div>
                                            <Label>Game Title</Label>
                                            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Cyberpunk 2077" />
                                        </div>

                                        {/* Executable */}
                                        <div>
                                            <Label>Executable Path</Label>
                                            <div className="flex gap-2">
                                                <input type="text" value={exePath} onChange={(e) => setExePath(e.target.value)} className={cn(inputCls, "flex-1 font-mono text-xs")} placeholder="C:\Games\game.exe" />
                                                <button onClick={handlePickExe} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-4 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-2">
                                                    <FolderOpen size={14} /> Browse
                                                </button>
                                            </div>
                                        </div>

                                        {/* Developer / Publisher */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label>Developer</Label>
                                                <div className="relative">
                                                    <User2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                                                    <input type="text" value={developer} onChange={(e) => setDeveloper(e.target.value)} className={cn(inputCls, "pl-9")} placeholder="CD Projekt Red" />
                                                </div>
                                            </div>
                                            <div>
                                                <Label>Publisher</Label>
                                                <div className="relative">
                                                    <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                                                    <input type="text" value={publisher} onChange={(e) => setPublisher(e.target.value)} className={cn(inputCls, "pl-9")} placeholder="CD Projekt" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Release Date & Genre */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label>Release Date</Label>
                                                <div className="relative">
                                                    <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                                                    <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className={cn(inputCls, "pl-9 [color-scheme:dark]")} />
                                                </div>
                                            </div>
                                            <div>
                                                <Label>Genre</Label>
                                                <div className="relative">
                                                    <Monitor size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                                                    <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} className={cn(inputCls, "pl-9")} placeholder="RPG, Action..." />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {tab === "images" && (
                                    <motion.div key="images" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="space-y-6">
                                        {/* Cover */}
                                        <div className="flex gap-5 items-start">
                                            <ImagePreview path={coverPath} aspect="w-20 h-28" placeholder="🖼️" />
                                            <div className="flex-1 space-y-2">
                                                <Label>Cover Image</Label>
                                                <p className="text-white/25 text-[10px] mb-3">Enter an HTTPS URL or pick a local file.</p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={coverPath}
                                                        onChange={(e) => setCoverPath(e.target.value)}
                                                        className={cn(inputCls, "flex-1 text-xs font-mono")}
                                                        placeholder="https://... or C:\path\cover.jpg"
                                                    />
                                                    <button onClick={() => handlePickImage("cover")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                        <FolderOpen size={13} /> Browse
                                                    </button>
                                                </div>
                                                {coverPath && (
                                                    <button onClick={() => setCoverPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1">
                                                        <X size={11} /> Clear image
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="border-t border-white/5" />

                                        {/* Background */}
                                        <div className="flex gap-5 items-start">
                                            <ImagePreview path={backgroundPath} aspect="w-32 h-20" placeholder="🌄" />
                                            <div className="flex-1 space-y-2">
                                                <Label>Background / Hero Image</Label>
                                                <p className="text-white/25 text-[10px] mb-3">This is the large cinematic image shown on the library hero.</p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={backgroundPath}
                                                        onChange={(e) => setBackgroundPath(e.target.value)}
                                                        className={cn(inputCls, "flex-1 text-xs font-mono")}
                                                        placeholder="https://... or C:\path\background.jpg"
                                                    />
                                                    <button onClick={() => handlePickImage("bg")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                                                        <FolderOpen size={13} /> Browse
                                                    </button>
                                                </div>
                                                {backgroundPath && (
                                                    <button onClick={() => setBackgroundPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1">
                                                        <X size={11} /> Clear image
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
                                                <textarea
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    rows={5}
                                                    className={cn(inputCls, "pl-9 resize-none")}
                                                    placeholder="Game summary or description..."
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <Label>Personal Notes</Label>
                                            <div className="relative">
                                                <StickyNote size={14} className="absolute left-3.5 top-3.5 text-white/20" />
                                                <textarea
                                                    value={notes}
                                                    onChange={(e) => setNotes(e.target.value)}
                                                    rows={4}
                                                    className={cn(inputCls, "pl-9 resize-none")}
                                                    placeholder="Private notes about this game..."
                                                />
                                            </div>
                                        </div>

                                        {/* Read-only info */}
                                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-2 text-xs text-white/30">
                                            <p className="font-black text-[10px] uppercase tracking-widest text-white/20 mb-3">Read-only Info</p>
                                            <div className="flex justify-between"><span>Game ID</span><span className="font-mono text-white/40">{gameToEdit.id}</span></div>
                                            <div className="flex justify-between"><span>Added</span><span className="text-white/40">{gameToEdit.added_at ? new Date(gameToEdit.added_at).toLocaleDateString() : "—"}</span></div>
                                            <div className="flex justify-between"><span>Playtime</span><span className="text-white/40">{Math.round((gameToEdit.playtime_seconds || 0) / 3600)}h {Math.round(((gameToEdit.playtime_seconds || 0) % 3600) / 60)}m</span></div>
                                            <div className="flex justify-between"><span>Last Played</span><span className="text-white/40">{gameToEdit.last_played ? new Date(gameToEdit.last_played).toLocaleDateString() : "Never"}</span></div>
                                            {gameToEdit.steam_app_id && <div className="flex justify-between"><span>Steam App ID</span><span className="font-mono text-white/40">{gameToEdit.steam_app_id}</span></div>}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Footer */}
                        <div className="px-7 py-5 bg-black/20 border-t border-white/5 flex items-center justify-between shrink-0 gap-3">
                            <button
                                onClick={close}
                                className="px-5 py-2.5 rounded-xl text-white/40 hover:text-white font-bold text-sm transition-colors hover:bg-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-accent hover:brightness-110 disabled:opacity-50 text-white px-7 py-2.5 rounded-xl font-black text-sm tracking-wide transition-all shadow-lg shadow-accent/20 active:scale-95 flex items-center gap-2"
                            >
                                {isSaving ? (
                                    <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Saving…</>
                                ) : (
                                    <><Save size={15} /> Save Changes</>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}