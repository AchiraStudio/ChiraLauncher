import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useProfileStore } from "../store/profileStore";
import { useGameStore } from "../store/gameStore";
import type { AchievementPayload } from "../components/overlay/overlay-types";

export function useCloudSyncEngine() {
    const { profile } = useProfileStore();
    const gamesById = useGameStore(s => s.gamesById);
    const gameCount = Object.keys(gamesById).length;

    const hasSyncedPlaytimeDown = useRef(false);

    useEffect(() => {
        if (!profile?.is_cloud_synced || !profile?.supabase_user_id || gameCount === 0) return;

        // ── 1. TWO-WAY SYNC ON BOOT ──
        const syncPlaytime = async () => {
            const { data: cloudStats, error } = await supabase
                .from('user_game_stats')
                .select('*')
                .eq('user_id', profile.supabase_user_id);

            if (!error && cloudStats) {
                const games = useGameStore.getState().gamesById;
                let localChanged = false;
                const statsToUpload: any[] = [];

                for (const localGame of Object.values(games)) {
                    if (!localGame.title) continue;

                    const cloudStat = cloudStats.find(c => c.game_title === localGame.title);

                    if (cloudStat) {
                        if (cloudStat.playtime_seconds > localGame.playtime_seconds) {
                            await invoke("overwrite_playtime", {
                                gameId: localGame.id,
                                playtimeSeconds: cloudStat.playtime_seconds,
                                lastPlayed: cloudStat.last_played
                            });
                            localChanged = true;
                        } else if (localGame.playtime_seconds > cloudStat.playtime_seconds) {
                            statsToUpload.push({
                                user_id: profile.supabase_user_id,
                                game_title: localGame.title,
                                app_id: localGame.steam_app_id?.toString() || null,
                                playtime_seconds: localGame.playtime_seconds,
                                last_played: localGame.last_played || new Date().toISOString()
                            });
                        }
                    } else if (localGame.playtime_seconds > 0) {
                        statsToUpload.push({
                            user_id: profile.supabase_user_id,
                            game_title: localGame.title,
                            app_id: localGame.steam_app_id?.toString() || null,
                            playtime_seconds: localGame.playtime_seconds,
                            last_played: localGame.last_played || new Date().toISOString()
                        });
                    }
                }

                if (localChanged) {
                    await useGameStore.getState().fetchGames();
                }

                if (statsToUpload.length > 0) {
                    const { error: bulkErr } = await supabase
                        .from("user_game_stats")
                        .upsert(statsToUpload, { onConflict: 'user_id,game_title' });

                    if (bulkErr) console.error("Cloud Sync: Failed bulk upload:", bulkErr);
                }

                hasSyncedPlaytimeDown.current = true;
            }
        };

        syncPlaytime();
    }, [profile?.is_cloud_synced, profile?.supabase_user_id, gameCount]);

    useEffect(() => {
        if (!profile?.is_cloud_synced || !profile?.supabase_user_id) return;

        // ── 2. LISTEN FOR ACHIEVEMENTS ──
        const unlistenAch = listen<AchievementPayload>("achievement-unlocked", async (event) => {
            // STRICT BLOCK: Never sync test achievements to the cloud or add ghost XP
            if (event.payload.is_debug === true || event.payload.xp === 0) return;

            const { display_name, game_title, xp, global_percent } = event.payload;
            const isUltraRare = global_percent !== null && global_percent <= 5.0;

            if (isUltraRare) {
                const detailsText = `🏆 Unlocked an ULTRA RARE achievement in ${game_title}!\n\n"${display_name}" (Only ${global_percent.toFixed(1)}% of players have this)`;

                const { error: feedErr } = await supabase.from("activity_feed").insert({
                    user_id: profile.supabase_user_id,
                    event_type: "achievement",
                    game_title: game_title || "Unknown Game",
                    details: detailsText,
                    xp_gained: xp || 0,
                    content_text: null,
                    media_url: null,
                    media_type: null,
                    is_pinned: false
                });

                if (feedErr) console.error("Cloud Sync: Failed to log achievement:", feedErr);
            }

            if (xp && xp > 0) {
                const currentXp = useProfileStore.getState().profile?.xp || 0;
                const newXp = currentXp + xp;

                const { error: xpErr } = await supabase
                    .from('profiles')
                    .update({ xp: newXp })
                    .eq('id', profile.supabase_user_id);

                if (xpErr) console.error("Cloud Sync: Failed to update XP:", xpErr);
            }
        });

        // ── 3. LISTEN FOR GAME STOPS (SYNC PLAYTIME UP SAFELY) ──
        const unlistenStop = listen<{ game_id: string; game_title: string; elapsed_seconds: number }>("game-stopped", async (event) => {
            const { game_id, game_title, elapsed_seconds } = event.payload;

            if (elapsed_seconds < 60 || !game_title) return;

            setTimeout(async () => {
                const localGame = useGameStore.getState().gamesById[game_id];
                if (!localGame) return;

                const { data: existingCloud } = await supabase
                    .from("user_game_stats")
                    .select("playtime_seconds")
                    .eq("user_id", profile.supabase_user_id)
                    .eq("game_title", game_title)
                    .maybeSingle();

                const cloudSeconds = existingCloud?.playtime_seconds || 0;
                const bestSeconds = Math.max(localGame.playtime_seconds, cloudSeconds + elapsed_seconds);

                const { error: upsertErr } = await supabase.from("user_game_stats").upsert({
                    user_id: profile.supabase_user_id,
                    game_title: game_title,
                    app_id: localGame.steam_app_id?.toString() || null,
                    playtime_seconds: bestSeconds,
                    last_played: new Date().toISOString()
                }, { onConflict: 'user_id,game_title' });

                if (upsertErr) console.error("Cloud Sync: Failed to backup playtime:", upsertErr);
            }, 2000);
        });

        // ── 4. E2EE CHAT RECEIVER ──
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