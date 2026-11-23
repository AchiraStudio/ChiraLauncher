import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
    primary: "bg-accent text-accent-fg hover:brightness-110 active:brightness-95 shadow-[0_6px_20px_-8px_var(--color-accent)]",
    secondary: "bg-white/[0.06] text-fg border border-line-strong hover:bg-white/[0.1] hover:border-white/25",
    ghost: "text-fg-soft hover:text-fg hover:bg-white/[0.07]",
    danger: "bg-danger/12 text-danger border border-danger/25 hover:bg-danger/22",
    success: "bg-ok/15 text-ok border border-ok/25 hover:bg-ok/25",
};

const SIZES: Record<Size, string> = {
    sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[9px]",
    md: "h-9 px-4 text-sm gap-2 rounded-ctl",
    lg: "h-11 px-6 text-[15px] gap-2.5 rounded-xl",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            className={cn(
                "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,border-color,filter,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
                VARIANTS[variant],
                SIZES[size],
                className,
            )}
            {...rest}
        >
            {loading ? <Spinner size={size === "lg" ? 18 : 15} /> : icon}
            {children}
        </button>
    );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    size?: "sm" | "md" | "lg";
    active?: boolean;
    tone?: "default" | "danger" | "accent";
}

const ICON_SIZES = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-11 w-11" } as const;

/** Square icon-only button. `label` doubles as the tooltip and the accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
    { label, size = "md", active, tone = "default", className, children, type = "button", ...rest },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            aria-label={label}
            title={label}
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-ctl transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-45",
                ICON_SIZES[size],
                tone === "danger"
                    ? "text-fg-soft hover:bg-danger/15 hover:text-danger"
                    : tone === "accent" || active
                        ? "bg-accent/15 text-accent hover:bg-accent/25"
                        : "text-fg-soft hover:bg-white/[0.08] hover:text-fg",
                className,
            )}
            {...rest}
        >
            {children}
        </button>
    );
});
