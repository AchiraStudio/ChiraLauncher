import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useUiStore } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";
import { AddGameModal } from "../modals/AddGameModal";
import { EditGameModal } from "../modals/EditGameModal";
import { DirectoryScannerModal } from "../modals/DirectoryScannerModal";
import { FolderBuilderModal } from "../modals/FolderBuilderModal";
import { LibrarySettingsModal } from "../modals/LibrarySettingsModal";
import { AppIdManagerModal } from "../modals/AppIdManagerModal";
import { DownloadManager } from "../ui/DownloadManager";
import { Sidebar } from "./Sidebar";
import { useLocalImage } from "../../hooks/useLocalImage";

function Modals() {
    return (
        <>
            <AddGameModal />
            <EditGameModal />
            <DirectoryScannerModal />
            <FolderBuilderModal />
            <LibrarySettingsModal />
            <AppIdManagerModal />
            <DownloadManager />
        </>
    );
}

function GlobalBackground() {
    const currentBgPath = useUiStore(s => s.currentBg);
    const { src: currentBg } = useLocalImage(currentBgPath);

    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
            {/* Layer 1: Static Base Gradient */}
            <div className="absolute inset-0 bg-background" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-from),_transparent_80%)] from-accent/10 to-transparent opacity-40" />

            {/* Layer 2: Dynamic Image Background */}
            <AnimatePresence mode="popLayout">
                {currentBg && (
                    <motion.div
                        key={currentBg}
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 0.25, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-0"
                    >
                        <img
                            src={currentBg}
                            alt=""
                            className="w-full h-full object-cover brightness-[0.6] saturate-[1.2] blur-[2px]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-background/40" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Layer 3: Interactive Glass Blobs */}
            <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] bg-accent/5 blur-[120px] rounded-full animate-pulse pointer-events-none" />
            <div className="absolute bottom-[0%] right-[0%] w-[500px] h-[500px] bg-accent/10 blur-[150px] rounded-full opacity-30 pointer-events-none" />
        </div>
    );
}

export function AppLayout() {
    const settings = useSettingsStore(s => s.settings);

    // Inject the user's custom accent color natively into the DOM variables!
    const customStyle = {
        '--color-accent': settings?.accent_color || '#3b82f6'
    } as React.CSSProperties;

    return (
        <div style={customStyle} className="h-screen w-screen bg-background text-text-primary overflow-hidden selection:bg-accent/30 selection:text-white flex flex-row relative">
            <GlobalBackground />
            <Toaster theme="dark" position="bottom-right" />
            <Sidebar />
            <Modals />
            <div className="flex-1 relative z-0 bg-transparent h-screen overflow-x-hidden overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <Outlet />
            </div>
        </div>
    );
}