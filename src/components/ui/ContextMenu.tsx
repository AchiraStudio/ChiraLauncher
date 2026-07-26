import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    danger?: boolean;
    separator?: boolean;
    disabled?: boolean;
    onClick?: () => void;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: y, left: x });

    // After render, measure actual size and clamp to viewport
    useLayoutEffect(() => {
        if (!ref.current) return;
        const { offsetWidth: w, offsetHeight: h } = ref.current;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        setPos({
            left: x + w > vw ? Math.max(0, x - w) : x,
            top: y + h > vh ? Math.max(0, y - h) : y,
        });
    }, [x, y, items]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    return (
        <AnimatePresence>
            <motion.div
                ref={ref}
                initial={{ opacity: 0, scale: 0.90, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.90, y: -8 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, minWidth: 220 }}
                className="bg-[#1e2330]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden py-1.5"
            >
                {items.map((item, i) => {
                    if (item.separator) return <div key={i} className="mx-3 my-1 border-t border-white/[0.07]" />;
                    return (
                        <button
                            key={i}
                            disabled={item.disabled}
                            onClick={() => {
                                if (!item.disabled) { item.onClick?.(); onClose(); }
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all duration-100 text-left
                                ${item.disabled ? "opacity-30 cursor-not-allowed" : ""}
                                ${!item.disabled && item.danger
                                    ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                    : !item.disabled ? "text-white/75 hover:text-white hover:bg-white/8" : "text-white/75"
                                }`}
                        >
                            {item.icon && (
                                <span className={`text-base w-5 text-center flex-shrink-0 ${item.danger ? "text-red-400" : "text-white/50"}`}>
                                    {item.icon}
                                </span>
                            )}
                            <span className="truncate">{item.label}</span>
                        </button>
                    );
                })}
            </motion.div>
        </AnimatePresence>
    );
}
