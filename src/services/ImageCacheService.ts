import { invoke } from "@tauri-apps/api/core";

class ImageCacheService {
    private cache = new Map<string, string>();
    private refCount = new Map<string, number>();

    public async acquire(path: string): Promise<string> {
        const count = this.refCount.get(path) || 0;
        this.refCount.set(path, count + 1);

        if (this.cache.has(path)) {
            return this.cache.get(path)!;
        }

        try {
            const bytes = await invoke<Uint8Array>("read_local_file_bytes", { path });
            const ext = path.split('.').pop()?.toLowerCase() || 'jpg';
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
            const blob = new Blob([bytes], { type: mime });
            const blobUrl = URL.createObjectURL(blob);

            // Double check it wasn't added while we were fetching
            if (!this.cache.has(path)) {
                this.cache.set(path, blobUrl);
            } else {
                URL.revokeObjectURL(blobUrl);
            }

            return this.cache.get(path)!;
        } catch (error) {
            this.release(path); // Clean up the ref count if it failed
            throw error;
        }
    }

    public release(path: string) {
        const newCount = (this.refCount.get(path) || 1) - 1;
        if (newCount <= 0) {
            this.refCount.delete(path);
            const url = this.cache.get(path);
            if (url) {
                URL.revokeObjectURL(url);
                this.cache.delete(path);
            }
        } else {
            this.refCount.set(path, newCount);
        }
    }
}

export const imageCacheService = new ImageCacheService();
