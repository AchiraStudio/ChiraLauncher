import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDownloadsStore } from "../../store/downloadsStore";
import { useProfileStore } from "../../store/profileStore";
import { useUiStore } from "../../store/uiStore";
import { Globe, Library as LibraryIcon, Star, Download, Settings, Pin, PinOff, User, Plus } from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
    { path: "/browse", label: "Browse", icon: <Globe size={20} /> },
    { path: "/library", label: "Library", icon: <LibraryIcon size={20} /> },
    { path: "/favorites", label: "Favorites", icon: <Star size={20} /> },
    { path: "/downloads", label: "Downloads", icon: <Download size={20} /> },
    { path: "/settings", label: "Settings", icon: <Settings size={20} /> },
];

export function Sidebar() {
    const location = useLocation();
    const [isPinned, setIsPinned] = useState(() => {
        return localStorage.getItem("sidebarPinned") !== "false";
    });
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        localStorage.setItem("sidebarPinned", isPinned.toString());
    }, [isPinned]);

    const downloads = useDownloadsStore(s => s.downloads);
    const activeDownloads = downloads.filter(d => d.state !== "Finished" && d.progress_percent < 100).length;
    const { profile } = useProfileStore();
    const setAddGameModalOpen = useUiStore((s) => s.setAddGameModalOpen);

    const isOpen = isPinned || isHovered;

    return (
        <motion.div
            initial={false}
            animate={{ width: isOpen ? 260 : 88 }}
            className="flex-shrink-0 h-full bg-surface/40 backdrop-blur-3xl border-r border-white/5 relative flex flex-col z-50 transition-all duration-500 ease-[0.22,1,0.36,1]"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Logo Area */}
            <div className="p-6 flex items-center justify-between mb-8 overflow-hidden">
                <div className="flex items-center gap-5 translate-x-1">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 relative group/logo overflow-hidden">
                        <img
                            src="/cl_logo.png"
                            alt="ChiraLauncher"
                            className="w-full h-full object-contain drop-shadow-[0_0_12px_rgba(102,192,244,0.35)] group-hover/logo:scale-110 transition-transform duration-300"
                        />
                    </div>
                    <AnimatePresence>
                        {isOpen && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex flex-col"
                            >
                                <span className="font-bold text-white text-lg leading-none">Chira</span>
                                <span className="text-xs text-accent mt-1 opacity-80">v1.0.4</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {isOpen && (
                    <button
                        onClick={() => setIsPinned(!isPinned)}
                        className="text-white/10 hover:text-accent transition-all p-2 rounded-xl hover:bg-white/5"
                    >
                        {isPinned ? <Pin size={16} fill="currentColor" /> : <PinOff size={16} />}
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex flex-col gap-3 px-4 flex-1">
                {NAV_ITEMS.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                "flex items-center gap-5 px-4 py-4 rounded-2xl transition-all duration-300 relative group overflow-hidden border border-transparent",
                                isActive ? "bg-accent/[0.08] border-accent/20 shadow-[0_0_25px_rgba(102,192,244,0.1)]" : "hover:bg-white/[0.02]"
                            )}
                        >
                            <span className={cn(
                                "shrink-0 transition-all duration-300",
                                isActive ? "text-accent scale-110 drop-shadow-[0_0_12px_rgba(102,192,244,0.5)]" : "text-white/20 group-hover:text-white/60"
                            )}>
                                {item.icon}
                            </span>

                            <AnimatePresence>
                                {isOpen && (
                                    <motion.span
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className={cn(
                                            "font-medium text-sm transition-all",
                                            isActive ? "text-white" : "text-white/20 group-hover:text-white/60"
                                        )}
                                    >
                                        {item.label}
                                    </motion.span>
                                )}
                            </AnimatePresence>

                            {item.path === "/downloads" && activeDownloads > 0 && (
                                <AnimatePresence>
                                    {isOpen ? (
                                        <motion.span
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="ml-auto bg-accent text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-md shadow-sm"
                                        >
                                            {activeDownloads}
                                        </motion.span>
                                    ) : (
                                        <span className="absolute top-3 right-3 bg-accent w-2.5 h-2.5 rounded-full border-2 border-[#121216] shadow-lg shadow-accent/40" />
                                    )}
                                </AnimatePresence>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Section: Add Game + Profile */}
            <div className="p-4 mt-auto flex flex-col gap-2">
                {/* Add Game Button */}
                <button
                    onClick={() => setAddGameModalOpen(true)}
                    className={cn(
                        "flex items-center gap-4 w-full p-4 rounded-2xl transition-all duration-300 overflow-hidden whitespace-nowrap border group relative",
                        "bg-accent/10 border-accent/20 hover:bg-accent/20 hover:border-accent/40 hover:shadow-[0_0_20px_rgba(102,192,244,0.15)]"
                    )}
                >
                    <div className="w-5 h-5 shrink-0 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <Plus size={20} strokeWidth={2.5} />
                    </div>
                    <AnimatePresence>
                        {isOpen && (
                            <motion.span
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="font-bold text-sm text-accent"
                            >
                                Add Game
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>

                {/* Profile */}
                <Link to="/user" className="flex items-center gap-4 w-full p-4 rounded-3xl transition-all hover:bg-white/[0.03] overflow-hidden whitespace-nowrap border border-transparent hover:border-white/5 cursor-pointer group shadow-2xl relative">
                    <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-12 h-12 rounded-[1.2rem] border border-white/5 group-hover:border-accent/40 overflow-hidden shrink-0 shadow-2xl transition-all duration-500 relative z-10">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                            <div className="w-full h-full bg-white/[0.02] flex items-center justify-center text-white/10 group-hover:text-accent/40 transition-colors">
                                <User size={24} />
                            </div>
                        )}
                    </div>
                    <AnimatePresence>
                        {isOpen && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex flex-col relative z-10 overflow-hidden"
                            >
                                <span className="text-white text-sm font-semibold truncate">
                                    {profile?.username || "Guest"}
                                </span>
                                <span className="text-accent text-xs flex items-center gap-1.5 mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(102,192,244,0.8)]" />
                                    Online
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Link>
            </div>
        </motion.div>
    );
}
