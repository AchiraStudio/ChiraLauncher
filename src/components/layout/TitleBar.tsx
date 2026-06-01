import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { motion } from "framer-motion";

export function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false);
    const appWindow = getCurrentWindow();

    // Used to detect double-click vs single-click on the drag region
    const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const DBLCLICK_THRESHOLD = 250; // ms

    useEffect(() => {
        // Sync maximized state on mount
        appWindow.isMaximized().then(setIsMaximized).catch(() => {});

        // Always keep state in sync with OS window events
        const unlisten = appWindow.onResized(() => {
            appWindow.isMaximized().then(setIsMaximized).catch(() => {});
        });

        return () => { unlisten.then(fn => fn()); };
    }, []);

    const handleMinimize = async () => {
        try { await appWindow.minimize(); } catch (e) { console.error(e); }
    };

    const handleToggleMaximize = async () => {
        try {
            // Always read the real state from the OS before toggling
            const maximized = await appWindow.isMaximized();
            if (maximized) {
                await appWindow.unmaximize();
                setIsMaximized(false);
            } else {
                await appWindow.maximize();
                setIsMaximized(true);
            }
        } catch (e) { console.error(e); }
    };

    const handleClose = async () => {
        try { await appWindow.close(); } catch (e) { console.error(e); }
    };

    // On mousedown: wait DBLCLICK_THRESHOLD ms. If no second click comes,
    // start dragging. If a second click fires within that window, cancel
    // dragging and toggle maximize instead.
    const handleDragRegionMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // left button only

        if (clickTimer.current !== null) {
            // Second click within threshold → it's a double-click → toggle maximize
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
            handleToggleMaximize();
        } else {
            // First click — wait to see if a second comes
            clickTimer.current = setTimeout(() => {
                clickTimer.current = null;
                // No second click came → start dragging
                appWindow.startDragging().catch(console.error);
            }, DBLCLICK_THRESHOLD);
        }
    };

    return (
        <div className="flex-shrink-0 w-full h-9 flex items-center relative select-none z-[200] bg-transparent">
            {/* Drag region — full bar except the control buttons */}
            <div
                className="flex-1 h-full flex items-center pl-4 gap-3 overflow-hidden cursor-default"
                onMouseDown={handleDragRegionMouseDown}
            >
                {/* App logo + name */}
                <div className="flex items-center gap-2.5 pointer-events-none select-none">
                    <img
                        src="/cl_logo.png"
                        alt="Chira"
                        className="w-4 h-4 object-contain opacity-80"
                    />
                    <span className="text-white/40 text-[11px] font-bold tracking-[0.15em] uppercase">
                        ChiraLauncher
                    </span>
                </div>
            </div>

            {/* Animated accent underline */}
            <motion.div
                className="absolute bottom-0 left-0 h-px"
                style={{
                    background: "linear-gradient(90deg, transparent 0%, var(--color-accent, #22d3ee) 40%, var(--color-accent, #22d3ee) 60%, transparent 100%)",
                    opacity: 0.25,
                    width: "100%"
                }}
            />

            {/* Windows Control Buttons */}
            <div className="flex items-stretch h-full shrink-0">
                {/* Minimize */}
                <button
                    onClick={handleMinimize}
                    className="group w-11 h-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/[0.07] transition-all duration-150 focus:outline-none"
                    aria-label="Minimize"
                    title="Minimize"
                >
                    <Minus
                        size={11}
                        strokeWidth={2.5}
                        className="group-hover:scale-110 transition-transform"
                    />
                </button>

                {/* Maximize / Restore */}
                <button
                    onClick={handleToggleMaximize}
                    className="group w-11 h-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/[0.07] transition-all duration-150 focus:outline-none"
                    aria-label={isMaximized ? "Restore" : "Maximize"}
                    title={isMaximized ? "Restore" : "Maximize"}
                >
                    {isMaximized ? (
                        /* Restore icon — two overlapping squares */
                        <svg
                            width="11" height="11"
                            viewBox="0 0 10 10"
                            fill="none"
                            className="group-hover:scale-110 transition-transform"
                        >
                            <rect x="2.5" y="0" width="7.5" height="7.5" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                            <rect x="0" y="2.5" width="7.5" height="7.5" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" style={{ background: "var(--bg)" }}/>
                        </svg>
                    ) : (
                        <Square
                            size={11}
                            strokeWidth={1.8}
                            className="group-hover:scale-110 transition-transform"
                        />
                    )}
                </button>

                {/* Close */}
                <button
                    onClick={handleClose}
                    className="group w-11 h-full flex items-center justify-center text-white/30 hover:text-white hover:bg-red-500 transition-all duration-150 focus:outline-none"
                    aria-label="Close"
                    title="Close"
                >
                    <X
                        size={12}
                        strokeWidth={2.5}
                        className="group-hover:scale-110 transition-transform"
                    />
                </button>
            </div>
        </div>
    );
}
