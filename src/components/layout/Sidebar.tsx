import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDownloadsStore } from "../../store/downloadsStore";
import { useProfileStore } from "../../store/profileStore";
import { useUiStore } from "../../store/uiStore";
import { useProcessStore } from "../../store/processStore";
import { Globe, Library as LibraryIcon, Star, Download, Settings, User, Plus, ShoppingCart, CloudOff } from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
    { path: "/discover", label: "Discover", icon: <Globe size={24} strokeWidth={1.5} /> },
    { path: "/browse", label: "Store", icon: <ShoppingCart size={24} strokeWidth={1.5} /> },
    { path: "/library", label: "Library", icon: <LibraryIcon size={24} strokeWidth={1.5} /> },
    { path: "/favorites", label: "Favorites", icon: <Star size={24} strokeWidth={1.5} /> },
    { path: "/downloads", label: "Downloads", icon: <Download size={24} strokeWidth={1.5} /> },
    { path: "/settings", label: "Settings", icon: <Settings size={24} strokeWidth={1.5} /> },
];

function Tooltip({ children, label }: { children: React.ReactNode, label: string }) {
    return (
        <div className="relative group">
            {children}
            <div className="absolute left-[calc(100%+16px)] top-1/2 -translate-y-1/2 px-3 py-1.5 bg-black/80 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 origin-left z-50 whitespace-nowrap">
                <span className="text-[11px] font-bold text-white tracking-widest uppercase">{label}</span>
            </div>
        </div>
    );
}

export function Sidebar() {
    const location = useLocation();
    
    const downloads = useDownloadsStore(s => s.downloads);
    const activeDownloads = downloads.filter(d => d.state !== "Finished" && d.progress_percent < 100).length;
    
    const { profile } = useProfileStore();
    const setAddGameModalOpen = useUiStore((s) => s.setAddGameModalOpen);
    const setAuthModalOpen = useUiStore((s) => s.setAuthModalOpen);
    
    const runningGames = useProcessStore(s => s.running);
    const activeGames = Object.values(runningGames);

    return (
        <div className="flex-shrink-0 w-[88px] h-full bg-black/40 backdrop-blur-3xl border-r border-white/5 relative flex flex-col z-50 overflow-visible">
            
            {/* Top Logo Area */}
            <div className="pt-8 pb-6 flex items-center justify-center relative">
                <div className="w-14 h-14 flex items-center justify-center rounded-2xl relative group overflow-hidden tech-card hover:shadow-[0_0_30px_rgba(34,211,238,0.2)] transition-all duration-500">
                    <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <img src="/cl_logo.png" alt="Chira" className="w-8 h-8 object-contain drop-shadow-[0_0_12px_rgba(34,211,238,0.6)] relative z-10 group-hover:scale-110 transition-transform duration-500" />
                </div>
            </div>

            {/* Navigation Rail */}
            <nav className="flex flex-col gap-4 px-4 flex-1 relative z-10 mt-6 overflow-visible">
                {NAV_ITEMS.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                        <Tooltip key={item.path} label={item.label}>
                            <Link
                                to={item.path}
                                className="relative flex items-center justify-center w-14 h-14 mx-auto rounded-2xl transition-all duration-500 group"
                            >
                                {/* Background hover/active pill */}
                                <div className={cn(
                                    "absolute inset-0 rounded-2xl transition-all duration-500",
                                    isActive ? "bg-accent/10 border border-accent/20 shadow-[0_0_20px_rgba(var(--color-accent),0.15)] scale-100" 
                                             : "bg-transparent border border-transparent scale-95 group-hover:bg-white/[0.04] group-hover:scale-100"
                                )} />
                                
                                {/* Active Indicator Bar */}
                                <AnimatePresence>
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebarActiveIndicator"
                                            className="absolute -left-[16px] w-[4px] h-8 bg-accent rounded-r-full shadow-[0_0_12px_rgba(var(--color-accent),0.8)]"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                        />
                                    )}
                                </AnimatePresence>

                                {/* Icon */}
                                <span className={cn(
                                    "relative z-10 transition-all duration-500",
                                    isActive ? "text-accent drop-shadow-[0_0_10px_rgba(var(--color-accent),0.5)] scale-110" 
                                             : "text-white/30 group-hover:text-white/80 group-hover:scale-110"
                                )}>
                                    {item.icon}
                                </span>

                                {/* Download Badge */}
                                {item.path === "/downloads" && activeDownloads > 0 && (
                                    <span className="absolute top-1 right-1 bg-accent w-3 h-3 rounded-full border-2 border-background shadow-[0_0_10px_rgba(var(--color-accent),0.8)] animate-pulse" />
                                )}
                            </Link>
                        </Tooltip>
                    );
                })}
            </nav>

            {/* Bottom Actions Area */}
            <div className="pb-8 px-4 mt-auto flex flex-col gap-4 relative z-10 items-center overflow-visible">
                
                {!profile?.is_cloud_synced && (
                    <Tooltip label="Connect Identity">
                        <button
                            onClick={() => setAuthModalOpen(true)}
                            className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] group"
                        >
                            <CloudOff size={22} className="text-blue-400 group-hover:scale-110 transition-transform" />
                        </button>
                    </Tooltip>
                )}

                <Tooltip label="Add Game">
                    <button
                        onClick={() => setAddGameModalOpen(true)}
                        className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 bg-accent/10 border border-accent/20 hover:bg-accent/20 hover:shadow-[0_0_20px_rgba(var(--color-accent),0.3)] group"
                    >
                        <Plus size={24} className="text-accent group-hover:scale-110 transition-transform" />
                    </button>
                </Tooltip>

                <Tooltip label={profile?.username || "Guest Profile"}>
                    <Link to="/user" className="mt-2 w-14 h-14 rounded-2xl relative group flex items-center justify-center tech-card hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all duration-500 cursor-pointer overflow-hidden border border-white/10 group-hover:border-white/30">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                            <div className="w-full h-full bg-white/[0.02] flex items-center justify-center text-white/20 group-hover:text-white transition-colors">
                                <User size={24} />
                            </div>
                        )}
                        
                        {/* Status Ring */}
                        <div className={cn(
                            "absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full border-[2.5px] border-background z-20",
                            activeGames.length > 0 ? "bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]" : (profile?.is_cloud_synced ? "bg-accent shadow-[0_0_10px_rgba(var(--color-accent),0.8)]" : "bg-white/30")
                        )} />
                    </Link>
                </Tooltip>

            </div>
        </div>
    );
}