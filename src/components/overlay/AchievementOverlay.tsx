import { useState, useEffect, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AchievementToast from "./AchievementToast";
import GameStartToast from "./GameStartToast";
import type { AchievementPayload, GameStartPayload, QueueItem } from "./overlay-types";

const MAX_QUEUE_DEPTH = 8;
let audioCtx: AudioContext | null = null;
let audioCtxInitialized = false;

const initAudioContext = () => {
    if (!audioCtxInitialized) {
        try {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioCtxInitialized = true;
        } catch (e) {
            console.warn("AudioContext not supported", e);
        }
    }
};

if (typeof document !== "undefined") {
    document.addEventListener("click", initAudioContext, { once: true });
}

export default function AchievementOverlay() {
    const [queue, setQueue] = useState<QueueItem[]>([]);

    // removeById is the ONLY way items leave the queue.
    // It is called exclusively by each toast's onDone — never by an external timeout.
    // This eliminates the double-removal race that caused duplicate badge flashes.
    const removeById = useCallback((id: string) => {
        setQueue((q: QueueItem[]) => {
            const next = q.filter((item: QueueItem) => item.id !== id);
            if (next.length === 0) {
                getCurrentWindow().hide().catch(console.error);
            }
            return next;
        });
    }, []);

    useEffect(() => {
        // --- Core Achievement Listener ---
        const unlistenAch = listen<AchievementPayload>("achievement-unlocked", (event: { payload: AchievementPayload }) => {
            const id = crypto.randomUUID();
            setQueue((q: QueueItem[]) => {
                // Deduplicate: ignore if an identical api_name is already in the queue
                const alreadyQueued = q.some(
                    (item: QueueItem) =>
                        item.type === "achievement" &&
                        (item.payload as AchievementPayload).api_name === event.payload.api_name
                );
                if (alreadyQueued) return q;
                if (q.length >= MAX_QUEUE_DEPTH) return q;
                return [...q, { id, type: "achievement", payload: event.payload }];
            });
            playAchievementSound();
        });

        // --- Core Game Start Listener ---
        const unlistenStart = listen<GameStartPayload>("game-started-toast", (event: { payload: GameStartPayload }) => {
            setQueue((q: QueueItem[]) => {
                if (q.length >= MAX_QUEUE_DEPTH) return q;
                return [...q, { id: crypto.randomUUID(), type: "game_start", payload: event.payload }];
            });
            playAchievementSound();
        });

        // --- STOP LISTENER FIX: Purge the queue and hide immediately when game closes ---
        const unlistenStop = listen("game-stopped", () => {
            setQueue([]); // Flush the queue
            getCurrentWindow().hide().catch(console.error); // Hide window explicitly
        });

        return () => {
            unlistenAch.then((f: UnlistenFn) => f());
            unlistenStart.then((f: UnlistenFn) => f());
            unlistenStop.then((f: UnlistenFn) => f());
        };
    }, [removeById]);

    const achievements = queue.filter((i: QueueItem) => i.type === "achievement");
    const gameToasts = queue.filter((i: QueueItem) => i.type === "game_start");

    return (
        <div style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif",
            isolation: "isolate",
            zIndex: 9999,
        }}>
            {/* Achievement toasts — top-center, stacked downward */}
            <div style={{
                position: "absolute",
                top: 20,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
            }}>
                {achievements.map((item: QueueItem) => (
                    <AchievementToast
                        key={item.id}
                        achievement={item.payload as AchievementPayload}
                        onDone={() => removeById(item.id)}
                    />
                ))}
            </div>

            {/* Game-start toasts — top-right corner */}
            <div style={{
                position: "absolute",
                top: 16,
                right: 16,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 10,
            }}>
                {gameToasts.map((item: QueueItem) => (
                    <GameStartToast
                        key={item.id}
                        payload={item.payload as GameStartPayload}
                        onDone={() => removeById(item.id)}
                    />
                ))}
            </div>
        </div>
    );
}

function playAchievementSound() {
    const enabled = localStorage.getItem("achievement_sound") !== "false";
    const volume = parseFloat(localStorage.getItem("achievement_volume") ?? "0.4");
    if (!enabled) return;

    if (!audioCtx) initAudioContext();
    const ctx = audioCtx;
    if (!ctx) return;

    try {
        if (ctx.state === "suspended") ctx.resume();

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        gainNode.connect(ctx.destination);

        [880, 1100, 1320].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
            osc.connect(gainNode);
            osc.start(ctx.currentTime + i * 0.1);
            osc.stop(ctx.currentTime + i * 0.1 + 0.2);
        });
    } catch {
        // silently ignore
    }
}