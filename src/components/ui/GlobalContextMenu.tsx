import { useEffect, useState } from "react";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import { ArrowLeft, ArrowRight, RefreshCw, HardDriveDownload, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function GlobalContextMenu() {
    const navigate = useNavigate();
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            // Check if the click originated from an element that has its own custom context menu
            // We can detect this if a parent called stopPropagation on the event
            // However, React synthetic events' stopPropagation doesn't stop native DOM events from bubbling to document.
            // A common pattern is to set a custom property on the native event, or check if default is prevented.
            if (e.defaultPrevented) return;

            // Otherwise, prevent default browser menu and show our global one
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
        };

        // Attach to the document to catch all unhandled context menu events
        document.addEventListener("contextmenu", handleContextMenu);
        return () => document.removeEventListener("contextmenu", handleContextMenu);
    }, []);

    if (!contextMenu) return null;

    const items: ContextMenuItem[] = [
        {
            label: "Go Back",
            icon: <ArrowLeft size={16} />,
            onClick: () => window.history.back()
        },
        {
            label: "Go Forward",
            icon: <ArrowRight size={16} />,
            onClick: () => window.history.forward()
        },
        {
            label: "Reload Page",
            icon: <RefreshCw size={16} />,
            onClick: () => window.location.reload()
        },
        { separator: true, label: "" },
        {
            label: "Downloads",
            icon: <HardDriveDownload size={16} />,
            onClick: () => navigate("/downloads")
        },
        {
            label: "Settings",
            icon: <Settings size={16} />,
            onClick: () => navigate("/settings")
        }
    ];

    return (
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={items}
            onClose={() => setContextMenu(null)}
        />
    );
}
