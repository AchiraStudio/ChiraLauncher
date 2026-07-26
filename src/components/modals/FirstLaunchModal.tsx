import React, { useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { useProfileStore } from "../../store/profileStore";
import { User, Rocket, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const FirstLaunchModal: React.FC = () => {
    const [username, setUsername] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const setFirstLaunch = useUiStore((s) => s.setFirstLaunch);
    const { updateProfile } = useProfileStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setIsSubmitting(true);
        try {
            await updateProfile(username.trim(), null, null, null, false);
            setFirstLaunch(false);
            toast.success(`Welcome, ${username}!`, { description: "Your local vault is ready." });
        } catch {
            toast.error("Failed to create profile. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#08090f]/95 backdrop-blur-2xl animate-in fade-in duration-500">
            <div className="relative w-full max-w-md overflow-hidden rounded-[3rem] border border-white/10 bg-black/40 p-10 shadow-2xl">
                {/* Ambient Glows */}
                <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-accent/20 blur-[100px]" />
                <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-purple-600/20 blur-[100px]" />

                <div className="relative space-y-8 z-10">
                    <div className="space-y-3 text-center">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-accent/10 border border-accent/20 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
                            <Rocket className="h-10 w-10 text-accent" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-white uppercase pt-4">Initialize Vault</h1>
                        <p className="text-white/40 text-xs font-bold tracking-widest uppercase">Set your operator callsign to begin</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2 mb-2 block">Operator Callsign</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20" />
                                <input
                                    type="text"
                                    placeholder="Enter username..."
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-black/50 py-4 pl-12 pr-4 text-white font-bold outline-none focus:border-accent transition-colors"
                                    autoFocus
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmitting || !username.trim()}
                            className="w-full rounded-2xl bg-accent text-black py-4 font-black uppercase tracking-widest text-xs transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                        >
                            {isSubmitting
                                ? <Loader2 className="animate-spin" size={16} />
                                : <><Check size={16} /> Launch ChiraLauncher</>
                            }
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};