use crate::state::{AppState, DbWrite, ProfileDbWrite, UserProfile};
use anyhow::Result;
use keyring::Entry;
use tauri::{command, State};
use uuid::Uuid;

const KEYRING_SERVICE: &str = "ChiraLauncher";

#[command]
pub async fn get_profile(state: State<'_, AppState>) -> Result<Option<UserProfile>, String> {
    let pool = &state.read_pool;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, username, steam_id, avatar_url, xp, supabase_user_id, is_cloud_synced, private_key, public_key FROM profiles WHERE is_default = 1 LIMIT 1")
        .map_err(|e| e.to_string())?;

    let profile = stmt.query_row([], |row| {
        let id: String = row.get(0)?;
        let mut p = UserProfile {
            id: id.clone(),
            username: row.get(1)?,
            steam_id: row.get(2)?,
            avatar_url: row.get(3)?,
            xp: row.get(4).unwrap_or(0),
            supabase_user_id: row.get(5).unwrap_or(None),
            is_cloud_synced: row.get::<_, i32>(6).unwrap_or(0) != 0,
            private_key: row.get(7).unwrap_or(None),
            public_key: row.get(8).unwrap_or(None),
        };

        // Attempt to read from OS Keychain (takes precedence if available)
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, &p.id) {
            if let Ok(secret) = entry.get_password() {
                if !secret.is_empty() {
                    p.private_key = Some(secret);
                }
            }
        }

        Ok(p)
    });

    match profile {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub async fn update_profile(
    state: State<'_, AppState>,
    username: String,
    steam_id: Option<String>,
    avatar_url: Option<String>,
    supabase_user_id: Option<String>,
    is_cloud_synced: bool,
) -> Result<UserProfile, String> {
    let existing = get_profile(state.clone()).await?;

    let (id, current_xp, priv_k, pub_k) = match existing {
        Some(p) => (p.id, p.xp, p.private_key, p.public_key),
        None => (Uuid::new_v4().to_string(), 0, None, None),
    };

    let final_steam_id = match steam_id {
        Some(sid) if !sid.trim().is_empty() => Some(sid),
        _ => {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            let suffix: u64 = rng.gen_range(1000000000..9999999999);
            Some(format!("7656119{}", suffix))
        }
    };

    let profile = UserProfile {
        id,
        username,
        steam_id: final_steam_id,
        avatar_url,
        xp: current_xp,
        supabase_user_id,
        is_cloud_synced,
        private_key: priv_k,
        public_key: pub_k,
    };

    state
        .db_tx
        .send(DbWrite::Profile(ProfileDbWrite::UpdateProfile(
            profile.clone(),
        )))
        .map_err(|e| e.to_string())?;

    Ok(profile)
}

#[command]
pub async fn is_first_launch(state: State<'_, AppState>) -> Result<bool, String> {
    let profile = get_profile(state).await?;
    Ok(profile.is_none())
}
