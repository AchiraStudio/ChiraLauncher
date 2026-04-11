import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useProfileStore } from "./store/profileStore";
import { supabase } from "./lib/supabase";
import { Send, Lock } from "lucide-react";
import { cn } from "./lib/utils";

interface LocalMessage {
    id: string;
    is_mine: boolean;
    plain_text: string;
    timestamp: number;
}

export function Messages() {
    const { targetId } = useParams();
    const { profile } = useProfileStore();
    const [messages, setMessages] = useState<LocalMessage[]>([]);
    const [input, setInput] = useState("");
    const [targetKey, setTargetKey] = useState<string | null>(null);

    // Fetch local history & target's public key
    useEffect(() => {
        if (!targetId) return;

        const loadData = async () => {
            // 1. Fetch from lightning-fast local SQLite
            const localHistory = await invoke<LocalMessage[]>("get_local_messages", { contactId: targetId });
            setMessages(localHistory);

            // 2. Fetch their public key for sending
            const { data } = await supabase.from("profiles").select("public_key").eq("id", targetId).single();
            if (data?.public_key) setTargetKey(data.public_key);
        };

        loadData();

        const listener = () => loadData();
        window.addEventListener("new-local-message", listener);
        return () => window.removeEventListener("new-local-message", listener);
    }, [targetId]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !targetKey || !profile) return;

        const text = input.trim();
        setInput(""); // Optimistic clear

        try {
            // 1. Encrypt locally
            const encrypted = await invoke<{ ciphertext: string, nonce: string }>("encrypt_message", {
                plainText: text,
                myPrivateKey: profile.private_key,
                theirPublicKey: targetKey
            });

            // 2. Send gibberish to cloud
            const msgId = crypto.randomUUID();
            await supabase.from("direct_messages").insert({
                id: msgId,
                sender_id: profile.supabase_user_id,
                receiver_id: targetId,
                ciphertext: encrypted.ciphertext,
                nonce: encrypted.nonce
            });

            // 3. Save plaintext locally instantly
            const newMsg = { id: msgId, is_mine: true, plain_text: text, timestamp: Date.now() };
            await invoke("save_local_message", { ...newMsg, contactId: targetId });

            setMessages(prev => [...prev, newMsg]);
        } catch (err) {
            console.error("Failed to transmit securely", err);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#08090f] p-10 max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
                <Lock className="text-green-400" size={20} />
                <h2 className="text-xl font-black text-white uppercase tracking-widest">Encrypted Channel</h2>
                <span className="text-[10px] font-mono text-white/30 ml-auto">{targetId}</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-4 custom-scrollbar">
                {messages.map(msg => (
                    <div key={msg.id} className={cn("flex w-full", msg.is_mine ? "justify-end" : "justify-start")}>
                        <div className={cn(
                            "max-w-[70%] p-4 rounded-2xl text-sm leading-relaxed",
                            msg.is_mine
                                ? "bg-accent text-black rounded-br-sm shadow-[0_0_20px_rgba(34,211,238,0.2)] font-medium"
                                : "bg-black/50 border border-white/10 text-white/80 rounded-bl-sm"
                        )}>
                            {msg.plain_text}
                        </div>
                    </div>
                ))}
            </div>

            <form onSubmit={handleSend} className="relative mt-auto">
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Type an encrypted message..."
                    className="w-full bg-black/50 border border-white/10 focus:border-accent rounded-2xl py-4 pl-6 pr-14 text-white text-sm outline-none transition-all shadow-inner"
                />
                <button type="submit" disabled={!input.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-accent/20 hover:bg-accent text-accent hover:text-black rounded-xl flex items-center justify-center transition-all disabled:opacity-50">
                    <Send size={16} />
                </button>
            </form>
        </div>
    );
}