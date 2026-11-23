import { useEffect, useRef } from "react";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { toast } from "sonner";
import { call, on, isTauri } from "../lib/tauri";
import { useProcessStore } from "../store/processStore";
import { useGameStore } from "../store/gameStore";
import { useSettingsStore } from "../store/settingsStore";
import { useProfileStore } from "../store/profileStore";
import { useUiStore } from "../store/uiStore";
import { useCollectionStore } from "../store/collectionStore";
import { useUpdateStore } from "../store/updateStore";
import { startDownloadPoller } from "../store/httpStore";
import { initOsIntegrationListeners } from "../store/osIntegrationStore";
import { launchGame } from "../services/gameService";
import { smartAudio } from "../services/SmartAudio";
import type { Game } from "../types/game";

const LAUNCH_PREFIX = "chiralauncher://launch/";

/** Launcher-style games are started through their launcher, so shortcuts must point there. */
export function shortcutTarget(g: Game): string {
    const viaLauncher = g.execution_method === "auto_launcher" || g.execution_method === "manual_launcher";
    return viaLauncher && g.launcher_path?.trim() ? g.launcher_path : g.executable_path;
}

function launchIdFrom(url: string): string | null {
    return url.startsWith(LAUNCH_PREFIX) ? url.slice(LAUNCH_PREFIX.length).replace(/\/$/, "") : null;
}

/** Background launch from a desktop shortcut: show a small splash, then start the game. */
async function backgroundLaunch(gameId: string, attempt = 0): Promise<void> {
    const game = useGameStore.getState().gamesById[gameId];
    if (!game) {
        // Library may still be loading when the shortcut starts the app
        if (attempt < 10) { setTimeout(() => void backgroundLaunch(gameId, attempt + 1), 500); return; }
        launchGame(gameId).catch(() => { });
        return;
    }
    new WebviewWindow(`splash-${Date.now()}`, {
        url: `/splash?title=${encodeURIComponent(game.title)}&cover=${encodeURIComponent(game.cover_path || "")}`,
        width: 480, height: 160, transparent: true, decorations: false,
        alwaysOnTop: true, center: true, skipTaskbar: true, resizable: false,
    });
    setTimeout(() => launchGame(gameId).catch(() => { }), 1000);
}

/**
 * Everything the main window needs wired up once: backend events, initial data
 * loads, the download poller, update checks, tray + audio sync and shortcuts for
 * newly added games. Keeping it in one hook keeps `App` readable and makes the
 * cleanup story obvious.
 */
export function useBackendBridge() {
    const setFirstLaunch = useUiStore((s) => s.setFirstLaunch);
    const knownIds = useRef<Set<string> | null>(null);

    // ── events + initial loads ──
    useEffect(() => {
        if (!isTauri()) {
            useGameStore.setState({ loaded: true });
            useSettingsStore.setState({ isLoading: false });
            return;
        }

        void useGameStore.getState().fetchGames();
        void useSettingsStore.getState().initialize();
        void useProfileStore.getState().fetchProfile();
        void useCollectionStore.getState().load();
        void useUpdateStore.getState().init();
        initOsIntegrationListeners();
        call<boolean>("is_first_launch").then((first) => first && setFirstLaunch(true)).catch(console.error);

        const offs = [
            on<{ game_id: string; source: "Launcher" | "AutoAttach" }>("game-started", (p) => {
                useProcessStore.getState().setGameStarted(p.game_id, {
                    gameId: p.game_id, source: p.source, startTime: Math.floor(Date.now() / 1000),
                });
            }),
            on<{ game_id: string; elapsed_seconds: number }>("game-stopped", (p) => {
                useProcessStore.getState().setGameStopped(p.game_id);
                useGameStore.getState().recordSession(p.game_id, p.elapsed_seconds);
            }),
            on<string>("stop-game-requested", (id) => {
                if (id) call("force_stop_game", { id }).catch(console.error);
            }),
            on<string[]>("single-instance", (args) => {
                for (const a of args) { const id = launchIdFrom(a); if (id) void backgroundLaunch(id); }
            }),
        ];
        const deep = onOpenUrl((urls) => {
            for (const u of urls) { const id = launchIdFrom(u); if (id) void backgroundLaunch(id); }
        });

        const stopPolling = startDownloadPoller(() => window.location.pathname.startsWith("/downloads"));

        return () => {
            offs.forEach((off) => off());
            deep.then((f) => f()).catch(() => { });
            stopPolling();
        };
    }, [setFirstLaunch]);

    // ── audio follows "is any game running" ──
    useEffect(() => {
        const sync = (running: Record<string, unknown>) => smartAudio.setGameRunning(Object.keys(running).length > 0);
        sync(useProcessStore.getState().running);
        return useProcessStore.subscribe((s) => sync(s.running));
    }, []);

    // ── tray gets the titles of running games (only when that set actually changes) ──
    useEffect(() => {
        if (!isTauri()) return;
        let last = "";
        const push = () => {
            const { running } = useProcessStore.getState();
            const games = useGameStore.getState().gamesById;
            const titles = Object.keys(running).map((id) => games[id]?.title).filter(Boolean) as string[];
            const key = titles.join("\u0000");
            if (key === last) return;
            last = key;
            call("update_tray", { titles }).catch(() => { });
        };
        const a = useProcessStore.subscribe(push);
        const b = useGameStore.subscribe(push);
        return () => { a(); b(); };
    }, []);

    // ── create desktop/start-menu shortcuts for games added while the app is open ──
    useEffect(() => {
        if (!isTauri()) return;
        return useGameStore.subscribe((s) => {
            if (!s.loaded) return;
            if (knownIds.current === null) { knownIds.current = new Set(Object.keys(s.gamesById)); return; }
            for (const g of Object.values(s.gamesById)) {
                if (knownIds.current.has(g.id)) continue;
                knownIds.current.add(g.id);
                call("create_all_shortcuts", {
                    gameId: g.id, title: g.title, exePath: shortcutTarget(g), installDir: g.install_dir || "",
                })
                    .then(() => toast.success("Shortcuts created", { description: `${g.title} was added to your Desktop and Start Menu.` }))
                    .catch(console.error);
            }
        });
    }, []);

    // ── UI click sound (delegated, one listener) ──
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest("button, [role='button'], a") && !t.closest("[data-no-press-sound]")) void smartAudio.playUI("press-sound.mp3");
        };
        document.addEventListener("click", onClick, { capture: true });
        return () => document.removeEventListener("click", onClick, { capture: true });
    }, []);
}
