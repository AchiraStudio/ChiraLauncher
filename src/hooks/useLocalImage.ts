import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

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

        if (cleanPath.startsWith("http") || cleanPath.startsWith("data:") || cleanPath.startsWith("blob:")) {
            setSrc(cleanPath);
            return;
        }

        if (imageCache.has(cleanPath)) {
            const blobUrl = imageCache.get(cleanPath)!;
            imageCache.delete(cleanPath);
            imageCache.set(cleanPath, blobUrl);
            setSrc(blobUrl);
            return;
        }

        invoke<Uint8Array>("read_local_file_bytes", { path: cleanPath })
            .then((bytes) => {
                if (active) {
                    const ext = cleanPath.split('.').pop()?.toLowerCase() || 'jpg';
                    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
                    const blob = new Blob([bytes], { type: mime });
                    const blobUrl = URL.createObjectURL(blob);

                    if (imageCache.size >= MAX_CACHE_SIZE) {
                        const firstKey = imageCache.keys().next().value;
                        if (firstKey) {
                            const oldUrl = imageCache.get(firstKey);
                            if (oldUrl) URL.revokeObjectURL(oldUrl);
                            imageCache.delete(firstKey);
                        }
                    }

                    imageCache.set(cleanPath, blobUrl);
                    setSrc(blobUrl);
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