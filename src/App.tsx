import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./lib/tauri";
import { useUiStore } from "./store/uiStore";
import { useBackendBridge } from "./hooks/useBackendBridge";
import { AppShell } from "./components/layout/AppShell";
import { FirstLaunchModal } from "./components/modals/FirstLaunchModal";
import { Spinner } from "./components/ui/Spinner";

// Route-level code splitting: each page is fetched when first visited.
// Secondary windows (tray menu, launch splash) are only parsed when their window is opened.
const TrayMenu = lazy(() => import("./pages/TrayMenu"));
const LaunchSplash = lazy(() => import("./LaunchSplash").then((m) => ({ default: m.LaunchSplash })));
const Home = lazy(() => import("./pages/Home"));
const LibraryPage = lazy(() => import("./pages/Library"));
const GameDetail = lazy(() => import("./pages/GameDetail"));
const Downloads = lazy(() => import("./pages/Downloads"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));

function MainApp() {
    useBackendBridge();
    const isFirstLaunch = useUiStore((s) => s.isFirstLaunch);

    if (isFirstLaunch) return <FirstLaunchModal />;

    return (
        <BrowserRouter>
            <Suspense fallback={<div className="grid h-screen w-screen place-items-center bg-bg text-fg-mute"><Spinner size={24} /></div>}>
                <Routes>
                    <Route element={<AppShell />}>
                        <Route index element={<Home />} />
                        <Route path="library" element={<LibraryPage />} />
                        <Route path="game/:id" element={<GameDetail />} />
                        <Route path="downloads" element={<Downloads />} />
                        <Route path="settings" element={<SettingsPage />} />
                        <Route path="profile" element={<Profile />} />
                        {/* Old routes keep working (shortcuts, muscle memory) */}
                        <Route path="favorites" element={<Navigate to="/library?filter=favorites" replace />} />
                        <Route path="user" element={<Navigate to="/profile" replace />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Suspense>
        </BrowserRouter>
    );
}

/** The same bundle serves several windows; the window label decides what to render. */
export default function App() {
    const label = isTauri() ? getCurrentWindow().label : "main";
    if (label === "tray") return <Suspense fallback={null}><TrayMenu /></Suspense>;
    if (label.startsWith("splash")) return <Suspense fallback={null}><LaunchSplash /></Suspense>;
    return <MainApp />;
}
