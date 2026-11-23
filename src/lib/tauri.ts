import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** True when running inside the Tauri webview (false in a plain browser / vite preview). */
export const isTauri = (): boolean => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

/** Turns whatever a rejected invoke() produced into a readable string. */
export function errMsg(e: unknown): string {
    if (typeof e === "string") return e;
    if (e instanceof Error) return e.message;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}

/** Typed invoke() that fails loudly (instead of with a cryptic TypeError) outside Tauri. */
export function call<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauri()) return Promise.reject(new Error(`Backend unavailable (${cmd}) - not running inside Tauri`));
    return invoke<T>(cmd, args);
}

/**
 * Subscribes to a backend event and returns a *synchronous* cleanup function.
 * Unlike `listen().then(fn => fn())` in an effect cleanup, this can never leak a
 * listener when the component unmounts before the subscription has resolved.
 */
export function on<T>(event: string, handler: (payload: T) => void): () => void {
    if (!isTauri()) return () => { };
    let disposed = false;
    let unlisten: (() => void) | null = null;
    listen<T>(event, (e) => handler(e.payload))
        .then((fn) => {
            if (disposed) fn();
            else unlisten = fn;
        })
        .catch(console.error);
    return () => {
        disposed = true;
        unlisten?.();
    };
}
