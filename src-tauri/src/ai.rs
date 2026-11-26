// AI 面试题生成：OpenAI 兼容接口（DeepSeek / 豆包 / OpenAI / Kimi）
use serde_json::{json, Value};
use uuid::Uuid;

use crate::settings::{decrypt_effective, ConfigStore};
use crate::types::{AIConfig, InterviewQuestion, InterviewSet, KeyPoint, SaveResult};

fn uid() -> String {
    Uuid::new_v4().to_string()
}

fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        // 整请求总超时：覆盖「等响应头 + 读响应 body」的全过程。
        // 只给 send() 包 timeout 是不够的——非流式接口通常 100~200ms 就返回响应头，
        // 真正耗时的模型生成发生在 body 流里；一旦服务端卡住，读 body 会永久挂起。
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .expect("failed to build reqwest client")
}

// ============================ 提示词 ============================

fn build_system_prompt(position: &str) -> String {
    format!(
        "你是一位资深技术面试官，正在为公司招聘「{position}」岗位的候选人进行面试出题。\n\n\
【任务】\n请仔细阅读候选人简历，结合「{position}」岗位的任职要求，生成一套针对性的面试题。\n\n\
【出题要求】\n\
1. 先分析简历中的技能领域、项目经历与工作内容，识别与「{position}」岗位相关的主要技术方向。\n\
2. 为每个识别出的技能领域生成 2-4 道面试题，题目总数控制在 8-15 道。\n\
3. 题目必须同时满足两个维度：\n   \
- 针对性：紧扣简历中候选人实际做过的项目、用过的技术栈，能验证其真实经验（避免泛泛而谈的通用题）。\n   \
- 岗位匹配：覆盖「{position}」岗位的核心能力要求，即使简历中着墨不多但岗位必需的知识点也要考查。\n\
4. 每道题目必须包含：\n   \
- 题目编号与标题（标题简明概括考点）\n   \
- 难度标签：easy / medium / hard\n   \
- 题目正文（Markdown 格式，可包含多个小问，小问用有序列表编号）\n   \
- 参考答案（详细但简洁，Markdown 格式，面试官核对用）\n   \
- 回答要点列表（供面试官逐项核对评分，每个要点带分值，要点分值之和应等于该题满分）\n   \
- 满分分值（5-15 之间的整数）\n\
5. 难度判定规则（根据简历中可推断的工作年限自动调整整体难度分布）：\n   \
- easy：应届生或工作 1 年以内\n   \
- medium：工作 1-3 年\n   \
- hard：工作 3 年以上\n   \
- 若简历无法判断年限，整体按 medium 难度出题\n\
6. 题目类型标记：\n   \
- basic：有明确小问和核对要点的题目，适合逐项评分，必须给出 keyPoints\n   \
- comprehensive：开放性 / 综合性问题（如架构设计、项目复盘），适合整体评价，keyPoints 为空数组\n\
7. 所有题目的满分之和必须为 100 分。\n\n\
【输出格式】\n必须输出严格的 JSON，不要输出任何其他文字、解释或 Markdown 代码块标记。结构如下：\n\
{{ \"categories\": [\"技能领域1\", \"技能领域2\"], \"questions\": [ {{ \"category\": \"技能领域1\", \"title\": \"题目标题\", \"difficulty\": \"medium\", \"type\": \"basic\", \"maxScore\": 8, \"questionBody\": \"题目正文（Markdown）\", \"referenceAnswer\": \"参考答案（Markdown）\", \"keyPoints\": [ {{ \"content\": \"要点描述\", \"score\": 2 }} ] }} ] }}"
    )
}

fn build_user_prompt(resume_text: &str, position: &str) -> String {
    const MAX_LEN: usize = 12000;
    // 必须按 UTF-8 字符边界截断：简历是中文文本，`&resume_text[..MAX_LEN]` 一旦切在
    // 多字节汉字中间会直接 panic（byte index 12000 is not a char boundary）。
    // 该 panic 发生在 async command 里时 Tauri 不会回包，前端 invoke 永远 pending，
    // 表现为「一直出题中、等了几千秒也不结束」。
    let mut end = MAX_LEN.min(resume_text.len());
    while end > 0 && !resume_text.is_char_boundary(end) {
        end -= 1;
    }
    let trimmed = &resume_text[..end];
    format!("面试岗位：{position}\n\n候选人简历内容：\n{trimmed}")
}

// ============================ JSON 容错解析 ============================

fn try_parse(text: &str) -> Result<(Vec<String>, Vec<Value>), String> {
    let start = text.find('{').ok_or("AI 返回内容中未找到有效的 JSON 对象")?;
    let end = text.rfind('}').ok_or("AI 返回内容中未找到有效的 JSON 对象")?;
    if end <= start {
        return Err("AI 返回内容中未找到有效的 JSON 对象".into());
    }
    let value: Value =
        serde_json::from_str(&text[start..=end]).map_err(|e| format!("JSON 解析失败: {e}"))?;
    let questions = value
        .get("questions")
        .and_then(|v| v.as_array())
        .ok_or("AI 返回的 JSON 缺少 questions 数组")?
        .clone();
    let categories = value
        .get("categories")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    Ok((categories, questions))
}

/// 容错解析 AI 返回的 JSON：依次尝试原文 / 去围栏 / 弯引号替换 / 尾围栏
fn parse_ai_json(raw: &str) -> Result<(Vec<String>, Vec<Value>), String> {
    let cleaned: String = raw
        .chars()
        .filter(|c| !matches!(c, '\u{feff}' | '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{2060}'))
        .collect();
    let cleaned = cleaned.trim();

    let mut candidates: Vec<String> = vec![cleaned.to_string()];

    // 去围栏
    if cleaned.starts_with("```") {
        if let Some(m) = cleaned
            .find('\n')
            .and_then(|_| {
                let start_idx = cleaned.find('\n').unwrap();
                let inner = &cleaned[start_idx + 1..];
                inner.rfind("```").map(|end| inner[..end].trim().to_string())
            })
        {
            candidates.push(m);
        }
    }

    // 弯引号替换
    let dequoted: String = cleaned
        .chars()
        .map(|c| match c {
            '\u{201c}' | '\u{201d}' => '"',
            '\u{2018}' | '\u{2019}' => '\'',
            other => other,
        })
        .collect();
    if dequoted != cleaned {
        candidates.push(dequoted);
    }

    let mut last_err: Option<String> = None;
    for cand in candidates {
        match try_parse(&cand) {
            Ok(v) => return Ok(v),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| "AI 返回内容中未找到有效的 JSON 对象".into()))
}

// ============================ 题目标准化 ============================

fn normalize_questions(raw_questions: &[Value]) -> Vec<InterviewQuestion> {
    let mut result = Vec::new();
    for raw in raw_questions {
        let Some(title) = raw.get("title").and_then(|v| v.as_str()) else {
            continue;
        };
        let Some(body) = raw.get("questionBody").and_then(|v| v.as_str()) else {
            continue;
        };

        let key_points: Vec<KeyPoint> = raw
            .get("keyPoints")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|kp| {
                        let content = kp.get("content")?.as_str()?;
                        Some(KeyPoint {
                            id: uid(),
                            content: content.to_string(),
                            score: kp_score(kp, content),
                            is_checked: false,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let difficulty = raw
            .get("difficulty")
            .and_then(|v| v.as_str())
            .filter(|d| *d == "easy" || *d == "hard")
            .unwrap_or("medium")
            .to_string();

        let qtype = raw
            .get("type")
            .and_then(|v| v.as_str())
            .filter(|t| *t == "comprehensive")
            .unwrap_or(if key_points.is_empty() { "comprehensive" } else { "basic" })
            .to_string();

        let max_score = raw
            .get("maxScore")
            .and_then(|v| v.as_i64())
            .filter(|&s| s > 0)
            .map(|s| s as i32)
            .unwrap_or_else(|| {
                let sum: i32 = key_points.iter().map(|k| k.score).sum();
                if sum > 0 { sum } else { 10 }
            });

        let is_basic = qtype == "basic";

        result.push(InterviewQuestion {
            id: uid(),
            category: raw
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("综合能力")
                .to_string(),
            title: title.to_string(),
            difficulty,
            qtype,
            max_score,
            question_body: body.to_string(),
            reference_answer: raw
                .get("referenceAnswer")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            key_points: if is_basic { key_points } else { vec![] },
            score: None,
            is_deleted: false,
            deleted_at: None,
        });
    }
    result
}

fn kp_score(kp: &Value, _content: &str) -> i32 {
    kp.get("score")
        .and_then(|v| v.as_i64())
        .filter(|&s| s > 0)
        .map(|s| s as i32)
        .unwrap_or(1)
}

// ============================ 请求逻辑 ============================

/// 从响应中提取文本内容（兼容字符串 / 数组分片两种格式）
fn extract_content(data: &Value) -> String {
    data.get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .map(|msg| match msg {
            Value::String(s) => s.clone(),
            Value::Array(parts) => parts
                .iter()
                .map(|p| match p {
                    Value::String(s) => s.clone(),
                    _ => p.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                })
                .collect(),
            _ => String::new(),
        })
        .unwrap_or_default()
}

fn base_url_trim(base_url: &str) -> String {
    base_url.trim_end_matches('/').to_string()
}

/// 生成面试题（主命令）
#[tauri::command]
pub async fn generate_questions(
    resume_text: String,
    position: String,
    config: AIConfig,
) -> Result<InterviewSet, String> {
    let config = effective(&config)?;
    if config.api_key.is_empty() {
        return Err("请先在设置中配置 API Key".into());
    }
    if position.trim().is_empty() {
        return Err("请先输入面试岗位".into());
    }

    let base_url = base_url_trim(&config.base_url);
    let client = build_client();
    let body = json!({
        "model": config.model,
        "messages": [
            { "role": "system", "content": build_system_prompt(&position) },
            { "role": "user", "content": build_user_prompt(&resume_text, &position) }
        ],
        "temperature": 0.4,
        "response_format": { "type": "json_object" }
    });

    let content = call_chat_completions(&client, &base_url, &config, &body, 240).await?;

    // 解析失败则去掉 response_format 重试一次
    let (categories, questions) = match parse_ai_json(&content) {
        Ok(v) => v,
        Err(_) => {
            let body2 = json!({
                "model": config.model,
                "messages": [
                    { "role": "system", "content": build_system_prompt(&position) },
                    { "role": "user", "content": build_user_prompt(&resume_text, &position) }
                ],
                "temperature": 0.4
            });
            let content2 = call_chat_completions(&client, &base_url, &config, &body2, 240).await?;
            parse_ai_json(&content2)?
        }
    };

    let normalized = normalize_questions(&questions);
    if normalized.is_empty() {
        return Err("AI 未能生成有效题目，请重试".into());
    }
    let categories = if categories.is_empty() {
        let mut seen = Vec::new();
        for q in &normalized {
            if !seen.contains(&q.category) {
                seen.push(q.category.clone());
            }
        }
        seen
    } else {
        categories
    };

    Ok(InterviewSet { categories, questions: normalized })
}

async fn call_chat_completions(
    client: &reqwest::Client,
    base_url: &str,
    config: &AIConfig,
    body: &Value,
    timeout_secs: u64,
) -> Result<String, String> {
    let url = format!("{base_url}/chat/completions");
    let response = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        client
            .post(&url)
            .bearer_auth(&config.api_key)
            .json(body)
            .send(),
    )
    .await
    .map_err(|_| "AI 请求超时，模型响应过慢，请重试或更换更快的模型".to_string())?
    .map_err(|e| format!("AI 服务请求失败：{e}"))?;

    let status = response.status();
    if !status.is_success() {
        let text = tokio::time::timeout(
            std::time::Duration::from_secs(timeout_secs),
            response.text(),
        )
        .await
        .map_err(|_| "AI 错误响应读取超时".to_string())?
        .unwrap_or_default();
        let preview: String = text.chars().take(200).collect();
        return Err(format!("AI 服务请求失败（HTTP {status}）：{preview}"));
    }

    // 生成阶段的所有耗时都在读 body 里，这里也必须限时，否则请求会无限期挂起
    let raw = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        response.text(),
    )
    .await
    .map_err(|_| "AI 请求超时，模型响应过慢，请重试或更换更快的模型".to_string())?
    .map_err(|e| format!("读取 AI 响应失败：{e}"))?;
    let data: Value =
        serde_json::from_str(&raw).map_err(|e| format!("解析响应失败：{e}"))?;
    let content = extract_content(&data);
    if content.trim().is_empty() {
        return Err("AI 返回内容为空".into());
    }
    Ok(content)
}

/// 轻量连通性探测：GET /models 测延迟
#[tauri::command]
pub async fn settings_ping(config: AIConfig) -> Result<SaveResult, String> {
    let config = effective(&config)?;
    if config.api_key.is_empty() {
        return Err("未配置 API Key".into());
    }
    let url = format!("{}/models", base_url_trim(&config.base_url));
    let client = build_client();
    let start = std::time::Instant::now();
    let resp = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        client.get(&url).bearer_auth(&config.api_key).send(),
    )
    .await
    .map_err(|_| "连接超时".to_string())?
    .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    // 确保响应完整到达
    let _ = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(SaveResult { ok: true, latency_ms: Some(start.elapsed().as_millis() as u64), ..Default::default() })
}

/// 拉取可用模型列表（GET /models）
#[tauri::command]
pub async fn settings_list_models(config: AIConfig) -> Result<SaveResult, String> {
    let config = effective(&config)?;
    if config.api_key.is_empty() {
        return Ok(SaveResult { ok: false, message: Some("请先填写 API Key".into()), models: Some(vec![]), latency_ms: None, path: None });
    }
    let url = format!("{}/models", base_url_trim(&config.base_url));
    let client = build_client();
    let resp = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        client.get(&url).bearer_auth(&config.api_key).send(),
    )
    .await
    .map_err(|_| "获取模型列表超时，请检查网络后重试".to_string())?
    .map_err(|e| format!("获取模型列表失败：{e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        let preview: String = text.chars().take(200).collect();
        return Ok(SaveResult { ok: false, message: Some(format!("获取模型列表失败（HTTP {status}）：{preview}")), models: Some(vec![]), latency_ms: None, path: None });
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut ids: Vec<String> = data
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    if ids.is_empty() {
        return Ok(SaveResult { ok: false, message: Some("该服务商未返回可用模型".into()), models: Some(vec![]), latency_ms: None, path: None });
    }
    Ok(SaveResult { ok: true, message: Some("ok".into()), models: Some(ids), latency_ms: None, path: None })
}

/// 测试 API 连通性（发送一条最小请求）
#[tauri::command]
pub async fn settings_test(config: AIConfig) -> Result<SaveResult, String> {
    let config = effective(&config)?;
    if config.api_key.is_empty() {
        return Ok(SaveResult { ok: false, message: Some("请先填写 API Key".into()), ..Default::default() });
    }
    let url = format!("{}/chat/completions", base_url_trim(&config.base_url));
    let client = build_client();
    let body = json!({
        "model": config.model,
        "messages": [{ "role": "user", "content": "你好，请回复\"连接成功\"四个字即可。" }],
        "max_tokens": 16
    });
    let resp = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        client.post(&url).bearer_auth(&config.api_key).json(&body).send(),
    )
    .await
    .map_err(|_| "连接超时".to_string())?
    .map_err(|e| format!("连接失败：{e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        let preview: String = text.chars().take(200).collect();
        return Ok(SaveResult { ok: false, message: Some(format!("连接失败（HTTP {status}）：{preview}")), ..Default::default() });
    }
    Ok(SaveResult { ok: true, message: Some("连接成功".into()), ..Default::default() })
}

/// 若传入 config 无 apiKey，则用已保存的加密配置补齐
fn effective(config: &AIConfig) -> Result<AIConfig, String> {
    if !config.api_key.is_empty() {
        return Ok(config.clone());
    }
    let store = ConfigStore::load();
    decrypt_effective(store)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 回归测试：简历超过 12000 字节且截断点落在汉字内部时，不能 panic。
    /// 旧实现 `&resume_text[..12000]` 会 panic，Tauri async command 不回包 →
    /// 前端一直显示「出题中」（用户看到 2500+ 秒仍不结束）。
    #[test]
    fn user_prompt_truncates_on_utf8_char_boundary() {
        let resume = format!("a{}", "续".repeat(5000)); // 15001 字节；12000 落在汉字中间
        assert!(resume.len() > 12000);
        assert!(!resume.is_char_boundary(12000));

        let prompt = build_user_prompt(&resume, "渗透测试工程师");
        assert!(prompt.contains("候选人简历内容"));
        assert!(prompt.len() < 13000);
    }

    /// 短简历不截断，内容完整保留
    #[test]
    fn user_prompt_keeps_short_resume_intact() {
        let resume = "张三，3 年渗透测试经验";
        let prompt = build_user_prompt(resume, "渗透测试工程师");
        assert!(prompt.ends_with(resume));
    }
}
