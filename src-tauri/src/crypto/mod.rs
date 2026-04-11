use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use x25519_dalek::{PublicKey, StaticSecret};

#[derive(Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub ciphertext: String,
    pub nonce: String,
}

#[derive(Serialize, Deserialize)]
pub struct KeyPair {
    pub public_key: String,
    pub private_key: String,
}

#[tauri::command]
pub fn generate_keypair() -> Result<KeyPair, String> {
    // Generate a secure, static private key
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);

    // Encode to base64 so it can be safely stored in SQLite / Supabase
    Ok(KeyPair {
        private_key: general_purpose::STANDARD.encode(secret.to_bytes()),
        public_key: general_purpose::STANDARD.encode(public.as_bytes()),
    })
}

#[tauri::command]
pub fn encrypt_message(
    plain_text: String,
    my_private_key: String,
    their_public_key: String,
) -> Result<EncryptedPayload, String> {
    let priv_bytes = general_purpose::STANDARD
        .decode(my_private_key)
        .map_err(|e| e.to_string())?;
    let pub_bytes = general_purpose::STANDARD
        .decode(their_public_key)
        .map_err(|e| e.to_string())?;

    let secret = StaticSecret::from({
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&priv_bytes[0..32]);
        arr
    });

    let public = PublicKey::from({
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&pub_bytes[0..32]);
        arr
    });

    // Create the mathematical shared lock
    let shared_secret = secret.diffie_hellman(&public);
    let cipher = Aes256Gcm::new(shared_secret.as_bytes().into());

    // Generate a unique 96-bit nonce for this specific message
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    // Encrypt the plain text
    let ciphertext = cipher
        .encrypt(&nonce, plain_text.as_bytes().as_ref())
        .map_err(|e| e.to_string())?;

    Ok(EncryptedPayload {
        ciphertext: general_purpose::STANDARD.encode(ciphertext),
        nonce: general_purpose::STANDARD.encode(nonce.as_slice()),
    })
}

#[tauri::command]
pub fn decrypt_message(
    ciphertext_b64: String,
    nonce_b64: String,
    my_private_key: String,
    their_public_key: String,
) -> Result<String, String> {
    let priv_bytes = general_purpose::STANDARD
        .decode(my_private_key)
        .map_err(|e| e.to_string())?;
    let pub_bytes = general_purpose::STANDARD
        .decode(their_public_key)
        .map_err(|e| e.to_string())?;
    let ciphertext = general_purpose::STANDARD
        .decode(ciphertext_b64)
        .map_err(|e| e.to_string())?;
    let nonce_bytes = general_purpose::STANDARD
        .decode(nonce_b64)
        .map_err(|e| e.to_string())?;

    let secret = StaticSecret::from({
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&priv_bytes[0..32]);
        arr
    });

    let public = PublicKey::from({
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&pub_bytes[0..32]);
        arr
    });

    // Recreate the exact same mathematical shared lock
    let shared_secret = secret.diffie_hellman(&public);
    let cipher = Aes256Gcm::new(shared_secret.as_bytes().into());
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Decrypt it back to plain text
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}
