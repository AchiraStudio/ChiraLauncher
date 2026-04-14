import { useState, useEffect, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AchievementToast from "./AchievementToast";
import GameStartToast from "./GameStartToast";
import type { AchievementPayload, GameStartPayload, QueueItem } from "./overlay-types";
import { smartAudio } from "../../services/SmartAudio";

const MAX_QUEUE_DEPTH = 8;

export default function AchievementOverlay() {
    const [queue, setQueue] = useState<QueueItem[]>([]);

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
        const unlistenAch = listen<AchievementPayload>("achievement-unlocked", async (event: { payload: AchievementPayload }) => {
            const payload = event.payload;

            // DELEGATE to SmartAudio. It handles Game Custom > Global Custom > Default Synth
            // Returns the exact audio duration with padding, clamped to a minimum of 3 seconds.
            const durationMs = await smartAudio.playAchievement(payload.custom_sound_path);

            payload.duration_ms = durationMs;

            const id = crypto.randomUUID();
            setQueue((q: QueueItem[]) => {
                const alreadyQueued = q.some(
                    (item: QueueItem) =>
                        item.type === "achievement" &&
                        (item.payload as AchievementPayload).api_name === payload.api_name
                );
                if (alreadyQueued) return q;
                if (q.length >= MAX_QUEUE_DEPTH) return q;
                return [...q, { id, type: "achievement", payload }];
            });
        });

        const unlistenStart = listen<GameStartPayload>("game-started-toast", (event: { payload: GameStartPayload }) => {
            setQueue((q: QueueItem[]) => {
                if (q.length >= MAX_QUEUE_DEPTH) return q;
                return [...q, { id: crypto.randomUUID(), type: "game_start", payload: event.payload }];
            });
            smartAudio.playFallbackSynthSound();
        });

        const unlistenStop = listen("game-stopped", () => {
            setQueue([]);
            getCurrentWindow().hide().catch(console.error);
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