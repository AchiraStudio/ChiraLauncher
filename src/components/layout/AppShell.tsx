import { Suspense, lazy } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useUiStore } from "../../store/uiStore";
import { useDevConsoleStore } from "../../store/devConsoleStore";
import { useHotkeys } from "../../hooks/useHotkeys";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { CommandPalette } from "./CommandPalette";
import { ContextMenuRoot } from "../ui/ContextMenu";
import { ConfirmHost } from "../ui/ConfirmHost";
import { UpdateDialog } from "../update/UpdateDialog";
import { Spinner } from "../ui/Spinner";

// Heavy, rarely-opened dialogs are code-split: they aren't parsed until first use.
const AddGameModal = lazy(() => import("../modals/AddGameModal").then((m) => ({ default: m.AddGameModal })));
const EditGameModal = lazy(() => import("../modals/EditGameModal").then((m) => ({ default: m.EditGameModal })));
const DirectoryScannerModal = lazy(() => import("../modals/DirectoryScannerModal").then((m) => ({ default: m.DirectoryScannerModal })));
const ResetAppModal = lazy(() => import("../modals/ResetAppModal").then((m) => ({ default: m.ResetAppModal })));
const DevConsoleModal = lazy(() => import("../modals/DevConsoleModal").then((m) => ({ default: m.DevConsoleModal })));

function Modals() {
    const addGameOpen = useUiStore((s) => s.addGameOpen);
    const scannerOpen = useUiStore((s) => s.scannerOpen);
    const editing = useUiStore((s) => s.gameToEdit);
    const resetOpen = useUiStore((s) => s.resetOpen);
    const devOpen = useDevConsoleStore((s) => s.isOpen);
    return (
        <Suspense fallback={null}>
            {addGameOpen && <AddGameModal />}
            {editing && <EditGameModal />}
            {scannerOpen && <DirectoryScannerModal />}
            {resetOpen && <ResetAppModal />}
            {devOpen && <DevConsoleModal />}
        </Suspense>
    );
}

export function AppShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
    const toggleSidebar = useUiStore((s) => s.toggleSidebar);

    useHotkeys({
        "mod+k": (e) => { e.preventDefault(); setPaletteOpen(true); },
        "mod+b": (e) => { e.preventDefault(); toggleSidebar(); },
        "mod+1": (e) => { e.preventDefault(); navigate("/"); },
        "mod+2": (e) => { e.preventDefault(); navigate("/library"); },
        "mod+3": (e) => { e.preventDefault(); navigate("/downloads"); },
        "mod+,": (e) => { e.preventDefault(); navigate("/settings"); },
        "mod+shift+d": (e) => { e.preventDefault(); useDevConsoleStore.getState().toggle(); },
        "`": (e) => { e.preventDefault(); useDevConsoleStore.getState().toggle(); },
    }, [navigate]);

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-fg">
            <TitleBar />
            <div className="flex min-h-0 flex-1">
                <Sidebar />
                <main className="relative min-w-0 flex-1 overflow-hidden bg-bg">
                    {/* Static ambient glow: pure CSS gradient, no blurred layers or looping animation */}
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_85%_-10%,color-mix(in_oklab,var(--color-accent)_9%,transparent),transparent)]" />
                    <Suspense fallback={<div className="grid h-full place-items-center text-fg-mute"><Spinner size={22} /></div>}>
                        <div key={location.pathname.split("/")[1] || "home"} className="relative h-full animate-fade-in">
                            <Outlet />
                        </div>
                    </Suspense>
                </main>
            </div>
            <Modals />
            <UpdateDialog />
            <CommandPalette />
            <ContextMenuRoot />
            <ConfirmHost />
            <Toaster
                theme="dark"
                position="bottom-right"
                offset={{ bottom: 16, right: 16 }}
                toastOptions={{
                    classNames: {
                        toast: "!bg-overlay !border !border-line-strong !text-fg !rounded-xl !shadow-pop",
                        description: "!text-fg-mute",
                        actionButton: "!bg-accent !text-accent-fg",
                    },
                }}
            />
        </div>
    );
}
