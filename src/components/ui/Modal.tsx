import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { IconButton } from "./Button";

const WIDTHS = {
    sm: "max-w-[420px]",
    md: "max-w-[560px]",
    lg: "max-w-[720px]",
    xl: "max-w-[960px]",
} as const;

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: ReactNode;
    subtitle?: ReactNode;
    icon?: ReactNode;
    size?: keyof typeof WIDTHS;
    /** Rendered in a bordered footer bar. */
    footer?: ReactNode;
    /** Extra header content (right side, before the close button). */
    actions?: ReactNode;
    /** Click on the backdrop / Esc closes the modal. Disable for destructive in-flight work. */
    dismissable?: boolean;
    bodyClassName?: string;
    children: ReactNode;
}

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
    open, onClose, title, subtitle, icon, size = "md", footer, actions, dismissable = true, bodyClassName, children,
}: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;

        // Move focus into the dialog (prefer a field over the header close button)
        const t = setTimeout(() => {
            const el = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select") ??
                panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
            el?.focus();
        }, 30);

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && dismissable) {
                e.stopPropagation();
                onCloseRef.current();
            } else if (e.key === "Tab" && panelRef.current) {
                // Keep Tab inside the dialog
                const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
                if (items.length === 0) return;
                const first = items[0];
                const last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => {
            clearTimeout(t);
            document.removeEventListener("keydown", onKey, true);
            previouslyFocused?.focus?.();
        };
    }, [open, dismissable]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[150] flex animate-fade-in items-center justify-center bg-black/70 p-5 pt-14"
            onMouseDown={(e) => {
                if (dismissable && e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                className={cn(
                    "flex max-h-full w-full animate-pop-in flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-pop",
                    WIDTHS[size],
                )}
            >
                {(title || icon) && (
                    <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
                        {icon && (
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent/12 text-accent">{icon}</div>
                        )}
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-[15px] font-semibold leading-tight text-fg">{title}</h2>
                            {subtitle && <p className="mt-0.5 truncate text-xs text-fg-mute">{subtitle}</p>}
                        </div>
                        {actions}
                        {dismissable && (
                            <IconButton label="Close" size="sm" onClick={onClose}>
                                <X size={16} />
                            </IconButton>
                        )}
                    </div>
                )}
                <div className={cn("min-h-0 flex-1 overflow-y-auto p-5", bodyClassName)}>{children}</div>
                {footer && <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-black/20 px-5 py-3.5">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}
