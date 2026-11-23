import { useCallback, useState } from "react";

/** useState that survives restarts via localStorage (and degrades silently when storage is unavailable). */
export function usePersistentState<T extends string | number | boolean>(key: string, initial: T) {
    const [value, setValue] = useState<T>(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return initial;
            if (typeof initial === "number") return (Number(raw) || initial) as T;
            if (typeof initial === "boolean") return (raw === "1") as T;
            return raw as T;
        } catch { return initial; }
    });
    const set = useCallback((v: T) => {
        setValue(v);
        try { localStorage.setItem(key, typeof v === "boolean" ? (v ? "1" : "0") : String(v)); } catch { /* ignore */ }
    }, [key]);
    return [value, set] as const;
}
