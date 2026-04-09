import { useEffect, useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { X, CheckSquare, Square, Frown, Loader2, Download, Folder, Play } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';

interface TorrentFileEntry {
    index: number;
    name: string;
    length: number;
}

interface TorrentInfo {
    id: number;
    name: string;
    files: TorrentFileEntry[];
    total_bytes: number;
}

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function TorrentFileModal() {
    const { isTorrentModalOpen, currentMagnet, setTorrentModalOpen } = useUiStore();
    const settings = useSettingsStore(s => s.settings);

    const [isLoading, setIsLoading] = useState(true);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [metadata, setMetadata] = useState<TorrentInfo | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
    const [savePath, setSavePath] = useState<string | null>(null);

    const applySmartDefaults = (files: TorrentFileEntry[]) => {
        const selected = new Set<number>();
        files.forEach(file => {
            const name = file.name.toLowerCase();
            const isOptional = name.includes('optional') ||
                name.includes('bonus') ||
                name.includes('ost') ||
                name.includes('soundtrack') ||
                name.includes('artbook') ||
                (name.includes('fg-selective-') && !name.includes('english'));

            if (!isOptional) {
                selected.add(file.index);
            }
        });
        setSelectedFiles(selected);
    };

    useEffect(() => {
        if (!isTorrentModalOpen || !currentMagnet) return;

        setIsLoading(true);
        setError(null);
        setMetadata(null);
        setElapsedTime(0);
        setSelectedFiles(new Set());
        setSavePath(null);

        const timer = setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);

        invoke<TorrentInfo>("inspect_magnet", { magnetUrl: currentMagnet })
            .then(info => {
                setMetadata(info);
                applySmartDefaults(info.files);
                clearInterval(timer);
                setIsLoading(false);
            })
            .catch(err => {
                setError(String(err));
                clearInterval(timer);
                setIsLoading(false);
            });

        return () => clearInterval(timer);
    }, [isTorrentModalOpen, currentMagnet]);

    const handleToggleFile = (index: number) => {
        const newSet = new Set(selectedFiles);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedFiles(newSet);
    };

    const handleSelectAll = () => {
        if (!metadata) return;
        if (selectedFiles.size === metadata.files.length) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(metadata.files.map(f => f.index)));
        }
    };

    const handlePickFolder = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
            title: "Select Download Folder"
        });
        if (selected && typeof selected === 'string') {
            setSavePath(selected);
        }
    };

    const handleStartDownload = async () => {
        if (!currentMagnet) return;

        // Uses the explicitly chosen path, or falls back to the AppSettings download path
        const finalPath = savePath || settings?.download_path || null;

        try {
            await invoke("start_download", {
                magnetUrl: currentMagnet,
                selectedFiles: Array.from(selectedFiles),
                savePath: finalPath
            });
            toast.success("Download started!", {
                description: metadata?.name || "Torrent added to queue."
            });
            setTorrentModalOpen(false);
        } catch (err) {
            toast.error("Failed to start download", { description: String(err) });
        }
    };

    if (!isTorrentModalOpen) return null;

    const totalSelectedBytes = metadata?.files
        .filter(f => selectedFiles.has(f.index))
        .reduce((acc, f) => acc + f.length, 0) || 0;

    const defaultPath = settings?.download_path || "Default Application Data";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#12141c] border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.02]">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                            <Download className="w-6 h-6 text-accent" />
                            New Download
                        </h2>
                        {metadata && (
                            <p className="text-xs font-bold tracking-widest uppercase text-white/40 mt-1 truncate max-w-md" title={metadata.name}>
                                {metadata.name}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => setTorrentModalOpen(false)}
                        className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <Loader2 className="w-12 h-12 text-accent animate-spin mb-4" />
                            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Fetching Metadata</h3>
                            <p className="text-white/40 text-sm max-w-sm mb-4">
                                Connecting to peers to retrieve the file list. This can take a moment depending on the swarm health.
                            </p>
                            <div className="text-xs font-mono font-bold text-accent bg-accent/10 px-4 py-1.5 rounded-full">
                                Elapsed: {elapsedTime}s
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                                <Frown className="w-8 h-8 text-red-500" />
                            </div>
                            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Failed to load torrent</h3>
                            <p className="text-red-400 text-sm max-w-md bg-red-500/5 p-4 rounded-lg border border-red-500/20">
                                {error}
                            </p>
                        </div>
                    ) : metadata ? (
                        <div className="space-y-6">

                            {/* File Tree */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-black text-white/50 uppercase tracking-widest">
                                        Files to Download
                                    </h3>
                                    <button
                                        onClick={handleSelectAll}
                                        className="text-[10px] font-black uppercase tracking-widest text-accent hover:text-white transition-colors"
                                    >
                                        {selectedFiles.size === metadata.files.length ? "Deselect All" : "Select All"}
                                    </button>
                                </div>

                                <div className="bg-black/40 border border-white/5 rounded-2xl max-h-[35vh] overflow-y-auto custom-scrollbar">
                                    {metadata.files.map(file => {
                                        const isSelected = selectedFiles.has(file.index);
                                        return (
                                            <div
                                                key={file.index}
                                                onClick={() => handleToggleFile(file.index)}
                                                className={`flex items-center justify-between p-3 border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors ${isSelected ? 'bg-accent/5' : ''}`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 pr-4">
                                                    <div className="text-accent shrink-0">
                                                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-white/20" />}
                                                    </div>
                                                    <span className={`text-sm truncate font-medium ${isSelected ? 'text-white' : 'text-white/30 line-through'}`}>
                                                        {file.name}
                                                    </span>
                                                </div>
                                                <span className="text-[11px] font-bold text-white/30 shrink-0 uppercase tracking-widest">
                                                    {formatBytes(file.length)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Save Path */}
                            <div>
                                <h3 className="text-xs font-black text-white/50 uppercase tracking-widest mb-3">
                                    Save Location
                                </h3>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-3.5 text-xs text-white/70 truncate font-mono shadow-inner">
                                        {savePath || defaultPath}
                                    </div>
                                    <button
                                        onClick={handlePickFolder}
                                        className="px-5 py-3.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap text-xs font-black uppercase tracking-widest"
                                    >
                                        <Folder className="w-4 h-4" />
                                        Browse
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-white/5 bg-black/20 flex items-center justify-between">
                    <div className="text-[11px] font-black uppercase tracking-widest text-white/40">
                        {metadata && (
                            <>
                                <span className="text-white">{formatBytes(totalSelectedBytes)}</span> selected
                                <span className="text-white/20 mx-2">•</span>
                                <span className="text-white/40">{formatBytes(metadata.total_bytes)} total</span>
                            </>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setTorrentModalOpen(false)}
                            className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={isLoading || !metadata || selectedFiles.size === 0}
                            onClick={handleStartDownload}
                            className="px-8 py-3 rounded-xl text-[10px] uppercase tracking-widest font-black text-white bg-accent hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-accent/20 flex items-center gap-2"
                        >
                            <Play className="w-3 h-3 fill-current" />
                            Start Download
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}