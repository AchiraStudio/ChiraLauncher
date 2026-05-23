import { invoke } from '@tauri-apps/api/core';

interface TrackState {
    buffer?: AudioBuffer; // Used only for SFX
    offset: number;     
    startTime: number;  
    isPlaying: boolean;
}

interface PlaylistState {
    paths: string[];
    playQueue: number[];
    currentIndex: number;
    trackProgress: number; // The exact second the track was paused at
}

class SmartAudioEngine {
    private ctx: AudioContext | null = null;
    private tracks = new Map<string, TrackState>();
    
    // HTML Audio for BGM (Solves the RAM memory leak)
    private bgmAudio: HTMLAudioElement | null = null;
    private bgmFadeInterval: number | null = null;
    private currentBgmBlobUrl: string | null = null;
    
    private activePlaylistType: string = 'none';

    // State memory for every playlist (Global + per-game)
    private playlists = new Map<string, PlaylistState>();
    
    private isPaused: boolean = false; 
    private isGameRunning: boolean = false;
    private isAppFocused: boolean = true;

    // Track the absolute newest intent. If this changes while parsing a file, we abort.
    private playbackIntentToken: number = 0;

    constructor() {
        this.evaluateContextState = this.evaluateContextState.bind(this);
        this.handleFocus = this.handleFocus.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
    }

    public setGameRunning(running: boolean) {
        this.isGameRunning = running;
        this.evaluateContextState();
    }

    private handleFocus() {
        this.isAppFocused = true;
        this.evaluateContextState();
    }

    private handleBlur() {
        setTimeout(() => {
            this.isAppFocused = document.hasFocus();
            this.evaluateContextState();
        }, 150);
    }

    private getMimeType(path: string): string {
        const ext = path.split('.').pop()?.toLowerCase();
        if (ext === 'ogg') return 'audio/ogg';
        if (ext === 'wav') return 'audio/wav';
        if (ext === 'flac') return 'audio/flac';
        return 'audio/mpeg'; 
    }

    // ── BGM VOLUME FADER ──
    private fadeBgmVolume(targetVolume: number, durationMs: number = 500) {
        if (!this.bgmAudio) return;
        
        if (this.bgmFadeInterval) {
            clearInterval(this.bgmFadeInterval);
            this.bgmFadeInterval = null;
        }

        // Instantly pause if target is 0 to avoid background throttle bugs
        if (targetVolume === 0) {
            this.bgmAudio.pause();
            this.bgmAudio.volume = 0;
            return;
        }

        if (this.bgmAudio.paused) {
            this.bgmAudio.volume = 0;
            this.bgmAudio.play().catch(()=>{});
        }

        const startVolume = this.bgmAudio.volume;
        const diff = targetVolume - startVolume;
        const steps = 20;
        const stepTime = durationMs / steps;
        let currentStep = 0;

        this.bgmFadeInterval = window.setInterval(() => {
            currentStep++;
            if (this.bgmAudio) {
                this.bgmAudio.volume = Math.max(0, Math.min(1, startVolume + (diff * (currentStep / steps))));
            }

            if (currentStep >= steps) {
                if (this.bgmFadeInterval) clearInterval(this.bgmFadeInterval);
            }
        }, stepTime);
    }

    private async evaluateContextState() {
        const settings = await this.getVolumeSettings();
        let shouldPause = false;
        
        if (this.isGameRunning) shouldPause = true;
        if (!settings.bgm_play_unfocused && !this.isAppFocused) shouldPause = true;
        if (!settings.bgm_play_in_tray && document.hidden) shouldPause = true;

        if (shouldPause && !this.isPaused) {
            this.isPaused = true;
            this.fadeBgmVolume(0); 
        } else if (!shouldPause && this.isPaused) {
            this.isPaused = false;
            this.fadeBgmVolume(settings.bgm);
        }
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

            document.addEventListener('mousedown', () => {
                if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => { });
                if (this.bgmAudio && this.bgmAudio.paused && !this.isPaused && this.activePlaylistType !== 'none') {
                    this.bgmAudio.play().catch(() => { });
                }
            }, { once: true });

            document.addEventListener('keydown', () => {
                if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => { });
                if (this.bgmAudio && this.bgmAudio.paused && !this.isPaused && this.activePlaylistType !== 'none') {
                    this.bgmAudio.play().catch(() => { });
                }
            }, { once: true });

            document.addEventListener('visibilitychange', () => {
                this.isAppFocused = document.hasFocus();
                this.evaluateContextState();
            });
            window.addEventListener('focus', this.handleFocus);
            window.addEventListener('blur', this.handleBlur);

            this.isAppFocused = document.hasFocus();
        }
    }

    async getVolumeSettings() {
        try {
            const settings = await invoke<any>("get_app_settings");
            return {
                sfx: (settings.volume_sfx ?? 80) / 100,
                bgm: (settings.volume_bgm ?? 50) / 100,
                enabled: settings.enable_notifications ?? true,
                launcher_bgm_paths: settings.launcher_bgm_paths as string[] || [],
                bgm_play_unfocused: settings.bgm_play_unfocused ?? false,
                bgm_play_in_tray: settings.bgm_play_in_tray ?? false,
                bgm_shuffle: settings.bgm_shuffle ?? false,
                globalAchSoundPath: settings.default_ach_sound_path || null,
            };
        } catch {
            return { 
                sfx: 0.8, bgm: 0.5, enabled: true, 
                launcher_bgm_paths: [], bgm_play_unfocused: false, 
                bgm_play_in_tray: false, bgm_shuffle: false, globalAchSoundPath: null 
            };
        }
    }

    // ── SECURE AUDIO LOADER (Rust Raw Byte Array IPC) ──
    private async resolveAudioUrl(path: string, intentToken: number): Promise<string> {
        if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) {
            return path;
        }

        if (this.playbackIntentToken !== intentToken) return "";

        try {
            // Memory efficient IPC transport using tauri::ipc::Response
            const buffer = await invoke<ArrayBuffer>("read_local_file_bytes", { path });
            if (this.playbackIntentToken !== intentToken) return "";

            const blob = new Blob([buffer], { type: this.getMimeType(path) });
            return URL.createObjectURL(blob);
        } catch (e) {
            console.error("IPC audio read failed", e);
            return "";
        }
    }

    // ── PLAYLIST & QUEUE LOGIC ──

    private generateShuffleQueue(length: number) {
        const arr = Array.from({ length }, (_, i) => i);
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    private async playNextTrack() {
        const state = this.playlists.get(this.activePlaylistType);
        if (!state || state.paths.length === 0) return;
        
        const settings = await this.getVolumeSettings();
        
        state.trackProgress = 0; // Reset progress for the next track

        if (settings.bgm_shuffle) {
            if (state.playQueue.length === 0) {
                state.playQueue = this.generateShuffleQueue(state.paths.length);
            }
            state.currentIndex = state.playQueue.shift()!;
        } else {
            state.currentIndex = (state.currentIndex + 1) % state.paths.length;
        }

        const nextPath = state.paths[state.currentIndex];
        await this.requestBGM(nextPath, 0);
    }

    private async requestBGM(path: string, resumeTime: number = 0) {
        this.init();
        
        const myToken = ++this.playbackIntentToken;

        // Instantly cut old track to prevent overlapping
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.src = ""; 
        }

        try {
            const url = await this.resolveAudioUrl(path, myToken);

            if (this.playbackIntentToken !== myToken || !url) {
                if (url.startsWith('blob:')) URL.revokeObjectURL(url);
                return;
            }

            if (this.currentBgmBlobUrl) {
                URL.revokeObjectURL(this.currentBgmBlobUrl);
            }
            
            if (url.startsWith('blob:')) {
                this.currentBgmBlobUrl = url;
            }

            if (!this.bgmAudio) {
                this.bgmAudio = new Audio();
            }

            this.bgmAudio.src = url;
            
            const state = this.playlists.get(this.activePlaylistType);
            this.bgmAudio.loop = state ? state.paths.length === 1 : false;
            this.bgmAudio.volume = 0; 

            // Bind onended behavior
            this.bgmAudio.onended = () => {
                if (this.playbackIntentToken !== myToken) return;

                if (state && state.paths.length > 1) {
                    this.playNextTrack();
                } else if (state) {
                    state.trackProgress = 0;
                    if (this.bgmAudio) {
                        this.bgmAudio.currentTime = 0;
                        this.bgmAudio.play().catch(()=>{});
                    }
                }
            };

            // Restore the saved timestamp
            if (resumeTime > 0) {
                this.bgmAudio.addEventListener('loadedmetadata', () => {
                    if (this.bgmAudio && this.bgmAudio.currentTime < resumeTime - 0.5) {
                        this.bgmAudio.currentTime = resumeTime;
                    }
                }, { once: true });
            }

            try {
                await this.bgmAudio.play();
            } catch (err: any) {
                if (err.name === 'NotAllowedError') {
                    console.warn("Autoplay blocked. Waiting for user interaction.");
                } else if (err.name === 'AbortError') {
                    // Ignored since play was interrupted by pause
                } else {
                    console.error("BGM Play error:", err);
                }
            }
            
            const settings = await this.getVolumeSettings();
            const shouldMuteBgm = document.hidden || (!settings.bgm_play_unfocused && !this.isAppFocused) || this.isGameRunning;
            
            if (!shouldMuteBgm) {
                this.fadeBgmVolume(settings.bgm);
                this.isPaused = false;
            } else {
                this.bgmAudio.pause();
                this.isPaused = true;
            }
        } catch (e) {
            console.error(`Failed to play BGM:`, e);
            if (this.playbackIntentToken === myToken) {
                this.playNextTrack();
            }
        }
    }

    private stopActiveBGM() {
        this.playbackIntentToken++; // Invalidate pending operations
        if (this.bgmAudio) {
            // Save exact track progress before killing the audio source
            const state = this.playlists.get(this.activePlaylistType);
            if (state) {
                state.trackProgress = this.bgmAudio.currentTime;
            }

            this.fadeBgmVolume(0);
            this.bgmAudio.pause();
            this.bgmAudio.src = "";
        }
        if (this.currentBgmBlobUrl) {
            URL.revokeObjectURL(this.currentBgmBlobUrl);
            this.currentBgmBlobUrl = null;
        }
        this.activePlaylistType = 'none';
    }

    private saveCurrentProgress() {
        if (this.bgmAudio && this.activePlaylistType !== 'none') {
            const state = this.playlists.get(this.activePlaylistType);
            if (state) {
                state.trackProgress = this.bgmAudio.currentTime;
            }
        }
    }

    async playGlobalBGM() {
        const settings = await this.getVolumeSettings();
        if (!settings.launcher_bgm_paths || settings.launcher_bgm_paths.length === 0) {
            this.stopActiveBGM();
            return;
        }

        // If we are switching from a game TO global, save the game's progress
        if (this.activePlaylistType !== 'global') {
            this.saveCurrentProgress();
        }

        const type = 'global';
        let state = this.playlists.get(type);
        const newPlaylistStr = JSON.stringify(settings.launcher_bgm_paths);

        // If the playlist fundamentally changed, rebuild it
        if (!state || JSON.stringify(state.paths) !== newPlaylistStr) {
            state = {
                paths: settings.launcher_bgm_paths,
                playQueue: [],
                currentIndex: 0,
                trackProgress: 0
            };
            if (settings.bgm_shuffle && state.paths.length > 1) {
                state.playQueue = this.generateShuffleQueue(state.paths.length);
                state.currentIndex = state.playQueue.shift()!;
            }
            this.playlists.set(type, state);
        }

        // If it's already playing the global playlist, don't restart it
        if (this.activePlaylistType === type) return;

        this.activePlaylistType = type;
        const path = state.paths[state.currentIndex];
        await this.requestBGM(path, state.trackProgress);
    }

    async playGameBGM(gameId: string, paths: string[]) {
        if (paths && paths.length > 0) {
            const settings = await this.getVolumeSettings();
            const type = `game_${gameId}`;
            
            // Save current progress before switching
            if (this.activePlaylistType !== type) {
                this.saveCurrentProgress();
            }

            let state = this.playlists.get(type);
            const newPlaylistStr = JSON.stringify(paths);

            if (!state || JSON.stringify(state.paths) !== newPlaylistStr) {
                state = {
                    paths: paths,
                    playQueue: [],
                    currentIndex: 0,
                    trackProgress: 0
                };
                if (settings.bgm_shuffle && state.paths.length > 1) {
                    state.playQueue = this.generateShuffleQueue(state.paths.length);
                    state.currentIndex = state.playQueue.shift()!;
                }
                this.playlists.set(type, state);
            }

            if (this.activePlaylistType === type) return;

            this.activePlaylistType = type;
            const path = state.paths[state.currentIndex];
            await this.requestBGM(path, state.trackProgress);
        } else {
            await this.playGlobalBGM();
        }
    }

    async updateLiveVolume() {
        const settings = await this.getVolumeSettings();
        const shouldPause = this.isGameRunning || (!settings.bgm_play_unfocused && !this.isAppFocused) || (!settings.bgm_play_in_tray && document.hidden);

        if (this.bgmAudio && this.activePlaylistType !== 'none') {
            if (shouldPause) {
                this.isPaused = true;
                this.fadeBgmVolume(0);
            } else {
                this.isPaused = false;
                this.fadeBgmVolume(settings.bgm);
            }
        } else if (this.activePlaylistType === 'none') {
            this.playGlobalBGM();
        }
    }

    // ── SFX Engine (Uses AudioContext) ──
    
    async loadSFX(path: string): Promise<AudioBuffer> {
        this.init();
        let url = path;
        let requiresCleanup = false;

        if (path.startsWith('http') || path.startsWith('data:') || (!path.includes('\\') && !path.includes(':/'))) {
            // It's a relative URL, a web URL, or data URI
            url = path.startsWith('/') ? path.substring(1) : path;
        } else {
            // Absolute local path
            try {
                const buffer = await invoke<ArrayBuffer>("read_local_file_bytes", { path });
                const blob = new Blob([buffer], { type: this.getMimeType(path) });
                url = URL.createObjectURL(blob);
                requiresCleanup = true;
            } catch (e) {
                console.error("Failed to read local SFX via IPC", e);
                throw e;
            }
        }
        
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await this.ctx!.decodeAudioData(arrayBuffer);
        
        if (requiresCleanup) URL.revokeObjectURL(url);
        return buffer;
    }

    analyzeSilence(buffer: AudioBuffer, threshold = 0.01) {
        const data = buffer.getChannelData(0);
        let start = 0;
        let end = data.length - 1;

        for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) > threshold) { start = i; break; }
        }

        for (let i = data.length - 1; i >= 0; i--) {
            if (Math.abs(data[i]) > threshold) { end = i; break; }
        }

        return {
            startTime: start / buffer.sampleRate,
            duration: Math.max(0.5, (end - start) / buffer.sampleRate)
        };
    }

    async playAchievement(gameSpecificPath: string | null | undefined): Promise<number> {
        this.init();
        if (!this.ctx) return 5000;

        if (this.ctx.state === 'suspended') {
            await this.ctx.resume().catch(() => { });
        }

        const settings = await this.getVolumeSettings();
        if (!settings.enabled) return 5000;

        const path = gameSpecificPath || settings.globalAchSoundPath;

        if (!path) {
            this.playFallbackSynthSound(settings.sfx);
            return 5000;
        }

        try {
            const buffer = await this.loadSFX(path);
            const { startTime, duration } = this.analyzeSilence(buffer);

            const source = this.ctx.createBufferSource();
            source.buffer = buffer;

            const sfxGain = this.ctx.createGain();
            sfxGain.gain.value = settings.sfx;

            source.connect(sfxGain);
            sfxGain.connect(this.ctx.destination);

            source.start(0, startTime, duration);

            return Math.max(3000, (duration * 1000) + 1500);
        } catch (e) {
            console.error("Failed to play custom achievement sound", e);
            this.playFallbackSynthSound(settings.sfx);
            return 5000;
        }
    }

    playFallbackSynthSound(volume = 0.8) {
        this.init();
        if (!this.ctx) return;

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }

        try {
            const sfxGain = this.ctx.createGain();
            sfxGain.gain.setValueAtTime(volume * 0.3, this.ctx.currentTime);
            sfxGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
            sfxGain.connect(this.ctx.destination);

            [880, 1100, 1320].forEach((freq, i) => {
                const osc = this.ctx!.createOscillator();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + i * 0.1);
                osc.connect(sfxGain);
                osc.start(this.ctx!.currentTime + i * 0.1);
                osc.stop(this.ctx!.currentTime + i * 0.1 + 0.2);
            });
        } catch { }
    }

    async playUI(soundFile: string) {
        this.init();
        if (!this.ctx) return;
        
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume().catch(() => { });
        }
        
        const settings = await this.getVolumeSettings();
        if (!settings.enabled) return;
        
        try {
            const url = soundFile.startsWith('/') ? soundFile.substring(1) : soundFile;
            let state = this.tracks.get(url);
            
            if (!state) {
                const buffer = await this.loadSFX(url);
                state = { buffer, offset: 0, startTime: 0, isPlaying: false };
                this.tracks.set(url, state);
                
                if (this.tracks.size > 10) {
                    for (const [k, v] of this.tracks.entries()) {
                        if (!v.isPlaying) { this.tracks.delete(k); break; }
                    }
                }
            }
            
            if (!state.buffer) return;
            
            const source = this.ctx.createBufferSource();
            source.buffer = state.buffer;
            
            const sfxGain = this.ctx.createGain();
            sfxGain.gain.value = settings.sfx;
            
            source.connect(sfxGain);
            sfxGain.connect(this.ctx.destination);
            
            source.start(0);
        } catch(e) {
            console.error(`Failed to play UI sound ${soundFile}:`, e);
        }
    }
}

export const smartAudio = new SmartAudioEngine();

if (typeof document !== "undefined") {
    document.addEventListener("mousedown", () => smartAudio.init(), { once: true });
    document.addEventListener("keydown", () => smartAudio.init(), { once: true });
}