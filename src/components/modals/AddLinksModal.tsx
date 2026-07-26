import { useState, useEffect } from "react";
import { useHttpStore } from "../../store/httpStore";
import { useSettingsStore } from "../../store/settingsStore";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link as LinkIcon, Folder, DownloadCloud, Loader2, FolderPlus } from "lucide-react";

export function autoFormatFolderName(urlOrFilename: string): string {
    if (!urlOrFilename) return "";
    let raw = urlOrFilename;
    if (raw.includes("#")) {
        raw = raw.split("#")[1];
    } else if (raw.includes("/")) {
        raw = raw.split("/").pop()?.split("?")[0] || raw;
    }
    raw = decodeURIComponent(raw);

    // Remove extensions & part numbers (.part1.rar, .part01.rar, etc.)
    raw = raw.replace(/\.(part\d+|0\d+|\d+)\.(rar|zip|7z|bin)$/i, "");
    raw = raw.replace(/\.(rar|zip|7z|bin|exe|iso)$/i, "");

    let repackTag = "";
    if (/fitgirl[-._]repack/i.test(raw) || /fitgirl/i.test(raw)) {
        repackTag = " [Fitgirl Repack]";
        raw = raw.replace(/--_fitgirl-repacks\.site_--_|[-._]fitgirl-repacks\.site|[-._]fitgirl[-._]repack|[-._]fitgirl/gi, "");
    } else if (/dodi[-._]repack/i.test(raw) || /dodi/i.test(raw)) {
        repackTag = " [DODI Repack]";
        raw = raw.replace(/[-._]dodi[-._]repacks?|[-._]dodi/gi, "");
    } else if (/elamigos/i.test(raw)) {
        repackTag = " [ElAmigos Repack]";
        raw = raw.replace(/[-._]elamigos/gi, "");
    }

    let clean = raw
        .replace(/--+/g, " ")
        .replace(/[._]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    clean = clean.replace(/\b\w/g, l => l.toUpperCase());
    return clean ? `${clean}${repackTag}` : "";
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function AddLinksModal({ isOpen, onClose }: Props) {
    const { resolveLink, addDownloads } = useHttpStore();
    const defaultPath = useSettingsStore(s => s.settings?.download_path || "");

    const [links, setLinks] = useState("");
    const [savePath, setSavePath] = useState<string | null>(null);
    const [folderName, setFolderName] = useState("");
    const [isResolving, setIsResolving] = useState(false);
    const [resolveStatus, setResolveStatus] = useState("");

    useEffect(() => {
        if (defaultPath && !savePath) {
            setSavePath(defaultPath);
        }
    }, [defaultPath, savePath]);

    // Auto-derive folder name when user pastes links
    useEffect(() => {
        if (!links.trim()) return;
        const firstUrl = links.split("\n").map(l => l.trim()).find(l => l.startsWith("http"));
        if (firstUrl) {
            const formatted = autoFormatFolderName(firstUrl);
            if (formatted) {
                setFolderName(formatted);
            }
        }
    }, [links]);

    const handlePickFolder = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: savePath || undefined,
            });
            if (selected && typeof selected === "string") {
                setSavePath(selected);
            }
        } catch (err) {
            console.error("Failed to pick directory:", err);
        }
    };

    const handleStartDownload = async () => {
        const rawUrls = links
            .split("\n")
            .map(l => l.trim())
            .filter(l => l.length > 0 && (l.startsWith("http://") || l.startsWith("https://")));

        if (rawUrls.length === 0) {
            toast.error("Please enter at least one valid HTTP/HTTPS URL");
            return;
        }

        const targetDir = savePath || defaultPath;
        if (!targetDir) {
            toast.error("Please select a target save folder");
            return;
        }

        setIsResolving(true);
        const resolvedUrls: string[] = [];
        const finalSavePaths: string[] = [];
        const validOriginalUrls: string[] = [];
        let successCount = 0;

        const cleanFolder = folderName.trim().replace(/[\\/:*?"<>|]/g, "_");

        for (let i = 0; i < rawUrls.length; i++) {
            const rawUrl = rawUrls[i];
            setResolveStatus(`Resolving link ${i + 1} of ${rawUrls.length}...`);

            try {
                const info = await resolveLink(rawUrl);
                const cleanFilename = info.title.replace(/[\\/:*?"<>|]/g, "_");

                const fullSavePath = cleanFolder
                    ? `${targetDir.replace(/[/\\]$/, "")}\\${cleanFolder}\\${cleanFilename}`
                    : `${targetDir.replace(/[/\\]$/, "")}\\${cleanFilename}`;

                resolvedUrls.push(info.download_url);
                finalSavePaths.push(fullSavePath);
                validOriginalUrls.push(rawUrl);
                successCount++;
            } catch (err: any) {
                console.error(`Failed to resolve ${rawUrl}:`, err);
                toast.error(`Failed to resolve link ${i + 1}`, {
                    description: err?.toString() || "Unknown resolution error"
                });
            }
        }

        setIsResolving(false);
        setResolveStatus("");

        if (resolvedUrls.length > 0) {
            try {
                await addDownloads(resolvedUrls, finalSavePaths, cleanFolder || undefined, validOriginalUrls);
                toast.success(`Queued ${successCount} download(s) in "${cleanFolder || 'Downloads'}"`);
                setLinks("");
                setFolderName("");
                onClose();
            } catch (err: any) {
                toast.error("Failed to queue downloads", { description: err?.toString() });
            }
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-2xl bg-[#0f121d] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-accent">
                                <DownloadCloud size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Add Downloads</h2>
                                <p className="text-white/40 text-xs mt-0.5">Paste direct or FuckingFast URLs (one per line)</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={isResolving}
                            className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-8 space-y-6">
                        {/* Links Textarea */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2.5 flex items-center gap-2">
                                <LinkIcon size={14} /> Download Links
                            </label>
                            <textarea
                                value={links}
                                onChange={e => setLinks(e.target.value)}
                                disabled={isResolving}
                                placeholder="https://fuckingfast.co/wv1im9nxe0yw#V_Rising_--_fitgirl-repacks.site_--_.part1.rar&#10;https://fuckingfast.co/6jsc1t0c7h81#V_Rising_--_fitgirl-repacks.site_--_.part2.rar"
                                className="w-full h-36 bg-black/40 border border-white/10 rounded-2xl p-4 text-xs text-white placeholder-white/20 focus:outline-none focus:border-accent/50 transition-all font-mono resize-none"
                            />
                        </div>

                        {/* Save Path Picker */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2.5 flex items-center gap-2">
                                <Folder size={14} /> Base Save Directory
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="text"
                                    readOnly
                                    value={savePath || "Default download path"}
                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/80 outline-none font-mono"
                                />
                                <button
                                    onClick={handlePickFolder}
                                    disabled={isResolving}
                                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-5 py-3 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
                                >
                                    Browse
                                </button>
                            </div>
                        </div>

                        {/* Formatted Folder Name */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2.5 flex items-center gap-2">
                                <FolderPlus size={14} className="text-accent" /> Folder / Group Name (Auto-formatted)
                            </label>
                            <input
                                type="text"
                                value={folderName}
                                onChange={e => setFolderName(e.target.value)}
                                disabled={isResolving}
                                placeholder="e.g. V Rising [Fitgirl Repack]"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-white/20 focus:outline-none focus:border-accent/50 transition-all"
                            />
                            <p className="text-[11px] text-white/40 mt-1.5">
                                Files will be saved into: <span className="font-mono text-accent/80">{savePath || 'DownloadDir'}\{folderName || 'FolderName'}</span>
                            </p>
                        </div>

                        {/* Resolution progress status */}
                        {isResolving && (
                            <div className="flex items-center gap-3 text-accent text-xs font-medium bg-accent/10 border border-accent/20 rounded-xl p-4">
                                <Loader2 size={16} className="animate-spin" />
                                <span>{resolveStatus}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-5 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={isResolving}
                            className="px-6 py-3 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleStartDownload}
                            disabled={isResolving || !links.trim()}
                            className="bg-accent hover:bg-accent/90 text-white font-bold text-xs uppercase tracking-wider px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-accent/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isResolving ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" /> Resolving...
                                </>
                            ) : (
                                "Start Download"
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
