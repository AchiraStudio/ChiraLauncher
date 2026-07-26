import { useMemo } from "react";
import { imageCacheService } from "../services/ImageCacheService";

export function useLocalImage(path: string | null | undefined) {
    const src = useMemo(() => {
        if (!path || path.trim() === "") return null;
        return imageCacheService.getAssetUrl(path.trim());
    }, [path]);

    return { src, error: false };
}