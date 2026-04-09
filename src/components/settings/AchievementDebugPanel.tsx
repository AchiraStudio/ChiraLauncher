import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function AchievementDebugPanel() {
    const [isFiring, setIsFiring] = useState(false);
    const [payload, setPayload] = useState({
        api_name: "TEST_ACHIEVEMENT",
        display_name: "Test Achievement",
        description: "This is a custom test achievement.",
        xp: 50,
        rarity: "common"
    });

    const fireCustom = async (override?: any) => {
        setIsFiring(true);
        try {
            const finalPayload = { 
                ...payload, 
                ...override,
                icon: null,
                icon_gray: null,
                earned_time: Math.floor(Date.now() / 1000)
            };
            await invoke("debug_fire_custom", { payload: finalPayload });
        } catch (e: any) {
            console.error(e);
            alert("Failed to fire test achievement: " + e.message);
        } finally {
            setIsFiring(false);
        }
    };

    const fireBurst = async () => {
        setIsFiring(true);
        try {
            const rarities = ["common", "rare", "epic", "legendary", "epic"];
            for (let i = 0; i < 5; i++) {
                const r = rarities[i];
                const xp = r === "common" ? 50 : r === "rare" ? 150 : r === "epic" ? 200 : 500;
                await invoke("debug_fire_custom", { 
                    payload: {
                        api_name: `TEST_BURST_${i}`,
                        display_name: `Burst ${i + 1}`,
                        description: `A test burst ${r} notification.`,
                        xp,
                        rarity: r,
                        icon: null,
                        icon_gray: null,
                        earned_time: Math.floor(Date.now() / 1000)
                    }
                });
                await new Promise(res => setTimeout(res, 100)); // Stagger
            }
        } catch (e: any) {
            console.error(e);
        } finally {
            setIsFiring(false);
        }
    };

    return (
        <div className="p-5 border border-red-500/20 bg-red-500/5 rounded-xl mt-6">
            <h3 className="text-sm font-black tracking-widest text-red-400 uppercase mb-4 flex items-center gap-2">
                <span className="text-lg">🧪</span> Developer Debug Tools
            </h3>
            
            <div className="flex flex-col gap-6">
                <div>
                    <h4 className="text-white font-bold text-sm mb-2">Custom Payload</h4>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <input
                            type="text" value={payload.display_name}
                            onChange={e => setPayload({ ...payload, display_name: e.target.value })}
                            placeholder="Title"
                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-accent"
                        />
                        <input
                            type="text" value={payload.description}
                            onChange={e => setPayload({ ...payload, description: e.target.value })}
                            placeholder="Description"
                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-accent"
                        />
                        <select
                            value={payload.rarity}
                            onChange={e => setPayload({ ...payload, rarity: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-accent"
                        >
                            <option value="common">Common</option>
                            <option value="rare">Rare</option>
                            <option value="epic">Epic</option>
                            <option value="legendary">Legendary</option>
                        </select>
                        <input
                            type="number" value={payload.xp}
                            onChange={e => setPayload({ ...payload, xp: parseInt(e.target.value) || 0 })}
                            placeholder="XP"
                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-accent"
                        />
                    </div>
                    <button 
                        onClick={() => fireCustom()}
                        disabled={isFiring}
                        className="w-full bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                    >
                        Fire Custom Notification
                    </button>
                </div>

                <div className="h-px bg-white/5" />

                <div>
                    <h4 className="text-white font-bold text-sm mb-2">Quick Actions</h4>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <button onClick={() => fireCustom({ display_name: "Common Find", rarity: "common", xp: 50 })} className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#a0a0b0] transition-colors">🔥 Common</button>
                        <button onClick={() => fireCustom({ display_name: "Rare Gem", rarity: "rare", xp: 150 })} className="bg-white/5 hover:bg-white/10 border border-[rgba(79,195,247,0.3)] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#4fc3f7] transition-colors">🔥 Rare</button>
                        <button onClick={() => fireCustom({ display_name: "Epic Win", rarity: "epic", xp: 200 })} className="bg-white/5 hover:bg-white/10 border border-[rgba(206,147,216,0.3)] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#ce93d8] transition-colors">🔥 Epic</button>
                        <button onClick={() => fireCustom({ display_name: "Legendary God", rarity: "legendary", xp: 500 })} className="bg-white/5 hover:bg-white/10 border border-[rgba(255,179,0,0.3)] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#ffb300] transition-colors">🔥 Legendary</button>
                    </div>
                    <button 
                        onClick={fireBurst}
                        disabled={isFiring}
                        className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/30 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <span>🧨</span> Fire 5 at once (Burst Test)
                    </button>
                </div>
            </div>
        </div>
    );
}
