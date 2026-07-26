import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useHttpStore } from "../../store/httpStore";
import { useUiStore } from "../../store/uiStore";
import { useProcessStore } from "../../store/processStore";
import { useProfileStore } from "../../store/profileStore";
import { useDevConsoleStore } from "../../store/devConsoleStore";
import { Library as LibraryIcon, Star, Download, Settings, User, Plus, Terminal } from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
    { path: "/library", label: "Library", icon: <LibraryIcon size={22} strokeWidth={1.75} /> },
    { path: "/favorites", label: "Favorites", icon: <Star size={22} strokeWidth={1.75} /> },
    { path: "/downloads", label: "Downloads", icon: <Download size={22} strokeWidth={1.75} /> },
    { path: "/settings", label: "Settings", icon: <Settings size={22} strokeWidth={1.75} /> },
];

function Tooltip({ children, label }: { children: React.ReactNode, label: string }) {
    return (
        <div className="relative group">
            {children}
            <div className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#0a0f1c]/95 border border-white/15 rounded-md shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 origin-left z-50 whitespace-nowrap">
                <span className="font-mono text-[10px] font-semibold text-white/90 tracking-widest uppercase">{label}</span>
            </div>
        </div>
    );
}

export function Sidebar() {
    const location = useLocation();
    const { downloads: httpDownloads } = useHttpStore();
    const activeDownloads = httpDownloads.filter(d => d.state !== "Finished" && d.state !== "Error").length;

    const { profile } = useProfileStore();
    const setAddGameModalOpen = useUiStore((s) => s.setAddGameModalOpen);
    const runningGames = useProcessStore(s => s.running);
    const showDevButtons = useDevConsoleStore(s => s.showDevButtons);
    const toggleDevConsole = useDevConsoleStore(s => s.toggle);
    const activeGames = Object.values(runningGames);

    return (
        <div className="flex-shrink-0 w-[80px] h-full bg-[#0a0f1c]/70 backdrop-blur-xl border-r border-white/10 relative flex flex-col z-50 overflow-visible">

            {/* Top Logo Area */}
            <div className="pt-6 pb-4 flex items-center justify-center relative">
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/10 group hover:border-accent/40 transition-all duration-300 shadow-md">
                    <img src="/cl_logo.png" alt="Chira" className="w-7 h-7 object-contain drop-shadow-[0_0_10px_rgba(59,130,246,0.5)] group-hover:scale-110 transition-transform duration-300" />
                </div>
            </div>

            {/* Navigation Rail */}
            <nav className="flex flex-col gap-3.5 px-3 flex-1 relative z-10 mt-4 overflow-visible">
                {NAV_ITEMS.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                        <Tooltip key={item.path} label={item.label}>
                            <Link
                                to={item.path}
                                className="relative flex items-center justify-center w-13 h-13 mx-auto rounded-xl transition-all duration-300 group"
                            >
                                <div className={cn(
                                    "absolute inset-0 rounded-xl transition-all duration-300",
                                    isActive ? "bg-accent/15 border border-accent/30 shadow-[0_0_20px_rgba(59,130,246,0.2)] scale-100"
                                             : "bg-transparent border border-transparent hover:bg-white/[0.05]"
                                )} />

                                <AnimatePresence>
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebarActiveIndicator"
                                            className="absolute -left-[12px] w-[3.5px] h-7 bg-accent rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ type: "spring", stiffness: 350, damping: 28 }}
                                        />
                                    )}
                                </AnimatePresence>

                                <span className={cn(
                                    "relative z-10 transition-all duration-300",
                                    isActive ? "text-accent drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-105"
                                             : "text-white/40 group-hover:text-white/90 group-hover:scale-105"
                                )}>
                                    {item.icon}
                                </span>

                                {/* Download Badge */}
                                {item.path === "/downloads" && activeDownloads > 0 && (
                                    <span className="absolute top-1.5 right-1.5 bg-accent w-2.5 h-2.5 rounded-full border-2 border-background shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-pulse" />
                                )}
                            </Link>
                        </Tooltip>
                    );
                })}
            </nav>

            {/* Bottom Actions Area */}
            <div className="pb-6 px-3 mt-auto flex flex-col gap-3 relative z-10 items-center overflow-visible">
                {showDevButtons && (
                    <Tooltip label="Dev Console">
                        <button
                            onClick={toggleDevConsole}
                            className="w-13 h-13 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/[0.03] border border-white/10 hover:border-accent/40 hover:bg-accent/15 group"
                        >
                            <Terminal size={19} className="text-white/60 group-hover:text-accent group-hover:scale-110 transition-all" />
                        </button>
                    </Tooltip>
                )}

                <Tooltip label="Add Game">
                    <button
                        onClick={() => setAddGameModalOpen(true)}
                        className="w-13 h-13 rounded-xl flex items-center justify-center transition-all duration-300 bg-white/[0.03] border border-white/10 hover:border-accent/40 hover:bg-accent/15 group"
                    >
                        <Plus size={20} className="text-white/60 group-hover:text-accent group-hover:scale-110 transition-all" />
                    </button>
                </Tooltip>

                <Tooltip label={profile?.username || "Profile"}>
                    <Link to="/user" className="mt-1 w-13 h-13 rounded-xl relative group flex items-center justify-center bg-white/[0.03] border border-white/10 hover:border-white/30 transition-all duration-300 overflow-hidden">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/30 group-hover:text-white transition-colors">
                                <User size={20} />
                            </div>
                        )}
                        {/* Status Ring */}
                        <div className={cn(
                            "absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-background z-20",
                            activeGames.length > 0 ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-white/20"
                        )} />
                    </Link>
                </Tooltip>
            </div>
        </div>
    );
}