import { useState, useEffect, useRef } from "react";
import type { AchievementPayload } from "./overlay-types";

const T_BUBBLE = 350;
const T_EXPAND = 450;
const T_HOLD = 5000;
const T_SHRINK = 350;
const T_POPOUT = 300;

const BAR_DELAY_MS = T_BUBBLE + T_EXPAND + 150;
const BAR_DRAIN_MS = T_HOLD - 300;

type Phase = "bubble" | "expand" | "hold" | "shrink" | "popout" | "done";
type Rarity = "common" | "uncommon" | "rare" | "very_rare" | "ultra_rare";

interface Props {
    achievement: AchievementPayload;
    onDone: () => void;
}

const TOKENS: Record<Rarity, {
    accent: string;
    bgGlow: string;
    label: string;
}> = {
    common: { accent: "#10b981", bgGlow: "rgba(16, 185, 129, 0.15)", label: "COMMON" },
    uncommon: { accent: "#3b82f6", bgGlow: "rgba(59, 130, 246, 0.15)", label: "UNCOMMON" },
    rare: { accent: "#8b5cf6", bgGlow: "rgba(139, 92, 246, 0.15)", label: "RARE" },
    very_rare: { accent: "#f59e0b", bgGlow: "rgba(245, 158, 11, 0.15)", label: "VERY RARE" },
    ultra_rare: { accent: "#f43f5e", bgGlow: "rgba(244, 63, 94, 0.15)", label: "ULTRA RARE" },
};

function getRarity(achievement: AchievementPayload): Rarity {
    const pct = achievement.global_percent;
    if (pct === null || pct === undefined) return "common";
    if (pct > 50) return "common";
    if (pct > 25) return "uncommon";
    if (pct > 10) return "rare";
    if (pct > 5) return "very_rare";
    return "ultra_rare";
}

export default function AchievementToast({ achievement, onDone }: Props) {
    const [phase, setPhase] = useState<Phase>("bubble");
    const [iconLoaded, setIconLoaded] = useState(false);

    const barRef = useRef<HTMLDivElement>(null);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;

    const rarity = getRarity(achievement);
    const tk = TOKENS[rarity];

    useEffect(() => {
        const timers: ReturnType<typeof setTimeout>[] = [];
        let elapsed = 0;

        timers.push(setTimeout(() => setPhase("bubble"), 0));
        elapsed += T_BUBBLE;

        timers.push(setTimeout(() => setPhase("expand"), elapsed));
        elapsed += T_EXPAND;

        timers.push(setTimeout(() => setPhase("hold"), elapsed));
        elapsed += T_HOLD;

        timers.push(setTimeout(() => setPhase("shrink"), elapsed));
        elapsed += T_SHRINK;

        timers.push(setTimeout(() => setPhase("popout"), elapsed));
        elapsed += T_POPOUT;

        timers.push(setTimeout(() => {
            setPhase("done");
            doneRef.current();
        }, elapsed));

        timers.push(setTimeout(() => {
            if (barRef.current) {
                barRef.current.style.transition = `width ${BAR_DRAIN_MS}ms linear`;
                barRef.current.style.width = "0%";
            }
        }, BAR_DELAY_MS));

        return () => timers.forEach(clearTimeout);
    }, []);

    if (phase === "done") return null;

    const isBubble = phase === "bubble";
    const isExpand = phase === "expand";
    const isHold = phase === "hold";
    const isShrink = phase === "shrink";
    const isPopout = phase === "popout";

    // Animation dimensions
    const width = (isBubble || isShrink || isPopout) ? 64 : 420;
    const height = (isBubble || isShrink || isPopout) ? 64 : 96;
    const borderRadius = (isBubble || isShrink || isPopout) ? "50%" : "20px";
    const opacity = isPopout ? 0 : 1;
    const scale = isPopout ? 1.1 : isBubble ? 0.4 : 1;

    const contentOpacity = isHold ? 1 : 0;
    const contentTx = isExpand ? 15 : 0;

    const transition = `
        width ${isExpand ? T_EXPAND : T_SHRINK}ms cubic-bezier(0.22, 1, 0.36, 1),
        height ${isExpand ? T_EXPAND : T_SHRINK}ms cubic-bezier(0.22, 1, 0.36, 1),
        border-radius ${isExpand ? T_EXPAND : T_SHRINK}ms ease,
        transform ${T_BUBBLE}ms cubic-bezier(0.34, 1.56, 0.64, 1),
        opacity 0.25s ease
    `;

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
            <div style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                width, height, borderRadius, opacity,
                transform: `scale(${scale})`,
                transition,
                background: "rgba(10, 15, 24, 0.90)",
                backdropFilter: "blur(40px)",
                WebkitBackdropFilter: "blur(40px)",
                border: `1px solid rgba(255,255,255,0.06)`,
                boxShadow: `0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 40px ${tk.bgGlow}`,
                overflow: "hidden",
                willChange: "width, height, transform, opacity"
            }}>
                {/* Left Colored Bar Accent */}
                <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 6,
                    background: `linear-gradient(to bottom, ${tk.accent}, transparent)`,
                    boxShadow: `0 0 20px ${tk.accent}`,
                    opacity: isHold ? 1 : 0, transition: "opacity 0.4s ease"
                }} />

                {/* Sweeping Light Ray */}
                <div style={{
                    position: "absolute", top: 0, bottom: 0, width: 40,
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                    transform: "skewX(-20deg)",
                    animation: "ach-sweep 3s ease-in-out infinite",
                    opacity: isHold ? 1 : 0,
                }} />

                {/* Icon Container */}
                <div style={{
                    position: "absolute", left: 0, width: 90, height: "100%",
                    display: "flex", alignItems: "center", justifyItems: "center", paddingLeft: 20, zIndex: 2
                }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: "14px",
                        background: "rgba(0,0,0,0.8)",
                        border: `1.5px solid ${tk.accent}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 24, overflow: "hidden",
                        boxShadow: `0 0 25px ${tk.bgGlow}`,
                        transform: (iconLoaded && isHold) ? "rotateY(0deg) scale(1)" : "rotateY(90deg) scale(0.3)",
                        opacity: (iconLoaded && isHold) ? 1 : 0,
                        transition: "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s, opacity 0.3s ease 0.15s",
                    }}>
                        {achievement.icon ? (
                            <img src={achievement.icon} alt="" onLoad={() => setIconLoaded(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                            <span ref={(e) => { if (e) setIconLoaded(true); }}>🏆</span>
                        )}
                    </div>
                </div>

                {/* Text Content */}
                <div style={{
                    flex: 1, paddingLeft: 90, paddingRight: 20,
                    display: "flex", flexDirection: "column", justifyContent: "center",
                    opacity: contentOpacity, transform: `translateX(${contentTx}px)`,
                    transition: "opacity 0.4s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
                    whiteSpace: "nowrap"
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 900,
                                letterSpacing: "0.2em", color: tk.accent, textTransform: "uppercase"
                            }}>
                                UNLOCKED
                            </span>
                            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
                            <span style={{
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                                letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase"
                            }}>
                                {tk.label}
                            </span>
                        </div>
                        {/* NEW: XP Badge */}
                        {achievement.xp > 0 && (
                            <div style={{
                                display: "flex", alignItems: "center", gap: 4,
                                background: tk.bgGlow, border: `1px solid ${tk.accent}`,
                                padding: "2px 8px", borderRadius: "8px",
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 900,
                                color: tk.accent, boxShadow: `0 0 10px ${tk.bgGlow}`
                            }}>
                                ✦ +{achievement.xp} XP
                            </div>
                        )}
                    </div>

                    <div style={{
                        fontSize: 18, fontWeight: 900, color: "#fff",
                        overflow: "hidden", textOverflow: "ellipsis",
                        letterSpacing: "-0.02em", textShadow: "0 2px 10px rgba(0,0,0,0.8)"
                    }}>
                        {achievement.display_name || achievement.api_name}
                    </div>

                    {achievement.description && (
                        <div style={{
                            fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4,
                            overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500
                        }}>
                            {achievement.description}
                        </div>
                    )}
                </div>

                {/* Time Bar */}
                <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
                    background: "rgba(255,255,255,0.05)", opacity: isHold ? 1 : 0, transition: "opacity 0.2s"
                }}>
                    <div ref={barRef} style={{
                        height: "100%", width: "100%", background: tk.accent,
                        boxShadow: `0 0 12px ${tk.accent}`, transformOrigin: "left"
                    }} />
                </div>
            </div>
            <style>{`
                @keyframes ach-sweep { 0% { transform: translateX(-150px) skewX(-20deg) } 100% { transform: translateX(500px) skewX(-20deg) } }
            `}</style>
        </div>
    );
}