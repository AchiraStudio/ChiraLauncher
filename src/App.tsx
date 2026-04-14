import { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { toast } from "sonner";
import { useProcessStore } from "./store/processStore";
import { useGameStore } from "./store/gameStore";
import { useSettingsStore } from "./store/settingsStore";
import { useFolderStore } from "./store/folderStore";
import { useDownloadsStore } from "./store/downloadsStore";
import { useProfileStore } from "./store/profileStore";

import { AppLayout } from "./components/layout/AppLayout";
import { Discover } from "./Discover";
import { Browse } from "./Browse";
import Library from "./Library";
import { Favorites } from "./Favorites";
import { Downloads } from "./Downloads";
import { Settings } from "./Settings";
import { UserPage } from "./UserPage";
import { Messages } from "./Messages";
import { LaunchSplash } from "./LaunchSplash";
import TrayMenu from "./pages/TrayMenu";
import { TorrentFileModal } from "./components/modals/TorrentFileModal";
import { FirstLaunchModal } from "./components/modals/FirstLaunchModal";
import { ExtensionManager } from "./components/extensions/ExtensionManager";
import { useUiStore } from "./store/uiStore";
import { ThemeEngine } from "./services/ThemeEngine";
import { useExtensionStore } from "./store/extensionStore";
import { launchGame } from "./services/gameService";
import { useCloudSyncEngine } from "./lib/syncEngine";

import { invoke } from "@tauri-apps/api/core";
import { smartAudio } from "./services/SmartAudio";

function useTraySync() {
  const runningGames = useProcessStore((s: any) => s.running);
  const gamesById = useGameStore((s: any) => s.gamesById);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    const titles = Object.keys(runningGames)
      .map((id) => gamesById[id]?.title)
      .filter(Boolean) as string[];

    invoke("update_tray", { titles }).catch(console.error);
  }, [runningGames, gamesById]);
}

export default function App() {
  const setGameStarted = useProcessStore((s: any) => s.setGameStarted);
  const setGameStopped = useProcessStore((s: any) => s.setGameStopped);
  const tickElapsed = useProcessStore((s: any) => s.tickElapsed);
  const updateGamePlaytime = useGameStore((s: any) => s.updateGamePlaytime);
  const setTorrentModalOpen = useUiStore((s: any) => s.setTorrentModalOpen);
  const isFirstLaunch = useUiStore((s: any) => s.isFirstLaunch);
  const setFirstLaunch = useUiStore((s: any) => s.setFirstLaunch);

  const gamesById = useGameStore((s: any) => s.gamesById || {});
  const prevGamesRef = useRef<any[]>(Object.values(gamesById));

  // Auto-sync process state to the Smart Audio engine
  // This will cleanly pause BGM whenever a game is playing
  const runningGames = useProcessStore((s: any) => s.running);
  useEffect(() => {
    const isPlaying = Object.keys(runningGames).length > 0;
    smartAudio.setGameRunning(isPlaying);
  }, [runningGames]);

  useCloudSyncEngine();

  // ── AUTO-SHORTCUT CREATOR ──
  useEffect(() => {
    const currentGames = Object.values(gamesById);
    const prevGames = prevGamesRef.current;

    if (prevGames.length > 0 && currentGames.length > prevGames.length) {
      const addedGames = currentGames.filter((g: any) => !prevGames.some((pg: any) => pg.id === g.id));

      addedGames.forEach((newGame: any) => {
        invoke("create_all_shortcuts", {
          gameId: newGame.id,
          title: newGame.title,
          exePath: newGame.executable_path,
          installDir: newGame.install_dir || ""
        }).then(() => {
          toast.success("Shortcuts Deployed", { description: `${newGame.title} added to Desktop & Start Menu.` });
        }).catch(console.error);
      });
    }

    prevGamesRef.current = currentGames;
  }, [gamesById]);

  // ── Background Launch Handler ──
  const triggerBackgroundLaunch = async (gameId: string, attempts = 0) => {
    let game = useGameStore.getState().gamesById[gameId];

    // Retry up to 10 times (5 seconds) if the DB is still hydrating
    if (!game && attempts < 10) {
      setTimeout(() => triggerBackgroundLaunch(gameId, attempts + 1), 500);
      return;
    }

    if (!game) {
      // Fallback if still not found
      launchGame(gameId).catch(console.error);
      return;
    }

    new WebviewWindow(`splash-${Date.now()}`, {
      url: `/splash?title=${encodeURIComponent(game.title)}&cover=${encodeURIComponent(game.cover_image_path || '')}`,
      width: 480,
      height: 160,
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      center: true,
      skipTaskbar: true,
      resizable: false
    });

    setTimeout(() => {
      launchGame(gameId).catch(console.error);
    }, 1000);
  };

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      console.warn("[ChiraLauncher] Tauri runtime not detected. Event bridge disabled.");
      return;
    }

    const unlistenStarted = listen<{ game_id: string; source: "Launcher" | "AutoAttach" }>(
      "game-started",
      (event) => {
        setGameStarted(event.payload.game_id, {
          gameId: event.payload.game_id,
          source: event.payload.source,
          pid: 0,
          startTime: Math.floor(Date.now() / 1000),
        });
      }
    );

    const unlistenStopped = listen<{ game_id: string; elapsed_seconds: number }>(
      "game-stopped",
      (event) => {
        setGameStopped(event.payload.game_id);
        updateGamePlaytime(event.payload.game_id, event.payload.elapsed_seconds);
      }
    );

    const unlistenDeepLink = onOpenUrl((urls) => {
      for (const url of urls) {
        if (url.startsWith("magnet:")) {
          setTorrentModalOpen(true, url);
          toast.success("Magnet link intercepted!", { description: url.slice(0, 50) + "..." });
        } else if (url.includes("chiralauncher://launch/")) {
          const id = url.split("chiralauncher://launch/")[1].replace(/\/$/, "");
          triggerBackgroundLaunch(id);
        }
      }
    });

    const unlistenSingleInstance = listen<string[]>("single-instance", (event) => {
      const args = event.payload;
      for (const arg of args) {
        if (arg.startsWith("magnet:")) {
          setTorrentModalOpen(true, arg);
          toast.success("Magnet link intercepted!", { description: arg.slice(0, 50) + "..." });
        } else if (arg.includes("chiralauncher://launch/")) {
          const id = arg.split("chiralauncher://launch/")[1].replace(/\/$/, "");
          triggerBackgroundLaunch(id);
        }
      }
    });

    const unlistenLaunchGame = listen<string>("launch-game-requested", (event) => {
      triggerBackgroundLaunch(event.payload);
      toast.info("System Initializing...", { description: `Requested via shortcut` });
    });

    const ticker = setInterval(() => {
      tickElapsed();
    }, 1000);

    return () => {
      unlistenStarted.then((f) => f());
      unlistenStopped.then((f) => f());
      unlistenDeepLink.then((f) => f());
      unlistenSingleInstance.then((f) => f());
      unlistenLaunchGame.then((f) => f());
      clearInterval(ticker);
    };
  }, [setGameStarted, setGameStopped, tickElapsed, updateGamePlaytime]);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      useGameStore.setState({ isLoading: false });
      useSettingsStore.setState({ isLoading: false });
      return;
    }

    useGameStore.getState().fetchGames();
    useSettingsStore.getState().initialize();
    useFolderStore.getState().load();
    useDownloadsStore.getState().startPolling();

    useProfileStore.getState().fetchProfile();
    useProfileStore.getState().initAuthListener();

    invoke("is_first_launch")
      .then((isFirst) => {
        if (isFirst) setFirstLaunch(true);
      })
      .catch(console.error);

    const extStore = useExtensionStore.getState();
    extStore.fetchExtensions().then(() => {
      const activeTheme = extStore.extensions.find(e => e.kind === 'theme' && e.enabled);
      if (activeTheme) {
        ThemeEngine.getInstance().applyTheme(activeTheme);
      }
    });
  }, []);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isClickable = target.closest('button') || target.closest('[role="button"]') || target.closest('a');
      const shouldSkip = target.closest('[data-no-press-sound]');
      
      if (isClickable && !shouldSkip) {
        smartAudio.playUI('press-sound.mp3');
      }
    };
    
    document.addEventListener('click', handleGlobalClick, { capture: true });
    return () => document.removeEventListener('click', handleGlobalClick, { capture: true });
  }, []);

  useTraySync();

  if (isFirstLaunch) {
    return <FirstLaunchModal />;
  }

  return (
    <>
      <TorrentFileModal />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/discover" replace />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/library" element={<Library />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/user" element={<UserPage />} />
            <Route path="/messages/:targetId" element={<Messages />} />
            <Route path="/extensions" element={<ExtensionManager />} />
          </Route>

          <Route path="/splash" element={<LaunchSplash />} />
          <Route path="/tray" element={<TrayMenu />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}