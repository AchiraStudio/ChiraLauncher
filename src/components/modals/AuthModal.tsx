import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUiStore } from "../../store/uiStore";
import { useProfileStore } from "../../store/profileStore";
import { supabase } from "../../lib/supabase";
import { X, Mail, Lock, User, Loader2, ShieldCheck, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";

export function AuthModal() {
    const { isAuthModalOpen, setAuthModalOpen } = useUiStore();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");

    if (!isAuthModalOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isLogin) {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                
                const { data: profileData, error: profileErr } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();
                    
                if (!profileErr && profileData) {
                    await useProfileStore.getState().updateProfile(
                        profileData.username,
                        profileData.steam_id,
                        profileData.avatar_url,
                        data.user.id,
                        true
                    );
                }
                toast.success("Welcome back, Pilot");
            } else {
                const { error } = await supabase.auth.signUp({ 
                    email, 
                    password,
                    options: { data: { display_name: username } }
                });
                if (error) throw error;
                toast.success("Identity established. Please check your email.");
            }
            setAuthModalOpen(false);
        } catch (err: any) {
            toast.error(err.message || "Authentication failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 backdrop-blur-2xl"
                    onClick={() => setAuthModalOpen(false)}
                />
                
                <motion.div
                    initial={{ scale: 0.95, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.95, y: 20, opacity: 0 }}
                    className="relative w-full max-w-md bg-[#0a0f18]/90 border border-white/10 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.9)] overflow-hidden"
                >
                    <div className="absolute -top-32 -left-32 w-64 h-64 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />

                    <div className="h-32 bg-gradient-to-b from-blue-900/20 to-transparent flex items-center justify-center relative border-b border-white/5">
                        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-400/20 flex items-center justify-center backdrop-blur-md shadow-[0_0_30px_rgba(37,99,235,0.2)]">
                            <ShieldCheck className="text-blue-400 w-8 h-8" />
                        </div>
                        <button 
                            onClick={() => setAuthModalOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-transparent hover:border-white/10"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-10 relative z-10">
                        <div className="text-center mb-10">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tight drop-shadow-md">
                                {isLogin ? "Welcome Back" : "Establish Link"}
                            </h2>
                            <p className="text-blue-200/50 text-[10px] font-bold uppercase tracking-widest mt-2">
                                {isLogin ? "Reconnect to the global grid" : "Initialize a new identity node"}
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {!isLogin && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Callsign</label>
                                    <div className="relative group">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-400 transition-colors" />
                                        <input 
                                            required type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-5 py-4 text-sm text-white outline-none focus:border-blue-500/50 focus:bg-blue-900/10 transition-all font-medium shadow-inner"
                                            placeholder="Pilot Name"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Uplink Address</label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-400 transition-colors" />
                                    <input 
                                        required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-5 py-4 text-sm text-white outline-none focus:border-blue-500/50 focus:bg-blue-900/10 transition-all font-medium shadow-inner"
                                        placeholder="email@example.com"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Access Key</label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-400 transition-colors" />
                                    <input 
                                        required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-5 py-4 text-sm text-white outline-none focus:border-blue-500/50 focus:bg-blue-900/10 transition-all font-medium shadow-inner"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit" disabled={loading}
                                className="w-full mt-6 py-4 bg-gradient-to-br from-blue-600 to-blue-900 hover:from-blue-500 hover:to-blue-800 border border-blue-400/30 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] active:scale-[0.98] flex items-center justify-center gap-3 relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isLogin ? <LogIn size={16} /> : <UserPlus size={16} />}
                                <span className="relative z-10">{isLogin ? "Initialize Uplink" : "Establish Identity"}</span>
                            </button>
                        </form>

                        <div className="mt-8 pt-8 border-t border-white/5 text-center">
                            <button 
                                onClick={() => setIsLogin(!isLogin)}
                                className="text-blue-400 hover:text-blue-300 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 mx-auto bg-blue-500/10 px-4 py-2 rounded-lg border border-blue-500/20"
                            >
                                {isLogin ? "Create New Node Instead" : "Use Existing Uplink"}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}