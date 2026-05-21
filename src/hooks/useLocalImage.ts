import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// Memory cache limit prevents massive RAM leaks from Base64 strings.
// 40 images is enough to keep the current viewport snappy without hoarding memory.
const MAX_CACHE_SIZE = 40;
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

        // Check in-memory cache first (LRU behavior)
        if (imageCache.has(cleanPath)) {
            const b64 = imageCache.get(cleanPath)!;
            // Move to the end to mark as recently used
            imageCache.delete(cleanPath);
            imageCache.set(cleanPath, b64);
            setSrc(b64);
            return;
        }

        // Call the Rust backend to securely read the file
        invoke<string>("read_image_base64", { path: cleanPath })
            .then((b64) => {
                if (active) {
                    // Enforce Cache Size Limit
                    if (imageCache.size >= MAX_CACHE_SIZE) {
                        // Delete the oldest entry (first item in the Map)
                        const firstKey = imageCache.keys().next().value;
                        if (firstKey) imageCache.delete(firstKey);
                    }

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