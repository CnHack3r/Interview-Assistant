// 本地配置 / 会话持久化：API Key 混淆后保存在本地配置文件
// （不再使用系统 Keychain —— 未签名的 Tauri/Electron 应用访问钥匙串会反复触发登录密码提示）
use base64::Engine;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use crate::types::{AIConfig, MaskedConfig, SaveResult};

// 数据目录沿用初代版本的标识，从 1.0.x 升级到 PRO 时保留历史简历 / 评分 / API Key
const APP_ID: &str = "com.interview.assistant";

#[derive(Debug, Clone)]
pub struct ConfigStore {
    pub provider: String,
    pub model: String,
    pub base_url: String,
}

pub struct Defaults {
    pub base_url: &'static str,
    pub model: &'static str,
}

pub fn defaults_for(provider: &str) -> Defaults {
    match provider {
        "doubao" => Defaults {
            base_url: "https://ark.cn-beijing.volces.com/api/v3",
            model: "doubao-pro-32k",
        },
        "openai" => Defaults {
            base_url: "https://api.openai.com/v1",
            model: "gpt-4o-mini",
        },
        "kimi" => Defaults {
            base_url: "https://api.moonshot.cn/v1",
            model: "moonshot-v1-8k",
        },
        _ => Defaults {
            base_url: "https://api.deepseek.com/v1",
            model: "deepseek-v4-flash",
        },
    }
}

fn app_dir() -> PathBuf {
    // 允许通过环境变量覆盖数据目录（便于测试/定制），默认走系统数据目录
    if let Ok(dir) = std::env::var("INTERVIEW_DATA_DIR") {
        return PathBuf::from(dir);
    }
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(APP_ID)
}

fn config_path() -> PathBuf {
    app_dir().join("config.json")
}

fn session_path() -> PathBuf {
    app_dir().join("session.json")
}

// ---------- API Key 本地存储 ----------

/// 读取配置文件的整体 JSON（不存在则返回空对象）
fn load_config_value() -> Value {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| json!({}))
}

/// 写回配置文件（保留其它字段）
fn write_config_value(v: &Value) -> Result<(), String> {
    let _ = fs::create_dir_all(app_dir());
    fs::write(config_path(), serde_json::to_string_pretty(v).unwrap_or_default())
        .map_err(|e| format!("写入配置失败：{e}"))
}

// 简单混淆（非强加密）：XOR + base64，避免 Key 明文落在磁盘上
const KEY_XOR: [u8; 8] = [0x5a, 0x11, 0x3c, 0xe7, 0x9b, 0x2f, 0x44, 0x68];

fn encode_key(value: &str) -> String {
    let enc: Vec<u8> = value
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ KEY_XOR[i % KEY_XOR.len()])
        .collect();
    base64::engine::general_purpose::STANDARD.encode(&enc)
}

fn decode_key(encoded: &str) -> Option<String> {
    let enc = base64::engine::general_purpose::STANDARD.decode(encoded).ok()?;
    let dec: Vec<u8> = enc
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ KEY_XOR[i % KEY_XOR.len()])
        .collect();
    String::from_utf8(dec).ok()
}

/// 保存 API Key（本地配置文件，混淆后存储）
fn set_secret(value: &str) -> Result<(), String> {
    let mut v = load_config_value();
    if let Some(obj) = v.as_object_mut() {
        obj.insert("key".into(), json!(encode_key(value)));
    }
    write_config_value(&v)
}

fn get_secret() -> Option<String> {
    load_config_value()
        .get("key")
        .and_then(|k| k.as_str())
        .and_then(decode_key)
}

// ---------- 配置 ----------

impl ConfigStore {
    pub fn load() -> Self {
        fs::read_to_string(config_path())
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .map(|v| ConfigStore {
                provider: v
                    .get("provider")
                    .and_then(|x| x.as_str())
                    .unwrap_or("deepseek")
                    .to_string(),
                model: v
                    .get("model")
                    .and_then(|x| x.as_str())
                    .unwrap_or_else(|| defaults_for("deepseek").model)
                    .to_string(),
                base_url: v
                    .get("baseUrl")
                    .and_then(|x| x.as_str())
                    .unwrap_or_else(|| defaults_for("deepseek").base_url)
                    .to_string(),
            })
            .unwrap_or_else(|| ConfigStore {
                provider: "deepseek".into(),
                model: defaults_for("deepseek").model.into(),
                base_url: defaults_for("deepseek").base_url.into(),
            })
    }
}

/// 读取配置并解密 API Key（供 AI 请求使用）
pub fn decrypt_effective(store: ConfigStore) -> Result<AIConfig, String> {
    Ok(AIConfig {
        provider: store.provider,
        model: store.model,
        base_url: store.base_url,
        api_key: get_secret().unwrap_or_default(),
    })
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "****".into()
    } else {
        let mut s = String::new();
        s.push_str(&key[..4]);
        s.push('…');
        s.push_str(&key[key.len() - 4..]);
        s
    }
}

/// 读取配置（不含明文 apiKey）
#[tauri::command]
pub fn get_config() -> Result<MaskedConfig, String> {
    let store = ConfigStore::load();
    let defaults = defaults_for(&store.provider);
    let model = if store.model.is_empty() {
        defaults.model.to_string()
    } else {
        store.model
    };
    let base_url = if store.base_url.is_empty() {
        defaults.base_url.to_string()
    } else {
        store.base_url
    };
    let api_key = get_secret().unwrap_or_default();
    Ok(MaskedConfig {
        provider: store.provider,
        model,
        base_url,
        has_key: !api_key.is_empty(),
        masked_key: mask_key(&api_key),
    })
}

/// 保存配置（提供新 Key 则优先写入系统安全存储；失败则写入本地配置文件）
#[tauri::command]
pub fn save_config(config: AIConfig) -> Result<SaveResult, String> {
    if !config.api_key.is_empty() {
        set_secret(&config.api_key)?;
    }
    let mut v = load_config_value();
    if let Some(obj) = v.as_object_mut() {
        obj.insert("provider".into(), json!(config.provider));
        obj.insert("model".into(), json!(config.model));
        obj.insert("baseUrl".into(), json!(config.base_url));
    }
    write_config_value(&v)?;
    Ok(SaveResult { ok: true, message: Some("已保存".into()), ..Default::default() })
}

// ---------- 会话持久化 ----------

#[tauri::command]
pub fn session_load() -> Result<Option<Value>, String> {
    Ok(fs::read_to_string(session_path())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok()))
}

#[tauri::command]
pub fn session_save(state: Value) -> Result<(), String> {
    let _ = fs::create_dir_all(app_dir());
    fs::write(session_path(), serde_json::to_string_pretty(&state).unwrap_or_default())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn session_clear() -> Result<(), String> {
    let _ = fs::remove_file(session_path());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::AIConfig;

    #[test]
    fn save_config_reproduces() {
        // 真实环境下 Keychain 可能不可用；用可写目录验证「回退到配置文件」路径是否可用
        std::env::set_var("INTERVIEW_DATA_DIR", "target/test-data");
        let _ = std::fs::remove_dir_all("target/test-data");

        let cfg = AIConfig {
            provider: "deepseek".into(),
            api_key: "sk-DEBUG-TEST-1234".into(),
            model: "deepseek-v4-flash".into(),
            base_url: "https://api.deepseek.com/v1".into(),
        };
        match save_config(cfg) {
            Ok(r) => println!("save_config => Ok: {r:?}"),
            Err(e) => println!("save_config => ERR: {e}"),
        }
        match get_secret() {
            Some(s) => println!("get_secret => Some({s})"),
            None => println!("get_secret => None"),
        }
        match get_config() {
            Ok(c) => println!("get_config => Ok: has_key={} masked={}", c.has_key, c.masked_key),
            Err(e) => println!("get_config => ERR: {e}"),
        }
    }
}
