import { useState, useEffect } from "react";
import { imageCacheService } from "../services/ImageCacheService";

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

        imageCacheService.acquire(cleanPath)
            .then(url => {
                if (active) setSrc(url);
            })
            .catch(err => {
                console.error("Failed to read local image:", cleanPath, err);
                if (active) setError(true);
            });

        return () => {
            active = false;
            imageCacheService.release(cleanPath);
        };
    }, [path]);

    return { src, error };
}