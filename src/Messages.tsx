import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useProfileStore } from "./store/profileStore";
import { supabase } from "./lib/supabase";
import { Send, Lock, ChevronLeft, User, ShieldCheck, PlusCircle } from "lucide-react";
import { cn } from "./lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface LocalMessage {
    id: string;
    is_mine: boolean;
    plain_text: string;
    timestamp: number;
}

interface TargetProfile {
    username: string;
    avatar_url: string | null;
    public_key: string | null;
}

export function Messages() {
    const { targetId } = useParams();
    const navigate = useNavigate();
    const { profile } = useProfileStore();

    const [messages, setMessages] = useState<LocalMessage[]>([]);
    const [input, setInput] = useState("");
    const [targetProfile, setTargetProfile] = useState<TargetProfile | null>(null);
    const [isSending, setIsSending] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (!targetId || !profile?.supabase_user_id) return;

        const loadData = async () => {
            try {
                const localHistory = await invoke<LocalMessage[]>("get_local_messages", { contactId: targetId });
                setMessages(localHistory);
            } catch (e) {
                console.error("Failed to load local messages:", e);
            }

            const { data } = await supabase.from("profiles").select("username, avatar_url, public_key").eq("id", targetId).single();
            if (data) {
                setTargetProfile(data as TargetProfile);
            }
        };

        loadData();

        const listener = () => loadData();
        window.addEventListener("new-local-message", listener);
        return () => window.removeEventListener("new-local-message", listener);
    }, [targetId, profile?.supabase_user_id]);

    const handleGenerateKeys = async () => {
        try {
            const keys = await invoke<{ public_key: string, private_key: string }>("generate_keypair");
            await invoke("set_profile_keys", { public_key: keys.public_key, private_key: keys.private_key });
            await supabase.from('profiles').update({ public_key: keys.public_key }).eq('id', profile?.supabase_user_id);
            await useProfileStore.getState().fetchProfile();
            toast.success("Secure Enclave Established", { description: "Encryption keys generated for this device." });
        } catch (e) {
            toast.error("Failed to generate keys");
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !targetProfile?.public_key || !profile?.private_key || isSending) return;

        const text = input.trim();
        setInput("");
        setIsSending(true);

        try {
            const encrypted = await invoke<{ ciphertext: string, nonce: string }>("encrypt_message", {
                plainText: text,
                myPrivateKey: profile.private_key,
                theirPublicKey: targetProfile.public_key
            });

            const msgId = crypto.randomUUID();

            const { error } = await supabase.from("direct_messages").insert({
                id: msgId,
                sender_id: profile.supabase_user_id,
                receiver_id: targetId,
                ciphertext: encrypted.ciphertext,
                nonce: encrypted.nonce
            });

            if (error) throw error;

            const newMsg = { id: msgId, is_mine: true, plain_text: text, timestamp: Date.now() };
            await invoke("save_local_message", { ...newMsg, contactId: targetId });

            setMessages(prev => [...prev, newMsg]);
        } catch (err) {
            console.error("Failed to transmit securely", err);
            setInput(text);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#08090f] relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-green-500/5 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-accent/5 blur-[150px] rounded-full pointer-events-none" />

            <div className="flex flex-col h-full max-w-5xl mx-auto w-full relative z-10 p-6 md:p-10">
                <div className="flex items-center gap-4 mb-8 bg-[#0f1423]/80 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-xl shrink-0">
                    <button onClick={() => navigate(-1)} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white/50 hover:text-white border border-transparent hover:border-white/10">
                        <ChevronLeft size={20} />
                    </button>

                    <div className="w-12 h-12 rounded-xl bg-black/50 border border-white/10 overflow-hidden shrink-0 shadow-inner">
                        {targetProfile?.avatar_url ? (
                            <img src={targetProfile.avatar_url} className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-full h-full p-2 text-white/20" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-black text-white tracking-tight truncate flex items-center gap-2">
                            @{targetProfile?.username || "Unknown"}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <ShieldCheck size={12} className="text-green-400" />
                            <span className="text-[10px] font-mono font-bold text-green-400 uppercase tracking-widest">E2E Encrypted</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-6 mb-6 pr-2 custom-scrollbar flex flex-col">
                    {messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-white/20">
                            <Lock size={48} className="mb-4 opacity-50" />
                            <p className="text-xs font-black uppercase tracking-widest text-center max-w-sm">
                                End-to-End Encrypted.<br />Nobody outside this channel can read your transmissions.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col justify-end min-h-full space-y-6">
                            {messages.map((msg, idx) => {
                                const showTime = idx === 0 || (msg.timestamp - messages[idx - 1].timestamp > 300000);
                                return (
                                    <div key={msg.id} className="flex flex-col">
                                        {showTime && (
                                            <div className="text-center my-4">
                                                <span className="bg-white/5 border border-white/5 px-3 py-1 rounded-full text-[9px] font-bold text-white/30 uppercase tracking-widest">
                                                    {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                                                </span>
                                            </div>
                                        )}
                                        <div className={cn("flex gap-4 group w-full", msg.is_mine ? "flex-row-reverse" : "flex-row")}>
                                            <div className="w-10 h-10 rounded-full bg-black/50 border border-white/10 overflow-hidden shrink-0 shadow-inner">
                                                {(msg.is_mine ? profile?.avatar_url : targetProfile?.avatar_url) ? (
                                                    <img src={msg.is_mine ? profile!.avatar_url! : targetProfile!.avatar_url!} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-full h-full p-2 text-white/20" />
                                                )}
                                            </div>
                                            <div className={cn("flex flex-col max-w-[75%]", msg.is_mine ? "items-end" : "items-start")}>
                                                <div className={cn("flex items-baseline gap-2 mb-1", msg.is_mine ? "flex-row-reverse" : "flex-row")}>
                                                    <span className="font-bold text-[13px] text-white/80">{msg.is_mine ? profile?.username : targetProfile?.username}</span>
                                                    <span className="text-[10px] font-bold text-white/30">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <div className={cn(
                                                    "px-5 py-3 text-[14.5px] leading-relaxed shadow-lg border",
                                                    msg.is_mine
                                                        ? "bg-accent/90 text-black rounded-[1.5rem] rounded-tr-sm border-accent/20 font-medium"
                                                        : "bg-[#1e2330] text-white/90 rounded-[1.5rem] rounded-tl-sm border-white/10"
                                                )}>
                                                    {msg.plain_text}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="bg-[#1e2330] border border-white/10 rounded-2xl p-3 flex flex-col mt-auto shadow-2xl shrink-0">
                    {!profile?.private_key ? (
                        <div className="flex items-center justify-between p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Lock size={20} className="text-yellow-400" />
                                <span className="text-yellow-400 text-sm font-bold">Keypair Missing. Secure comms disabled on this device.</span>
                            </div>
                            <button onClick={handleGenerateKeys} className="bg-yellow-500 hover:brightness-110 text-black px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95">Generate Keys</button>
                        </div>
                    ) : (
                        <form onSubmit={handleSend} className="flex items-center gap-4">
                            <div className="bg-white/5 border border-white/10 rounded-full p-3 text-white/30 hover:text-white hover:bg-white/10 cursor-pointer transition-all">
                                <PlusCircle size={20} />
                            </div>
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder={targetProfile?.public_key ? `Message @${targetProfile.username}...` : "Target missing public key..."}
                                disabled={!targetProfile?.public_key || isSending}
                                className="flex-1 bg-transparent text-white text-[15px] outline-none placeholder:text-white/30 disabled:opacity-50"
                            />
                            <button type="submit" disabled={!input.trim() || isSending} className="p-3.5 bg-accent text-black rounded-full hover:brightness-110 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(var(--color-accent),0.3)] active:scale-95">
                                <Send size={18} className="ml-0.5" />
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}