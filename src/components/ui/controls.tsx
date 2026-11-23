import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/* ── Switch ───────────────────────────────────────────────────────────────── */
export function Switch({
    checked, onChange, disabled, label,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative h-[22px] w-10 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-45",
                checked ? "border-accent bg-accent" : "border-line-strong bg-white/10",
            )}
        >
            <span
                className={cn(
                    "absolute top-[2px] h-4 w-4 rounded-full shadow transition-all duration-200",
                    checked ? "left-[20px] bg-accent-fg" : "left-[2px] bg-white",
                )}
            />
        </button>
    );
}

/* ── Slider ───────────────────────────────────────────────────────────────── */
export function Slider({
    value, min = 0, max = 100, step = 1, onChange, format, label,
}: {
    value: number; min?: number; max?: number; step?: number;
    onChange: (v: number) => void; format?: (v: number) => string; label?: string;
}) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div className="flex items-center gap-3">
            <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="slider h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none"
                style={{ background: `linear-gradient(90deg, var(--color-accent) ${pct}%, rgb(255 255 255 / 0.1) ${pct}%)` }}
            />
            <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-fg-soft">
                {format ? format(value) : value}
            </span>
        </div>
    );
}

/* ── Field / inputs ───────────────────────────────────────────────────────── */
export function Field({
    label, hint, children, className,
}: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <div className={cn("space-y-1.5", className)}>
            {label && <label className="block text-[13px] font-medium text-fg-soft">{label}</label>}
            {children}
            {hint && <p className="text-xs leading-relaxed text-fg-mute">{hint}</p>}
        </div>
    );
}

const inputBase =
    "w-full rounded-ctl border border-line-strong bg-raised px-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-mute hover:border-white/25 focus:border-accent/70 focus:bg-overlay disabled:opacity-50";

export function TextInput({
    icon, mono, className, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; mono?: boolean }) {
    return (
        <div className="relative min-w-0 flex-1">
            {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute">{icon}</span>}
            <input
                spellCheck={false}
                className={cn(inputBase, "h-9", icon ? "pl-9" : "", mono && "font-mono text-[13px]", className)}
                {...rest}
            />
        </div>
    );
}

export function TextArea({ className, mono, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
    return (
        <textarea
            spellCheck={false}
            className={cn(inputBase, "min-h-[96px] resize-y py-2.5 leading-relaxed", mono && "font-mono text-[13px]", className)}
            {...rest}
        />
    );
}

/* ── Segmented control ────────────────────────────────────────────────────── */
export function Segmented<T extends string>({
    value, options, onChange, size = "md",
}: {
    value: T;
    options: { value: T; label: ReactNode; icon?: ReactNode }[];
    onChange: (v: T) => void;
    size?: "sm" | "md";
}) {
    return (
        <div role="tablist" className="inline-flex rounded-ctl border border-line bg-black/25 p-0.5">
            {options.map((o) => (
                <button
                    key={o.value}
                    role="tab"
                    aria-selected={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-[8px] font-medium transition-colors",
                        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-[13px]",
                        value === o.value ? "bg-white/[0.11] text-fg shadow-sm" : "text-fg-mute hover:text-fg-soft",
                    )}
                >
                    {o.icon}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/* ── Badge / Kbd ──────────────────────────────────────────────────────────── */
const TONES = {
    neutral: "bg-white/[0.07] text-fg-soft border-line",
    accent: "bg-accent/15 text-accent border-accent/25",
    ok: "bg-ok/12 text-ok border-ok/25",
    warn: "bg-warn/12 text-warn border-warn/25",
    danger: "bg-danger/12 text-danger border-danger/25",
} as const;

export function Badge({
    tone = "neutral", icon, children, className, title,
}: { tone?: keyof typeof TONES; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
    return (
        <span
            title={title}
            className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium", TONES[tone], className)}
        >
            {icon}
            {children}
        </span>
    );
}

export function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-white/[0.06] px-1.5 font-mono text-[10.5px] text-fg-soft">
            {children}
        </kbd>
    );
}

/* ── Progress ─────────────────────────────────────────────────────────────── */
export function ProgressBar({
    value, tone = "accent", indeterminate, className, height = 6,
}: { value?: number; tone?: "accent" | "ok" | "warn" | "danger"; indeterminate?: boolean; className?: string; height?: number }) {
    const fill = { accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[tone];
    return (
        <div
            className={cn("relative w-full overflow-hidden rounded-full bg-white/[0.08]", className)}
            style={{ height }}
            role="progressbar"
            aria-valuenow={indeterminate ? undefined : Math.round(value ?? 0)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            {indeterminate ? (
                <div className={cn("absolute inset-y-0 w-1/3 rounded-full", fill)} style={{ animation: "indeterminate 1.3s ease-in-out infinite" }} />
            ) : (
                // transform instead of width: stays on the compositor, no layout per tick
                <div
                    className={cn("h-full w-full origin-left rounded-full transition-transform duration-500 ease-out", fill)}
                    style={{ transform: `scaleX(${Math.max(0, Math.min(100, value ?? 0)) / 100})` }}
                />
            )}
        </div>
    );
}

/* ── Settings layout helpers ──────────────────────────────────────────────── */
export function SettingRow({
    title, description, children, stacked,
}: { title: ReactNode; description?: ReactNode; children?: ReactNode; stacked?: boolean }) {
    const id = useId();
    return (
        <div className={cn("flex gap-4 py-3.5", stacked ? "flex-col" : "items-center justify-between")}>
            <div className="min-w-0">
                <div id={id} className="text-sm font-medium text-fg">{title}</div>
                {description && <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-fg-mute">{description}</p>}
            </div>
            {children && <div className={cn(stacked ? "w-full" : "shrink-0")}>{children}</div>}
        </div>
    );
}

export function Card({ title, description, children, className, action }: {
    title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode;
}) {
    return (
        <section className={cn("surface", className)}>
            {(title || action) && (
                <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                    <div>
                        <h3 className="text-sm font-semibold text-fg">{title}</h3>
                        {description && <p className="mt-0.5 text-[13px] text-fg-mute">{description}</p>}
                    </div>
                    {action}
                </header>
            )}
            <div className="divide-y divide-line px-5">{children}</div>
        </section>
    );
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
export function EmptyState({
    icon, title, description, actions, className,
}: { icon: ReactNode; title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
            <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-line bg-white/[0.03] text-fg-mute">{icon}</div>
            <h3 className="text-lg font-semibold text-fg">{title}</h3>
            {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-mute">{description}</p>}
            {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
        </div>
    );
}

/* ── Tooltip (CSS only, zero JS) ──────────────────────────────────────────── */
export function Tooltip({
    label, children, side = "right",
}: { label: ReactNode; children: ReactNode; side?: "right" | "top" | "bottom" }) {
    const pos = {
        right: "left-[calc(100%+10px)] top-1/2 -translate-y-1/2",
        top: "bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2",
        bottom: "top-[calc(100%+8px)] left-1/2 -translate-x-1/2",
    }[side];
    return (
        <div className="group/tt relative">
            {children}
            <div
                role="tooltip"
                className={cn(
                    "pointer-events-none absolute z-[300] whitespace-nowrap rounded-md border border-line-strong bg-overlay px-2 py-1 text-xs font-medium text-fg opacity-0 shadow-pop transition-opacity delay-300 duration-150 group-hover/tt:opacity-100",
                    pos,
                )}
            >
                {label}
            </div>
        </div>
    );
}
