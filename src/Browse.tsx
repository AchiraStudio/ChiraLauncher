import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Flame, Star, Download, ChevronRight, ChevronLeft, Tag } from "lucide-react";
import { cn } from "./lib/utils";

// ─── Placeholder Data (Wire this up to your API later!) ───
const HERO_GAMES = [
    {
        id: "h1",
        title: "Cyberpunk 2077",
        developer: "CD PROJEKT RED",
        image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/capsule_616x353.jpg",
        banner: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/library_hero.jpg",
        price: "$59.99",
        tags: ["Action", "RPG", "Sci-fi"]
    },
    {
        id: "h2",
        title: "Elden Ring",
        developer: "FromSoftware",
        image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/capsule_616x353.jpg",
        banner: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/library_hero.jpg",
        price: "$59.99",
        tags: ["Souls-like", "Dark Fantasy", "RPG"]
    },
    {
        id: "h3",
        title: "Helldivers 2",
        developer: "Arrowhead Game Studios",
        image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2081080/capsule_616x353.jpg",
        banner: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2081080/library_hero.jpg",
        price: "$39.99",
        tags: ["Co-op", "Shooter", "Multiplayer"]
    }
];

const TRENDING_GAMES = [
    { id: "t1", title: "Baldur's Gate 3", price: "$59.99", rating: 96, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/capsule_616x353.jpg" },
    { id: "t2", title: "Lethal Company", price: "$19.99", rating: 98, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1966720/capsule_616x353.jpg" },
    { id: "t3", title: "Palworld", price: "$9.99", rating: 97, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1623730/capsule_616x353.jpg" },
    { id: "t4", title: "Dragon's Dogma 2", price: "$59.99", rating: 95, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/capsule_616x353.jpg" }, // Reuse image for demo
    { id: "t5", title: "Red Dead Redemption 2", price: "$69.99", rating: 89, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/capsule_616x353.jpg" },
    { id: "t6", title: "Stardew Valley", price: "$29.99", rating: 98, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/413150/capsule_616x353.jpg" },
];

const CATEGORIES = ["All", "Action", "RPG", "Strategy", "Shooter", "Indie", "Multiplayer", "Survival"];

export function Browse() {
    const [activeHero, setActiveHero] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("All");

    // Auto-advance hero carousel
    useEffect(() => {
        const timer = setInterval(() => {
            setActiveHero((prev) => (prev + 1) % HERO_GAMES.length);
        }, 6000);
        return () => clearInterval(timer);
    }, []);

    const nextHero = () => setActiveHero((prev) => (prev + 1) % HERO_GAMES.length);
    const prevHero = () => setActiveHero((prev) => (prev - 1 + HERO_GAMES.length) % HERO_GAMES.length);

    const currentHero = HERO_GAMES[activeHero];

    return (
        // ── FIX: absolute inset-0 + flex-col to claim the full screen, 
        // while the inner main tag gets overflow-y-auto to fix the scroll bug! ──
        <div className="absolute inset-0 flex flex-col bg-[#08090f] text-white font-outfit">

            {/* Seamless unified background layer for the whole page */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.img
                        key={currentHero.id}
                        src={currentHero.banner}
                        alt=""
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        className="absolute top-0 left-0 w-full h-[70vh] object-cover opacity-30 saturate-150 blur-3xl"
                    />
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-b from-[#08090f]/40 via-[#08090f]/80 to-[#08090f]" />
            </div>

            {/* ── THE SCROLLABLE CONTAINER ── */}
            <main className="flex-1 h-full overflow-y-auto overflow-x-hidden custom-scrollbar relative z-10 scroll-smooth">

                {/* ── FLOATING SEARCH & FILTER BAR ── */}
                <div className="sticky top-0 z-50 px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6 pointer-events-none">
                    <div className="flex-1 w-full max-w-xl pointer-events-auto">
                        <div className="relative group">
                            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-cyan-400 transition-colors" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search the catalog..."
                                className="w-full bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[1.5rem] py-4 pl-14 pr-6 text-sm font-bold text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400/50 shadow-2xl transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 overflow-x-auto custom-scrollbar max-w-full pointer-events-auto pb-2 md:pb-0 hide-scroll">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={cn(
                                    "px-5 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap backdrop-blur-md shadow-lg",
                                    activeCategory === cat
                                        ? "bg-cyan-400 text-black shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                                        : "bg-black/40 border border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="px-8 lg:px-16 pb-24 max-w-[1600px] mx-auto mt-4">

                    {/* ── DYNAMIC HERO CAROUSEL ── */}
                    <section className="mb-20">
                        <div className="relative w-full aspect-[21/9] max-h-[600px] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] bg-black">
                            <AnimatePresence mode="wait">
                                <motion.img
                                    key={currentHero.id}
                                    src={currentHero.banner}
                                    alt={currentHero.title}
                                    initial={{ opacity: 0, scale: 1.05 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className="absolute inset-0 w-full h-full object-cover brightness-[0.6]"
                                />
                            </AnimatePresence>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent w-[70%]" />

                            {/* Hero Content */}
                            <div className="absolute inset-0 p-12 lg:p-20 flex flex-col justify-end pointer-events-none">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={currentHero.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        transition={{ duration: 0.5, delay: 0.2 }}
                                        className="max-w-2xl pointer-events-auto"
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="px-3 py-1 rounded-lg bg-cyan-400/20 border border-cyan-400/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest backdrop-blur-md">Featured</span>
                                            <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">{currentHero.developer}</span>
                                        </div>
                                        <h1 className="text-5xl lg:text-7xl font-black tracking-tighter text-white drop-shadow-lg mb-6 leading-tight">
                                            {currentHero.title}
                                        </h1>

                                        <div className="flex items-center gap-3 mb-8">
                                            {currentHero.tags.map(tag => (
                                                <span key={tag} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-[10px] font-bold uppercase tracking-widest backdrop-blur-md flex items-center gap-1.5">
                                                    <Tag size={10} /> {tag}
                                                </span>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-6">
                                            <button className="px-10 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-cyan-300 text-black font-black text-xs uppercase tracking-widest shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:brightness-110 transition-all active:scale-95 flex items-center gap-3">
                                                <Download size={16} strokeWidth={3} /> Get - {currentHero.price}
                                            </button>
                                            <button className="w-14 h-14 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-95">
                                                <Star size={20} />
                                            </button>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Carousel Controls */}
                            <div className="absolute right-8 bottom-8 flex items-center gap-3">
                                <button onClick={prevHero} className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-90">
                                    <ChevronLeft size={20} />
                                </button>
                                <div className="flex gap-2 px-2">
                                    {HERO_GAMES.map((_, i) => (
                                        <div key={i} className={cn("h-1.5 rounded-full transition-all duration-500", i === activeHero ? "w-6 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]" : "w-2 bg-white/20")} />
                                    ))}
                                </div>
                                <button onClick={nextHero} className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-90">
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* ── TRENDING GRID ── */}
                    <section>
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                                <Flame className="text-orange-500" size={28} /> Trending Now
                            </h2>
                            <button className="text-xs font-bold text-white/50 hover:text-cyan-400 uppercase tracking-widest transition-colors flex items-center gap-1">
                                View All <ChevronRight size={14} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {TRENDING_GAMES.map((game) => (
                                <motion.div
                                    key={game.id}
                                    whileHover={{ y: -8 }}
                                    className="group cursor-pointer rounded-[2rem] bg-black/40 backdrop-blur-xl border border-white/5 p-4 transition-all hover:bg-white/[0.04] hover:border-white/15 shadow-xl hover:shadow-2xl"
                                >
                                    <div className="w-full aspect-[16/9] rounded-[1.25rem] overflow-hidden mb-4 relative bg-black/50 border border-white/5 shadow-inner">
                                        <img src={game.image} alt={game.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1.5 shadow-md">
                                            <Star size={10} className="text-yellow-400" fill="currentColor" />
                                            <span className="text-[10px] font-black text-white">{game.rating}</span>
                                        </div>
                                        {/* Overlay Hover Play Button */}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="w-12 h-12 rounded-full bg-cyan-400 text-black flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.5)] transform scale-75 group-hover:scale-100 transition-transform duration-300 delay-75">
                                                <Search size={20} strokeWidth={3} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="px-2">
                                        <h3 className="text-sm font-bold text-white truncate mb-2 group-hover:text-cyan-400 transition-colors">{game.title}</h3>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-white/50 uppercase tracking-widest">{game.price}</span>
                                            <button className="w-8 h-8 rounded-xl bg-white/5 group-hover:bg-cyan-400/10 flex items-center justify-center text-white/40 group-hover:text-cyan-400 transition-colors">
                                                <Download size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </section>

                </div>
            </main>

            {/* Quick tip: If AppLayout is causing the issue elsewhere, ensure the layout container holding the `<Outlet />` isn't forcing overflow-hidden on its children! */}
        </div>
    );
}