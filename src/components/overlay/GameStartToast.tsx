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

    const platform = (payload as any).platform ?? "System";
    const achDone = (payload as any).achievementsDone as number | undefined;
    const achTotal = (payload as any).achievementsTotal as number | undefined;
    const achPct = achDone != null && achTotal ? Math.round((achDone / achTotal) * 100) : undefined;

    return (
        <div style={{
            position: "relative", width: 420,
            transform: `translateY(${ty}) scale(${sc})`,
            opacity: op, transition: tr,
            willChange: "transform, opacity", pointerEvents: "none",
        }}>
            {/* Card */}
            <div style={{
                position: "relative", borderRadius: 20, overflow: "hidden",
                background: "rgba(10, 15, 24, 0.95)",
                border: "1px solid rgba(255,255,255,0.05)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(34,211,238,0.15), 0 0 40px rgba(34,211,238,0.1)",
            }}>
                {coverSrc && (
                    <div style={{
                        position: "absolute", inset: 0,
                        backgroundImage: `url(${coverSrc})`,
                        backgroundSize: "cover", backgroundPosition: "center",
                        filter: "blur(30px) brightness(0.4) saturate(1.5)",
                        transform: "scale(1.2)",
                    }} />
                )}

                <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(160deg, rgba(10,15,24,0.90) 0%, rgba(10,15,24,0.70) 100%)",
                }} />

                {/* Top shimmer bar */}
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.65) 30%, rgba(103,232,249,0.9) 50%, rgba(34,211,238,0.65) 70%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "gs-shimmer 2.5s linear infinite",
                    zIndex: 4,
                }} />

                {/* Scan sweep */}
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.5), transparent)",
                    animation: "gs-scan 3s linear infinite 0.5s",
                    zIndex: 5, opacity: 0.5,
                }} />

                <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "stretch" }}>
                    <div style={{ position: "relative", flexShrink: 0, width: 90, overflow: "hidden" }}>
                        {coverSrc ? (
                            <>
                                <div style={{
                                    position: "absolute", inset: 0,
                                    backgroundImage: `url(${coverSrc})`,
                                    backgroundSize: "cover", backgroundPosition: "center",
                                    filter: "blur(10px) brightness(0.6)",
                                    transform: "scale(1.1)",
                                }} />
                                <img
                                    src={coverSrc}
                                    alt={payload.title}
                                    onError={() => setImgError(true)}
                                    style={{ position: "relative", width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 120 }}
                                />
                            </>
                        ) : (
                            <div style={{
                                width: "100%", minHeight: 120,
                                background: "linear-gradient(160deg,#164e63,#083344)",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
                            }}>
                                🎮
                            </div>
                        )}
                        <div style={{
                            position: "absolute", top: 0, right: 0, bottom: 0, width: 40,
                            background: "linear-gradient(to right, transparent, rgba(10,15,24,0.9))",
                        }} />
                    </div>

                    <div style={{ flex: 1, padding: "18px 20px 16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: "50%",
                                background: "#22d3ee", boxShadow: "0 0 10px #22d3ee",
                                animation: "gs-pulse 1.8s ease-in-out infinite",
                                flexShrink: 0, display: "inline-block",
                            }} />
                            <span style={{
                                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                                color: "rgba(34,211,238,0.85)",
                            }}>
                                Game Initiated
                            </span>
                            <span style={{
                                marginLeft: "auto",
                                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700,
                                color: "rgba(255,255,255,0.4)",
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 6, padding: "3px 8px",
                            }}>
                                {platform}
                            </span>
                        </div>

                        <div style={{
                            fontSize: 18, fontWeight: 900, color: "#fff",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            letterSpacing: "-0.02em", lineHeight: 1.2,
                            animation: "gs-reveal 0.45s ease-out 0.5s both",
                            textShadow: "0 4px 16px rgba(0,0,0,0.8)",
                        }}>
                            {payload.title}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{
                                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500,
                                animation: "gs-reveal 0.4s ease-out 0.62s both",
                                display: "flex", alignItems: "center", gap: 6,
                            }}>
                                <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                                    <circle cx="5" cy="5" r="4" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                                    <path d="M5 2.5V5l1.5 1" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeLinecap="round" />
                                </svg>
                                Tracking Output
                            </span>
                            {achPct != null && (
                                <>
                                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "inline-block" }} />
                                    <span style={{
                                        fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                        fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500,
                                        animation: "gs-reveal 0.4s ease-out 0.68s both",
                                    }}>
                                        {achPct}% Archive
                                    </span>
                                </>
                            )}
                        </div>

                        {achPct != null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, animation: "gs-reveal 0.4s ease-out 0.76s both", marginTop: 2 }}>
                                <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{
                                        height: "100%",
                                        width: `${achPct}%`,
                                        background: "linear-gradient(90deg,#22d3ee,#67e8f9)",
                                        borderRadius: 2,
                                        animation: "gs-bar 0.65s ease-out 0.9s both",
                                        transformOrigin: "left",
                                    }} />
                                </div>
                                <span style={{
                                    fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                    fontSize: 9, color: "rgba(34,211,238,0.6)", whiteSpace: "nowrap", fontWeight: 700
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
                @keyframes gs-scan    { 0%{transform:translateX(-100%)} 100%{transform:translateX(450px)} }
                @keyframes gs-pulse   { 0%,100%{opacity:1;transform:scale(1);box-shadow:0 0 8px #22d3ee} 50%{opacity:.65;transform:scale(1.5);box-shadow:0 0 20px #22d3ee} }
                @keyframes gs-reveal  { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
                @keyframes gs-bar     { from{transform:scaleX(0)} to{transform:scaleX(1)} }
            `}</style>
        </div>
    );
}