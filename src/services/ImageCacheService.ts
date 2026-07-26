import { convertFileSrc } from "@tauri-apps/api/core";

class ImageCacheService {
    private cache = new Map<string, string>();

    public getAssetUrl(path: string): string {
        if (!path || path.trim() === "") return "";
        const cleanPath = path.trim();

        if (cleanPath.startsWith("http") || cleanPath.startsWith("data:") || cleanPath.startsWith("blob:") || cleanPath.startsWith("asset:")) {
            return cleanPath;
        }

        if (this.cache.has(cleanPath)) {
            return this.cache.get(cleanPath)!;
        }

        try {
            const url = convertFileSrc(cleanPath);
            this.cache.set(cleanPath, url);
            return url;
        } catch {
            return cleanPath;
        }
    }

    public async acquire(path: string): Promise<string> {
        return this.getAssetUrl(path);
    }

    public release(_path: string) {
        // No-op needed for native asset:// URLs since browser handles disk/GPU cache natively
    }
}

export const imageCacheService = new ImageCacheService();

