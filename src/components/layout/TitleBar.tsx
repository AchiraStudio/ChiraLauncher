import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { motion } from "framer-motion";

export function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false);
    const appWindow = getCurrentWindow();

    useEffect(() => {
        // Sync maximized state on mount
        appWindow.isMaximized().then(setIsMaximized).catch(() => {});

        // Listen for window resize events to update maximize button icon
        const unlisten = appWindow.onResized(() => {
            appWindow.isMaximized().then(setIsMaximized).catch(() => {});
        });

        return () => { unlisten.then(fn => fn()); };
    }, []);

    const handleMinimize = async () => {
        try { await appWindow.minimize(); } catch (e) { console.error(e); }
    };

    const handleMaximize = async () => {
        try {
            if (isMaximized) {
                await appWindow.unmaximize();
            } else {
                await appWindow.maximize();
            }
            setIsMaximized(!isMaximized);
        } catch (e) { console.error(e); }
    };

    const handleClose = async () => {
        try { await appWindow.close(); } catch (e) { console.error(e); }
    };

    const handleDblClick = () => handleMaximize();

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.buttons === 1) {
            appWindow.startDragging().catch(console.error);
        }
    };

    return (
        <div
            className="flex-shrink-0 w-full h-9 flex items-center relative select-none z-[200] bg-transparent"
        >
            {/* Drag region — full bar except the control buttons */}
            <div
                data-tauri-drag-region="true"
                className="flex-1 h-full flex items-center pl-4 gap-3 overflow-hidden cursor-default"
                onDoubleClick={handleDblClick}
                onMouseDown={handleMouseDown}
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
                    onClick={handleMaximize}
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
