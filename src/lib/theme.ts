/** Relative luminance (WCAG) of a #rrggbb colour, 0..1. */
function luminance(hex: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/**
 * Applies the user's accent colour to the whole app, and picks a readable
 * foreground (dark text on bright accents like yellow, white text otherwise).
 */
export function applyAccent(hex: string | undefined | null) {
    const color = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#3b82f6";
    const root = document.documentElement.style;
    root.setProperty("--color-accent", color);
    root.setProperty("--color-accent-fg", luminance(color) > 0.42 ? "#0a0c12" : "#ffffff");
}

export const ACCENT_PRESETS = [
    { name: "Azure", value: "#3b82f6" },
    { name: "Cyan", value: "#06b6d4" },
    { name: "Violet", value: "#8b5cf6" },
    { name: "Rose", value: "#ec4899" },
    { name: "Emerald", value: "#10b981" },
    { name: "Amber", value: "#f59e0b" },
    { name: "Crimson", value: "#ef4444" },
    { name: "Slate", value: "#94a3b8" },
] as const;
