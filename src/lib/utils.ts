type ClassValue = string | number | false | null | undefined | ClassValue[];

/** Tiny className joiner (no dependency needed for what we do). */
export function cn(...classes: ClassValue[]): string {
    let out = "";
    for (const c of classes) {
        if (!c) continue;
        const s = Array.isArray(c) ? cn(...c) : String(c);
        if (s) out += (out ? " " : "") + s;
    }
    return out;
}

/** Stable debounce with a cancel handle. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
    let t: ReturnType<typeof setTimeout> | undefined;
    const d = (...a: A) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
    };
    d.cancel = () => clearTimeout(t);
    d.flush = (...a: A) => {
        clearTimeout(t);
        fn(...a);
    };
    return d;
}

/** Last path segment of a Windows or POSIX path. */
export function basename(p: string): string {
    return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

/** Parent directory of a Windows or POSIX path. */
export function dirname(p: string): string {
    const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
    return i > 0 ? p.slice(0, i) : p;
}
