import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "../../store/uiStore";
import { User, Shield, Rocket, Check } from "lucide-react";
import { toast } from "sonner";

export const FirstLaunchModal: React.FC = () => {
    const [username, setUsername] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const setFirstLaunch = useUiStore((s) => s.setFirstLaunch);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setIsSubmitting(true);
        try {
            await invoke("update_profile", {
                username: username.trim(),
                steamId: null,
                avatarUrl: null,
            });
            setFirstLaunch(false);
            toast.success(`Welcome, ${username}!`, {
                description: "Your profile has been created and will be used to personalize your games.",
            });
        } catch (error) {
            console.error(error);
            toast.error("Failed to create profile");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in duration-500">
            <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] p-8 shadow-2xl shadow-purple-500/20">
                {/* Decorative background elements */}
                <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-purple-600/20 blur-3xl" />
                <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />

                <div className="relative space-y-8">
                    <div className="space-y-2 text-center">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 shadow-lg shadow-purple-500/40">
                            <Rocket className="h-10 w-10 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-white pt-4">Welcome to ChiraLauncher</h1>
                        <p className="text-zinc-400">Let's set up your local gaming identity.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label htmlFor="username" className="text-sm font-medium text-zinc-300 ml-1">
                                Choose your Username
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                    <User className="h-5 w-5 text-zinc-500" />
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    placeholder="Enter username..."
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full rounded-2xl border border-white/5 bg-white/5 py-4 pl-12 pr-4 text-white placeholder-zinc-600 transition-all focus:border-purple-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                                    autoFocus
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 rounded-2xl bg-white/5 p-4 border border-white/5">
                            <div className="flex items-start gap-4">
                                <div className="mt-1 rounded-full bg-purple-500/20 p-2">
                                    <Shield className="h-4 w-4 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-medium text-white">Automated Patching</h3>
                                    <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                                        Your username will be automatically applied to supported game emulators (Goldberg, CODEX, etc.) to keep your progress unified.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !username.trim()}
                            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 py-4 font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/30 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                        >
                            <div className="flex items-center justify-center gap-2">
                                {isSubmitting ? (
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                ) : (
                                    <>
                                        <span>Start Gaming</span>
                                        <Check className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                                    </>
                                )}
                            </div>
                        </button>
                    </form>

                    <p className="text-center text-xs text-zinc-500 pt-4">
                        Everything is stored locally on your machine.
                    </p>
                </div>
            </div>
        </div>
    );
};
