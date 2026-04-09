import { useState, useEffect, useRef } from "react";
import type { AchievementPayload } from "./overlay-types";

const T_BUBBLE = 400;
const T_EXPAND = 450;
const T_HOLD = 4000;
const T_SHRINK = 300;
const T_POPOUT = 300;

const BAR_DELAY_MS = T_BUBBLE + T_EXPAND + 60;
const BAR_DRAIN_MS = T_HOLD - 120;

type Phase = "bubble" | "expand" | "hold" | "shrink" | "popout" | "done";
type Rarity = "common" | "uncommon" | "rare" | "very_rare" | "ultra_rare";

interface Props {
    achievement: AchievementPayload;
    onDone: () => void;
}

const TOKENS: Record<Rarity, {
    accent: string;
    accentDim: string;
    accentGlow: string;
    shimmer: string;
    ringTop: string;
    barFrom: string;
    barTo: string;
    eyebrow: string;
    label: string;
}> = {
    common: {
        accent: "#10b981",
        accentDim: "rgba(16, 185, 129, 0.15)",
        accentGlow: "rgba(16, 185, 129, 0.20)",
        shimmer: "#6ee7b7",
        ringTop: "rgba(16, 185, 129, 0.9)",
        barFrom: "#047857",
        barTo: "#34d399",
        eyebrow: "rgba(16, 185, 129, 0.8)",
        label: "Common Unlocked",
    },
    uncommon: {
        accent: "#3b82f6",
        accentDim: "rgba(59, 130, 246, 0.15)",
        accentGlow: "rgba(59, 130, 246, 0.20)",
        shimmer: "#93c5fd",
        ringTop: "rgba(59, 130, 246, 0.9)",
        barFrom: "#1d4ed8",
        barTo: "#60a5fa",
        eyebrow: "rgba(59, 130, 246, 0.8)",
        label: "Uncommon Unlocked",
    },
    rare: {
        accent: "#8b5cf6",
        accentDim: "rgba(139, 92, 246, 0.15)",
        accentGlow: "rgba(139, 92, 246, 0.20)",
        shimmer: "#c4b5fd",
        ringTop: "rgba(139, 92, 246, 0.9)",
        barFrom: "#5b21b6",
        barTo: "#a78bfa",
        eyebrow: "rgba(139, 92, 246, 0.8)",
        label: "Rare Achievement",
    },
    very_rare: {
        accent: "#eab308",
        accentDim: "rgba(234, 179, 8, 0.15)",
        accentGlow: "rgba(234, 179, 8, 0.20)",
        shimmer: "#fde047",
        ringTop: "rgba(234, 179, 8, 0.9)",
        barFrom: "#a16207",
        barTo: "#facc15",
        eyebrow: "rgba(234, 179, 8, 0.8)",
        label: "Very Rare!",
    },
    ultra_rare: {
        accent: "#f43f5e",
        accentDim: "rgba(244, 63, 94, 0.15)",
        accentGlow: "rgba(244, 63, 94, 0.20)",
        shimmer: "#fda4af",
        ringTop: "rgba(244, 63, 94, 0.9)",
        barFrom: "#be123c",
        barTo: "#fb7185",
        eyebrow: "rgba(244, 63, 94, 0.8)",
        label: "Ultra Rare!",
    },
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
    const [iconError, setIconError] = useState(false);

    const barRef = useRef<HTMLDivElement>(null);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;

    const rarity = getRarity(achievement);
    const tk = TOKENS[rarity];

    useEffect(() => {
        let elapsed = 0;
        const timers: ReturnType<typeof setTimeout>[] = [];

        timers.push(setTimeout(() => setPhase("bubble"), 0));

        elapsed = T_BUBBLE;
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
            if (!barRef.current) return;
            barRef.current.style.transition = `transform ${BAR_DRAIN_MS}ms linear`;
            barRef.current.style.transform = "scaleX(0)";
        }, BAR_DELAY_MS));

        return () => timers.forEach(clearTimeout);
    }, []);

    const iconSrc = !iconError && achievement.icon ? achievement.icon : undefined;

    const isBubble = phase === "bubble";
    const isExpand = phase === "expand";
    const isHold = phase === "hold";
    const isShrink = phase === "shrink";
    const isPopout = phase === "popout";
    const isDone = phase === "done";

    const pillWidth = (isBubble || isShrink || isPopout || isDone) ? 68 : 360;
    const pillHeight = (isBubble || isShrink || isPopout || isDone) ? 68 : 74;
    const pillBorderRadius = (isBubble || isShrink || isPopout || isDone) ? "50%" : "24px";
    const pillOpacity = isPopout || isDone ? 0 : 1;
    const pillScale = isPopout ? 1.15 : isBubble ? 0.6 : 1;

    const contentOpacity = (isExpand && phase === "expand") ? 0 : isHold ? 1 : isShrink ? 0 : 0;
    const contentTx = (isExpand) ? 12 : 0;

    const pillTransition = (() => {
        if (isBubble) return `
            width ${T_BUBBLE * 0.7}ms cubic-bezier(0.34,1.56,0.64,1),
            height ${T_BUBBLE * 0.7}ms cubic-bezier(0.34,1.56,0.64,1),
            border-radius ${T_BUBBLE * 0.7}ms ease,
            opacity ${T_BUBBLE * 0.5}ms ease-out,
            transform ${T_BUBBLE * 0.7}ms cubic-bezier(0.34,1.56,0.64,1)
        `;
        if (isExpand) return `
            width ${T_EXPAND}ms cubic-bezier(0.16,1,0.3,1),
            height ${T_EXPAND}ms cubic-bezier(0.16,1,0.3,1),
            border-radius ${T_EXPAND}ms cubic-bezier(0.16,1,0.3,1),
            opacity ${T_EXPAND * 0.4}ms ease-out,
            transform ${T_EXPAND}ms cubic-bezier(0.16,1,0.3,1)
        `;
        if (isHold) return "none";
        if (isShrink) return `
            width ${T_SHRINK}ms cubic-bezier(0.4,0,0.6,1),
            height ${T_SHRINK}ms cubic-bezier(0.4,0,0.6,1),
            border-radius ${T_SHRINK}ms ease,
            opacity ${T_SHRINK}ms ease
        `;
        if (isPopout) return `
            opacity ${T_POPOUT}ms ease-in,
            transform ${T_POPOUT}ms cubic-bezier(0.4,0,1,1)
        `;
        return "none";
    })();

    const contentTransition = isShrink
        ? `opacity ${T_SHRINK * 0.4}ms ease, transform ${T_SHRINK * 0.4}ms ease`
        : `opacity ${T_EXPAND * 0.6}ms ease ${T_EXPAND * 0.4}ms, transform ${T_EXPAND * 0.6}ms ease ${T_EXPAND * 0.4}ms`;

    if (isDone) return null;

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
            <div style={{
                position: "relative", display: "flex", alignItems: "center", overflow: "hidden",
                width: pillWidth, height: pillHeight, borderRadius: pillBorderRadius, opacity: pillOpacity,
                transform: `scale(${pillScale})`, transition: pillTransition,
                background: "rgba(10, 15, 24, 0.95)",
                border: `1px solid ${tk.accentDim}`,
                boxShadow: `0 12px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02), 0 0 30px ${tk.accentGlow}`,
                willChange: "width, height, border-radius, opacity, transform",
            }}>
                <div style={{
                    position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
                    background: `radial-gradient(ellipse 65% 120% at 8% 50%, ${tk.accentDim}, transparent 65%)`,
                }} />

                <div style={{
                    position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
                    background: `linear-gradient(90deg, transparent, ${tk.ringTop} 40%, ${tk.shimmer} 50%, ${tk.ringTop} 60%, transparent)`,
                    backgroundSize: "250% 100%", animation: "ach-shimmer 2s linear infinite", opacity: 0.9,
                }} />

                <div style={{
                    position: "absolute", left: 0, top: 0, width: 74, height: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 2,
                    transition: "width 0ms",
                }}>
                    <div style={{
                        position: "absolute", inset: 14, borderRadius: "50%", border: "1.5px solid transparent",
                        borderTopColor: tk.ringTop, borderRightColor: tk.accentDim, animation: "ach-ring 2.8s linear infinite",
                    }} />
                    <div style={{
                        position: "absolute", inset: 18, borderRadius: "50%", border: "1px solid transparent",
                        borderBottomColor: tk.accentDim, borderLeftColor: tk.ringTop, animation: "ach-ring 4s linear infinite reverse", opacity: 0.6,
                    }} />

                    <div style={{
                        width: 42, height: 42, borderRadius: "50%",
                        background: `radial-gradient(circle at 35% 35%, ${tk.accentDim}, rgba(0,0,0,0.8))`,
                        border: `1.5px solid ${tk.accentDim}`, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18, lineHeight: "1", overflow: "hidden",
                        transform: iconLoaded ? "scale(1) rotate(0deg)" : "scale(0.2) rotate(-30deg)",
                        opacity: iconLoaded ? 1 : 0,
                        transition: "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.15s, opacity 0.25s ease 0.15s",
                    }}>
                        {iconSrc ? (
                            <img
                                src={iconSrc} alt={achievement.display_name} onLoad={() => setIconLoaded(true)} onError={() => { setIconError(true); setIconLoaded(true); }}
                                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
                            />
                        ) : (
                            <span ref={(el) => { if (el) setIconLoaded(true); }}>🏆</span>
                        )}
                    </div>

                    <div style={{
                        position: "absolute", inset: 12, borderRadius: "50%",
                        border: `1.5px solid ${tk.accent}`, animation: "ach-ripple 1.6s ease-out 0.38s 2", opacity: 0,
                    }} />
                </div>

                <div style={{
                    display: "flex", alignItems: "center", flex: 1, minWidth: 0,
                    paddingLeft: 84, opacity: contentOpacity, transform: `translateX(${contentTx}px)`,
                    transition: contentTransition, willChange: "opacity, transform",
                }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 9, fontWeight: 700,
                            letterSpacing: "0.2em", textTransform: "uppercase", color: tk.eyebrow, marginBottom: 4,
                        }}>
                            <span style={{
                                width: 4, height: 4, borderRadius: "50%", background: tk.accent, opacity: 0.8,
                                flexShrink: 0, display: "inline-block", animation: "ach-dot 2s ease-in-out infinite 1s",
                                boxShadow: `0 0 6px ${tk.accent}`
                            }} />
                            {tk.label}
                        </div>
                        <div style={{
                            fontSize: 16, fontWeight: 900, lineHeight: 1.2, marginBottom: 2,
                            backgroundImage: `linear-gradient(90deg, #fff 20%, ${tk.shimmer} 50%, #fff 80%)`,
                            backgroundSize: "300% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                            animation: "ach-shimmer 3s linear infinite 1s", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                            {achievement.display_name || achievement.api_name}
                        </div>
                        {achievement.description && (
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>
                                {achievement.description}
                            </div>
                        )}
                    </div>

                    <div style={{
                        flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        padding: "0 22px 0 16px", gap: 2, height: 74, borderLeft: `1px solid ${tk.accentDim}`,
                        background: `linear-gradient(90deg, transparent, ${tk.accentDim} 100%)`, opacity: 0.8
                    }}>
                        <span style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 22, fontWeight: 800, color: tk.accent, lineHeight: 1 }}>
                            {achievement.global_percent !== null ? `${achievement.global_percent.toFixed(1)}%` : "??%"}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: "#fff", opacity: 0.5, lineHeight: 1 }}>
                            GLOBAL
                        </span>
                    </div>
                </div>

                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden", opacity: isHold ? 1 : 0, transition: "opacity 0.2s ease", zIndex: 3 }}>
                    <div ref={barRef} style={{ height: "100%", width: "100%", backgroundImage: `linear-gradient(90deg, ${tk.barFrom}, ${tk.barTo}, ${tk.barFrom})`, backgroundSize: "200% 100%", animation: "ach-shimmer 1.6s linear infinite", transform: "scaleX(1)", transformOrigin: "left", transition: "none", borderRadius: "0 0 4px 4px" }} />
                </div>
            </div>
            <style>{`
                @keyframes ach-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
                @keyframes ach-ring { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
                @keyframes ach-ripple { 0% { transform: scale(1); opacity: 0.75 } 100% { transform: scale(2); opacity: 0 } }
                @keyframes ach-dot { 0%, 100% { opacity: 0.55; transform: scale(1) } 50% { opacity: 1; transform: scale(1.45) } }
            `}</style>
        </div>
    );
}