import { cn } from "../../../lib/utils";
import { FolderOpen, Hash, User2, Calendar, Monitor } from "lucide-react";

export function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-white/35 text-[10px] font-black tracking-widest uppercase block mb-2">{children}</label>;
}

export const inputCls = "w-full bg-black/30 border border-white/10 focus:border-accent/60 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none transition-all placeholder:text-white/15";

export function EditGameGeneralTab({
    title, setTitle,
    exePath, setExePath,
    launchArgs, setLaunchArgs,
    appIdInput, setAppIdInput,
    developer, setDeveloper,
    releaseDate, setReleaseDate,
    genre, setGenre,
    handlePickExe
}: any) {
    return (
        <div className="space-y-5">
            <div>
                <Label>Game Title</Label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
            </div>
            <div>
                <Label>Main Game Executable</Label>
                <div className="flex gap-2">
                    <input type="text" value={exePath} onChange={(e) => setExePath(e.target.value)} className={cn(inputCls, "flex-1 font-mono text-xs")} />
                    <button onClick={handlePickExe} className="shrink-0 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-4 rounded-xl font-bold text-xs transition-all border border-white/10 flex items-center gap-2">
                        <FolderOpen size={14} /> Browse
                    </button>
                </div>
                <p className="text-white/30 text-[10px] mt-1 ml-1">The primary game executable (e.g. Game.exe, or Shipping.exe for Unreal Engine).</p>
            </div>

            <div>
                <Label>Custom Launch Arguments</Label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={launchArgs}
                        onChange={(e) => setLaunchArgs(e.target.value)}
                        className={cn(inputCls, "font-mono text-sm placeholder:text-white/20")}
                        placeholder="-novid -high -fullscreen"
                    />
                </div>
                <p className="text-white/30 text-[10px] mt-1 ml-1">Optional parameters appended when starting the executable.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>Steam App ID</Label>
                    <div className="relative">
                        <Hash size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                        <input type="number" value={appIdInput} onChange={(e) => setAppIdInput(e.target.value)} className={cn(inputCls, "pl-9 font-mono")} placeholder="e.g. 123456" />
                    </div>
                </div>
                <div>
                    <Label>Developer</Label>
                    <div className="relative">
                        <User2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                        <input type="text" value={developer} onChange={(e) => setDeveloper(e.target.value)} className={cn(inputCls, "pl-9")} />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>Release Date</Label>
                    <div className="relative">
                        <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                        <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className={cn(inputCls, "pl-9 [color-scheme:dark]")} />
                    </div>
                </div>
                <div>
                    <Label>Genre / Publisher</Label>
                    <div className="relative">
                        <Monitor size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
                        <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} className={cn(inputCls, "pl-9")} />
                    </div>
                </div>
            </div>
        </div>
    );
}
