import { convertFileSrc, invoke } from '@tauri-apps/api/core';

interface TrackState {
    buffer: AudioBuffer;
    offset: number;     // Accumulated playtime of this track
    startTime: number;  // The Context Time when this track was last started
}

class SmartAudioEngine {
    private ctx: AudioContext | null = null;
    private tracks = new Map<string, TrackState>();
    private activeTrackId: string | null = null;
    private activeSource: AudioBufferSourceNode | null = null;
    private activeGain: GainNode | null = null;

    private isGameRunning: boolean = false;
    private isAppFocused: boolean = true;

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
        this.isAppFocused = false;
        this.evaluateContextState();
    }

    private evaluateContextState() {
        if (!this.ctx) return;

        // CRITICAL FIX: We NEVER suspend the AudioContext anymore. 
        // Suspending the context kills all audio, including background achievement toasts.
        // Instead, we force it to stay awake, and smoothly ramp the BGM volume to 0.
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }

        // Mute BGM if minimized, unfocused, or a game is playing
        const shouldMuteBgm = document.hidden || !this.isAppFocused || this.isGameRunning;

        if (this.activeGain) {
            this.getVolumeSettings().then(settings => {
                if (!this.activeGain || !this.ctx) return;

                const now = this.ctx.currentTime;
                this.activeGain.gain.cancelScheduledValues(now);

                if (shouldMuteBgm) {
                    // Smooth fade out
                    this.activeGain.gain.linearRampToValueAtTime(0.001, now + 0.5);
                } else {
                    // Smooth fade in back to user's BGM setting
                    this.activeGain.gain.linearRampToValueAtTime(settings.bgm, now + 0.5);
                }
            });
        }
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

            // Aggressively attempt to unlock the Audio Context on user interaction
            document.addEventListener('mousedown', () => {
                if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => { });
            }, { once: true });

            document.addEventListener('keydown', () => {
                if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => { });
            }, { once: true });

            // Native listeners for app visibility and focus state
            document.addEventListener('visibilitychange', this.evaluateContextState);
            window.addEventListener('focus', this.handleFocus);
            window.addEventListener('blur', this.handleBlur);

            this.isAppFocused = document.hasFocus();
        }
        this.evaluateContextState();
    }

    async getVolumeSettings() {
        try {
            const settings = await invoke<any>("get_app_settings");
            return {
                sfx: (settings.volume_sfx ?? 80) / 100,
                bgm: (settings.volume_bgm ?? 50) / 100,
                enabled: settings.enable_notifications ?? true,
                globalBgmPath: settings.launcher_bgm_path || null,
                globalAchSoundPath: settings.default_ach_sound_path || null,
            };
        } catch {
            return { sfx: 0.8, bgm: 0.5, enabled: true, globalBgmPath: null, globalAchSoundPath: null };
        }
    }

    async loadAudio(path: string): Promise<AudioBuffer> {
        this.init();
        let url = path;

        // If it's a local file path, bypass strict Tauri asset scopes via base64 IPC
        if (!path.startsWith('http') && !path.startsWith('data:')) {
            try {
                url = await invoke<string>("read_audio_base64", { path });
            } catch (e) {
                console.warn("Failed to load audio via IPC, falling back to asset protocol", e);
                url = convertFileSrc(path);
            }
        }

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await this.ctx!.decodeAudioData(arrayBuffer);
    }

    analyzeSilence(buffer: AudioBuffer, threshold = 0.01) {
        const data = buffer.getChannelData(0);
        let start = 0;
        let end = data.length - 1;

        // Find first non-silent frame
        for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) > threshold) { start = i; break; }
        }

        // Find last non-silent frame
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

        // Force context alive just in case browser policy suspended it
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
            const buffer = await this.loadAudio(path);
            const { startTime, duration } = this.analyzeSilence(buffer);

            const source = this.ctx.createBufferSource();
            source.buffer = buffer;

            // Create a dedicated gain node for the SFX so it ignores BGM muting
            const sfxGain = this.ctx.createGain();
            sfxGain.gain.value = settings.sfx;

            source.connect(sfxGain);
            sfxGain.connect(this.ctx.destination);

            source.start(0, startTime, duration);

            // Ensure the toast stays visible for at least 3000ms (3 seconds) no matter how short the sound is
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

    private async requestTrack(id: string, path: string | null) {
        this.init();
        if (!this.ctx) return;

        if (this.activeTrackId === id) return; // Already playing the requested track

        // FADE OUT PREVIOUS BGM
        if (this.activeTrackId && this.activeSource && this.activeGain) {
            const oldId = this.activeTrackId;
            const oldSource = this.activeSource;
            const oldGain = this.activeGain;
            const oldState = this.tracks.get(oldId);

            if (oldState) {
                const elapsed = this.ctx.currentTime - oldState.startTime;
                oldState.offset = (oldState.offset + elapsed) % oldState.buffer.duration;
            }

            oldGain.gain.cancelScheduledValues(this.ctx.currentTime);
            oldGain.gain.setValueAtTime(oldGain.gain.value, this.ctx.currentTime);
            oldGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 1.0);

            setTimeout(() => {
                try { oldSource.stop(); } catch { }
            }, 1000);
        }

        this.activeTrackId = id;
        this.activeSource = null;
        this.activeGain = null;

        if (!path) {
            // Fallback: If a game had no BGM, fall back to global launcher BGM
            if (id !== 'global') {
                const settings = await this.getVolumeSettings();
                // 🛑 ASYNC SAFETY CHECK: Ensure we didn't switch tabs while fetching settings
                if (this.activeTrackId !== id) return;

                if (settings.globalBgmPath) {
                    await this.requestTrack('global', settings.globalBgmPath);
                }
            }
            return;
        }

        try {
            // Group our async setups
            const settings = await this.getVolumeSettings();
            if (this.activeTrackId !== id) return;

            let state = this.tracks.get(id);
            if (!state) {
                const buffer = await this.loadAudio(path);

                // 🛑 ASYNC SAFETY CHECK: Did the user navigate away while the MP3 was decoding?
                if (this.activeTrackId !== id) return;

                state = { buffer, offset: 0, startTime: 0 };
                this.tracks.set(id, state);
            }

            const source = this.ctx.createBufferSource();
            source.buffer = state.buffer;
            source.loop = true;

            const gain = this.ctx.createGain();

            // Check if we should immediately mute it upon creation (e.g., app is currently unfocused)
            const shouldMuteBgm = document.hidden || !this.isAppFocused || this.isGameRunning;
            const targetVolume = shouldMuteBgm ? 0.001 : settings.bgm;

            gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(targetVolume, this.ctx.currentTime + 1.0);

            source.connect(gain);
            gain.connect(this.ctx.destination);

            state.startTime = this.ctx.currentTime;
            source.start(0, state.offset);

            this.activeSource = source;
            this.activeGain = gain;
        } catch (e) {
            console.error(`Failed to play track ${id}:`, e);
        }
    }

    async playGlobalBGM() {
        const settings = await this.getVolumeSettings();
        await this.requestTrack('global', settings.globalBgmPath);
    }

    async playGameBGM(gameId: string, path: string | null) {
        if (path) {
            await this.requestTrack(`game_${gameId}`, path);
        } else {
            await this.playGlobalBGM();
        }
    }

    // Called instantly by settings panel so user doesn't have to restart tracks
    async updateLiveVolume() {
        if (this.ctx && this.activeGain) {
            const settings = await this.getVolumeSettings();
            const shouldMuteBgm = document.hidden || !this.isAppFocused || this.isGameRunning;

            const targetVolume = shouldMuteBgm ? 0.001 : settings.bgm;
            this.activeGain.gain.linearRampToValueAtTime(targetVolume, this.ctx.currentTime + 0.5);
        }
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
            const url = `/${soundFile}`;
            let state = this.tracks.get(url);
            
            if (!state) {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = await this.ctx.decodeAudioData(arrayBuffer);
                state = { buffer, offset: 0, startTime: 0 };
                this.tracks.set(url, state);
            }
            
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

// Auto-initialize context on first interaction
if (typeof document !== "undefined") {
    document.addEventListener("mousedown", () => smartAudio.init(), { once: true });
    document.addEventListener("keydown", () => smartAudio.init(), { once: true });
}