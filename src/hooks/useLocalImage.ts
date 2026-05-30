import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const imageCache = new Map<string, string>();
const imageRefCount = new Map<string, number>();

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

        const count = imageRefCount.get(cleanPath) || 0;
        imageRefCount.set(cleanPath, count + 1);

        if (imageCache.has(cleanPath)) {
            setSrc(imageCache.get(cleanPath)!);
        } else {
            invoke<Uint8Array>("read_local_file_bytes", { path: cleanPath })
                .then((bytes) => {
                    const ext = cleanPath.split('.').pop()?.toLowerCase() || 'jpg';
                    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
                    const blob = new Blob([bytes], { type: mime });
                    const blobUrl = URL.createObjectURL(blob);

                    if (!imageCache.has(cleanPath)) {
                        imageCache.set(cleanPath, blobUrl);
                    }
                    
                    if (active) {
                        setSrc(imageCache.get(cleanPath)!);
                    } else {
                        const currentCount = imageRefCount.get(cleanPath) || 0;
                        if (currentCount <= 0 && imageCache.has(cleanPath)) {
                            URL.revokeObjectURL(imageCache.get(cleanPath)!);
                            imageCache.delete(cleanPath);
                        }
                    }
                })
                .catch((e) => {
                    console.error("Failed to read local image:", cleanPath, e);
                    if (active) setError(true);
                });
        }

        return () => {
            active = false;
            const newCount = (imageRefCount.get(cleanPath) || 1) - 1;
            if (newCount <= 0) {
                imageRefCount.delete(cleanPath);
                const url = imageCache.get(cleanPath);
                if (url) {
                    URL.revokeObjectURL(url);
                    imageCache.delete(cleanPath);
                }
            } else {
                imageRefCount.set(cleanPath, newCount);
            }
        };
    }, [path]);

    return { src, error };
}