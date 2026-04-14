import { useEffect } from "react";
import { motion } from "framer-motion";
import { Activity, Gamepad2 } from "lucide-react";
import { useLocalImage } from "./hooks/useLocalImage";
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export function LaunchSplash() {
    // Extract parameters passed through the WebviewWindow URL
    const searchParams = new URLSearchParams(window.location.search);
    const title = searchParams.get("title") || "Unknown Game";
    const coverPath = searchParams.get("cover") || "";
    
    // Strip focal point modifier if present to load correctly
    const cleanPath = coverPath ? coverPath.split("?pos=")[0] : "";
    const { src } = useLocalImage(cleanPath);

    useEffect(() => {
        // Automatically close this splash window after 4 seconds
        setTimeout(() => {
            if (window.__TAURI_INTERNALS__) {
                getCurrentWebviewWindow().close();
            }
        }, 4000);
    }, []);

    return (
        <div className="w-screen h-screen bg-[#0a0f18]/95 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center p-6 gap-6 overflow-hidden relative shadow-2xl">
            {/* Ambient Glow */}
            <div className="absolute top-0 left-1/4 w-1/2 h-1 bg-blue-500/50 blur-xl" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/20 blur-[60px] rounded-full" />

            <div className="w-20 h-28 rounded-xl bg-black/50 border border-white/10 overflow-hidden shrink-0 shadow-lg relative z-10">
                {src ? (
                    <img src={src} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20"><Gamepad2 size={24} /></div>
                )}
            </div>

            <div className="flex flex-col relative z-10 flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                    <Activity size={14} className="text-blue-400 animate-pulse" />
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Initializing Core</span>
                </div>
                <h1 className="text-xl font-black text-white uppercase tracking-tight truncate">{title}</h1>
                <p className="text-white/40 text-xs mt-1 font-medium">Routing through secure overlay...</p>
                
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-4">
                    <motion.div 
                        className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 3.5, ease: "linear" }}
                    />
                </div>
            </div>
        </div>
    );
}