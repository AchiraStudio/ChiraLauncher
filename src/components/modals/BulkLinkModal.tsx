import { useState, useEffect } from "react";
import { useHttpStore } from "../../store/httpStore";
import { useSettingsStore } from "../../store/settingsStore";
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { toast } from "sonner";
import { motion } from "framer-motion";
import { X, Link as LinkIcon, Folder, DownloadCloud, FolderTree, Zap } from "lucide-react";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function BulkLinkModal({ isOpen, onClose }: Props) {
    const addDownloads = useHttpStore(s => s.addDownloads);
    const defaultPath = useSettingsStore(s => s.settings?.download_path || "");

    const [links, setLinks] = useState("");
    const [savePath, setSavePath] = useState<string | null>(null);
    const [folderName, setFolderName] = useState("");
    const [category, setCategory] = useState<"auto" | "direct">("auto");
    const [isResolving, setIsResolving] = useState(false);
    const [resolveProgress, setResolveProgress] = useState("");

    // Auto-derive folder name from first URL
    useEffect(() => {
        if (!links.trim() || folderName.trim()) return;
        const firstUrl = links.split('\n').map(l => l.trim()).find(l => l.startsWith("http"));
        if (!firstUrl) return;
        try {
            const url = new URL(firstUrl);
            let name = url.hash.replace('#', '') || url.pathname.split('/').pop() || "";
            name = decodeURIComponent(name)
                .replace(/\.part\d+\.rar$/i, '')
                .replace(/\.(zip|rar)$/i, '')
                .replace(/_--_fitgirl-repacks\.site_--_/gi, ' [Fitgirl Repacks]')
                .replace(/_/g, ' ')
                .trim();
            if (name) setFolderName(name);
        } catch { }
    }, [links]);

    const handlePickFolder = async () => {
        const selected = await open({ directory: true, multiple: false });
        if (selected && typeof selected === 'string') setSavePath(selected);
    };

    const handleStart = async () => {
        const urlArray = links.split('\n').map(l => l.trim()).filter(l => l.startsWith("http"));
        if (!urlArray.length) return;

        const baseDir = savePath || defaultPath;
        const folder = folderName.trim();
        const finalUrls: string[] = [];
        const finalPaths: string[] = [];

        setIsResolving(true);
        try {
            for (let i = 0; i < urlArray.length; i++) {
                setResolveProgress(`Resolving ${i + 1} / ${urlArray.length}...`);
                try {
                    const [title, dlUrl] = await invoke<[string, string]>("resolve_premium_link", { url: urlArray[i] });
                    finalUrls.push(dlUrl);
                    finalPaths.push(folder ? `${baseDir}\\${folder}\\${title}` : `${baseDir}\\${title}`);
                } catch (e) {
                    if (category === "direct") {
                        const title = urlArray[i].split('/').pop() || `file_${i}`;
                        finalUrls.push(urlArray[i]);
                        finalPaths.push(folder ? `${baseDir}\\${folder}\\${title}` : `${baseDir}\\${title}`);
                    } else {
                        toast.error(`Failed to resolve link ${i + 1}`, { description: String(e) });
                    }
                }
            }

            if (!finalUrls.length) {
                toast.error("No links could be resolved. Check your URLs.");
                return;
            }

            await addDownloads(finalUrls, finalPaths, folder || undefined);
            setLinks("");
            setFolderName("");
            onClose();
        } finally {
            setIsResolving(false);
            setResolveProgress("");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl bg-[#12141c] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
            >
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400">
                            <DownloadCloud size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Bulk Direct Downloader</h2>
                            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">Paste multiple URLs (one per line)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 flex flex-col gap-6">
                    {/* Category toggle */}
                    <div className="flex gap-4">
                        {(["auto", "direct"] as const).map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${category === cat ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-black/40 text-white/40 border border-white/5 hover:bg-white/5'}`}
                            >
                                {cat === "auto" ? <><Zap size={16} /> Auto-Resolver (FuckingFast / DataNodes)</> : <><LinkIcon size={16} /> Direct URLs</>}
                            </button>
                        ))}
                    </div>

                    <textarea
                        value={links}
                        onChange={(e) => setLinks(e.target.value)}
                        placeholder={category === "auto"
                            ? "https://fuckingfast.co/12345/game.part1.rar\nhttps://datanodes.to/abc123xyz/game.part2.rar"
                            : "https://example.com/game.part1.rar\nhttps://example.com/game.part2.rar"}
                        className="w-full h-40 bg-black/50 border border-white/10 rounded-2xl p-5 text-sm text-white font-mono outline-none focus:border-blue-500/50 shadow-inner resize-none custom-scrollbar"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Save Location</h3>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-3.5 text-xs text-white/70 truncate font-mono h-11 flex items-center">
                                    {savePath || defaultPath}
                                </div>
                                <button onClick={handlePickFolder} className="px-4 h-11 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors flex items-center justify-center shrink-0">
                                    <Folder size={16} />
                                </button>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Subfolder Name (Optional)</h3>
                            <div className="relative">
                                <FolderTree className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                <input
                                    type="text"
                                    value={folderName}
                                    onChange={(e) => setFolderName(e.target.value)}
                                    placeholder="e.g. Cyberpunk 2077"
                                    className="w-full bg-black/40 border border-white/10 focus:border-blue-500/50 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white outline-none transition-colors h-11"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-5 border-t border-white/5 bg-black/20 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                        Cancel
                    </button>
                    <button
                        disabled={!links.trim() || isResolving}
                        onClick={handleStart}
                        className="px-8 py-3 rounded-xl text-[10px] uppercase tracking-widest font-black text-black bg-blue-400 hover:bg-blue-300 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(96,165,250,0.3)] flex items-center gap-2 min-w-[180px] justify-center"
                    >
                        {isResolving
                            ? <span className="text-black">{resolveProgress || "Resolving..."}</span>
                            : <><LinkIcon size={14} /> Start Bulk Download</>
                        }
                    </button>
                </div>
            </motion.div>
        </div>
    );
}