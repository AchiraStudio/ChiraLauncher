export interface GameMetadata {
    id: string;
    title: string;
    cover_url: string | null;
    background_url: string | null;
    summary: string | null;
    release_date: string | null;
    developer: string | null;
    publisher: string | null;
    rating: number | null;
    genres: string[] | null;
    themes: string[] | null;
    platforms: string[] | null;
    game_modes: string[] | null;
    steam_app_id: string | null;
}

export interface Game {
    id: string;
    title: string;
    sort_title: string | null;
    executable_path: string;
    playtime_seconds: number;
    last_played: string | null; // ISO 8601
    added_at: string | null;     // ISO 8601
    source: string;
    installed_size: number | null;
    install_dir: string | null;
    cover_image_path: string | null;
    background_image_path: string | null;
    description: string | null;
    igdb_id: number | null;
    steam_app_id: number | null;
    release_date: string | null;
    developer: string | null;
    publisher: string | null;
    genre: string | null;
    rating: number | null;
    sort_order: number;
    hidden: boolean;
    custom_cover: boolean;
    launch_args: string | null;
    working_dir: string | null;
    notes: string | null;
    last_metadata_sync: string | null;

    // Phase 20 RAWG metadata overrides
    genres: string | null; // JSON string
    tags: string | null; // JSON string
    metacritic_score: number | null;
    platforms: string | null; // JSON string
    repack_info: string | null; // JSON string
    run_as_admin: boolean;

    // Phase Persistent Stats
    session_count: number | null;
    first_played: string | null;
    achievements_unlocked: number | null;
    achievements_total: number | null;
    manual_achievement_path: string | null;

    // Emulator / achievement detection fields
    crack_type: string | null;
    app_id: string | null;
    detected_metadata_path: string | null;
    detected_earned_state_path: string | null;
}

export type LaunchSource = "Launcher" | "AutoAttach";

export interface NewGame {
    id: string;
    title: string;
    executable_path: string;
    cover_path: string | null;
    background_path: string | null;
    description: string | null;
    developer: string | null;
    genre: string | null;
    source: string;
    added_at: string;
    installed_size: number | null;
    install_dir: string | null;

    publisher?: string | null;
    release_date?: string | null;
    genres?: string | null;
    tags?: string | null;
    metacritic_score?: number | null;
    platforms?: string | null;
    repack_info?: string | null;
    run_as_admin?: boolean;
    manual_achievement_path?: string | null;
    steam_app_id?: number | null;

    crack_type?: string | null;
    app_id?: string | null;
    detected_metadata_path?: string | null;
    detected_earned_state_path?: string | null;
}

export interface ProcessIdentity {
    pid: number;
    exe_path: string;
    start_time: number;
    game_id: string;
    launched_by: LaunchSource;
}
