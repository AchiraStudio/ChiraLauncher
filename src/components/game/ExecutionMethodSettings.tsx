import { Rocket, FolderOpen } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { ExecutionMethod } from "../../types/game";

const EXEC_OPTIONS: { value: ExecutionMethod; label: string; desc: string }[] = [
    { value: "direct", label: "Standard Direct Launch (Default)", desc: "Spawns the executable directly and tracks its PID." },
    { value: "official_steam", label: "Official Steam Game (via steam://)", desc: "Launches via steam:// so DRM applies. AutoAttach catches it." },
    { value: "unreal_engine", label: "Unreal Engine (Bypass Bootstrap)", desc: "Ignores the bootstrap and attaches to Win64-Shipping.exe." },
    { value: "auto_launcher", label: "Auto-Launcher (Wait 5s)", desc: "Spawns Launcher, waits 5s, then spawns Game." },
    { value: "manual_launcher", label: "Manual Launcher", desc: "Spawns Launcher and leaves it up to you to click 'Play'." }
];

export function ExecutionMethodSettings({
    executionMethod,
    setExecutionMethod,
    launcherPath,
    setLauncherPath
}: {
    executionMethod: ExecutionMethod | string;
    setExecutionMethod: (v: ExecutionMethod) => void;
    launcherPath: string;
    setLauncherPath: (v: string) => void;
}) {
    return (
        <div className="space-y-6">
            <div className="bg-accent/5 border border-accent/15 p-5 rounded-2xl flex gap-4 items-start shadow-inner">
                <Rocket className="text-accent shrink-0 mt-0.5" size={24} />
                <div>
                    <h4 className="text-accent text-sm font-black uppercase tracking-widest mb-1.5">Engine Routing</h4>
                    <p className="text-white/50 text-xs leading-relaxed font-medium">
                        Does this game require a secondary launcher, or is it built on an engine that spawns child processes? Configure how ChiraLauncher tracks the execution flow here.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="text-white/30 text-[10px] font-black tracking-normal uppercase ml-1 block mb-2">Execution Method</label>
                    <select
                        value={executionMethod}
                        onChange={(e) => setExecutionMethod(e.target.value as any)}
                        className="w-full bg-white/[0.03] border-2 border-white/5 focus:border-accent/40 rounded-2xl px-6 py-5 text-white font-black text-sm outline-none transition-all appearance-none cursor-pointer [&>option]:bg-[#0f1423] [&>option]:text-white"
                    >
                        {EXEC_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>

                <AnimatePresence>
                    {(executionMethod === "auto_launcher" || executionMethod === "manual_launcher") && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="pt-2 space-y-3">
                                <label className="text-white/30 text-[10px] font-black tracking-normal uppercase ml-1 block">Secondary Launcher Executable</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={launcherPath}
                                        onChange={(e) => setLauncherPath(e.target.value)}
                                        className="flex-1 bg-black/30 border border-white/10 border-dashed rounded-xl px-5 py-4 font-mono text-sm text-white outline-none focus:border-accent/40 transition-all"
                                        placeholder="C:\Games\Launcher.exe"
                                    />
                                    <button
                                        onClick={async () => {
                                            const selected = await openDialog({ multiple: false, filters: [{ name: "Executables", extensions: ["exe"] }] });
                                            if (selected && typeof selected === "string") setLauncherPath(selected);
                                        }}
                                        className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-4 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-2"
                                    >
                                        <FolderOpen size={16} /> Browse
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="p-5 bg-black/40 rounded-2xl border border-white/5 mt-4">
                    <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">How it works</h4>
                    <ul className="text-xs text-white/50 space-y-3 list-disc pl-4 marker:text-white/20">
                        {executionMethod === "direct" && <li>Spawns the <span className="text-white/80 font-mono">Executable Path</span> directly and tracks its PID.</li>}
                        {executionMethod === "official_steam" && <li>Launches via the <span className="text-white/80 font-mono">steam://</span> protocol so Steam can apply DRM and custom arguments correctly. AutoAttach catches the game once it loads.</li>}
                        {executionMethod === "unreal_engine" && <li>Spawns the executable, but ignores it when it immediately dies. AutoAttach will intercept the real <span className="text-white/80 font-mono">Win64-Shipping.exe</span> automatically.</li>}
                        {executionMethod === "auto_launcher" && <li>Spawns the <span className="text-white/80 font-mono">Launcher Executable</span>, waits 5 seconds, then spawns the <span className="text-white/80 font-mono">Main Game Executable</span> automatically.</li>}
                        {executionMethod === "manual_launcher" && <li>Spawns the <span className="text-white/80 font-mono">Launcher Executable</span> and leaves it up to you to click "Play". AutoAttach intercepts the main game when it appears.</li>}
                    </ul>
                </div>
            </div>
        </div>
    );
}
