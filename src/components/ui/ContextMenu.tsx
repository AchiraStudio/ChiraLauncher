import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Home, Library, HardDriveDownload, Settings, RefreshCw } from "lucide-react";
import { useMenuStore, type MenuItem } from "../../store/menuStore";
import { cn } from "../../lib/utils";

/** Single app-wide context menu host. Mounted once in the shell. */
export function ContextMenuRoot() {
    const menu = useMenuStore((s) => s.menu);
    const open = useMenuStore((s) => s.open);
    const close = useMenuStore((s) => s.close);
    const navigate = useNavigate();

    // Fallback menu for right-clicks nobody handled. Native menus stay available in text fields.
    useEffect(() => {
        const onCtx = (e: MouseEvent) => {
            if (e.defaultPrevented) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest("input, textarea, [contenteditable='true']")) return;
            e.preventDefault();
            open(e.clientX, e.clientY, [
                { label: "Home", icon: <Home size={15} />, onClick: () => navigate("/") },
                { label: "Library", icon: <Library size={15} />, onClick: () => navigate("/library") },
                { label: "Downloads", icon: <HardDriveDownload size={15} />, onClick: () => navigate("/downloads") },
                { label: "Settings", icon: <Settings size={15} />, onClick: () => navigate("/settings") },
                { separator: true },
                { label: "Reload", icon: <RefreshCw size={15} />, onClick: () => window.location.reload() },
            ]);
        };
        document.addEventListener("contextmenu", onCtx);
        return () => document.removeEventListener("contextmenu", onCtx);
    }, [navigate, open]);

    if (!menu) return null;
    return createPortal(<MenuPanel x={menu.x} y={menu.y} items={menu.items} onClose={close} />, document.body);
}

function MenuPanel({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: x, top: y });
    const [index, setIndex] = useState(-1);

    // Clamp to the viewport once we know our size
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { offsetWidth: w, offsetHeight: h } = el;
        setPos({
            left: Math.max(8, x + w > window.innerWidth - 8 ? x - w : x),
            top: Math.max(8, y + h > window.innerHeight - 8 ? window.innerHeight - h - 8 : y),
        });
    }, [x, y, items]);

    useEffect(() => {
        const actionable = items.map((it, i) => (it.separator || it.disabled ? -1 : i)).filter((i) => i >= 0);
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((cur) => {
                    const at = actionable.indexOf(cur);
                    const next = e.key === "ArrowDown" ? (at + 1) % actionable.length : (at <= 0 ? actionable.length - 1 : at - 1);
                    return actionable[next];
                });
            } else if (e.key === "Enter") {
                setIndex((cur) => {
                    const it = items[cur];
                    if (it && !it.disabled) { it.onClick?.(); onClose(); }
                    return cur;
                });
            }
        };
        window.addEventListener("mousedown", onDown, true);
        window.addEventListener("keydown", onKey);
        window.addEventListener("blur", onClose);
        window.addEventListener("resize", onClose);
        window.addEventListener("wheel", onClose, { passive: true });
        return () => {
            window.removeEventListener("mousedown", onDown, true);
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("blur", onClose);
            window.removeEventListener("resize", onClose);
            window.removeEventListener("wheel", onClose);
        };
    }, [items, onClose]);

    return (
        <div
            ref={ref}
            role="menu"
            style={{ left: pos.left, top: pos.top }}
            className="fixed z-[400] min-w-[210px] animate-pop-in overflow-hidden rounded-xl border border-line-strong bg-overlay p-1.5 shadow-pop"
        >
            {items.map((item, i) =>
                item.separator ? (
                    <div key={i} className="mx-2 my-1.5 h-px bg-line" />
                ) : (
                    <button
                        key={i}
                        role="menuitem"
                        disabled={item.disabled}
                        onMouseEnter={() => setIndex(i)}
                        onClick={() => { item.onClick?.(); onClose(); }}
                        className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors disabled:opacity-35",
                            index === i && (item.danger ? "bg-danger/15" : "bg-white/[0.08]"),
                            item.danger ? "text-danger" : "text-fg",
                        )}
                    >
                        {item.icon && <span className={cn("grid w-4 place-items-center", item.danger ? "text-danger" : "text-fg-mute")}>{item.icon}</span>}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.shortcut && <span className="font-mono text-[11px] text-fg-mute">{item.shortcut}</span>}
                    </button>
                ),
            )}
        </div>
    );
}
