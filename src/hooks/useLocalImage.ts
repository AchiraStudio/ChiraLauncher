import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Memory cache prevents stuttering and excessive backend calls when scrolling
const imageCache = new Map<string, string>();

export function useLocalImage(path: string | null | undefined) {
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        setError(false);

        if (!path || path.trim() === "") {
            setSrc(null);
            return;
        }

        const cleanPath = path.trim();

        // If it's already a web URL or base64 data, use it directly
        if (cleanPath.startsWith("http") || cleanPath.startsWith("data:")) {
            setSrc(cleanPath);
            return;
        }

        // Check in-memory cache first
        if (imageCache.has(cleanPath)) {
            setSrc(imageCache.get(cleanPath)!);
            return;
        }

        // Call the Rust backend to securely read the file and bypass Tauri asset restrictions
        invoke<string>("read_image_base64", { path: cleanPath })
            .then((b64) => {
                if (active) {
                    imageCache.set(cleanPath, b64);
                    setSrc(b64);
                }
            })
            .catch((e) => {
                console.error("Failed to read local image:", cleanPath, e);
                if (active) setError(true);
            });

        return () => { active = false; };
    }, [path]);

    return { src, error };
}