import React, { useState } from "react";
import { useUiStore } from "../../store/uiStore";
import { useProfileStore } from "../../store/profileStore";
import { supabase } from "../../lib/supabase";
import { invoke } from "@tauri-apps/api/core";
import { User, Rocket, Check, Globe, HardDrive, Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

type AuthMode = "select" | "local" | "cloud_signup" | "cloud_login";

export const FirstLaunchModal: React.FC = () => {
    const [mode, setMode] = useState<AuthMode>("select");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const setFirstLaunch = useUiStore((s) => s.setFirstLaunch);
    const { updateProfile } = useProfileStore();

    const handleLocalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setIsSubmitting(true);
        try {
            await updateProfile(username.trim(), null, null, null, false);
            setFirstLaunch(false);
            toast.success(`Welcome, ${username}!`, { description: "Local Node Initialized." });
        } catch (error) {
            toast.error("Failed to create local profile");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloudSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) return;

        setIsSubmitting(true);
        try {
            if (mode === "cloud_signup") {
                if (!username.trim()) {
                    toast.error("Callsign required for signup");
                    setIsSubmitting(false);
                    return;
                }

                // 1. Generate E2EE Keys locally via Rust
                const keys = await invoke<{ public_key: string, private_key: string }>("generate_keypair");

                // 2. Sign Up in Supabase
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { username: username.trim() } // This metadata is used by our DB Trigger!
                    }
                });
                if (error) throw error;

                // 3. Save full keypair to local SQLite
                await invoke("set_profile_keys", { public_key: keys.public_key, private_key: keys.private_key });

                // 4. Update the profile with the public key (Trigger already created the row)
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({ public_key: keys.public_key })
                    .eq('id', data.user?.id);

                if (profileError) console.error("Failed to upload public key:", profileError);

                // 5. Update Local Profile State
                await updateProfile(username.trim(), null, null, data.user?.id, true);

                toast.success("Network Uplink Established!", { description: "Encryption keys generated and synced." });
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;

                // Pull cloud profile data to sync local
                const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user?.id).single();
                if (profileError) throw profileError;

                await updateProfile(profileData?.username || "Operator", null, profileData?.avatar_url, data.user?.id, true);

                // If cloud has a public key but we don't have it locally, it means we're on a new device.
                // In a full E2EE app, we'd need to transfer the private key. For now, we'll just log it.
                if (profileData?.public_key) {
                    toast.info("Security Note", { description: "You are signed in, but you need to transfer your private key to this device to read past messages." });
                }

                toast.success("Identity Synced from Cloud!");
            }
            setFirstLaunch(false);
        } catch (error: any) {
            toast.error(error.message || "Authentication failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#08090f]/95 backdrop-blur-2xl animate-in fade-in duration-500">
            <div className="relative w-full max-w-xl overflow-hidden rounded-[3rem] border border-white/10 bg-black/40 p-10 shadow-2xl">

                {/* Ambient Glows */}
                <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-accent/20 blur-[100px]" />
                <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-purple-600/20 blur-[100px]" />

                <div className="relative space-y-8 z-10">
                    <div className="space-y-3 text-center">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-accent/10 border border-accent/20 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
                            <Rocket className="h-10 w-10 text-accent" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-white uppercase pt-4">Initialize Core</h1>
                        <p className="text-white/40 text-xs font-bold tracking-widest uppercase">Select your operational mode</p>
                    </div>

                    {mode === "select" && (
                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <button onClick={() => setMode("local")} className="bg-white/5 hover:bg-white/10 border border-white/10 p-6 rounded-3xl flex flex-col items-center gap-4 transition-all group active:scale-95">
                                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-colors"><HardDrive size={24} /></div>
                                <div className="text-center">
                                    <h3 className="font-black text-white uppercase tracking-wider text-sm">Local Node</h3>
                                    <p className="text-[10px] text-white/40 mt-2 font-medium">Offline vault. No social features. Data stays on your drive.</p>
                                </div>
                            </button>
                            <button onClick={() => setMode("cloud_login")} className="bg-accent/10 hover:bg-accent/20 border border-accent/20 p-6 rounded-3xl flex flex-col items-center gap-4 transition-all group active:scale-95 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                                <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center text-accent group-hover:scale-110 transition-transform"><Globe size={24} /></div>
                                <div className="text-center">
                                    <h3 className="font-black text-white uppercase tracking-wider text-sm">Network Uplink</h3>
                                    <p className="text-[10px] text-white/60 mt-2 font-medium">Cloud sync, global leaderboards, and E2EE messaging.</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {mode === "local" && (
                        <form onSubmit={handleLocalSubmit} className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2 mb-2 block">Operator Callsign</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20" />
                                    <input type="text" placeholder="Enter username..." value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/50 py-4 pl-12 pr-4 text-white font-bold outline-none focus:border-accent transition-colors" autoFocus required />
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setMode("select")} className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold uppercase tracking-widest transition-all">Back</button>
                                <button type="submit" disabled={isSubmitting || !username.trim()} className="flex-1 rounded-2xl bg-white text-black py-4 font-black uppercase tracking-widest text-xs transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <><Check size={16} /> Finalize Offline Profile</>}
                                </button>
                            </div>
                        </form>
                    )}

                    {(mode === "cloud_login" || mode === "cloud_signup") && (
                        <form onSubmit={handleCloudSubmit} className="space-y-5 animate-in slide-in-from-left-4 duration-300">
                            {mode === "cloud_signup" && (
                                <div>
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2 mb-2 block">Operator Callsign</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                        <input type="text" placeholder="Public Username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/50 py-3.5 pl-11 pr-4 text-white text-sm outline-none focus:border-accent transition-colors" required />
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2 mb-2 block">Network ID (Email)</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                    <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/50 py-3.5 pl-11 pr-4 text-white text-sm outline-none focus:border-accent transition-colors" required />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-2 mb-2 block">Passphrase</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                                    <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/50 py-3.5 pl-11 pr-4 text-white text-sm outline-none focus:border-accent transition-colors" required />
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 pt-2">
                                <div className="flex gap-3">
                                    <button type="button" onClick={() => setMode("select")} className="px-6 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold uppercase tracking-widest transition-all">Back</button>
                                    <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl bg-accent text-white py-4 font-black uppercase tracking-widest text-xs transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                                        {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <><Globe size={16} /> {mode === "cloud_login" ? "Authenticate" : "Establish Link"}</>}
                                    </button>
                                </div>
                                <button type="button" onClick={() => setMode(mode === "cloud_login" ? "cloud_signup" : "cloud_login")} className="text-[10px] font-bold text-white/40 hover:text-white uppercase tracking-widest mt-2">
                                    {mode === "cloud_login" ? "Need an account? Sign up" : "Already registered? Log in"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};