import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { toast } from "sonner";
import { useProcessStore } from "./store/processStore";
import { useGameStore } from "./store/gameStore";
import { useSettingsStore } from "./store/settingsStore";
import { useFolderStore } from "./store/folderStore";
import { useDownloadsStore } from "./store/downloadsStore";
import { useProfileStore } from "./store/profileStore";

import { AppLayout } from "./components/layout/AppLayout";
import { Browse } from "./Browse";
import Library from "./pages/Library";
import { Favorites } from "./Favorites";
import { Downloads } from "./Downloads";
import { Settings } from "./Settings";
import { UserPage } from "./UserPage";
import { TorrentFileModal } from "./components/modals/TorrentFileModal";
import { FirstLaunchModal } from "./components/modals/FirstLaunchModal";
import { ExtensionManager } from "./components/extensions/ExtensionManager";
import { useUiStore } from "./store/uiStore";
import { ThemeEngine } from "./services/ThemeEngine";
import { useExtensionStore } from "./store/extensionStore";
import { launchGame } from "./services/gameService";

import { useRepackStore } from "./store/repackStore";
import { invoke } from "@tauri-apps/api/core";

function useTraySync() {
  const runningGames = useProcessStore((s) => s.running);
  const gamesById = useGameStore((s) => s.gamesById);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    const titles = Object.keys(runningGames)
      .map((id) => gamesById[id]?.title)
      .filter(Boolean) as string[];

    invoke("update_tray", { titles }).catch(console.error);
  }, [runningGames, gamesById]);
}

function App() {
  const setGameStarted = useProcessStore((s) => s.setGameStarted);
  const setGameStopped = useProcessStore((s) => s.setGameStopped);
  const tickElapsed = useProcessStore((s) => s.tickElapsed);
  const updateGamePlaytime = useGameStore((s) => s.updateGamePlaytime);
  const setTorrentModalOpen = useUiStore((s) => s.setTorrentModalOpen);
  const isFirstLaunch = useUiStore((s) => s.isFirstLaunch);
  const setFirstLaunch = useUiStore((s) => s.setFirstLaunch);

  // --- Tauri Event Bridge ---
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
        }
      }
    });

    const unlistenSingleInstance = listen<string[]>("single-instance", (event) => {
      const args = event.payload;
      for (const arg of args) {
        if (arg.startsWith("magnet:")) {
          setTorrentModalOpen(true, arg);
          toast.success("Magnet link intercepted!", { description: arg.slice(0, 50) + "..." });
        }
      }
    });

    const unlistenLaunchGame = listen<string>("launch-game-requested", (event) => {
      launchGame(event.payload).catch(console.error);
      toast.info("Launching Game...", { description: `Requested via shortcut` });
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

  // --- Fetch Initial Data ---
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      console.warn("[ChiraLauncher] Operating in browser mode. Backend fetches skipped.");
      useGameStore.setState({ isLoading: false });
      useSettingsStore.setState({ isLoading: false });
      return;
    }

    useRepackStore.getState().initialize();
    useGameStore.getState().fetchGames();
    useSettingsStore.getState().initialize();
    useFolderStore.getState().load();
    useDownloadsStore.getState().startPolling();
    useProfileStore.getState().fetchProfile();

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

  useTraySync();

  useEffect(() => {
    if (window.__TAURI_INTERNALS__) {
      const hasSeenWarning = localStorage.getItem("magnet_override_warning");
      if (!hasSeenWarning) {
        toast.info("Magnet Handler Registered", {
          description: "ChiraLauncher is now your default magnet handler.",
          duration: 10000,
        });
        localStorage.setItem("magnet_override_warning", "true");
      }
    }
  }, []);

  if (isFirstLaunch) {
    return <FirstLaunchModal />;
  }

  return (
    <>
      <TorrentFileModal />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/browse" replace />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/library" element={<Library />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />

            <Route path="/user" element={<UserPage />} />
            <Route path="/extensions" element={<ExtensionManager />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;