import { useState, useEffect } from "react";
import { useUiStore } from "../../store/uiStore";
import { useFolderStore } from "../../store/folderStore";
import { motion, AnimatePresence } from "framer-motion";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";

// ── Color Tint Options ────────────────────────────────────────────────────────
const TINT_OPTIONS = [
    { label: "Cyber Blue", value: "from-blue-900/60", hex: "#1e3a5f" },
    { label: "Neon Purple", value: "from-purple-900/60", hex: "#3b0764" },
    { label: "Crimson Red", value: "from-red-900/60", hex: "#7f1d1d" },
    { label: "Emerald Green", value: "from-emerald-900/60", hex: "#064e3b" },
    { label: "Amber Gold", value: "from-amber-900/60", hex: "#78350f" },
    { label: "Midnight Slate", value: "from-gray-900/60", hex: "#111827" },
    { label: "Pink Neon", value: "from-pink-900/60", hex: "#831843" },
    { label: "Cyan Ice", value: "from-cyan-900/60", hex: "#164e63" },
];

// ── Icon Picker Items ─────────────────────────────────────────────────────────
const PRESET_ICONS = [
    "📁", "🎮", "⭐", "🏆", "🔥", "💎", "🎯", "🗡️",
    "🌌", "🚀", "🌙", "❤️", "👾", "🤖", "🧩", "🎲",
    "⚔️", "🛡️", "🌊", "🏔️", "🎸", "🏎️", "🦾", "🎭",
];

const FILTER_OPTIONS = [
    { value: "all", label: "All Games", desc: "Shows every game in your library" },
    { value: "installed", label: "Installed Only", desc: "Games with an exe path set" },
    { value: "recent", label: "Recently Added", desc: "Last N games added to library" },
    { value: "favorites", label: "Favorites", desc: "Games marked as favorite" },
    { value: "nonsteam", label: "Non-Steam", desc: "Manually added games only" },
    { value: "manual", label: "Manual Collection", desc: "Drag & drop games into this folder" },
];

export function FolderBuilderModal() {
    const { isFolderModalOpen, setFolderModalOpen, folderToEdit } = useUiStore();
    const addCustomFolder = useFolderStore((s) => s.addCustomFolder);
    const updateCustomFolder = useFolderStore((s) => s.updateCustomFolder);
    const removeCustomFolder = useFolderStore((s) => s.removeCustomFolder);

    const isEditMode = !!folderToEdit;

    const [name, setName] = useState("");
    const [icon, setIcon] = useState("📁");
    const [bgImage, setBgImage] = useState("");
    const [bgImageLocal, setBgImageLocal] = useState<string | null>(null); // local file path
    const [gradientStart, setGradientStart] = useState("from-blue-900/60");
    const [gradientEnd] = useState("to-transparent");
    const [filterType, setFilterType] = useState<"all" | "recent" | "favorites" | "installed" | "nonsteam" | "manual">("all");
    const [showIconPicker, setShowIconPicker] = useState(false);
    const [customIconInput, setCustomIconInput] = useState("");
    const [bgUrlError, setBgUrlError] = useState(false);

    useEffect(() => {
        if (folderToEdit) {
            setName(folderToEdit.name);
            setIcon(folderToEdit.icon);
            setBgImage(folderToEdit.bgImage || "");
            setGradientStart(folderToEdit.gradientStart || "from-blue-900/60");
            setFilterType(folderToEdit.filterType);
        } else {
            setName("");
            setIcon("📁");
            setBgImage("");
            setBgImageLocal(null);
            setGradientStart("from-blue-900/60");
            setFilterType("all");
        }
        setBgUrlError(false);
    }, [folderToEdit, isFolderModalOpen]);

    if (!isFolderModalOpen) return null;

    const effectiveBg = bgImageLocal
        ? convertFileSrc(bgImageLocal)
        : bgImage || null;

    const selectedTint = TINT_OPTIONS.find(t => t.value === gradientStart);

    const handleBgUrlChange = (val: string) => {
        setBgImage(val);
        setBgUrlError(false);
        setBgImageLocal(null);
    };

    const handleLocalImagePick = async () => {
        try {
            const selected = await openDialog({
                multiple: false,
                filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
            });
            if (selected && typeof selected === "string") {
                setBgImageLocal(selected);
                setBgImage(""); // clear URL field when local file is selected
            }
        } catch { }
    };

    const handleSave = () => {
        if (!name.trim()) return;
        const iconFinal = icon.trim() || "📁";
        const bgFinal = bgImageLocal ?? bgImage.trim();

        const payload = {
            name: name.trim(),
            icon: iconFinal,
            bgImage: bgFinal,
            gradientStart,
            gradientEnd,
            filterType,
        };

        if (isEditMode && folderToEdit) {
            updateCustomFolder(folderToEdit.id, payload);
        } else {
            addCustomFolder(payload);
        }
        setFolderModalOpen(false);
    };

    const handleDelete = () => {
        if (folderToEdit) {
            removeCustomFolder(folderToEdit.id);
            setFolderModalOpen(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/70 backdrop-blur-xl"
                    onClick={() => setFolderModalOpen(false)}
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 12 }}
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    className="relative w-full max-w-4xl bg-[#1e2330]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_40px_100px_rgba(0,0,0,0.7)] overflow-hidden flex"
                >
                    {/* ── LEFT: Live Preview Panel ────────────────────────── */}
                    <div className="w-[45%] p-8 flex flex-col items-center justify-center bg-black/20 border-r border-white/5 gap-6 relative">
                        <p className="absolute top-5 left-6 text-white/30 text-[10px] font-black tracking-widest uppercase">Live Preview</p>

                        {/* Folder card preview */}
                        <div className="relative w-[280px] h-[175px] rounded-2xl overflow-hidden border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                            {/* Background image */}
                            {effectiveBg && (
                                <img
                                    src={effectiveBg}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-cover brightness-[0.65]"
                                    onError={() => { setBgUrlError(true); }}
                                />
                            )}
                            {bgUrlError && (
                                <div className="absolute top-2 right-2 text-red-400 text-[10px] font-bold bg-red-500/20 px-2 py-0.5 rounded">Invalid URL</div>
                            )}

                            {/* Color tint overlay */}
                            {selectedTint && (
                                <div
                                    className="absolute inset-0"
                                    style={{ background: `linear-gradient(to top, ${selectedTint.hex}cc, transparent)` }}
                                />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                            {/* Content */}
                            <div className="absolute inset-0 flex flex-col justify-end p-5">
                                <span className="text-3xl leading-none mb-1">{icon || "📁"}</span>
                                <p className="text-white font-black text-lg tracking-tight leading-tight truncate">
                                    {name || "Folder Name"}
                                </p>
                                <p className="text-white/40 text-[10px] font-bold mt-0.5">
                                    {FILTER_OPTIONS.find(f => f.value === filterType)?.label}
                                </p>
                            </div>
                        </div>

                        {/* Color tint swatches */}
                        <div>
                            <p className="text-white/30 text-[10px] font-black tracking-widest uppercase text-center mb-3">Color Tint</p>
                            <div className="grid grid-cols-4 gap-2">
                                {TINT_OPTIONS.map((tint) => (
                                    <button
                                        key={tint.value}
                                        title={tint.label}
                                        onClick={() => setGradientStart(tint.value)}
                                        className={`w-10 h-10 rounded-xl border-2 transition-all ${gradientStart === tint.value
                                            ? "border-white scale-110 shadow-lg"
                                            : "border-transparent hover:border-white/40"
                                            }`}
                                        style={{ backgroundColor: tint.hex }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT: Form ─────────────────────────────────────── */}
                    <div className="w-[55%] p-8 flex flex-col gap-5 overflow-y-auto">
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight">
                                {isEditMode ? "Edit Collection" : "Create Collection"}
                            </h2>
                            <p className="text-white/40 text-sm mt-1">
                                {isEditMode ? `Editing "${folderToEdit?.name}"` : "Design a custom folder for your library."}
                            </p>
                        </div>

                        {/* Name + Icon */}
                        <div className="flex gap-3">
                            <div className="flex-1 space-y-1.5">
                                <label className="text-[10px] font-black text-white/40 tracking-widest uppercase">Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 focus:border-accent rounded-xl px-4 py-2.5 text-white outline-none transition-colors font-medium"
                                    placeholder="e.g. Action RPGs"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-white/40 tracking-widest uppercase">Icon</label>
                                <button
                                    onClick={() => setShowIconPicker(!showIconPicker)}
                                    className="w-20 h-[44px] bg-black/40 border border-white/10 hover:border-accent rounded-xl flex items-center justify-center text-2xl transition-colors"
                                    title="Click to change icon"
                                >
                                    {icon || "📁"}
                                </button>
                            </div>
                        </div>

                        {/* Icon Picker Panel */}
                        <AnimatePresence>
                            {showIconPicker && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="bg-black/40 border border-white/10 rounded-xl p-4 overflow-hidden"
                                >
                                    <p className="text-[10px] font-black text-white/30 tracking-widest uppercase mb-3">Choose or type any icon / emoji</p>
                                    <div className="grid grid-cols-8 gap-1.5 mb-3">
                                        {PRESET_ICONS.map((ic) => (
                                            <button
                                                key={ic}
                                                onClick={() => { setIcon(ic); setShowIconPicker(false); }}
                                                className={`h-9 rounded-lg text-lg flex items-center justify-center transition-all ${icon === ic ? "bg-accent/20 border border-accent/50" : "hover:bg-white/10"
                                                    }`}
                                            >
                                                {ic}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={customIconInput}
                                            onChange={(e) => setCustomIconInput(e.target.value)}
                                            placeholder="Type emoji or text…"
                                            className="flex-1 bg-black/40 border border-white/10 focus:border-accent rounded-lg px-3 py-2 text-white text-sm outline-none"
                                        />
                                        <button
                                            onClick={() => { if (customIconInput.trim()) { setIcon(customIconInput.trim()); setShowIconPicker(false); setCustomIconInput(""); } }}
                                            className="px-4 py-2 bg-accent/80 hover:bg-accent rounded-lg text-white text-sm font-bold"
                                        >
                                            Use
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Background Image */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-white/40 tracking-widest uppercase">Background Image</label>
                            <div className="flex gap-2 items-center">
                                {effectiveBg && !bgUrlError && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="w-11 h-11 rounded-lg overflow-hidden border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.15)] flex-shrink-0 bg-black/40"
                                    >
                                        <img src={effectiveBg} alt="" className="w-full h-full object-cover" />
                                    </motion.div>
                                )}
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        value={bgImage}
                                        onChange={(e) => handleBgUrlChange(e.target.value)}
                                        placeholder="Paste image URL..."
                                        className={`w-full bg-black/40 border rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors font-medium h-11 ${bgUrlError ? "border-red-500/60 focus:border-red-400" : "border-white/10 focus:border-accent"
                                            }`}
                                    />
                                    {bgUrlError && (
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-xs">✕ Invalid</span>
                                    )}
                                    {bgImage && !bgUrlError && (
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 text-xs shadow-black drop-shadow-md">✓</span>
                                    )}
                                </div>
                                <button
                                    onClick={handleLocalImagePick}
                                    title="Browse for local image"
                                    className="px-3 min-w-[44px] h-11 bg-black/40 border border-white/10 hover:border-accent rounded-xl text-white/60 hover:text-white transition-colors text-sm flex items-center justify-center flex-shrink-0"
                                >
                                    📂
                                </button>
                            </div>
                            {bgImageLocal && (
                                <p className="text-green-400/70 text-[10px] font-bold">Using local file: {bgImageLocal.split("\\").pop()}</p>
                            )}
                            <p className="text-white/20 text-[10px]">Supports URLs and local files. Images are resized to fit automatically.</p>
                        </div>

                        {/* Content Source */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-white/40 tracking-widest uppercase">Content Source</label>
                            <div className="space-y-1.5">
                                {FILTER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setFilterType(opt.value as any)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-all ${filterType === opt.value
                                            ? "bg-accent/10 border-accent/40 text-white"
                                            : "bg-black/20 border-white/5 text-white/50 hover:border-white/15 hover:text-white/70"
                                            }`}
                                    >
                                        <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all ${filterType === opt.value ? "bg-accent border-accent" : "border-white/20"
                                            }`} />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-bold">{opt.label}</span>
                                            <span className="text-[10px] text-white/30 ml-2">{opt.desc}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3 mt-auto pt-4 border-t border-white/5">
                            {isEditMode && (
                                <button
                                    onClick={handleDelete}
                                    className="px-4 bg-red-900/30 hover:bg-red-700/50 text-red-400 hover:text-red-200 font-bold py-3 rounded-xl transition-colors border border-red-500/20"
                                >
                                    🗑️
                                </button>
                            )}
                            <button
                                onClick={() => setFolderModalOpen(false)}
                                className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-bold py-3 rounded-xl transition-colors border border-white/8"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!name.trim()}
                                className="flex-1 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl transition-all shadow-lg shadow-accent/20 active:scale-95"
                            >
                                {isEditMode ? "Save Changes" : "✦ Create Folder"}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
