import { useEffect, useState } from "react";
import { useUiStore } from "../../store/uiStore";
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

    const [isLoading, setIsLoading] = useState(true);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [metadata, setMetadata] = useState<TorrentInfo | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Set of selected file indices
    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
    const [savePath, setSavePath] = useState<string | null>(null);

    // Smart default selection logic
    const applySmartDefaults = (files: TorrentFileEntry[]) => {
        const selected = new Set<number>();
        files.forEach(file => {
            const name = file.name.toLowerCase();
            // Automatically uncheck known optional/extra files
            const isOptional = name.includes('optional') ||
                name.includes('bonus') ||
                name.includes('ost') ||
                name.includes('soundtrack') ||
                name.includes('artbook') ||
                name.includes('fg-selective-') && !name.includes('english'); // FitGirl selective language (keep English)

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
        setSavePath(null); // Reset path so backend uses default

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

        try {
            await invoke("start_download", {
                magnetUrl: currentMagnet,
                selectedFiles: Array.from(selectedFiles),
                savePath: savePath
            });
            toast.success("Download started!", {
                description: metadata?.name || "Torrent added to queue."
            });
            setTorrentModalOpen(false);
            // TODO: Route user to Downloads page
        } catch (err) {
            toast.error("Failed to start download", { description: String(err) });
        }
    };

    if (!isTorrentModalOpen) return null;

    // Calculate total selected size
    const totalSelectedBytes = metadata?.files
        .filter(f => selectedFiles.has(f.index))
        .reduce((acc, f) => acc + f.length, 0) || 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/10">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Download className="w-5 h-5 text-chira-500" />
                            New Download
                        </h2>
                        {metadata && (
                            <p className="text-sm text-zinc-400 mt-1 truncate max-w-md" title={metadata.name}>
                                {metadata.name}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => setTorrentModalOpen(false)}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-zinc-900/50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <Loader2 className="w-12 h-12 text-chira-500 animate-spin mb-4" />
                            <h3 className="text-lg font-medium text-white mb-2">Fetching Metadata...</h3>
                            <p className="text-zinc-400 text-sm max-w-sm mb-4">
                                Connecting to peers to retrieve the file list. This can take a moment depending on the swarm health.
                            </p>
                            <div className="text-xs font-mono text-zinc-500 bg-zinc-800/50 px-3 py-1 rounded-full">
                                Elapsed: {elapsedTime}s
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                                <Frown className="w-8 h-8 text-red-500" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">Failed to load torrent</h3>
                            <p className="text-red-400 text-sm max-w-md bg-red-500/5 p-4 rounded-lg border border-red-500/20">
                                {error}
                            </p>
                        </div>
                    ) : metadata ? (
                        <div className="space-y-6">

                            {/* File Tree */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                                        Files to Download
                                    </h3>
                                    <button
                                        onClick={handleSelectAll}
                                        className="text-xs text-chira-400 hover:text-chira-300 hover:underline flex items-center gap-1"
                                    >
                                        {selectedFiles.size === metadata.files.length ? "Deselect All" : "Select All"}
                                    </button>
                                </div>

                                <div className="bg-black/40 border border-zinc-800 rounded-lg max-h-[40vh] overflow-y-auto">
                                    {metadata.files.map(file => {
                                        const isSelected = selectedFiles.has(file.index);
                                        return (
                                            <div
                                                key={file.index}
                                                onClick={() => handleToggleFile(file.index)}
                                                className={`flex items-center justify-between p-3 border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer transition-colors ${isSelected ? 'bg-chira-500/5' : ''}`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 pr-4">
                                                    <div className="text-chira-500 shrink-0">
                                                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-zinc-600" />}
                                                    </div>
                                                    <span className={`text-sm truncate ${isSelected ? 'text-zinc-200' : 'text-zinc-500 line-through'}`}>
                                                        {file.name}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-zinc-500 shrink-0 font-mono">
                                                    {formatBytes(file.length)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Save Path */}
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
                                    Save Location
                                </h3>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 bg-black/40 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-300 truncate font-mono">
                                        {savePath || "Default Download Directory (App Data)"}
                                    </div>
                                    <button
                                        onClick={handlePickFolder}
                                        className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                                    >
                                        <Folder className="w-4 h-4" />
                                        Browse...
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between">
                    <div className="text-sm text-zinc-400">
                        {metadata && (
                            <>
                                <span className="text-white font-medium">{formatBytes(totalSelectedBytes)}</span> selected
                                <span className="text-zinc-600 mx-2">/</span>
                                <span className="text-zinc-500">{formatBytes(metadata.total_bytes)} total</span>
                            </>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setTorrentModalOpen(false)}
                            className="px-5 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={isLoading || !metadata || selectedFiles.size === 0}
                            onClick={handleStartDownload}
                            className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-chira-600 hover:bg-chira-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-chira-900/20 flex items-center gap-2"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            Start Download
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
