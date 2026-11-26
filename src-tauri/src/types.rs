// 共享数据结构（serde 序列化为 camelCase，与原 TypeScript 前端字段一致）
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyPoint {
    pub id: String,
    pub content: String,
    pub score: i32,
    #[serde(default)]
    pub is_checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InterviewQuestion {
    pub id: String,
    pub category: String,
    pub title: String,
    pub difficulty: String, // easy | medium | hard
    #[serde(rename = "type")]
    pub qtype: String, // basic | comprehensive
    pub max_score: i32,
    pub question_body: String,
    pub reference_answer: String,
    #[serde(default)]
    pub key_points: Vec<KeyPoint>,
    // null = 未评分
    #[serde(default)]
    pub score: Option<i32>,
    #[serde(default)]
    pub is_deleted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewSet {
    pub categories: Vec<String>,
    pub questions: Vec<InterviewQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIConfig {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportData {
    pub candidate_name: String,
    pub position: String,
    pub interview_date: String,
    pub questions: Vec<InterviewQuestion>,
    pub total_score: i32,
    pub total_max_score: i32,
    pub original_max_score: i32,
    pub score_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // 用于 JSON 反序列化（会话持久化），不在 Rust 内直接构造
pub struct Candidate {
    pub id: String,
    pub name: String,
    pub position: String,
    pub resume: CandidateResume,
    #[serde(default)]
    pub questions: Vec<InterviewQuestion>,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gen_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct CandidateResume {
    pub name: String,
    pub path: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct CandidatesFile {
    pub candidates: Vec<Candidate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_candidate_id: Option<String>,
    pub saved_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePick {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
}

/// get_config 返回值：不包含明文 apiKey
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskedConfig {
    pub provider: String,
    pub model: String,
    pub base_url: String,
    pub has_key: bool,
    pub masked_key: String,
}
