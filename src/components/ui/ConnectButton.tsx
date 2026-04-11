import { LogIn } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { cn } from "../../lib/utils";

interface ConnectButtonProps {
    className?: string;
    variant?: "primary" | "glass";
    text?: string;
}

export function ConnectButton({ className, variant = "primary", text = "Connect Identity" }: ConnectButtonProps) {
    const setAuthModalOpen = useUiStore(s => s.setAuthModalOpen);

    return (
        <button 
            onClick={() => setAuthModalOpen(true)}
            className={cn(
                "relative flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 active:scale-95 overflow-hidden group",
                variant === "primary" 
                    ? "bg-gradient-to-br from-blue-600 to-blue-900 text-white shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:shadow-[0_0_40px_rgba(37,99,235,0.5)] border border-blue-400/30 hover:border-blue-300/50" 
                    : "bg-white/5 backdrop-blur-md text-white border border-white/10 hover:bg-white/10 hover:border-white/20 shadow-xl",
                className
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <LogIn size={18} className={cn("relative z-10", variant === "primary" ? "drop-shadow-md" : "")} /> 
            <span className="relative z-10">{text}</span>
        </button>
    );
}