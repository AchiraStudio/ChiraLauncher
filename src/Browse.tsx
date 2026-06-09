import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion";
import { Search, Flame, Star, Download, ChevronRight, Tag } from "lucide-react";
import { cn } from "./lib/utils";

// ─── Placeholder Data ───
const HERO_GAMES = [
    {
        id: "h1",
        title: "Cyberpunk 2077",
        developer: "CD PROJEKT RED",
        image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/capsule_616x353.jpg",
        banner: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/library_hero.jpg",
        logo: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/logo.png",
        price: "$59.99",
        tags: ["Action", "RPG", "Sci-fi", "Open World"],
        color: "from-yellow-400/20"
    },
    {
        id: "h2",
        title: "Elden Ring",
        developer: "FromSoftware",
        image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/capsule_616x353.jpg",
        banner: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/library_hero.jpg",
        logo: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/logo.png",
        price: "$59.99",
        tags: ["Souls-like", "Dark Fantasy", "RPG"],
        color: "from-amber-600/20"
    },
    {
        id: "h3",
        title: "Helldivers 2",
        developer: "Arrowhead Game Studios",
        image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2081080/capsule_616x353.jpg",
        banner: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2081080/library_hero.jpg",
        logo: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2081080/logo.png",
        price: "$39.99",
        tags: ["Co-op", "Shooter", "Multiplayer"],
        color: "from-blue-500/20"
    }
];

const TRENDING_GAMES = [
    { id: "t1", title: "Baldur's Gate 3", price: "$59.99", rating: 96, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1086940/capsule_616x353.jpg" },
    { id: "t2", title: "Lethal Company", price: "$19.99", rating: 98, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1966720/capsule_616x353.jpg" },
    { id: "t3", title: "Palworld", price: "$9.99", rating: 97, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1623730/capsule_616x353.jpg" },
    { id: "t4", title: "Dragon's Dogma 2", price: "$59.99", rating: 95, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2054970/capsule_616x353.jpg" }, 
    { id: "t5", title: "Red Dead Redemption 2", price: "$69.99", rating: 89, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1174180/capsule_616x353.jpg" },
    { id: "t6", title: "Stardew Valley", price: "$29.99", rating: 98, image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/413150/capsule_616x353.jpg" },
];

const CATEGORIES = ["Discover", "Action", "RPG", "Strategy", "Shooter", "Indie", "Multiplayer", "Survival"];

function TiltCard({ children, className }: { children: React.ReactNode, className?: string }) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
    const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });
    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["7deg", "-7deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-7deg", "7deg"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function Browse() {
    const [activeHero, setActiveHero] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("Discover");
    const containerRef = useRef<HTMLDivElement>(null);

    const { scrollY } = useScroll({ container: containerRef });
    const headerOpacity = useTransform(scrollY, [0, 150], [0, 1]);
    const heroY = useTransform(scrollY, [0, 500], [0, 150]);

    // Auto-advance hero carousel
    useEffect(() => {
        const timer = setInterval(() => {
            setActiveHero((prev) => (prev + 1) % HERO_GAMES.length);
        }, 8000);
        return () => clearInterval(timer);
    }, []);

    const currentHero = HERO_GAMES[activeHero];

    return (
        <div className="absolute inset-0 flex flex-col bg-[#050608] text-white font-outfit overflow-hidden">

            {/* Persistent Global Background Layer */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentHero.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className="absolute inset-0"
                    >
                        <img src={currentHero.banner} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.15] saturate-[1.2] blur-3xl scale-110" />
                        <div className={cn("absolute inset-0 bg-gradient-to-b via-transparent to-[#050608] opacity-60", currentHero.color)} />
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Floating Header */}
            <motion.div 
                style={{ opacity: headerOpacity }}
                className="absolute top-0 left-0 right-0 h-24 bg-black/50 backdrop-blur-3xl border-b border-white/5 z-50 pointer-events-none"
            />

            <div className="absolute top-0 left-0 right-0 z-50 px-10 py-6 flex items-center justify-between gap-8 pointer-events-none">
                <div className="flex-1 max-w-lg pointer-events-auto">
                    <div className="relative group">
                        <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-accent transition-colors" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search the grid..."
                            className="w-full bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[1.25rem] py-4 pl-14 pr-6 text-sm font-bold text-white placeholder:text-white/30 focus:outline-none focus:border-accent/50 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all"
                        />
                    </div>
                </div>

                <div className="flex gap-2 pointer-events-auto hide-scroll overflow-x-auto">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={cn(
                                "px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap backdrop-blur-md",
                                activeCategory === cat
                                    ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                    : "bg-black/30 border border-white/5 text-white/50 hover:text-white hover:bg-white/10"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scrollable Container */}
            <main ref={containerRef} className="flex-1 h-full overflow-y-auto overflow-x-hidden relative z-10 scroll-smooth custom-scrollbar">

                {/* Hero Section */}
                <section className="relative w-full h-[85vh] min-h-[700px] flex items-end pb-24 px-10 lg:px-20 overflow-hidden">
                    <motion.div style={{ y: heroY }} className="absolute inset-0 z-0">
                        <AnimatePresence mode="wait">
                            <motion.img
                                key={currentHero.id}
                                src={currentHero.banner}
                                alt={currentHero.title}
                                initial={{ opacity: 0, scale: 1.05 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="w-full h-full object-cover brightness-[0.65] saturate-[1.1] relative z-10"
                            />
                        </AnimatePresence>
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050608] via-[#050608]/40 to-transparent z-10" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#050608]/90 via-[#050608]/40 to-transparent w-[80%] z-10" />
                    </motion.div>

                    <div className="relative z-20 w-full max-w-[1600px] mx-auto flex justify-between items-end">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentHero.id}
                                initial={{ opacity: 0, x: -30, filter: "blur(10px)" }}
                                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                                exit={{ opacity: 0, x: 30, filter: "blur(10px)" }}
                                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                                className="max-w-3xl"
                            >
                                <div className="flex items-center gap-4 mb-6">
                                    <span className="px-4 py-1.5 rounded-lg bg-accent/20 border border-accent/30 text-accent text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-md shadow-[0_0_20px_rgba(var(--color-accent),0.2)]">Featured</span>
                                    <span className="text-white/50 text-[11px] font-bold uppercase tracking-[0.2em]">{currentHero.developer}</span>
                                </div>
                                
                                {currentHero.logo ? (
                                    <img src={currentHero.logo} alt={currentHero.title} className="w-auto h-[140px] object-contain mb-8 drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)]" />
                                ) : (
                                    <h1 className="text-7xl font-black tracking-tighter text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)] mb-8 leading-tight">
                                        {currentHero.title}
                                    </h1>
                                )}

                                <div className="flex items-center gap-3 mb-10 flex-wrap">
                                    {currentHero.tags.map(tag => (
                                        <span key={tag} className="px-4 py-2 rounded-xl bg-black/40 backdrop-blur-xl border border-white/10 text-white/80 text-[11px] font-black uppercase tracking-[0.15em] flex items-center gap-2 shadow-xl">
                                            <Tag size={12} className="text-accent/70" /> {tag}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex items-center gap-5">
                                    <button className="px-12 py-5 rounded-[1.25rem] bg-white text-black font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-[1.02] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)] transition-all active:scale-95 flex items-center gap-3">
                                        <Download size={18} strokeWidth={3} /> Install Now — {currentHero.price}
                                    </button>
                                    <button className="w-16 h-16 rounded-[1.25rem] bg-black/40 hover:bg-black/60 border border-white/10 flex items-center justify-center text-white backdrop-blur-2xl transition-all hover:scale-105 active:scale-95 shadow-xl">
                                        <Star size={24} />
                                    </button>
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        <div className="hidden lg:flex flex-col gap-3 shrink-0">
                            {HERO_GAMES.map((hero, i) => (
                                <button
                                    key={hero.id}
                                    onClick={() => setActiveHero(i)}
                                    className={cn(
                                        "w-[240px] h-[80px] rounded-2xl overflow-hidden relative group transition-all duration-500",
                                        i === activeHero ? "ring-2 ring-white scale-105 shadow-[0_0_30px_rgba(255,255,255,0.2)]" : "opacity-50 hover:opacity-100"
                                    )}
                                >
                                    <img src={hero.banner} className="absolute inset-0 w-full h-full object-cover brightness-50 group-hover:brightness-75 transition-all" />
                                    <div className="absolute inset-0 p-4 flex flex-col justify-end">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-white truncate">{hero.title}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <div className="px-10 lg:px-20 max-w-[1600px] mx-auto pb-32">
                    {/* Trending Grid */}
                    <section className="mb-20">
                        <div className="flex items-center justify-between mb-10">
                            <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-4 drop-shadow-lg">
                                <span className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.2)]">
                                    <Flame size={20} />
                                </span>
                                TRENDING NOW
                            </h2>
                            <button className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-black text-white/70 hover:text-white uppercase tracking-[0.2em] transition-all flex items-center gap-2 backdrop-blur-md">
                                View All <ChevronRight size={14} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-8">
                            {TRENDING_GAMES.map((game, i) => (
                                <motion.div
                                    key={game.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ duration: 0.5, delay: i * 0.05 }}
                                >
                                    <TiltCard className="group cursor-pointer">
                                        <div className="w-full aspect-[2/3] rounded-[2rem] overflow-hidden mb-5 relative bg-black/60 border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
                                            <img src={game.image} alt={game.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 group-hover:saturate-150 relative z-0" />
                                            
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30 opacity-80 z-10 pointer-events-none" />
                                            
                                            <div className="absolute top-4 right-4 z-20">
                                                <div className="bg-black/50 backdrop-blur-xl px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 shadow-xl">
                                                    <Star size={12} className="text-yellow-400" fill="currentColor" />
                                                    <span className="text-[11px] font-black text-white tracking-widest">{game.rating}</span>
                                                </div>
                                            </div>

                                            {/* Hover Action Overlay */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20 backdrop-blur-[2px]">
                                                <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 text-white flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)] transform scale-50 group-hover:scale-100 transition-transform duration-500 delay-75 backdrop-blur-md">
                                                    <Search size={24} strokeWidth={2.5} />
                                                </div>
                                            </div>

                                            <div className="absolute bottom-0 left-0 right-0 p-6 z-20 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                                                <h3 className="text-lg font-black text-white leading-tight mb-2 drop-shadow-md">{game.title}</h3>
                                                <span className="text-[12px] font-black text-accent uppercase tracking-widest drop-shadow-[0_0_10px_rgba(var(--color-accent),0.5)]">{game.price}</span>
                                            </div>
                                        </div>
                                    </TiltCard>
                                </motion.div>
                            ))}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}