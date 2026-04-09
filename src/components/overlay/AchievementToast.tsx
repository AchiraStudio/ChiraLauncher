import { useState, useEffect, useRef } from "react";
import type { AchievementPayload } from "./overlay-types";

// ─── Timing constants ─────────────────────────────────────────────────────────
//  Phase 1 — BUBBLE:  tiny circle pops up showing the icon         ~400ms
//  Phase 2 — EXPAND:  pill card expands from circle                ~380ms
//  Phase 3 — HOLD:    full card visible, bar drains                 3800ms
//  Phase 4 — SHRINK:  card collapses back to circle                ~280ms
//  Phase 5 — POP-OUT: circle scales + fades out                    ~300ms
//
//  onDone is called at the END of pop-out so the parent removes the item
//  from the queue exactly once — no race with a parallel setTimeout.

const T_BUBBLE = 400;
const T_EXPAND = 380;
const T_HOLD = 3800;
const T_SHRINK = 280;
const T_POPOUT = 300;

// Bar starts exactly when card is fully expanded, drains through HOLD
const BAR_DELAY_MS = T_BUBBLE + T_EXPAND + 60;
const BAR_DRAIN_MS = T_HOLD - 120;

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "bubble" | "expand" | "hold" | "shrink" | "popout" | "done";
type Rarity = "common" | "rare" | "legendary";

interface Props {
    achievement: AchievementPayload;
    onDone: () => void;
}

// ─── Rarity tokens ────────────────────────────────────────────────────────────
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
        accent: "#FFD700",
        accentDim: "rgba(255,215,0,0.20)",
        accentGlow: "rgba(255,200,0,0.25)",
        shimmer: "#FFF0A0",
        ringTop: "rgba(255,215,0,0.85)",
        barFrom: "#A07800",
        barTo: "#FFE566",
        eyebrow: "rgba(255,215,0,0.70)",
        label: "Achievement Unlocked",
    },
    rare: {
        accent: "#7EB8FF",
        accentDim: "rgba(100,160,255,0.20)",
        accentGlow: "rgba(80,140,255,0.22)",
        shimmer: "#C8E4FF",
        ringTop: "rgba(110,170,255,0.85)",
        barFrom: "#2A5A99",
        barTo: "#B0D8FF",
        eyebrow: "rgba(130,180,255,0.75)",
        label: "Rare Achievement",
    },
    legendary: {
        accent: "#FF9C45",
        accentDim: "rgba(255,140,60,0.20)",
        accentGlow: "rgba(255,110,30,0.25)",
        shimmer: "#FFD9A0",
        ringTop: "rgba(255,160,80,0.85)",
        barFrom: "#8B3E00",
        barTo: "#FFD080",
        eyebrow: "rgba(255,180,90,0.75)",
        label: "Legendary",
    },
};

function getRarity(achievement: AchievementPayload): Rarity {
    const r = (achievement as any).rarity as string | undefined;
    if (r === "rare") return "rare";
    if (r === "legendary") return "legendary";
    return "common";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AchievementToast({ achievement, onDone }: Props) {
    const [phase, setPhase] = useState<Phase>("bubble");
    const [iconLoaded, setIconLoaded] = useState(false);
    const [iconError, setIconError] = useState(false);

    const barRef = useRef<HTMLDivElement>(null);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;

    const rarity = getRarity(achievement);
    const tk = TOKENS[rarity];

    // ── Phase machine — single source of truth ────────────────────────────────
    useEffect(() => {
        let elapsed = 0;

        const timers: ReturnType<typeof setTimeout>[] = [];

        // bubble is the initial state — just schedule the rest
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
            doneRef.current(); // called ONCE, here, at the very end
        }, elapsed));

        // Bar drain — starts after expand settles
        timers.push(setTimeout(() => {
            if (!barRef.current) return;
            barRef.current.style.transition = `transform ${BAR_DRAIN_MS}ms linear`;
            barRef.current.style.transform = "scaleX(0)";
        }, BAR_DELAY_MS));

        return () => timers.forEach(clearTimeout);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const iconSrc = !iconError && achievement.icon ? achievement.icon : undefined;
    const gscore = (achievement as any).gamerscore ?? (achievement as any).xp ?? 30;

    // ── Derived geometry per phase ────────────────────────────────────────────
    //
    //  bubble  → small circle: 60×60, borderRadius 50, opacity 0→1 (scale 0→1)
    //  expand  → animate to full pill width, borderRadius 40→40
    //  hold    → stable full card
    //  shrink  → animate back to circle
    //  popout  → scale up slightly + fade out
    //  done    → hidden

    const isBubble = phase === "bubble";
    const isExpand = phase === "expand";
    const isHold = phase === "hold";
    const isShrink = phase === "shrink";
    const isPopout = phase === "popout";
    const isDone = phase === "done";

    // Pill geometry
    const pillWidth = (isBubble || isShrink || isPopout || isDone) ? 64 : 356;
    const pillHeight = (isBubble || isShrink || isPopout || isDone) ? 64 : 68;
    const pillBorderRadius = (isBubble || isShrink || isPopout || isDone) ? "50%" : "40px";
    const pillOpacity = isPopout || isDone ? 0 : 1;
    const pillScale = isPopout ? 1.18 :
        isBubble ? 0.4 : 1;

    // Content (text + score) visibility
    const contentOpacity = (isExpand && phase === "expand") ? 0 :
        isHold ? 1 :
            isShrink ? 0 : 0;
    const contentTx = (isExpand) ? 8 : 0;

    // Pill transition string
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
        ? `opacity ${T_SHRINK * 0.5}ms ease, transform ${T_SHRINK * 0.5}ms ease`
        : `opacity ${T_EXPAND * 0.6}ms ease ${T_EXPAND * 0.4}ms, transform ${T_EXPAND * 0.6}ms ease ${T_EXPAND * 0.4}ms`;

    if (isDone) return null;

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pointerEvents: "none",
        }}>
            {/* ── Pill / circle ─────────────────────────────────────────────── */}
            <div style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
                width: pillWidth,
                height: pillHeight,
                borderRadius: pillBorderRadius,
                opacity: pillOpacity,
                transform: `scale(${pillScale})`,
                transition: pillTransition,
                background: "linear-gradient(145deg, #141418 0%, #0d0d12 100%)",
                border: `1px solid ${tk.accentDim}`,
                boxShadow: [
                    "0 0 0 1px rgba(0,0,0,0.5)",
                    "0 20px 60px rgba(0,0,0,0.85)",
                    `0 0 50px ${tk.accentGlow}`,
                    "inset 0 1px 0 rgba(255,255,255,0.05)",
                ].join(", "),
                willChange: "width, height, border-radius, opacity, transform",
            }}>
                {/* Ambient glow */}
                <div style={{
                    position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
                    background: `radial-gradient(ellipse 65% 120% at 8% 50%, ${tk.accentDim}, transparent 65%)`,
                }} />

                {/* Top shimmer line */}
                <div style={{
                    position: "absolute", top: 0, left: "8%", right: "8%", height: 1,
                    background: `linear-gradient(90deg, transparent, ${tk.ringTop} 40%, ${tk.shimmer} 50%, ${tk.ringTop} 60%, transparent)`,
                    backgroundSize: "250% 100%",
                    animation: "ach-shimmer 2.4s linear infinite",
                    opacity: 0.85,
                }} />

                {/* ── Icon area — always centered, stays visible through all phases ── */}
                <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 68,
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    zIndex: 2,
                    // When collapsed to circle the icon IS the pill — keep centered
                    transition: "width 0ms",
                }}>
                    {/* Spinning ring */}
                    <div style={{
                        position: "absolute",
                        inset: 12,
                        borderRadius: "50%",
                        border: "1.5px solid transparent",
                        borderTopColor: tk.ringTop,
                        borderRightColor: tk.accentDim,
                        animation: "ach-ring 2.8s linear infinite",
                    }} />
                    {/* Counter-ring */}
                    <div style={{
                        position: "absolute",
                        inset: 16,
                        borderRadius: "50%",
                        border: "1px solid transparent",
                        borderBottomColor: tk.accentDim,
                        borderLeftColor: tk.ringTop,
                        animation: "ach-ring 4s linear infinite reverse",
                        opacity: 0.5,
                    }} />

                    {/* Icon disc */}
                    <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: `radial-gradient(circle at 35% 35%, ${tk.accentDim}, rgba(0,0,0,0.55))`,
                        border: `1.5px solid ${tk.accentDim}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 17,
                        lineHeight: "1",
                        overflow: "hidden",
                        transform: iconLoaded ? "scale(1) rotate(0deg)" : "scale(0.2) rotate(-30deg)",
                        opacity: iconLoaded ? 1 : 0,
                        transition: "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.15s, opacity 0.25s ease 0.15s",
                    }}>
                        {iconSrc ? (
                            <img
                                src={iconSrc}
                                alt={achievement.display_name}
                                onLoad={() => setIconLoaded(true)}
                                onError={() => { setIconError(true); setIconLoaded(true); }}
                                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
                            />
                        ) : (
                            <span ref={(el) => { if (el) setIconLoaded(true); }}>🏆</span>
                        )}
                    </div>

                    {/* Ripple — fires twice after bubble phase */}
                    <div style={{
                        position: "absolute",
                        inset: 10,
                        borderRadius: "50%",
                        border: `1.5px solid ${tk.accent}`,
                        animation: "ach-ripple 1.6s ease-out 0.38s 2",
                        opacity: 0,
                    }} />
                </div>

                {/* ── Text + score — fades in after expand, out before shrink ── */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    minWidth: 0,
                    paddingLeft: 84,  // clears the icon area
                    opacity: contentOpacity,
                    transform: `translateX(${contentTx}px)`,
                    transition: contentTransition,
                    willChange: "opacity, transform",
                }}>
                    {/* Text block */}
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                        {/* Eyebrow */}
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 9,
                            fontWeight: 500,
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: tk.eyebrow,
                            marginBottom: 4,
                        }}>
                            <span style={{
                                width: 5, height: 5,
                                borderRadius: "50%",
                                background: tk.accent,
                                opacity: 0.65,
                                flexShrink: 0,
                                display: "inline-block",
                                animation: "ach-dot 2s ease-in-out infinite 1s",
                            }} />
                            {tk.label}
                        </div>

                        {/* Title */}
                        <div style={{
                            fontSize: 15,
                            fontWeight: 800,
                            lineHeight: 1.2,
                            marginBottom: 2,
                            backgroundImage: `linear-gradient(90deg, #fff 20%, ${tk.shimmer} 50%, #fff 80%)`,
                            backgroundSize: "300% 100%",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            animation: "ach-shimmer 3s linear infinite 1s",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}>
                            {achievement.display_name || achievement.api_name}
                        </div>

                        {/* Description */}
                        {achievement.description && (
                            <div style={{
                                fontSize: 10.5,
                                color: "rgba(255,255,255,0.34)",
                                lineHeight: 1.4,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}>
                                {achievement.description}
                            </div>
                        )}
                    </div>

                    {/* Gamerscore chip */}
                    <div style={{
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 20px 0 14px",
                        gap: 1,
                        height: 68,
                        borderLeft: `1px solid ${tk.accentDim}`,
                    }}>
                        <span style={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 20,
                            fontWeight: 600,
                            color: tk.accent,
                            lineHeight: 1,
                        }}>
                            {gscore}
                        </span>
                        <span style={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: 8,
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            color: `${tk.accent}55`,
                            lineHeight: 1,
                        }}>
                            G
                        </span>
                    </div>
                </div>

                {/* ── Lifetime drain bar — moved inside to ensure clipping ── */}
                <div style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: "rgba(255,255,255,0.05)",
                    overflow: "hidden",
                    opacity: isHold ? 1 : 0,
                    transition: "opacity 0.2s ease",
                    zIndex: 3,
                }}>
                    <div
                        ref={barRef}
                        style={{
                            height: "100%",
                            width: "100%",
                            backgroundImage: `linear-gradient(90deg, ${tk.barFrom}, ${tk.barTo}, ${tk.barFrom})`,
                            backgroundSize: "200% 100%",
                            animation: "ach-shimmer 1.6s linear infinite",
                            transform: "scaleX(1)",
                            transformOrigin: "left",
                            transition: "none",
                            borderRadius: "0 0 3px 3px",
                        }}
                    />
                </div>
            </div>

            {/* ── Keyframes ────────────────────────────────────────────────────── */}
            <style>{`
                @keyframes ach-shimmer {
                    0%   { background-position: 200% 0 }
                    100% { background-position: -200% 0 }
                }
                @keyframes ach-ring {
                    from { transform: rotate(0deg) }
                    to   { transform: rotate(360deg) }
                }
                @keyframes ach-ripple {
                    0%   { transform: scale(1);   opacity: 0.75 }
                    100% { transform: scale(2);   opacity: 0 }
                }
                @keyframes ach-dot {
                    0%, 100% { opacity: 0.55; transform: scale(1) }
                    50%      { opacity: 1;    transform: scale(1.45) }
                }
            `}</style>
        </div>
    );
}