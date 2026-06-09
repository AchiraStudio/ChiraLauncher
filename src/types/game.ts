export type ExecutionMethod = "direct" | "auto_launcher" | "manual_launcher" | "unreal_engine" | "official_steam";



export interface Game {
    id: string;
    title: string;
    sort_title: string | null;
    executable_path: string;
    playtime_seconds: number;
    last_played: string | null;
    added_at: string | null;
    source: string;
    installed_size: number | null;
    install_dir: string | null;
    cover_image_path: string | null;
    background_image_path: string | null;
    logo_path: string | null;
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

    genres: string | null;
    tags: string | null;
    metacritic_score: number | null;
    platforms: string | null;
    repack_info: string | null;
    run_as_admin: boolean;

    session_count: number | null;
    first_played: string | null;
    achievements_unlocked: number | null;
    achievements_total: number | null;
    manual_achievement_path: string | null;
    manual_save_path: string | null;
    crack_type: string | null;
    app_id: string | null;
    detected_metadata_path: string | null;
    detected_earned_state_path: string | null;
    is_favorite: boolean;

    custom_ach_sound_path: string | null;
    custom_bgm_path: string | null; // Legacy single path
    custom_bgm_paths: string[]; // NEW multi-path array

    execution_method: ExecutionMethod | string;
    launcher_path: string | null;
}



export type NewGame = Partial<Game> & {
    id: string;
    title: string;
    executable_path: string;
    source: string;
    added_at: string;
    is_favorite: boolean;
    cover_path?: string | null;
    background_path?: string | null;
    logo_path?: string | null;
};
