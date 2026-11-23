import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./tauri";

/** Opens an http(s) link in the user's default browser (never inside the app window). */
export async function openExternal(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) return;
    try {
        if (isTauri()) await openUrl(url);
        else window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
        console.error("Failed to open link:", e);
    }
}

/** onClick for containers of sanitised HTML: routes any link inside to the system browser. */
export function interceptLinks(e: React.MouseEvent<HTMLElement>) {
    const a = (e.target as HTMLElement).closest("a");
    if (a) {
        e.preventDefault();
        const href = a.getAttribute("href");
        if (href) void openExternal(href);
    }
}
