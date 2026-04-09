import { AchievementPayload } from "./overlay-types";
import { motion } from "framer-motion";



const THEME = {
    glow: "rgba(255,160,0,0.45)",
    accent: "#FFB800",
    bg: "rgba(20,20,20,0.95)",
    gradient: "linear-gradient(135deg, rgba(15,15,15,0.98) 0%, rgba(45,35,10,0.15) 100%)"
};

/**
 * @deprecated Use AchievementOverlay instead. 
 * Kept for potential temporary internal references, but no longer used in overlay.tsx
 */
export function AchievementBadgeOverlay() {
    return null;
}

export function AchievementBadge({ badge }: { badge: AchievementPayload }) {
    const iconSrc = badge.icon ?? null;

    return (
        <motion.div
            initial={{ opacity: 0, x: 120, scale: 0.88 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 120, scale: 0.88, transition: { duration: 0.25 } }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: 320,
                padding: "12px 16px",
                borderRadius: 18,
                background: THEME.gradient,
                border: `1px solid ${THEME.accent}40`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${THEME.accent}20, 0 0 20px ${THEME.glow}`,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                pointerEvents: "none",
                userSelect: "none",
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                isolation: "isolate",
            }}
        >
            {/* Icon */}
            <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    overflow: "hidden",
                    border: `1px solid ${THEME.accent}40`,
                    background: "rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: `0 0 12px ${THEME.glow}`,
                }}>
                    {iconSrc ? (
                        <img src={iconSrc} alt={badge.display_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                        <span style={{ fontSize: 26 }}>🏆</span>
                    )}
                </div>
                {/* Ping ring */}
                <motion.div
                    animate={{ opacity: [0.6, 0], scale: [1, 1.6] }}
                    transition={{ duration: 1.5, repeat: 2, ease: "easeOut" }}
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 14,
                        border: `2px solid ${THEME.accent}60`,
                        pointerEvents: "none",
                    }}
                />
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                    color: THEME.accent,
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginBottom: 3,
                    opacity: 0.95,
                }}>
                    ✦ Achievement Unlocked
                </p>
                <p style={{
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: 14,
                    lineHeight: 1.3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 2,
                    textShadow: `0 0 12px ${THEME.glow}`,
                }}>
                    {badge.display_name || badge.api_name}
                </p>
                {badge.description ? (
                    <p style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 11,
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}>
                        {badge.description}
                    </p>
                ) : null}
            </div>
        </motion.div>
    );
}
