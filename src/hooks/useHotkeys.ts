import { useEffect } from "react";

type Handler = (e: KeyboardEvent) => void;

/** True while the user is typing in a field (so single-key shortcuts must not fire). */
export function isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/**
 * Global shortcuts. Keys are written like "mod+k", "mod+shift+d", "/", "escape".
 * `mod` is Ctrl on Windows/Linux and Cmd on macOS.
 */
export function useHotkeys(map: Record<string, Handler>, deps: unknown[] = []) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const parts: string[] = [];
            if (e.ctrlKey || e.metaKey) parts.push("mod");
            if (e.shiftKey) parts.push("shift");
            if (e.altKey) parts.push("alt");
            parts.push(e.key.toLowerCase());
            const combo = parts.join("+");
            const handler = map[combo];
            if (!handler) return;
            // Plain-key shortcuts ("/") must not fire while typing; modifier combos always do.
            if (!combo.includes("mod") && !combo.includes("alt") && isTyping(e)) return;
            handler(e);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
