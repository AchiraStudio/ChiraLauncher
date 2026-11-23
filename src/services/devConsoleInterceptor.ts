import { useDevConsoleStore } from "../store/devConsoleStore";
import { listen } from "@tauri-apps/api/event";

let isInitialized = false;

/** JSON.stringify that can't throw on circular structures (console.error must never crash). */
function fmt(a: unknown): string {
    if (typeof a !== "object" || a === null) return String(a);
    if (a instanceof Error) return a.stack || a.message;
    try { return JSON.stringify(a); } catch { return String(a); }
}

export function initDevConsoleInterceptor() {
    if (isInitialized) return;
    isInitialized = true;

    // Preserve original console methods
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleLog = console.log;

    console.error = (...args: any[]) => {
        originalConsoleError(...args);
        const msg = args.map(fmt).join(" ");
        useDevConsoleStore.getState().addLog("error", "Frontend", msg);
    };

    console.warn = (...args: any[]) => {
        originalConsoleWarn(...args);
        const msg = args.map(fmt).join(" ");
        useDevConsoleStore.getState().addLog("warn", "Frontend", msg);
    };

    console.log = (...args: any[]) => {
        originalConsoleLog(...args);
        const msg = args.map(fmt).join(" ");
        useDevConsoleStore.getState().addLog("info", "Frontend", msg);
    };

    window.onerror = (message, source, lineno, colno, error) => {
        useDevConsoleStore.getState().addLog(
            "error",
            "Frontend",
            `Uncaught Error: ${String(message)} (${source}:${lineno}:${colno})`,
            error
        );
        return false;
    };

    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
        useDevConsoleStore.getState().addLog(
            "error",
            "Frontend",
            `Unhandled Promise Rejection: ${String(event.reason)}`,
            event.reason
        );
    };

    // Listen to Tauri backend logs if emitted from Rust
    if (window.__TAURI_INTERNALS__) {
        listen<{ level: string; message: string; details?: string }>("backend-log", (event) => {
            const level = event.payload.level?.toLowerCase() || "info";
            const type = level.includes("err") ? "error" : level.includes("warn") ? "warn" : "backend";
            useDevConsoleStore.getState().addLog(
                type,
                "Backend",
                event.payload.message,
                event.payload.details
            );
        }).catch(() => {});
    }

    // Global shortcut Alt+Shift+F2 to toggle Developer Mode (buttons + Native DevTools)
    window.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.altKey && e.shiftKey && (e.key === "F2" || e.code === "F2")) {
            e.preventDefault();
            const isEnabled = useDevConsoleStore.getState().toggleDevButtons();

            if (window.__TAURI_INTERNALS__) {
                import("@tauri-apps/api/core").then(({ invoke }) => {
                    invoke("toggle_devtools").catch(console.error);
                });
            }

            import("sonner").then(({ toast }) => {
                if (isEnabled) {
                    toast.success("Developer Mode Enabled", { description: "Dev Console buttons & DevTools are now visible." });
                } else {
                    toast.info("Developer Mode Disabled", { description: "Dev Console buttons hidden." });
                }
            });
        }
    });

    useDevConsoleStore.getState().addLog("info", "System", "ChiraLauncher Developer Console Initialized. Hidden Shortcut: Alt+Shift+F2");
}


