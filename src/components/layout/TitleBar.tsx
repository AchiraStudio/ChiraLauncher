import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Search, Square, X, Copy, Terminal } from "lucide-react";
import { isTauri } from "../../lib/tauri";
import { useUiStore } from "../../store/uiStore";
import { useDevConsoleStore } from "../../store/devConsoleStore";
import { Kbd } from "../ui/controls";
import { cn } from "../../lib/utils";

const winBtn = "grid h-full w-11 place-items-center text-fg-mute transition-colors focus-visible:outline-offset-[-2px]";

export function TitleBar() {
    const [maximized, setMaximized] = useState(false);
    const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
    const showDev = useDevConsoleStore((s) => s.showDevButtons);
    const toggleDev = useDevConsoleStore((s) => s.toggle);

    useEffect(() => {
        if (!isTauri()) return;
        const w = getCurrentWindow();
        let t: ReturnType<typeof setTimeout>;
        const sync = () => w.isMaximized().then(setMaximized).catch(() => { });
        sync();
        // onResized fires continuously while dragging an edge: debounce the IPC round-trip
        const un = w.onResized(() => { clearTimeout(t); t = setTimeout(sync, 120); });
        return () => { clearTimeout(t); un.then((f) => f()); };
    }, []);

    const win = () => (isTauri() ? getCurrentWindow() : null);

    return (
        <div className="relative z-[200] flex h-10 shrink-0 select-none items-center border-b border-line bg-bg/90">
            {/* Native drag region: instant drag + OS-handled double-click maximise */}
            <div data-tauri-drag-region className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-4">
                <img data-tauri-drag-region src="/cl_logo.png" alt="" className="pointer-events-none h-[18px] w-[18px] object-contain" />
                <span data-tauri-drag-region className="pointer-events-none text-[13px] font-semibold tracking-tight text-fg-soft">ChiraLauncher</span>
            </div>

            <button
                onClick={() => setPaletteOpen(true)}
                className="absolute left-1/2 top-1/2 flex h-7 w-[min(360px,36vw)] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg border border-line bg-white/[0.04] px-3 text-[13px] text-fg-mute transition-colors hover:border-line-strong hover:bg-white/[0.07] hover:text-fg-soft"
                aria-label="Search games and actions"
            >
                <Search size={14} />
                <span className="flex-1 truncate text-left">Search games & actions</span>
                <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
            </button>

            <div className="flex h-full items-stretch">
                {showDev && (
                    <button onClick={toggleDev} aria-label="Developer console" title="Developer console" className={cn(winBtn, "hover:bg-white/[0.07] hover:text-accent")}>
                        <Terminal size={14} />
                    </button>
                )}
                <button onClick={() => win()?.minimize()} aria-label="Minimize" className={cn(winBtn, "hover:bg-white/[0.07] hover:text-fg")}>
                    <Minus size={15} />
                </button>
                <button onClick={() => win()?.toggleMaximize()} aria-label={maximized ? "Restore" : "Maximize"} className={cn(winBtn, "hover:bg-white/[0.07] hover:text-fg")}>
                    {maximized ? <Copy size={12} className="-scale-x-100" /> : <Square size={12} />}
                </button>
                <button onClick={() => win()?.close()} aria-label="Close" className={cn(winBtn, "hover:bg-[#e5484d] hover:text-white")}>
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
