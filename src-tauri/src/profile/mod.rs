use crate::state::{AppState, DbWrite, ProfileDbWrite, UserProfile};
use anyhow::Result;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::{command, State};
use uuid::Uuid;

const KEYRING_SERVICE: &str = "ChiraLauncher";

#[derive(Serialize, Deserialize)]
pub struct LocalMessage {
    pub id: String,
    pub is_mine: bool,
    pub plain_text: String,
    pub timestamp: u64,
}

#[derive(Serialize)]
pub struct RecentChat {
    pub contact_id: String,
    pub last_message: String,
    pub timestamp: u64,
}

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
            id,
            username: row.get(1)?,
            steam_id: row.get(2)?,
            avatar_url: row.get(3)?,
            xp: row.get(4).unwrap_or(0),
            supabase_user_id: row.get(5).unwrap_or(None),
            is_cloud_synced: row.get::<_, i32>(6).unwrap_or(0) != 0,
            private_key: None,
            public_key: row.get(8).unwrap_or(None),
        };

        if let Ok(entry) = Entry::new(KEYRING_SERVICE, &p.id) {
            if let Ok(secret) = entry.get_password() {
                p.private_key = Some(secret);
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
pub async fn set_profile_keys(
    state: State<'_, AppState>,
    public_key: String,
    private_key: String,
) -> Result<(), String> {
    if let Some(mut p) = get_profile(state.clone()).await? {
        p.public_key = Some(public_key);

        if let Ok(entry) = Entry::new(KEYRING_SERVICE, &p.id) {
            if let Err(e) = entry.set_password(&private_key) {
                return Err(format!("Failed to save to keychain: {}", e));
            }
        }

        state
            .db_tx
            .send(DbWrite::Profile(ProfileDbWrite::UpdateProfile(p)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn is_first_launch(state: State<'_, AppState>) -> Result<bool, String> {
    let profile = get_profile(state).await?;
    Ok(profile.is_none())
}

#[command]
pub async fn save_local_message(
    id: String,
    contact_id: String,
    is_mine: bool,
    plain_text: String,
    timestamp: u64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db_tx
        .send(DbWrite::Profile(ProfileDbWrite::SaveLocalMessage {
            id,
            contact_id,
            is_mine,
            plain_text,
            timestamp,
        }))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn get_local_messages(
    contact_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<LocalMessage>, String> {
    let pool = &state.read_pool;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, is_mine, plain_text, timestamp FROM local_messages WHERE contact_id = ?1 ORDER BY timestamp ASC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([contact_id], |row| {
            Ok(LocalMessage {
                id: row.get(0)?,
                is_mine: row.get::<_, i32>(1)? != 0,
                plain_text: row.get(2)?,
                timestamp: row.get::<_, i64>(3)? as u64,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut msgs = Vec::new();
    for msg in iter {
        msgs.push(msg.map_err(|e| e.to_string())?);
    }

    Ok(msgs)
}

#[command]
pub async fn get_recent_chats(state: State<'_, AppState>) -> Result<Vec<RecentChat>, String> {
    let pool = &state.read_pool;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT contact_id, plain_text, MAX(timestamp) as last_ts FROM local_messages GROUP BY contact_id ORDER BY last_ts DESC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(RecentChat {
                contact_id: row.get(0)?,
                last_message: row.get(1)?,
                timestamp: row.get::<_, i64>(2)? as u64,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut chats = Vec::new();
    for chat in iter {
        chats.push(chat.map_err(|e| e.to_string())?);
    }

    Ok(chats)
}
