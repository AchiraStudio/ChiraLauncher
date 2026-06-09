import { cn } from "../../../lib/utils";
import { Trophy, RefreshCcw, FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useSettingsStore } from "../../../store/settingsStore";
import { Label, inputCls } from "./EditGameGeneralTab";

export function EditGameAchievementsTab({
    gameToEdit,
    appIdInput,
    isGeneratingAch, setIsGeneratingAch,
    isSyncingSteam, setIsSyncingSteam,
    manualAchPath, setManualAchPath,
    manualSavePath, setManualSavePath,
    handlePickAchMeta, handlePickAchSave
}: any) {
    return (
        <div className="space-y-6">
            {/* ── Generator Panel ─────────────────────────────── */}
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-start gap-4">
                    <Trophy className="text-yellow-400 shrink-0 mt-0.5" size={18} />
                    <div className="flex-1 min-w-0">
                        <h4 className="text-yellow-400 text-xs font-black uppercase tracking-widest mb-1">Generate Achievement Data</h4>
                        <p className="text-white/40 text-[11px] leading-relaxed">
                            Fetches the achievement schema from Steam and writes <span className="font-mono text-white/60">achievements.json</span> to the game's <span className="font-mono text-white/60">steam_settings/</span> folder. Requires a valid Steam App ID, install directory, and API key.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                    <div className="bg-black/40 rounded-xl px-3 py-2 border border-white/5 truncate">
                        <p className="text-white/20 font-black uppercase tracking-widest mb-0.5">App ID</p>
                        <p className="text-white/60 truncate">{appIdInput || "Not set"}</p>
                    </div>
                    <div className="bg-black/40 rounded-xl px-3 py-2 border border-white/5 truncate">
                        <p className="text-white/20 font-black uppercase tracking-widest mb-0.5">Install Dir</p>
                        <p className="text-white/60 truncate">{gameToEdit.install_dir || "Not set"}</p>
                    </div>
                </div>

                <div className="flex flex-col gap-2 w-full">
                    <button
                        onClick={async () => {
                            const apiKey = useSettingsStore.getState().settings?.steam_api_key;
                            if (!apiKey) {
                                toast.warning("Cannot generate achievements: No Steam API Key configured.");
                                return;
                            }
                            if (!gameToEdit.install_dir) {
                                toast.error("No install directory", { description: "The game must have a valid install directory." });
                                return;
                            }
                            setIsGeneratingAch(true);
                            try {
                                const result = await invoke<{ count: number; has_global_pcts: boolean }>("fetch_and_write_achievements", {
                                    appId: appIdInput,
                                    gameDir: gameToEdit.install_dir,
                                    apiKey
                                });
                                toast.success(`Generated ${result.count} achievements`, {
                                    description: `Written to steam_settings/achievements.json${result.has_global_pcts ? ' with global rarity data.' : '.'}`
                                });
                            } catch (e: any) {
                                toast.error("Generation failed", { description: String(e) });
                            } finally {
                                setIsGeneratingAch(false);
                            }
                        }}
                        disabled={isGeneratingAch || !appIdInput || isSyncingSteam}
                        className="w-full py-3 bg-yellow-500/10 hover:bg-yellow-500/20 disabled:opacity-40 border border-yellow-500/20 text-yellow-400 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                        {isGeneratingAch ? (
                            <><div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /> Generating...</>
                        ) : (
                            <><Trophy size={14} /> Generate steam_settings/achievements.json</>
                        )}
                    </button>
                    <button
                        onClick={async () => {
                            if (!gameToEdit.install_dir) {
                                toast.error("No install directory", { description: "The game must have a valid install directory." });
                                return;
                            }
                            setIsSyncingSteam(true);
                            try {
                                await invoke("sync_steam_achievements", {
                                    id: gameToEdit.id,
                                    steamAppId: appIdInput,
                                    installDir: gameToEdit.install_dir
                                });
                                toast.success("Synced from Steam", {
                                    description: "Achievements updated directly from the Steam Client."
                                });
                            } catch (e: any) {
                                toast.error("Sync failed", { description: String(e) });
                            } finally {
                                setIsSyncingSteam(false);
                            }
                        }}
                        disabled={isGeneratingAch || !appIdInput || isSyncingSteam}
                        className="w-full py-3 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-40 border border-blue-500/20 text-blue-400 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                        {isSyncingSteam ? (
                            <><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> Syncing...</>
                        ) : (
                            <><Trophy size={14} /> Sync Steam Achievements (SAM)</>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Manual Override Paths ─────────────────────────── */}
            <div className="bg-accent/5 border border-accent/15 p-5 rounded-2xl flex gap-4 items-start shadow-inner">
                <Trophy className="text-accent shrink-0 mt-0.5" size={18} />
                <div>
                    <h4 className="text-accent text-xs font-black uppercase tracking-widest mb-1.5">Manual Path Overrides</h4>
                    <p className="text-white/40 text-[11px] leading-relaxed font-semibold">
                        Point the launcher directly to your definition and progress files if auto-detection doesn't find them automatically.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Metadata Path (achievements.json)</Label>
                    <div className="flex gap-2">
                        <input type="text" value={manualAchPath} onChange={(e) => setManualAchPath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} placeholder="C:\Games\...\achievements.json" />
                        <button onClick={handlePickAchMeta} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                            <FolderOpen size={13} />
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Progress File (achievements.ini / .json / .xml)</Label>
                    <div className="flex gap-2">
                        <input type="text" value={manualSavePath} onChange={(e) => setManualSavePath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} placeholder="C:\...\achievements.ini" />
                        <button onClick={handlePickAchSave} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                            <FolderOpen size={13} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="pt-4 flex justify-end gap-3">
                <button onClick={() => { setManualAchPath(""); setManualSavePath(""); }} disabled={!manualAchPath && !manualSavePath} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-30">
                    <RefreshCcw size={12} /> Reset to Auto
                </button>
            </div>
        </div>
    );
}
