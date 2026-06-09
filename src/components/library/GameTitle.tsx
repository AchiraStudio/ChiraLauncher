import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Game } from "../../types/game";
import { useLocalImage } from "../../hooks/useLocalImage";

export function GameTitle({ game }: { game: Game }) {
    const { src: logoSrc, error: logoErr } = useLocalImage(game.logo_path);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [game.id, game.logo_path]);

    const hasLogo = Boolean(game.logo_path && !logoErr && !imgError && logoSrc);

    return (
        <div className="mb-6 min-h-[120px] flex items-end">
            <AnimatePresence mode="wait">
                {hasLogo ? (
                    <motion.div
                        key="logo"
                        initial={{ opacity: 0, x: -10, filter: "blur(10px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, x: 10, filter: "blur(10px)" }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="relative group"
                    >
                        <img
                            src={logoSrc!}
                            alt=""
                            className="absolute inset-0 w-auto h-[120px] object-contain blur-3xl opacity-50 brightness-150 saturate-150 scale-110 pointer-events-none"
                        />
                        <img
                            src={logoSrc!}
                            alt={game.title}
                            onError={() => setImgError(true)}
                            className="relative block w-auto max-w-[600px] h-[120px] object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.9)] transition-transform duration-700 group-hover:scale-[1.02]"
                        />
                    </motion.div>
                ) : (
                    <motion.h1
                        key="text"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.4 }}
                        className="text-6xl lg:text-7xl font-black tracking-tighter text-white leading-[0.9] max-w-4xl drop-shadow-[0_4px_40px_rgba(0,0,0,0.8)]"
                    >
                        {game.title}
                    </motion.h1>
                )}
            </AnimatePresence>
        </div>
    );
}
