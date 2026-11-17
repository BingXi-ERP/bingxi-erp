//! 支付通道凭证的 AES-256-GCM 存储封装；AAD 防止跨通道替换密文。
use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, OsRng, Payload, rand_core::RngCore},
};
use base64::{Engine, engine::general_purpose::STANDARD};

use super::error::AppError;

const PREFIX: &str = "pc:v1:";
const NONCE_LEN: usize = 12;
#[cfg(test)]
const TAG_LEN: usize = 16;

fn unavailable() -> AppError {
    AppError::ServiceUnavailable("Payment channel credential encryption unavailable".into())
}

fn parse_key(value: Option<&str>) -> Result<[u8; 32], AppError> {
    let bytes = STANDARD
        .decode(value.ok_or_else(unavailable)?)
        .map_err(|_| unavailable())?;
    bytes.try_into().map_err(|_| unavailable())
}

/// 仅凭证写入调用此入口；不读取 JWT，不生成或持久化环境密钥。
pub fn encrypt_for_storage(channel_code: &str, plaintext: &str) -> Result<String, AppError> {
    let value = std::env::var("PAYMENT_CHANNEL_ENCRYPTION_KEY").map_err(|_| unavailable())?;
    let key = parse_key(Some(&value))?;
    encrypt(&key, channel_code, plaintext)
}

fn aad(channel_code: &str) -> Vec<u8> {
    let mut aad = b"payment-channel-config:api-key:v1\0".to_vec();
    aad.extend_from_slice(channel_code.as_bytes());
    aad
}

fn encrypt(key: &[u8; 32], channel_code: &str, plaintext: &str) -> Result<String, AppError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| unavailable())?;
    let mut nonce = [0u8; NONCE_LEN];
    OsRng
        .try_fill_bytes(&mut nonce)
        .map_err(|_| unavailable())?;
    let ciphertext = cipher
        .encrypt(
            &Nonce::from(nonce),
            Payload {
                msg: plaintext.as_bytes(),
                aad: &aad(channel_code),
            },
        )
        .map_err(|_| unavailable())?;
    let mut payload = nonce.to_vec();
    payload.extend_from_slice(&ciphertext);
    Ok(format!("{PREFIX}{}", STANDARD.encode(payload)))
}

/// 显式传入密钥验证存储格式及认证标签；无明文兼容路径。
/// 仅测试用于验证往返与认证；生产写入路径不读取密文。
#[cfg(test)]
pub fn decrypt(key: &[u8; 32], channel_code: &str, stored: &str) -> Result<String, AppError> {
    let payload = STANDARD
        .decode(stored.strip_prefix(PREFIX).ok_or_else(unavailable)?)
        .map_err(|_| unavailable())?;
    if payload.len() < NONCE_LEN + TAG_LEN {
        return Err(unavailable());
    }
    let nonce: [u8; NONCE_LEN] = payload[..NONCE_LEN].try_into().map_err(|_| unavailable())?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| unavailable())?;
    let plaintext = cipher
        .decrypt(
            &Nonce::from(nonce),
            Payload {
                msg: &payload[NONCE_LEN..],
                aad: &aad(channel_code),
            },
        )
        .map_err(|_| unavailable())?;
    String::from_utf8(plaintext).map_err(|_| unavailable())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{http::StatusCode, response::IntoResponse};

    #[test]
    fn round_trip_uses_fresh_nonces() {
        let key = [17; 32];
        let first = encrypt(&key, "wechat_pay", "test-credential").unwrap();
        let second = encrypt(&key, "wechat_pay", "test-credential").unwrap();
        assert_ne!(first, second);
        let first_bytes = STANDARD
            .decode(first.strip_prefix(PREFIX).unwrap())
            .unwrap();
        let second_bytes = STANDARD
            .decode(second.strip_prefix(PREFIX).unwrap())
            .unwrap();
        assert_ne!(first_bytes[..NONCE_LEN], second_bytes[..NONCE_LEN]);
        for stored in [first, second] {
            assert_eq!(
                decrypt(&key, "wechat_pay", &stored).unwrap(),
                "test-credential"
            );
        }
    }

    #[test]
    fn authentication_and_format_errors_never_fall_back() {
        let key = [17; 32];
        let stored = encrypt(&key, "wechat_pay", "test-credential").unwrap();
        assert!(decrypt(&[18; 32], "wechat_pay", &stored).is_err());
        assert!(decrypt(&key, "alipay", &stored).is_err());
        let original = STANDARD
            .decode(stored.strip_prefix(PREFIX).unwrap())
            .unwrap();
        for index in [0, NONCE_LEN, original.len() - 1] {
            let mut altered = original.clone();
            altered[index] ^= 1;
            assert!(
                decrypt(
                    &key,
                    "wechat_pay",
                    &format!("{PREFIX}{}", STANDARD.encode(altered))
                )
                .is_err()
            );
        }
        for invalid in [
            "",
            "plaintext",
            "pc:v2:AAAA",
            "pc:v1:!",
            "pc:v1:",
            "pc:v1:AAAA",
        ] {
            assert!(decrypt(&key, "wechat_pay", invalid).is_err());
        }
    }

    #[test]
    fn key_loading_is_strict_and_errors_are_safe_503() {
        assert_eq!(
            parse_key(Some(&STANDARD.encode([17; 32]))).unwrap(),
            [17; 32]
        );
        for value in [
            None,
            Some(String::new()),
            Some("not-base64-secret".into()),
            Some(STANDARD.encode([0; 31])),
            Some(STANDARD.encode([0; 33])),
            Some(format!("{}\n", STANDARD.encode([0; 32]))),
        ] {
            let error = parse_key(value.as_deref()).unwrap_err();
            assert_eq!(error.to_string(), unavailable().to_string());
            assert_eq!(
                error.into_response().status(),
                StatusCode::SERVICE_UNAVAILABLE
            );
        }
    }
}
