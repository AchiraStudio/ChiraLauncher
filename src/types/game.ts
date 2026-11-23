export type ExecutionMethod =
    | "direct"
    | "auto_launcher"
    | "manual_launcher"
    | "unreal_engine"
    | "official_steam";

/**
 * Mirrors `db::queries::Game` in the Rust backend field-for-field.
 * `update_game` deserialises the same shape, so anything added here must also
 * exist on the Rust side (and vice versa).
 */
export interface Game {
    id: string;
    title: string;
    executable_path: string;
    playtime_seconds: number;
    last_played: string | null;
    cover_path: string | null;
    background_path: string | null;
    logo_path: string | null;
    description: string | null;
    developer: string | null;
    genre: string | null;
    rating: number | null;
    igdb_id: number | null;
    steam_app_id: number | null;
    source: string;
    added_at: string | null;
    installed_size: number | null;
    install_dir: string | null;
    publisher: string | null;
    release_date: string | null;
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
    custom_bgm_path: string | null;
    execution_method: ExecutionMethod | string;
    launcher_path: string | null;
    custom_bgm_paths: string[];
    custom_cover: boolean;
    launch_args: string | null;
    sort_order: number;
}

/** Payload for `add_game` (`db::queries::NewGame`). */
export type NewGame = Pick<Game, "id" | "title" | "executable_path" | "source" | "run_as_admin" | "is_favorite"> &
    Partial<Omit<Game, "id" | "title" | "executable_path" | "source" | "run_as_admin" | "is_favorite" | "added_at">> & {
        added_at: string;
    };
