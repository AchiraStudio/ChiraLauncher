import { ExtensionInfo } from '../store/extensionStore';
import { invoke } from '@tauri-apps/api/core';

export class ThemeEngine {
    private static instance: ThemeEngine;
    private styleTag: HTMLStyleElement | null = null;

    private constructor() {
        this.styleTag = document.getElementById('chira-dynamic-theme') as HTMLStyleElement;
        if (!this.styleTag) {
            this.styleTag = document.createElement('style');
            this.styleTag.id = 'chira-dynamic-theme';
            document.head.appendChild(this.styleTag);
        }
    }

    public static getInstance(): ThemeEngine {
        if (!ThemeEngine.instance) {
            ThemeEngine.instance = new ThemeEngine();
        }
        return ThemeEngine.instance;
    }

    public async applyTheme(extension: ExtensionInfo) {
        if (extension.kind !== 'theme' || !extension.enabled) {
            this.clearTheme();
            return;
        }

        try {
            const content = await invoke<string>('read_extension_file', {
                extensionId: extension.id,
                fileName: 'theme.css'
            });

            if (this.styleTag) {
                this.styleTag.innerHTML = content;
            }
        } catch (error) {
            console.error('Failed to apply theme:', error);
        }
    }

    public clearTheme() {
        if (this.styleTag) {
            this.styleTag.innerHTML = '';
        }
    }
}
