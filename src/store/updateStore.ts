import { create } from "zustand";
import { toast } from "sonner";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { call, errMsg, isTauri } from "../lib/tauri";
import { useUiStore } from "./uiStore";

export type UpdatePhase =
    | "idle"
    | "checking"
    | "uptodate"
    | "available"
    | "downloading"
    | "installing"
    | "error"
    /** Not running in Tauri, or no updater signing key has been configured yet. */
    | "unsupported";

interface Progress { downloaded: number; total: number | null; speed: number }

interface UpdateState {
    phase: UpdatePhase;
    currentVersion: string;
    version: string | null;
    notes: string | null;
    date: string | null;
    progress: Progress;
    error: string | null;
    lastChecked: number | null;
    autoCheck: boolean;
    skippedVersion: string | null;
    /** Why updating is unavailable (shown in Settings), when phase === "unsupported". */
    unsupportedReason: string | null;

    init: () => Promise<void>;
    checkForUpdates: (opts?: { silent?: boolean }) => Promise<void>;
    install: () => Promise<void>;
    skipVersion: () => void;
    setAutoCheck: (v: boolean) => void;
}

const LS = {
    last: "update.lastChecked",
    skipped: "update.skipped",
    auto: "update.autoCheck",
};
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

/** The plugin's Update object holds a native resource id, so it lives outside reactive state. */
let pending: Update | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

const SIX_HOURS = 6 * 60 * 60 * 1000;

export const useUpdateStore = create<UpdateState>((set, get) => ({
    phase: "idle",
    currentVersion: "",
    version: null,
    notes: null,
    date: null,
    progress: { downloaded: 0, total: null, speed: 0 },
    error: null,
    lastChecked: Number(read(LS.last)) || null,
    autoCheck: read(LS.auto) !== "0",
    skippedVersion: read(LS.skipped),
    unsupportedReason: null,

    init: async () => {
        if (!isTauri()) {
            set({ phase: "unsupported", unsupportedReason: "Updates are only available in the desktop app." });
            return;
        }
        try { set({ currentVersion: await getVersion() }); } catch { /* keep empty */ }

        // Is a signing key + endpoint configured in this build?
        const configured = await call<boolean>("updater_configured").catch(() => true);
        if (!configured) {
            set({ phase: "unsupported", unsupportedReason: "This build has no updater signing key yet. Run `npm run updater:keygen` once, then rebuild." });
            return;
        }

        if (get().autoCheck) {
            setTimeout(() => void get().checkForUpdates({ silent: true }), 6000);
            clearInterval(timer);
            timer = setInterval(() => {
                const { autoCheck, phase } = get();
                if (autoCheck && (phase === "idle" || phase === "uptodate" || phase === "error")) void get().checkForUpdates({ silent: true });
            }, SIX_HOURS);
        }
    },

    checkForUpdates: async ({ silent = false } = {}) => {
        const phase = get().phase;
        if (phase === "checking" || phase === "downloading" || phase === "installing" || phase === "unsupported") return;
        set({ phase: "checking", error: null });
        try {
            const update = await check({ timeout: 20000 });
            const now = Date.now();
            write(LS.last, String(now));
            if (!update) {
                pending = null;
                set({ phase: "uptodate", lastChecked: now, version: null, notes: null });
                if (!silent) toast.success("You're up to date", { description: `ChiraLauncher ${get().currentVersion} is the latest version.` });
                return;
            }
            pending = update;
            const skipped = get().skippedVersion === update.version;
            set({
                phase: skipped && silent ? "uptodate" : "available",
                lastChecked: now,
                version: update.version,
                notes: update.body ?? null,
                date: update.date ?? null,
            });
            if (!skipped || !silent) {
                toast(`Update ${update.version} is available`, {
                    description: "A new version of ChiraLauncher is ready to install.",
                    duration: 12000,
                    action: { label: "View", onClick: () => useUiStore.getState().setUpdateDialogOpen(true) },
                });
            }
        } catch (e) {
            const msg = errMsg(e);
            set({ phase: "error", error: msg });
            if (!silent) toast.error("Couldn't check for updates", { description: msg });
            else console.warn("[updater] silent check failed:", msg);
        }
    },

    install: async () => {
        if (!pending) return;
        set({ phase: "downloading", error: null, progress: { downloaded: 0, total: null, speed: 0 } });
        let downloaded = 0;
        let lastT = performance.now();
        let lastBytes = 0;
        try {
            await pending.downloadAndInstall((ev) => {
                if (ev.event === "Started") {
                    set({ progress: { downloaded: 0, total: ev.data.contentLength ?? null, speed: 0 } });
                } else if (ev.event === "Progress") {
                    downloaded += ev.data.chunkLength;
                    const now = performance.now();
                    // Smoothed speed, refreshed ~4x/s so the UI doesn't thrash
                    if (now - lastT > 250) {
                        const speed = ((downloaded - lastBytes) / (now - lastT)) * 1000;
                        lastT = now;
                        lastBytes = downloaded;
                        set((s) => ({ progress: { ...s.progress, downloaded, speed } }));
                    } else {
                        set((s) => ({ progress: { ...s.progress, downloaded } }));
                    }
                } else if (ev.event === "Finished") {
                    set({ phase: "installing" });
                }
            });
            set({ phase: "installing" });
            // On Windows the installer takes over and ends this process; elsewhere restart ourselves.
            await relaunch();
        } catch (e) {
            const msg = errMsg(e);
            set({ phase: "error", error: msg });
            toast.error("Update failed", { description: msg });
        }
    },

    skipVersion: () => {
        const v = get().version;
        if (!v) return;
        write(LS.skipped, v);
        set({ skippedVersion: v, phase: "uptodate" });
        useUiStore.getState().setUpdateDialogOpen(false);
    },

    setAutoCheck: (v) => {
        write(LS.auto, v ? "1" : "0");
        set({ autoCheck: v });
        if (!v) clearInterval(timer);
        else if (get().phase !== "unsupported") void get().init();
    },
}));
