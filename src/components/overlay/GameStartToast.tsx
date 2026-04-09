import { useState, useEffect, useRef } from "react";
import type { GameStartPayload } from "./overlay-types";

export type { GameStartPayload };

const HOLD_MS = 10000;
const EXIT_MS = 700;

interface Props {
    payload: GameStartPayload;
    onDone: () => void;
}

type Phase = "enter" | "hold" | "exit";

export default function GameStartToast({ payload, onDone }: Props) {
    const [phase, setPhase] = useState<Phase>("enter");
    const [visible, setVisible] = useState(false);
    const [imgError, setImgError] = useState(false);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;

    useEffect(() => {
        const t0 = setTimeout(() => setVisible(true), 40);
        const t1 = setTimeout(() => setPhase("hold"), 650);
        const t2 = setTimeout(() => setPhase("exit"), HOLD_MS);
        const t3 = setTimeout(() => doneRef.current(), HOLD_MS + EXIT_MS);
        return () => { [t0, t1, t2, t3].forEach(clearTimeout); };
    }, []);

    const isExit = phase === "exit";
    const ty = isExit ? "-130%" : visible ? "0%" : "-24px";
    const sc = isExit ? 0.92 : visible ? 1 : 0.90;
    const op = isExit ? 0 : visible ? 1 : 0;
    const tr = isExit
        ? `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`
        : `transform 0.65s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease`;

    const coverSrc = !imgError && payload.coverBase64 ? payload.coverBase64 : undefined;

    // Pull platform from payload if available
    const platform = (payload as any).platform ?? "Steam";
    // Achievement progress if available
    const achDone = (payload as any).achievementsDone as number | undefined;
    const achTotal = (payload as any).achievementsTotal as number | undefined;
    const achPct = achDone != null && achTotal ? Math.round((achDone / achTotal) * 100) : undefined;

    return (
        <div style={{
            position: "relative", width: 400,
            transform: `translateY(${ty}) scale(${sc})`,
            opacity: op, transition: tr,
            willChange: "transform, opacity", pointerEvents: "none",
        }}>
            {/* Card */}
            <div style={{
                position: "relative", borderRadius: 14, overflow: "hidden",
                background: "#0a0f18",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.03)",
            }}>
                {/* Blurred cover as ambient background */}
                {coverSrc && (
                    <div style={{
                        position: "absolute", inset: 0,
                        backgroundImage: `url(${coverSrc})`,
                        backgroundSize: "cover", backgroundPosition: "center",
                        filter: "blur(28px) brightness(0.35) saturate(1.4)",
                        transform: "scale(1.15)",
                    }} />
                )}
                {/* Dark overlay */}
                <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(160deg, rgba(5,10,20,0.80) 0%, rgba(5,10,20,0.60) 100%)",
                }} />

                {/* Top shimmer bar */}
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 1.5,
                    backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(82,196,26,0.65) 30%, rgba(160,240,100,0.9) 50%, rgba(82,196,26,0.65) 70%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "gs-shimmer 2.5s linear infinite",
                    zIndex: 4,
                }} />
                {/* Scan sweep */}
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 1.5,
                    background: "linear-gradient(90deg, transparent, rgba(82,196,26,0.5), transparent)",
                    animation: "gs-scan 3s linear infinite 0.5s",
                    zIndex: 5, opacity: 0.5,
                }} />

                {/* Inner layout */}
                <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "stretch" }}>
                    {/* Cover art strip */}
                    <div style={{ position: "relative", flexShrink: 0, width: 86, overflow: "hidden" }}>
                        {coverSrc ? (
                            <>
                                {/* Blurred layer behind for depth */}
                                <div style={{
                                    position: "absolute", inset: 0,
                                    backgroundImage: `url(${coverSrc})`,
                                    backgroundSize: "cover", backgroundPosition: "center",
                                    filter: "blur(8px) brightness(0.6)",
                                    transform: "scale(1.1)",
                                }} />
                                <img
                                    src={coverSrc}
                                    alt={payload.title}
                                    onError={() => setImgError(true)}
                                    style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 110 }}
                                />
                            </>
                        ) : (
                            <div style={{
                                width: "100%", minHeight: 110,
                                background: "linear-gradient(160deg,#1a2a3a,#0d1525)",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
                            }}>
                                🎮
                            </div>
                        )}
                        {/* Right-edge dissolve into card bg */}
                        <div style={{
                            position: "absolute", top: 0, right: 0, bottom: 0, width: 44,
                            background: "linear-gradient(to right, transparent, #0a0f18)",
                        }} />
                    </div>

                    {/* Text body */}
                    <div style={{ flex: 1, padding: "15px 18px 14px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
                        {/* Live row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{
                                width: 7, height: 7, borderRadius: "50%",
                                background: "#52c41a", boxShadow: "0 0 8px #52c41a",
                                animation: "gs-pulse 1.8s ease-in-out infinite",
                                flexShrink: 0, display: "inline-block",
                            }} />
                            <span style={{
                                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                fontSize: 9, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase",
                                color: "rgba(82,196,26,0.75)",
                            }}>
                                Now Playing
                            </span>
                            {/* Platform badge */}
                            <span style={{
                                marginLeft: "auto",
                                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                fontSize: 8, letterSpacing: "0.10em", textTransform: "uppercase",
                                color: "rgba(255,255,255,0.28)",
                                background: "rgba(255,255,255,0.07)",
                                border: "1px solid rgba(255,255,255,0.09)",
                                borderRadius: 4, padding: "2px 6px",
                            }}>
                                {platform}
                            </span>
                        </div>

                        {/* Title */}
                        <div style={{
                            fontSize: 17, fontWeight: 800, color: "#fff",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            letterSpacing: "-0.02em", lineHeight: 1.1,
                            animation: "gs-reveal 0.45s ease-out 0.5s both",
                            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                        }}>
                            {payload.title}
                        </div>

                        {/* Meta row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                fontSize: 10, color: "rgba(255,255,255,0.32)",
                                animation: "gs-reveal 0.4s ease-out 0.62s both",
                                display: "flex", alignItems: "center", gap: 4,
                            }}>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <circle cx="5" cy="5" r="4" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                                    <path d="M5 2.5V5l1.5 1" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeLinecap="round" />
                                </svg>
                                Just started
                            </span>
                            {achPct != null && (
                                <>
                                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.14)", display: "inline-block" }} />
                                    <span style={{
                                        fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                        fontSize: 10, color: "rgba(255,255,255,0.32)",
                                        animation: "gs-reveal 0.4s ease-out 0.68s both",
                                    }}>
                                        {achPct}% complete
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Achievement progress bar (shown only if data is present) */}
                        {achPct != null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, animation: "gs-reveal 0.4s ease-out 0.76s both" }}>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{
                                        height: "100%",
                                        width: `${achPct}%`,
                                        background: "linear-gradient(90deg,#52c41a,#a8e063)",
                                        borderRadius: 2,
                                        animation: "gs-bar 0.65s ease-out 0.9s both",
                                        transformOrigin: "left",
                                    }} />
                                </div>
                                <span style={{
                                    fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                    fontSize: 9, color: "rgba(82,196,26,0.5)", whiteSpace: "nowrap",
                                }}>
                                    {achDone} / {achTotal} G
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes gs-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
                @keyframes gs-scan    { 0%{transform:translateX(-100%)} 100%{transform:translateX(400px)} }
                @keyframes gs-pulse   { 0%,100%{opacity:1;transform:scale(1);box-shadow:0 0 6px #52c41a} 50%{opacity:.65;transform:scale(1.4);box-shadow:0 0 16px #52c41a} }
                @keyframes gs-reveal  { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
                @keyframes gs-bar     { from{transform:scaleX(0)} to{transform:scaleX(1)} }
            `}</style>
        </div>
    );
}