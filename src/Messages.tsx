import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useProfileStore } from "./store/profileStore";
import { supabase } from "./lib/supabase";
import { Send, Lock, User, ShieldCheck, Loader2, ChevronDown, SmilePlus } from "lucide-react";
import { cn } from "./lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

// ─── Lightweight curated emoji picker ───────────────────────────────────────
const EMOJI_GROUPS = [
    { label: "Reactions", emojis: ["👍", "👎", "❤️", "🔥", "😂", "😮", "😢", "🎉", "💯", "✅"] },
    { label: "Gaming", emojis: ["🎮", "🕹️", "🏆", "⚔️", "🛡️", "💀", "🎯", "🚀", "💣", "⭐"] },
    { label: "Face", emojis: ["😀", "😎", "🤔", "🤯", "😤", "🥶", "🫡", "👀", "🤝", "💪"] },
    { label: "Objects", emojis: ["💻", "📱", "🖥️", "⚙️", "🔑", "📦", "💾", "🧩", "🎵", "🌐"] },
];

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
    const [activeGroup, setActiveGroup] = useState(0);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="absolute bottom-full mb-3 right-0 w-72 bg-[#1a1f30] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
        >
            {/* Group tabs */}
            <div className="flex border-b border-white/5 overflow-x-auto">
                {EMOJI_GROUPS.map((g, i) => (
                    <button
                        key={i}
                        onClick={() => setActiveGroup(i)}
                        className={cn(
                            "px-4 py-2.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all",
                            activeGroup === i ? "text-accent border-b-2 border-accent" : "text-white/30 hover:text-white/60"
                        )}
                    >
                        {g.label}
                    </button>
                ))}
            </div>
            {/* Emoji grid */}
            <div className="grid grid-cols-10 gap-0.5 p-3">
                {EMOJI_GROUPS[activeGroup].emojis.map((emoji, i) => (
                    <button
                        key={i}
                        onClick={() => onSelect(emoji)}
                        className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-xl transition-all hover:scale-110 active:scale-95"
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );
}
// ────────────────────────────────────────────────────────────────────────────

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
    const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showScrollDown, setShowScrollDown] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const hasAttemptedKeygen = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    // Detect scroll position to show/hide scroll-to-bottom indicator
    const handleScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        setShowScrollDown(!isNearBottom);
    }, []);

    useEffect(() => {
        scrollToBottom("instant");
    }, [messages]);

    // ── AUTOMATIC KEY GENERATION ──────────────────────────────────────────
    useEffect(() => {
        const autoGenerateKeys = async () => {
            if (profile && profile.is_cloud_synced && !profile.private_key && !hasAttemptedKeygen.current) {
                hasAttemptedKeygen.current = true;
                setIsGeneratingKeys(true);
                try {
                    const keys = await invoke<{ public_key: string, private_key: string }>("generate_keypair");
                    await invoke("set_profile_keys", { public_key: keys.public_key, private_key: keys.private_key });

                    if (profile.supabase_user_id) {
                        const { error } = await supabase.from('profiles').update({ public_key: keys.public_key }).eq('id', profile.supabase_user_id);
                        if (error) throw error;
                    }

                    await useProfileStore.getState().fetchProfile();
                    toast.success("Secure Enclave Established", { description: "Encryption keys generated automatically for this device." });
                } catch (e: any) {
                    console.error(e);
                    toast.error("Failed to generate encryption keys", { description: e.message || String(e) });
                } finally {
                    setIsGeneratingKeys(false);
                }
            }
        };

        autoGenerateKeys();
    }, [profile]);

    // ── LOAD HISTORY + TARGET PROFILE ─────────────────────────────────────
    const loadData = useCallback(async () => {
        if (!targetId || !profile?.supabase_user_id) return;

        try {
            const localHistory = await invoke<LocalMessage[]>("get_local_messages", { contactId: targetId });
            setMessages(localHistory);
        } catch (e) {
            console.error("Failed to load local messages:", e);
        }

        const { data } = await supabase
            .from("profiles")
            .select("username, avatar_url, public_key")
            .eq("id", targetId)
            .single();
        if (data) setTargetProfile(data as TargetProfile);
    }, [targetId, profile?.supabase_user_id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── SUPABASE REALTIME — auto-decrypt incoming messages ─────────────────
    useEffect(() => {
        if (!targetId || !profile?.supabase_user_id || !profile?.private_key) return;

        const myId = profile.supabase_user_id;
        const myPrivKey = profile.private_key;

        const channel = supabase
            .channel(`dm:${[myId, targetId].sort().join(":")}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "direct_messages",
                    filter: `receiver_id=eq.${myId}`,
                },
                async (payload) => {
                    const msg = payload.new as any;
                    // Only handle messages from our current conversation partner
                    if (msg.sender_id !== targetId) return;

                    try {
                        // Decrypt using our private key + sender's public key (E2E)
                        const senderPubKey = targetProfile?.public_key;
                        if (!senderPubKey) return;

                        const plainText = await invoke<string>("decrypt_message", {
                            ciphertext: msg.ciphertext,
                            nonce: msg.nonce,
                            myPrivateKey: myPrivKey,
                            theirPublicKey: senderPubKey,
                        });

                        const localMsg: LocalMessage = {
                            id: msg.id,
                            is_mine: false,
                            plain_text: plainText,
                            timestamp: new Date(msg.created_at || Date.now()).getTime(),
                        };

                        // Persist locally
                        await invoke("save_local_message", { ...localMsg, contactId: targetId });

                        // Add to UI
                        setMessages(prev => {
                            if (prev.some(m => m.id === localMsg.id)) return prev;
                            return [...prev, localMsg];
                        });
                    } catch (e) {
                        console.error("[Realtime] Failed to decrypt incoming message:", e);
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [targetId, profile?.supabase_user_id, profile?.private_key, targetProfile?.public_key]);

    // ── LEGACY event listener for local triggers ──────────────────────────
    useEffect(() => {
        const listener = () => loadData();
        window.addEventListener("new-local-message", listener);
        return () => window.removeEventListener("new-local-message", listener);
    }, [loadData]);

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
        } catch (err: any) {
            console.error("Failed to transmit securely", err);
            toast.error("Message failed to send", { description: err.message || String(err) });
            setInput(text);
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    };

    const handleEmojiSelect = (emoji: string) => {
        setInput(prev => prev + emoji);
        setShowEmojiPicker(false);
        inputRef.current?.focus();
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-[#08090f] overflow-hidden">
            <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-green-500/5 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-accent/5 blur-[150px] rounded-full pointer-events-none" />

            <div className="flex flex-col flex-1 min-h-0 max-w-5xl mx-auto w-full relative z-10 p-6 md:p-10">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6 bg-[#0f1423]/80 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-xl shrink-0">
                    <button
                        onClick={() => navigate('/user')}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white/50 hover:text-white border border-transparent hover:border-white/10"
                    >
                        <ChevronDown size={20} className="rotate-90" />
                    </button>

                    <div className="w-12 h-12 rounded-xl bg-black/50 border border-white/10 overflow-hidden shrink-0 shadow-inner">
                        {targetProfile?.avatar_url ? (
                            <img src={targetProfile.avatar_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <User className="w-full h-full p-2 text-white/20" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-black text-white tracking-tight truncate">
                            @{targetProfile?.username || "Unknown"}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <ShieldCheck size={12} className="text-green-400" />
                            <span className="text-[10px] font-mono font-bold text-green-400 uppercase tracking-widest">E2E Encrypted</span>
                        </div>
                    </div>
                </div>

                {/* Messages list */}
                <div
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto space-y-6 mb-6 pr-2 custom-scrollbar flex flex-col min-h-0 relative"
                >
                    {messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-white/20">
                            <Lock size={48} className="mb-4 opacity-50" />
                            <p className="text-xs font-black uppercase tracking-widest text-center max-w-sm">
                                End-to-End Encrypted.<br />Nobody outside this channel can read your transmissions.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col justify-end min-h-full space-y-6 pt-4">
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
                                                    <img
                                                        src={msg.is_mine ? profile!.avatar_url! : targetProfile!.avatar_url!}
                                                        className="w-full h-full object-cover"
                                                        alt=""
                                                    />
                                                ) : (
                                                    <User className="w-full h-full p-2 text-white/20" />
                                                )}
                                            </div>
                                            <div className={cn("flex flex-col max-w-[75%]", msg.is_mine ? "items-end" : "items-start")}>
                                                <div className={cn("flex items-baseline gap-2 mb-1", msg.is_mine ? "flex-row-reverse" : "flex-row")}>
                                                    <span className="font-bold text-[13px] text-white/80">
                                                        {msg.is_mine ? profile?.username : targetProfile?.username}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-white/30">
                                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className={cn(
                                                    "px-5 py-3 text-[14.5px] leading-relaxed shadow-lg border break-words",
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

                {/* Scroll-to-bottom button */}
                {showScrollDown && (
                    <button
                        onClick={() => scrollToBottom("smooth")}
                        className="absolute bottom-28 right-12 bg-accent text-black w-10 h-10 rounded-full flex items-center justify-center shadow-xl shadow-accent/30 hover:brightness-110 transition-all animate-bounce z-20"
                    >
                        <ChevronDown size={20} />
                    </button>
                )}

                {/* Input area */}
                <div className="bg-[#1e2330] border border-white/10 rounded-2xl p-3 flex flex-col mt-auto shadow-2xl shrink-0">
                    {isGeneratingKeys ? (
                        <div className="flex items-center justify-center p-4">
                            <div className="flex items-center gap-3 text-accent font-bold text-xs uppercase tracking-widest">
                                <Loader2 size={16} className="animate-spin" /> Establishing Secure Enclave...
                            </div>
                        </div>
                    ) : !profile?.private_key ? (
                        <div className="flex items-center justify-center p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 text-sm font-bold gap-3">
                            <Lock size={20} />
                            Keypair Missing. Secure comms disabled on this device.
                        </div>
                    ) : (
                        <form onSubmit={handleSend} className="flex items-center gap-4">
                            <div className="relative shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    className="bg-white/5 border border-white/10 rounded-full p-3 text-white/30 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
                                >
                                    <SmilePlus size={20} />
                                </button>
                                {showEmojiPicker && (
                                    <EmojiPicker
                                        onSelect={handleEmojiSelect}
                                        onClose={() => setShowEmojiPicker(false)}
                                    />
                                )}
                            </div>
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder={targetProfile?.public_key ? `Message @${targetProfile.username}...` : "Target missing public key..."}
                                disabled={!targetProfile?.public_key || isSending}
                                className="flex-1 min-w-0 bg-transparent text-white text-[15px] outline-none placeholder:text-white/30 disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isSending}
                                className="p-3.5 shrink-0 bg-accent text-black rounded-full hover:brightness-110 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(var(--color-accent),0.3)] active:scale-95"
                            >
                                <Send size={18} className="ml-0.5" />
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}