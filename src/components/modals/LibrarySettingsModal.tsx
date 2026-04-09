import { useUiStore } from "../../store/uiStore";
import { useFolderStore } from "../../store/folderStore";
import { motion, AnimatePresence } from "framer-motion";

export function LibrarySettingsModal() {
    const { isLibrarySettingsModalOpen, setLibrarySettingsModalOpen } = useUiStore();
    const { settings, updateSettings } = useFolderStore();

    if (!isLibrarySettingsModalOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    onClick={() => setLibrarySettingsModalOpen(false)}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-md bg-surface/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 flex flex-col gap-6"
                >
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Library Background</h2>
                        <p className="text-white/50 text-sm mt-1">Customize the default background when no game is focused.</p>
                    </div>

                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-white/50 tracking-widest uppercase">Background Image URL</label>
                            <input
                                type="text"
                                value={settings.globalBgImage}
                                onChange={(e) => updateSettings({ globalBgImage: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-accent transition-colors text-sm"
                                placeholder="https://..."
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <label className="text-xs font-bold text-white/50 tracking-widest uppercase">Opacity</label>
                                <span className="text-xs text-white/70 font-bold">{Math.round(settings.globalBgOpacity * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="1" step="0.05"
                                value={settings.globalBgOpacity}
                                onChange={(e) => updateSettings({ globalBgOpacity: parseFloat(e.target.value) })}
                                className="w-full appearance-none h-1.5 bg-white/20 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <label className="text-xs font-bold text-white/50 tracking-widest uppercase">Blur</label>
                                <span className="text-xs text-white/70 font-bold">{settings.globalBgBlur}px</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="20" step="1"
                                value={settings.globalBgBlur}
                                onChange={(e) => updateSettings({ globalBgBlur: parseInt(e.target.value) })}
                                className="w-full appearance-none h-1.5 bg-white/20 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                            />
                        </div>
                    </div>

                    <div className="mt-4">
                        <button
                            onClick={() => setLibrarySettingsModalOpen(false)}
                            className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-lg transition-colors border border-white/10 shadow-lg"
                        >
                            DONE
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
