import React from "react";
import ReactDOM from "react-dom/client";
import AchievementOverlay from "./components/overlay/AchievementOverlay";
import { useSettingsStore } from "./store/settingsStore";

// The overlay window spins up as a totally separate webview. 
// We must initialize the settings from the DB before rendering 
// so the audio engine knows what volume level to use!
useSettingsStore.getState().initialize().then(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
            <AchievementOverlay />
        </React.StrictMode>
    );
});