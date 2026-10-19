// 案情板 CaseBoard · 启动密码保险库（M8 验收 2）
//
// 验收要求「数据库文件用普通 SQLite 工具打开为密文；错误密码无法解锁」。
// 做法：整库文件用 AES-256-GCM 加密，密钥由 Argon2id 从启动密码派生；
// 锁定状态下磁盘上只有 caseboard.db.vault，明文库文件不存在。
// 文件布局：[magic CBV1][salt 16][nonce 12][密文]。

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use rand::RngCore;
use std::path::Path;

const MAGIC: &[u8; 4] = b"CBV1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const HEADER_LEN: usize = 4 + SALT_LEN + NONCE_LEN;

/// 判断一个文件是不是案情板加密库（只看文件头）。
pub fn is_vault(bytes: &[u8]) -> bool {
    bytes.len() > HEADER_LEN && &bytes[..4] == MAGIC
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|error| format!("无法派生密钥：{error}"))?;
    Ok(key)
}

/// 把明文库加密写成保险库文件（成功后调用方负责删除明文库）。
pub fn encrypt(plain: &Path, vault: &Path, password: &str) -> Result<u64, String> {
    let data = std::fs::read(plain).map_err(|error| format!("无法读取数据库：{error}"))?;
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce);
    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| format!("密钥无效：{error}"))?;
    let body = cipher
        .encrypt(Nonce::from_slice(&nonce), data.as_slice())
        .map_err(|_| "加密失败：无法写入保险库".to_string())?;
    let mut out = Vec::with_capacity(HEADER_LEN + body.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&body);
    std::fs::write(vault, &out).map_err(|error| format!("无法写入保险库：{error}"))?;
    Ok(out.len() as u64)
}

/// 用启动密码解出明文库；密码不对时返回「启动密码不正确」，绝不留下半截文件。
pub fn decrypt(vault: &Path, plain: &Path, password: &str) -> Result<u64, String> {
    let data = std::fs::read(vault).map_err(|error| format!("无法读取保险库：{error}"))?;
    if !is_vault(&data) {
        return Err("这不是案情板保险库文件（文件头不对）".to_string());
    }
    let salt = &data[4..4 + SALT_LEN];
    let nonce = &data[4 + SALT_LEN..HEADER_LEN];
    let body = &data[HEADER_LEN..];
    let key = derive_key(password, salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| format!("密钥无效：{error}"))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce), body)
        .map_err(|_| "启动密码不正确".to_string())?;
    let tmp = plain.with_extension("db.tmp");
    std::fs::write(&tmp, &plaintext).map_err(|error| format!("无法写入数据库：{error}"))?;
    std::fs::rename(&tmp, plain).map_err(|error| format!("无法替换数据库：{error}"))?;
    Ok(plaintext.len() as u64)
}
