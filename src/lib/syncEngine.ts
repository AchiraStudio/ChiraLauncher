import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useProfileStore } from "../store/profileStore";
import type { AchievementPayload } from "../components/overlay/overlay-types";

export function useCloudSyncEngine() {
    const { profile } = useProfileStore();

    useEffect(() => {
        if (!profile?.is_cloud_synced || !profile?.supabase_user_id) return;

        // 1. Listen for local achievements and broadcast them to the cloud
        const unlistenAch = listen<AchievementPayload>("achievement-unlocked", async (event) => {
            const { display_name, game_title, xp } = event.payload;

            const { error: feedErr } = await supabase.from("activity_feed").insert({
                user_id: profile.supabase_user_id,
                event_type: "achievement",
                game_title: game_title || "Unknown Game",
                details: `Unlocked: ${display_name}`,
                xp_gained: xp || 0
            });

            if (feedErr) console.error("Cloud Sync: Failed to log achievement:", feedErr);

            // ── INSTANT CLOUD XP SYNC ──
            if (xp && xp > 0) {
                // Read latest XP from the Zustand store (it gets updated via local event listener)
                // and push the absolute value to Supabase
                const currentXp = useProfileStore.getState().profile?.xp || 0;
                const newXp = currentXp + xp;
                
                const { error: xpErr } = await supabase
                    .from('profiles')
                    .update({ xp: newXp })
                    .eq('id', profile.supabase_user_id);
                    
                if (xpErr) console.error("Cloud Sync: Failed to update XP:", xpErr);
            }
        });

        // 2. Listen for game stops and log playtime sessions to the cloud
        const unlistenStop = listen<{ game_title: string; elapsed_seconds: number }>("game-stopped", async (event) => {
            const minutes = Math.round(event.payload.elapsed_seconds / 60);
            if (minutes < 1) return;

            const { error: playErr } = await supabase.from("activity_feed").insert({
                user_id: profile.supabase_user_id,
                event_type: "playtime",
                game_title: event.payload.game_title || "Unknown Game",
                details: `Logged ${minutes} minutes of playtime.`
            });

            if (playErr) console.error("Cloud Sync: Failed to log playtime:", playErr);
        });

        // 3. E2EE Chat Receiver
        const chatChannel = supabase
            .channel("direct_messages")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${profile.supabase_user_id}` },
                async (payload) => {
                    const msg = payload.new;
                    if (!profile.private_key) return;

                    const { data: senderData } = await supabase.from("profiles").select("public_key").eq("id", msg.sender_id).single();
                    if (!senderData?.public_key) return;

                    try {
                        const plainText = await invoke<string>("decrypt_message", {
                            ciphertextB64: msg.ciphertext,
                            nonceB64: msg.nonce,
                            myPrivateKey: profile.private_key,
                            theirPublicKey: senderData.public_key
                        });

                        await invoke("save_local_message", {
                            id: msg.id,
                            contactId: msg.sender_id,
                            isMine: false,
                            plainText: plainText,
                            timestamp: new Date(msg.created_at).getTime()
                        });

                        window.dispatchEvent(new CustomEvent("new-local-message"));
                    } catch (e) {
                        console.error("Failed to decrypt incoming transmission:", e);
                    }
                }
            )
            .subscribe();

        return () => {
            unlistenAch.then(f => f());
            unlistenStop.then(f => f());
            supabase.removeChannel(chatChannel);
        };
    }, [profile?.is_cloud_synced, profile?.supabase_user_id, profile?.private_key]);
}