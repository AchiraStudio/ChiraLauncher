import { cn } from "../../../lib/utils";
import { FolderOpen, X, Plus, Music, Play, Trophy } from "lucide-react";
import { useLocalImage } from "../../../hooks/useLocalImage";
import { TrackListItem } from "../../ui/TrackListItem";
import { smartAudio } from "../../../services/SmartAudio";
import { Label, inputCls } from "./EditGameGeneralTab";

function ImagePreview({ path, aspect, placeholder, isLogo = false }: { path: string | null; aspect: string; placeholder: string; isLogo?: boolean }) {
    const cleanPath = path ? path.split("?pos=")[0] : "";
    const { src, error } = useLocalImage(cleanPath);

    const [, focalStr] = path ? path.split("?pos=") : ["", ""];
    const objectPosition = focalStr?.replace("-", " ") || "center";

    return (
        <div className={cn("rounded-xl bg-black/45 border border-white/5 overflow-hidden flex items-center justify-center text-white/10 shrink-0 relative shadow-inner", aspect)}>
            {src && !error ? (
                <>
                    {isLogo && (
                        <img
                            src={src}
                            alt=""
                            className="absolute inset-0 w-full h-full object-contain blur-xl opacity-20 brightness-150 p-4 pointer-events-none"
                        />
                    )}
                    <img
                        src={src}
                        alt=""
                        className={cn(
                            "absolute inset-0 w-full h-full transition-transform duration-500",
                            isLogo ? "object-contain p-4 drop-shadow-lg" : "object-cover"
                        )}
                        style={{ objectPosition }}
                    />
                </>
            ) : (
                <span className="relative z-10 text-2xl font-black opacity-20 select-none uppercase tracking-tighter italic">{placeholder}</span>
            )}
        </div>
    );
}

export function EditGameMediaTab({
    coverPath, setCoverPath,
    backgroundPath, setBackgroundPath,
    logoPath, setLogoPath,
    focalPoint, setFocalPoint,
    customAchSoundPath, setCustomAchSoundPath,
    customBgmPaths, setCustomBgmPaths,
    handlePickImage, handlePickAudio,
    moveTrack, removeTrack,
    gameId
}: any) {
    return (
        <div className="space-y-6">

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
                        <button onClick={() => setCoverPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1 mt-1">
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
                        <select value={focalPoint} onChange={(e) => setFocalPoint(e.target.value)} className="bg-white/5 border border-white/10 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded outline-none text-white/60 [&>option]:bg-[#0f1423] [&>option]:text-white">
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
                        <button onClick={() => setBackgroundPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1 mt-1">
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
                        <button onClick={() => setLogoPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1 mt-1">
                            <X size={11} /> Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="border-t border-white/5" />

            <div className="space-y-5">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Custom Background Music Playlist</Label>
                        <button onClick={() => handlePickAudio("bgm")} className="bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                            <Plus size={14} /> Add Tracks
                        </button>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-2xl p-2 max-h-[150px] overflow-y-auto custom-scrollbar shadow-inner space-y-1">
                        {customBgmPaths.length === 0 ? (
                            <div className="py-6 flex flex-col items-center justify-center text-white/20 gap-2">
                                <Music size={20} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">No Custom Tracks</span>
                            </div>
                        ) : (
                            customBgmPaths.map((path: string, i: number) => (
                                <TrackListItem
                                    key={i}
                                    path={path}
                                    index={i}
                                    totalTracks={customBgmPaths.length}
                                    onMove={moveTrack}
                                    onRemove={removeTrack}
                                    size={12}
                                />
                            ))
                        )}
                    </div>
                    {customBgmPaths.length > 0 && (
                        <div className="flex justify-end gap-2 mt-2">
                            <button onClick={() => smartAudio.playGameBGM(gameId, customBgmPaths)} className="bg-accent/10 hover:bg-accent/20 text-accent px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all border border-accent/20 flex items-center gap-2">
                                <Play size={12} fill="currentColor" /> Preview Playlist
                            </button>
                            <button onClick={() => { setCustomBgmPaths([]); smartAudio.playGlobalBGM(); }} className="text-red-400/60 hover:text-red-400 px-4 py-2 bg-red-500/5 hover:bg-red-500/10 rounded-xl border border-red-500/10 transition-colors text-[10px] font-bold uppercase tracking-widest">
                                Clear All
                            </button>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>Custom Achievement Sound</Label>
                    <div className="flex gap-2">
                        <Trophy size={16} className="mt-2.5 text-yellow-500/40 shrink-0" />
                        <input type="text" value={customAchSoundPath} onChange={(e) => setCustomAchSoundPath(e.target.value)} className={cn(inputCls, "flex-1 text-xs font-mono")} placeholder="C:\Sounds\unlock.wav" />
                        {customAchSoundPath && (
                            <button onClick={() => smartAudio.playAchievement(customAchSoundPath)} className="shrink-0 bg-accent/10 hover:bg-accent/20 text-accent px-4 py-3 rounded-xl font-bold text-xs transition-all border border-accent/20 flex items-center justify-center" title="Preview Sound">
                                <Play size={14} fill="currentColor" />
                            </button>
                        )}
                        <button onClick={() => handlePickAudio("achievement")} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-1.5">
                            <FolderOpen size={13} />
                        </button>
                    </div>
                    <p className="text-white/30 text-[10px] ml-6">The toast duration will automatically match the length of this sound file (minimum 3 seconds).</p>
                    {customAchSoundPath && (
                        <button onClick={() => setCustomAchSoundPath("")} className="text-red-400/60 hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1 ml-6 mt-1">
                            <X size={11} /> Clear Sound
                        </button>
                    )}
                </div>
            </div>

        </div>
    );
}
