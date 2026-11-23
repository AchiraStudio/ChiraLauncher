import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
    Play, Square, Info, Heart, HeartOff, Pencil, FolderOpen, Link2, Unlink, RefreshCcw, Trash2, FolderPlus, Check,
} from "lucide-react";
import type { Game } from "../types/game";
import { call, errMsg } from "../lib/tauri";
import { useProcessStore } from "../store/processStore";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { useCollectionStore } from "../store/collectionStore";
import { confirm } from "../store/confirmStore";
import { launchGame, forceStopGame } from "../services/gameService";
import { smartAudio } from "../services/SmartAudio";
import { shortcutTarget } from "./useBackendBridge";
import type { MenuItem } from "../store/menuStore";

/** One place for everything you can do to a game, shared by Library, Home, Detail and the palette. */
export function useGameActions() {
    const navigate = useNavigate();

    const open = useCallback((g: Game) => navigate(`/game/${g.id}`), [navigate]);

    const play = useCallback(async (g: Game) => {
        void smartAudio.playUI("play-sound.mp3");
        const ps = useProcessStore.getState();
        try {
            if (ps.running[g.id]) await forceStopGame(g.id);
            else await launchGame(g.id);
        } catch { /* already toasted by the service */ }
    }, []);

    const createShortcuts = useCallback(async (g: Game) => {
        try {
            await call("create_all_shortcuts", { gameId: g.id, title: g.title, exePath: shortcutTarget(g), installDir: g.install_dir || "" });
            toast.success("Shortcuts created", { description: `${g.title} was added to your Desktop and Start Menu.` });
        } catch (e) { toast.error("Couldn't create shortcuts", { description: errMsg(e) }); }
    }, []);

    const removeShortcuts = useCallback(async (g: Game) => {
        try {
            // The backend requires both gameId and title (the Edit dialog used to omit title and always failed)
            await call("remove_all_shortcuts", { gameId: g.id, title: g.title });
            toast.success("Shortcuts removed", { description: `${g.title} shortcuts were cleared.` });
        } catch (e) { toast.error("Couldn't remove shortcuts", { description: errMsg(e) }); }
    }, []);

    const openFolder = useCallback(async (g: Game) => {
        try { await call("open_path_in_explorer", { path: g.executable_path.replace(/\//g, "\\") }); }
        catch (e) { toast.error("Couldn't open folder", { description: errMsg(e) }); }
    }, []);

    const remove = useCallback(async (g: Game) => {
        const ok = await confirm({
            title: `Remove ${g.title}?`,
            description: "It will be removed from your library along with its shortcuts. Your game files on disk are not touched, and playtime is remembered if you add it again.",
            confirmLabel: "Remove game",
            danger: true,
        });
        if (!ok) return false;
        try {
            await call("remove_all_shortcuts", { gameId: g.id, title: g.title }).catch(() => { });
            await useGameStore.getState().removeGame(g.id);
            useCollectionStore.getState().forgetGame(g.id);
            toast.success("Game removed", { description: `${g.title} is no longer in your library.` });
            return true;
        } catch (e) { toast.error("Couldn't remove game", { description: errMsg(e) }); return false; }
    }, []);

    /** Right-click menu for a game. */
    const menu = useCallback((g: Game): MenuItem[] => {
        const running = !!useProcessStore.getState().running[g.id];
        const collections = useCollectionStore.getState().collections;
        const coll = useCollectionStore.getState();
        return [
            { label: running ? "Stop" : "Play", icon: running ? <Square size={14} /> : <Play size={14} />, onClick: () => void play(g) },
            { label: "View details", icon: <Info size={14} />, onClick: () => open(g) },
            { separator: true },
            {
                label: g.is_favorite ? "Remove from favorites" : "Add to favorites",
                icon: g.is_favorite ? <HeartOff size={14} /> : <Heart size={14} />,
                onClick: () => void useGameStore.getState().toggleFavorite(g.id),
            },
            ...collections.map((c): MenuItem => {
                const inIt = c.gameIds.includes(g.id);
                return {
                    label: inIt ? `In “${c.name}”` : `Add to “${c.name}”`,
                    icon: inIt ? <Check size={14} /> : <FolderPlus size={14} />,
                    onClick: () => coll.toggleGame(c.id, g.id),
                };
            }),
            { label: "New collection with this game", icon: <FolderPlus size={14} />, onClick: () => { coll.create(g.title, g.id); toast.success("Collection created"); } },
            { separator: true },
            { label: "Edit details", icon: <Pencil size={14} />, onClick: () => useUiStore.getState().editGame(g) },
            { label: "Open install folder", icon: <FolderOpen size={14} />, onClick: () => void openFolder(g) },
            { label: "Create shortcuts", icon: <Link2 size={14} />, onClick: () => void createShortcuts(g) },
            { label: "Remove shortcuts", icon: <Unlink size={14} />, onClick: () => void removeShortcuts(g) },
            { label: "Sync metadata", icon: <RefreshCcw size={14} />, onClick: () => void useGameStore.getState().refreshMetadata(g.id) },
            { separator: true },
            { label: "Remove from library", icon: <Trash2 size={14} />, danger: true, onClick: () => void remove(g) },
        ];
    }, [play, open, openFolder, createShortcuts, removeShortcuts, remove]);

    return { open, play, createShortcuts, removeShortcuts, openFolder, remove, menu };
}
