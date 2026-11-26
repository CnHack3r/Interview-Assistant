// 面试报告：优先用 headless Chrome 渲染 HTML → PDF（复刻原项目 Chromium printToPDF），printpdf 兜底
use base64::Engine;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use printpdf::*;

use crate::types::{InterviewQuestion, ReportData, SaveResult};

fn mm(v: f64) -> Mm {
    Mm(v as f32)
}

fn fsize(v: f64) -> f32 {
    v as f32
}

// ============================ 公共计算 ============================

fn escaped(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// 极简 Markdown → HTML（针对报告预览，粗体/代码/列表/标题）
fn md_to_html(md: &str) -> String {
    let mut out = String::new();
    let mut in_list = false;
    for raw in md.split('\n') {
        let line = escaped(raw);
        let l = bold_to_html(&code_to_html(&line));
        if let Some((depth, text)) = regex_heading(&line) {
            if in_list {
                out.push_str("</ol>");
                in_list = false;
            }
            let level = (depth + 2).min(6);
            out.push_str(&format!("<h{level}>{text}</h{level}>"));
        } else if let Some(text) = regex_ordered(&line) {
            if !in_list {
                out.push_str("<ol>");
                in_list = true;
            }
            out.push_str(&format!("<li>{text}</li>"));
        } else if let Some(text) = regex_bullet(&line) {
            if !in_list {
                out.push_str("<ol style=\"list-style:disc\">");
                in_list = true;
            }
            out.push_str(&format!("<li>{text}</li>"));
        } else {
            if in_list {
                out.push_str("</ol>");
                in_list = false;
            }
            if !l.trim().is_empty() {
                out.push_str(&format!("<p>{}</p>", l));
            }
        }
    }
    if in_list {
        out.push_str("</ol>");
    }
    out
}

fn regex_ordered(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    // 数出前导数字
    let mut i = 0;
    let bytes = trimmed.as_bytes();
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == 0 || i >= trimmed.len() {
        return None;
    }
    let rest = &trimmed[i..];
    // 分隔符：. 或 )（ASCII）或中文顿号 、 （3 字节）
    let sep_ok = rest.starts_with('.')
        || rest.starts_with(')')
        || rest.starts_with('、');
    if sep_ok {
        let after = &rest[sep_len(rest)..];
        let t = after.trim_start().to_string();
        if !t.is_empty() {
            return Some(t);
        }
    }
    None
}

fn sep_len(s: &str) -> usize {
    if s.starts_with('、') {
        3
    } else {
        1
    }
}

fn regex_bullet(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    if (trimmed.starts_with('-') || trimmed.starts_with('*')) && trimmed.len() > 1 {
        let rest = trimmed[1..].trim_start().to_string();
        if !rest.is_empty() {
            return Some(rest);
        }
    }
    None
}

fn regex_heading(line: &str) -> Option<(usize, String)> {
    let trimmed = line.trim_start();
    let mut depth = 0;
    for c in trimmed.chars() {
        if c == '#' {
            depth += 1;
        } else {
            break;
        }
    }
    if (1..=4).contains(&depth) {
        Some((depth, trimmed[depth..].trim_start().to_string()))
    } else {
        None
    }
}

fn bold_to_html(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(pos) = rest.find("**") {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + 2..];
        if let Some(end) = after.find("**") {
            out.push_str("<strong>");
            out.push_str(&after[..end]);
            out.push_str("</strong>");
            rest = &after[end + 2..];
        } else {
            out.push_str("**");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn code_to_html(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(pos) = rest.find('`') {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + 1..];
        if let Some(end) = after.find('`') {
            out.push_str("<code>");
            out.push_str(&after[..end]);
            out.push_str("</code>");
            rest = &after[end + 1..];
        } else {
            out.push_str("`");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn difficulty_label(d: &str) -> &str {
    match d {
        "easy" => "易",
        "hard" => "难",
        _ => "中",
    }
}

fn grade_of(rate: f64) -> &'static str {
    if rate >= 90.0 {
        "优秀"
    } else if rate >= 75.0 {
        "良好"
    } else if rate >= 60.0 {
        "合格"
    } else {
        "不合格"
    }
}

fn strip_md(s: &str) -> String {
    s.replace("**", "").replace("`", "").replace("```", "")
}

// ============================ 报告模型 ============================

struct Evaluation {
    cat_rows: Vec<(String, i32, i32, f64, &'static str)>,
    missed: Vec<(String, String, String)>,
    hard_rate: Option<f64>,
    grade: &'static str,
    verdict: String,
}

fn build_evaluation(data: &ReportData) -> Evaluation {
    let asked: Vec<&InterviewQuestion> = data.questions.iter().filter(|q| !q.is_deleted).collect();

    let mut cat_map: Vec<(String, i32, i32)> = Vec::new();
    for q in &asked {
        if let Some(entry) = cat_map.iter_mut().find(|(c, _, _)| c == &q.category) {
            entry.1 += q.score.unwrap_or(0);
            entry.2 += q.max_score;
        } else {
            cat_map.push((q.category.clone(), q.score.unwrap_or(0), q.max_score));
        }
    }
    let cat_rows: Vec<(String, i32, i32, f64, &'static str)> = cat_map
        .into_iter()
        .map(|(c, got, max)| {
            let rate = if max > 0 { (got as f64 / max as f64) * 100.0 } else { 0.0 };
            let label = if rate >= 80.0 {
                "扎实"
            } else if rate >= 60.0 {
                "基本掌握"
            } else {
                "薄弱"
            };
            (c, got, max, rate, label)
        })
        .collect();

    let mut missed = Vec::new();
    for q in &asked {
        if q.score.is_none() {
            continue;
        }
        for kp in &q.key_points {
            if !kp.is_checked {
                missed.push((q.category.clone(), q.title.clone(), kp.content.clone()));
            }
        }
    }

    let hard: Vec<&InterviewQuestion> =
        asked.iter().copied().filter(|q| q.difficulty == "hard").collect();
    let hard_got: i32 = hard.iter().map(|q| q.score.unwrap_or(0)).sum();
    let hard_max: i32 = hard.iter().map(|q| q.max_score).sum();
    let hard_rate = if hard_max > 0 {
        Some((hard_got as f64 / hard_max as f64) * 100.0)
    } else {
        None
    };

    let grade = grade_of(data.score_rate);
    let weak: Vec<String> = cat_rows
        .iter()
        .filter(|(_, _, _, rate, _)| *rate < 60.0)
        .map(|(c, _, _, _, _)| c.clone())
        .collect();

    let verdict = if data.score_rate >= 80.0 {
        format!(
            "候选人总得分率 {:.1}%，技术能力扎实，符合「{}」岗位要求，建议进入后续流程。",
            data.score_rate,
            escaped(&data.position)
        )
    } else if data.score_rate >= 60.0 {
        if weak.is_empty() {
            format!(
                "候选人总得分率 {:.1}%，基本符合「{}」岗位要求。",
                data.score_rate,
                escaped(&data.position)
            )
        } else {
            format!(
                "候选人总得分率 {:.1}%，基本符合「{}」岗位要求，但在 {} 领域存在短板，建议结合岗位核心要求权衡。",
                data.score_rate,
                escaped(&data.position),
                weak.iter().map(|w| escaped(w)).collect::<Vec<_>>().join("、")
            )
        }
    } else {
        format!(
            "候选人总得分率 {:.1}%，与「{}」岗位要求存在明显差距，暂不建议进入后续流程。",
            data.score_rate,
            escaped(&data.position)
        )
    };

    Evaluation { cat_rows, missed, hard_rate, grade, verdict }
}

// ============================ HTML 预览 ============================

/// 生成报告预览 HTML（前端用 iframe 渲染）
// 预览模式样式：参考原 Electron 的 previewReport —— 灰色底 + A4 纸张居中排版 + 封面垂直居中
const PREVIEW_CSS: &str = r#"
  html { background:#e5e7eb; }
  body { background:transparent !important; padding:24px 0; }
  .page { width:170mm; margin:0 auto 24px; background:#fff; padding:25mm 20mm 20mm; box-sizing:content-box; box-shadow:0 2px 12px rgba(0,0,0,0.18); border-radius:2px; }
  .page:last-child { margin-bottom:24px; }
  .cover { padding-top:0 !important; display:flex; flex-direction:column; justify-content:center; }
  .cover .score-watermark { top:10mm; right:6mm; }
"#;

#[tauri::command]
pub fn preview_html(app: tauri::AppHandle, data: ReportData) -> Result<String, String> {
    let fonts_dir = resolve_fonts_dir(Some(&app));
    let font_b64 = brush_font_base64(&fonts_dir);
    let html = build_report_html(&data, font_b64.as_deref());
    // 注入预览样式（灰色底 + A4 纸张居中），使预览与「打印版」区分开
    Ok(html.replacen("</head>", &format!("<style>{PREVIEW_CSS}</style></head>"), 1))
}

const ACCENT: &str = "#1a5276";

fn status_cell_html(q: &InterviewQuestion) -> String {
    let dot = |c: &str| {
        format!(
            "<span style=\"display:inline-block;width:7pt;height:7pt;border-radius:50%;background:{c};margin-right:2mm;vertical-align:middle\"></span>"
        )
    };
    if q.is_deleted {
        format!("<span style=\"color:#95a5a6\">{}未问</span>", dot("#95a5a6"))
    } else if q.score.is_none() {
        format!("<span style=\"color:#b9770e\">{}待评</span>", dot("#b9770e"))
    } else if q.score == Some(0) {
        format!("<span style=\"color:#c0392b\">{}未答出</span>", dot("#c0392b"))
    } else {
        format!("<span style=\"color:#1e8449\">{}已答出</span>", dot("#1e8449"))
    }
}

fn build_report_html(data: &ReportData, font_base64: Option<&str>) -> String {
    let ev = build_evaluation(data);

    // 毛笔字体 @font-face（与原始 Electron 版一致，内嵌 base64，保证水印用真实毛笔字体）
    let font_face = font_base64
        .map(|b64| {
            format!(
                "@font-face {{ font-family: 'Ma Shan Zheng'; src: url(data:font/ttf;base64,{b64}) format('truetype'); }}"
            )
        })
        .unwrap_or_default();

    let rows: String = data
        .questions
        .iter()
        .enumerate()
        .map(|(i, q)| {
            let score = q.score.map(|s| s.to_string()).unwrap_or_else(|| "—".into());
            format!(
                "<tr class=\"{}\"><td class=\"num\">{}</td><td>{}</td><td>{}</td><td>{}</td><td class=\"num\">{}</td><td class=\"num\">{}</td><td>{}</td></tr>",
                if q.is_deleted { "deleted" } else { "" },
                i + 1,
                escaped(&q.title),
                escaped(&q.category),
                difficulty_label(&q.difficulty),
                q.max_score,
                score,
                status_cell_html(q)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let detail_pages: String = data
        .questions
        .iter()
        .filter(|q| !q.is_deleted && q.score.is_some())
        .map(|q| {
            let score = q.score.unwrap_or(0);
            let rate = if q.max_score > 0 {
                score as f64 / q.max_score as f64
            } else {
                0.0
            };
            let badge = if score == 0 {
                "<span class=\"badge badge-miss\">未答出</span>"
            } else if rate >= 0.8 {
                "<span class=\"badge badge-ok\">答出良好</span>"
            } else if rate >= 0.4 {
                "<span class=\"badge badge-partial\">部分答出</span>"
            } else {
                "<span class=\"badge badge-miss\">答出较少</span>"
            };

            // 基础题：回答要点核对（✓ 已答出 / ✗ 未答出）
            let kp_html = if q.qtype == "basic" && !q.key_points.is_empty() {
                let checked = q.key_points.iter().filter(|k| k.is_checked).count();
                let total = q.key_points.len();
                let items: String = q
                    .key_points
                    .iter()
                    .map(|kp| {
                        if kp.is_checked {
                            format!(
                                "<div class=\"kp kp-ok\"><span class=\"kp-mark\">✓</span>{}</div>",
                                escaped(&kp.content)
                            )
                        } else {
                            format!(
                                "<div class=\"kp kp-miss\"><span class=\"kp-mark\">✗</span>{}</div>",
                                escaped(&kp.content)
                            )
                        }
                    })
                    .collect();
                format!(
                    "<h4>回答要点核对（答出 {checked}/{total}）</h4><div class=\"kp-list\">{items}</div>"
                )
            } else {
                String::new()
            };

            format!(
                "<section class=\"page detail-page\"><h3>{}</h3><p class=\"meta-line\">{} · 难度{} · 得分 <strong>{}/{}</strong> {}</p><h4>题目</h4><div class=\"md\">{}</div>{}<h4>参考答案</h4><div class=\"md\">{}</div></section>",
                escaped(&q.title),
                escaped(&q.category),
                difficulty_label(&q.difficulty),
                score,
                q.max_score,
                badge,
                md_to_html(&q.question_body),
                kp_html,
                md_to_html(&q.reference_answer)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let cat_rows: String = ev
        .cat_rows
        .iter()
        .map(|(c, got, max, rate, label)| {
            let color = if *rate >= 80.0 {
                "#1e8449"
            } else if *rate >= 60.0 {
                "#b9770e"
            } else {
                "#c0392b"
            };
            format!(
                "<tr><td>{}</td><td class=\"num\">{}</td><td class=\"num\">{}</td><td class=\"num\">{:.0}%</td><td><span style=\"color:{color}\">● {label}</span></td></tr>",
                escaped(c),
                got,
                max,
                rate
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let missed_html = if ev.missed.is_empty() {
        "<p style=\"color:#1e8449\">● 所有已评题目的回答要点均已覆盖，无遗漏项。</p>".to_string()
    } else {
        let items: String = ev
            .missed
            .iter()
            .map(|(c, _t, content)| {
                format!(
                    "<li><span style=\"color:#7f8c8d\">[{}]</span> {}</li>",
                    escaped(c),
                    escaped(content)
                )
            })
            .collect();
        format!("<ol>{items}</ol>")
    };

    let hard_note = ev
        .hard_rate
        .map(|r| {
            let note = if r >= 70.0 {
                "具备解决复杂问题的能力，技术深度良好。"
            } else if r >= 40.0 {
                "有一定技术深度，复杂问题处理能力尚可。"
            } else {
                "复杂问题处理能力偏弱，技术深度有待加强。"
            };
            format!("难题（hard）得分率 {r:.0}%，{note}")
        })
        .unwrap_or_default();

    let deleted = data.original_max_score - data.total_max_score;
    let deleted_note = if deleted > 0 {
        format!(
            "<p>原始满分 {} 分，已扣除删除题目分值 {} 分。</p>",
            data.original_max_score, deleted
        )
    } else {
        String::new()
    };

    format!(
        r#"<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><style>
{font_face}
* {{ box-sizing: border-box; }}
body {{ font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif; color:#2c3e50; margin:0; font-size:14pt; line-height:1.8; }}
.page {{ page-break-after:always; position:relative; }}
.page:last-child {{ page-break-after:auto; }}
.cover {{ text-align:center; padding-top:30%; min-height:250mm; }}
.cover h1 {{ font-size:42pt; color:{ACCENT}; letter-spacing:4pt; margin:0 0 6mm; }}
.cover .subtitle {{ font-size:19pt; color:#5d6d7e; margin-bottom:10mm; }}
.cover hr.divider {{ width:60mm; border:none; border-top:1pt solid {ACCENT}; margin:8mm auto; }}
.cover .meta {{ font-size:16pt; color:#2c3e50; line-height:2.2; }}
.cover .meta b {{ color:#5d6d7e; font-weight:500; }}
.score-watermark {{ position:absolute; top:4mm; right:2mm; font-family:'Ma Shan Zheng','Kaiti SC','STKaiti','KaiTi',cursive; font-size:42pt; color:rgba(180,30,30,0.62); transform:rotate(-12deg); transform-origin:top right; border:2pt solid rgba(180,30,30,0.42); padding:2mm 8mm; border-radius:2mm; white-space:nowrap; }}
h2 {{ font-size:19pt; color:{ACCENT}; border-bottom:1.5pt solid {ACCENT}; padding-bottom:2mm; margin:0 0 5mm; }}
table {{ width:100%; border-collapse:collapse; margin-top:4mm; font-size:13pt; }}
thead th {{ background:{ACCENT}; color:#fff; padding:2.5mm 3mm; font-weight:bold; text-align:left; }}
td {{ border-bottom:0.5pt solid #d5dbdb; padding:2.2mm 3mm; }}
tbody tr:nth-child(even) {{ background:#f8f9fa; }}
td.num,th.num {{ text-align:right; font-variant-numeric:tabular-nums; }}
tr.deleted td {{ color:#95a5a6; }}
tr.deleted td:nth-child(2) {{ text-decoration:line-through; }}
.conclusion {{ margin-top:6mm; padding:4mm 5mm; background:#fafafa; color:#2c3e50; border-left:6pt solid {ACCENT}; }}
.conclusion p {{ margin:1.5mm 0; }}
.detail-page h3 {{ font-size:16pt; color:{ACCENT}; margin:0 0 1mm; }}
.detail-page .meta-line {{ font-size:12pt; color:#7f8c8d; margin:0 0 4mm; }}
.detail-page h4 {{ font-size:14pt; margin:5mm 0 2mm; border-left:3pt solid {ACCENT}; padding-left:2.5mm; }}
.sec-title {{ font-size:16pt; color:{ACCENT}; margin:6mm 0 2.5mm; }}
.md code {{ background:#fdf2e9; color:#c0392b; padding:0.5mm 1.5mm; border-radius:1mm; }}
.md p {{ margin:1.5mm 0; }} .md ol {{ margin:2mm 0; padding-left:6mm; }} .md li {{ margin:1mm 0; }}
/* 答出状态徽章 */
.badge {{ display:inline-block; padding:0.5mm 2.5mm; border-radius:2mm; font-size:10pt; font-weight:bold; vertical-align:middle; margin-left:2mm; }}
.badge-ok {{ background:#eafaf1; color:#1e8449; }}
.badge-partial {{ background:#fef9e7; color:#b9770e; }}
.badge-miss {{ background:#fdedec; color:#c0392b; }}
/* 回答要点核对 */
.kp-list {{ margin:1.5mm 0; }}
.kp {{ padding:1.5mm 2.5mm; margin:1mm 0; border-radius:1.5mm; font-size:12pt; line-height:1.6; }}
.kp-ok {{ background:#eafaf1; color:#1e8449; }}
.kp-miss {{ background:#fdedec; color:#c0392b; }}
.kp-mark {{ display:inline-block; width:5mm; font-weight:bold; }}
</style></head><body>
<section class="page cover">
  <div class="score-watermark">面试总分：{} 分</div>
  <h1>面试评估报告</h1>
  <div class="subtitle">{} · 面试评估</div>
  <hr class="divider"/>
  <div class="meta">
    <b>候选人姓名：</b>{}<br>
    <b>应聘岗位：</b>{}<br>
    <b>面试日期：</b>{}<br>
    <b>面试总分：</b>{} / {} 分（得分率 {:.1}%）
  </div>
</section>
<section class="page">
  <h2>评分汇总</h2>
  <table><thead><tr><th class="num">#</th><th>题目标题</th><th>分类</th><th>难度</th><th class="num">满分</th><th class="num">得分</th><th>状态</th></tr></thead><tbody>{}</tbody></table>
  <div class="conclusion"><p><strong>面试总分：{} / {} 分</strong>（得分率 {:.1}%，评级：{}）</p>{}</div>
</section>
<section class="page">
  <h2>能力评估与面试总结</h2>
  <h3 class="sec-title">一、分类能力得分</h3>
  <table><thead><tr><th>技能领域</th><th class="num">得分</th><th class="num">满分</th><th class="num">得分率</th><th>评价</th></tr></thead><tbody>{}</tbody></table>
  <h3 class="sec-title">二、未掌握要点（{} 项）</h3>
  <div>{}</div>
  <h3 class="sec-title">三、综合结论</h3>
  <div class="conclusion"><p>{}</p>{}{}</div>
</section>
{}</body></html>"#,
        data.total_score,
        escaped(&data.position),
        escaped(&data.candidate_name),
        escaped(&data.position),
        escaped(&data.interview_date),
        data.total_score,
        data.total_max_score,
        data.score_rate,
        rows,
        data.total_score,
        data.total_max_score,
        data.score_rate,
        ev.grade,
        deleted_note,
        cat_rows,
        ev.missed.len(),
        missed_html,
        ev.verdict,
        if ev.hard_rate.is_some() {
            format!("<p>{hard_note}</p>")
        } else {
            String::new()
        },
        format!("<p>总体评级：<strong>{}</strong>（总得分率 {:.1}%）</p>", ev.grade, data.score_rate),
        detail_pages
    )
}

// ============================ PDF 生成（printpdf 0.7） ============================

struct Fonts {
    body: IndirectFontRef,
    brush: IndirectFontRef,
}

/// 使用 Tauri resource_dir 定位打包后的字体目录（优先）
fn resource_font_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    app.path().resource_dir().ok().map(|d| d.join("fonts"))
}

fn resolve_fonts_dir(app: Option<&tauri::AppHandle>) -> PathBuf {
    if let Some(a) = app {
        if let Some(dir) = resource_font_dir(a) {
            // 依据资源配置位置探测：resource_dir/fonts 或 resource_dir/resources/fonts
            let candidates = [
                dir.clone(),
                dir.parent().map(|p| p.join("resources").join("fonts")).unwrap_or(dir.clone()),
            ];
            for c in &candidates {
                if c.join("NotoSansSC-Regular.ttf").exists() {
                    return c.clone();
                }
            }
        }
    }
    // 兜底：从可执行文件向上探测
    let mut dir = std::env::current_exe().unwrap_or_default();
    dir.pop();
    for _ in 0..6 {
        let cand = dir.join("resources").join("fonts");
        if cand.join("NotoSansSC-Regular.ttf").exists() {
            return cand;
        }
        if !dir.pop() {
            break;
        }
    }
    PathBuf::from("resources").join("fonts")
}

fn load_font(doc: &PdfDocumentReference, dir: &PathBuf, name: &str) -> Result<IndirectFontRef, String> {
    let path = dir.join(name);
    let f = File::open(&path).map_err(|e| format!("打开字体 {} 失败：{e}", path.display()))?;
    doc.add_external_font(f).map_err(|e| format!("加载字体失败：{e}"))
}

fn is_cjk(c: char) -> bool {
    let u = c as u32;
    (0x1100..=0xFFFD).contains(&u) && !c.is_ascii()
}

// 字体尺寸以 pt 为单位，坐标以 mm 为单位：1pt ≈ 0.3528mm
const PT_TO_MM: f64 = 0.3528;

fn est_width(text: &str, size_pt: f64) -> f64 {
    text.chars()
        .map(|c| {
            if is_cjk(c) {
                size_pt * PT_TO_MM
            } else {
                size_pt * 0.55 * PT_TO_MM
            }
        })
        .sum()
}

fn wrap_text(text: &str, size_pt: f64, max_mm: f64) -> Vec<String> {
    let mut lines = Vec::new();
    for para in text.split('\n') {
        let mut cur = String::new();
        let mut cur_w = 0.0;
        for ch in para.chars() {
            let w = if is_cjk(ch) {
                size_pt * PT_TO_MM
            } else {
                size_pt * 0.55 * PT_TO_MM
            };
            if cur_w + w > max_mm && !cur.is_empty() {
                lines.push(cur.clone());
                cur = String::new();
                cur_w = 0.0;
            }
            cur.push(ch);
            cur_w += w;
        }
        if !cur.is_empty() {
            lines.push(cur);
        } else if para.is_empty() {
            lines.push(String::new());
        }
    }
    lines
}

fn color(r: f32, g: f32, b: f32) -> Color {
    Color::Rgb(Rgb::new(r, g, b, None))
}

/// 绘制一行文本（mm 坐标、pt 字号）
fn draw_text(layer: &PdfLayerReference, s: &str, size: f64, x: f64, y: f64, font: &IndirectFontRef) {
    let _ = layer.use_text(s, fsize(size), mm(x), mm(y), font);
}

/// 绘制一组自动换行的文本，返回新的 y 光标（mm）
fn draw_lines(
    layer: &PdfLayerReference,
    text: &str,
    size: f64,
    x: f64,
    start_y: f64,
    bottom_margin: f64,
    font: &IndirectFontRef,
) -> f64 {
    let mut y = start_y;
    for line in wrap_text(text, size, 120.0) {
        if y < bottom_margin {
            break;
        }
        if !line.is_empty() {
            draw_text(layer, &line, size, x, y, font);
        }
        y -= size * PT_TO_MM * 1.8;
    }
    y
}

fn draw_line(layer: &PdfLayerReference, x1: f64, y1: f64, x2: f64, y2: f64) {
    let line = Line {
        points: vec![
            (Point::new(mm(x1), mm(y1)), false),
            (Point::new(mm(x2), mm(y2)), false),
        ],
        is_closed: false,
    };
    let _ = layer.add_line(line);
}

// 页面常量（A4，普通 margin）
const PAGE_W: f64 = 210.0;
const PAGE_H: f64 = 297.0;
const LEFT: f64 = 15.0;
const RIGHT: f64 = 195.0;
const TOP: f64 = 282.0;
const BOTTOM: f64 = 18.0;

fn draw_bordered_rect(layer: &PdfLayerReference, x1: f64, y1: f64, x2: f64, y2: f64) {
    draw_line(layer, x1, y1, x2, y1);
    draw_line(layer, x2, y1, x2, y2);
    draw_line(layer, x2, y2, x1, y2);
    draw_line(layer, x1, y2, x1, y1);
}

fn draw_centered_text(layer: &PdfLayerReference, s: &str, size: f64, y: f64, font: &IndirectFontRef) {
    let w = est_width(s, size);
    draw_text(layer, s, size, (PAGE_W - w) / 2.0, y, font);
}

// ============================ 表格排版 ============================

#[derive(Clone, Copy, PartialEq)]
enum Align {
    Left,
    Right,
    Center,
}

fn fill_rect(layer: &PdfLayerReference, x1: f64, y1: f64, x2: f64, y2: f64, c: Color) {
    layer.set_fill_color(c);
    let _ = layer.add_rect(Rect::new(mm(x1), mm(y1), mm(x2), mm(y2)));
}

fn cell_x(x: f64, w: f64, align: Align, pad: f64, text_w: f64) -> f64 {
    match align {
        Align::Left => x + pad,
        Align::Right => x + w - pad - text_w,
        Align::Center => x + (w - text_w) / 2.0,
    }
}

/// 绘制带表头的表格：深色表头 + 斑马纹 + 行分隔线 + 数字右对齐；返回表格底部 y
fn draw_table(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    size_pt: f64,
    columns: &[(f64, f64, Align)],
    header: &[&str],
    rows: &[Vec<String>],
    row_gray: &[bool],
    last_col_color: &[Option<(f32, f32, f32)>],
    y_start: f64,
) -> f64 {
    let pad = 1.6;
    let vpad = 2.0;
    let line_h = size_pt * PT_TO_MM * 1.5;
    let left = columns[0].0;
    let right = columns.last().map(|c| c.0 + c.1).unwrap_or(RIGHT);
    let white = color(1.0, 1.0, 1.0);

    // 表头
    let head_h = line_h + vpad * 2.0;
    fill_rect(layer, left, y_start, right, y_start - head_h, color(0.10, 0.32, 0.46));
    layer.set_fill_color(white);
    for (i, h) in header.iter().enumerate() {
        let (x, w, align) = columns[i];
        let tx = cell_x(x, w, align, pad, est_width(h, size_pt));
        draw_text(layer, h, size_pt, tx, y_start - vpad - size_pt * PT_TO_MM * 0.6, font);
    }
    let mut y = y_start - head_h;

    // 数据行
    for (ri, row) in rows.iter().enumerate() {
        let cell_lines: Vec<Vec<String>> = row
            .iter()
            .enumerate()
            .map(|(ci, txt)| wrap_text(txt, size_pt, columns[ci].1 - pad * 2.0))
            .collect();
        let nlines = cell_lines.iter().map(|l| l.len().max(1)).max().unwrap_or(1);
        let row_h = nlines as f64 * line_h + vpad * 2.0;
        if ri % 2 == 1 {
            fill_rect(layer, left, y, right, y - row_h, color(0.97, 0.98, 0.98));
        }
        layer.set_outline_color(color(0.84, 0.87, 0.87));
        draw_line(layer, left, y - row_h, right, y - row_h);

        for (ci, txt) in row.iter().enumerate() {
            let (x, w, align) = columns[ci];
            let mut c = if row_gray.get(ri).copied().unwrap_or(false) {
                color(0.58, 0.65, 0.65)
            } else {
                color(0.17, 0.24, 0.31)
            };
            if ci == columns.len() - 1 {
                if let Some(Some((r, g, b))) = last_col_color.get(ri) {
                    c = color(*r, *g, *b);
                }
            }
            layer.set_fill_color(c);
            let lines = &cell_lines[ci];
            let first_y = y - vpad - size_pt * PT_TO_MM * 0.6;
            for (li, line) in lines.iter().enumerate() {
                let tx = cell_x(x, w, align, pad, est_width(line, size_pt));
                draw_text(layer, line, size_pt, tx, first_y - li as f64 * line_h, font);
            }
        }
        y -= row_h;
    }
    y
}

fn draw_cover(layer: &PdfLayerReference, data: &ReportData, fonts: &Fonts) {
    // 毛笔字水印印章（右上角，红色描边 + 毛笔字）
    let stamp = format!("面试总分：{} 分", data.total_score);
    let (sx1, sy1, sx2, sy2) = (120.0, 264.0, 200.0, 288.0);
    layer.set_outline_color(color(0.70, 0.12, 0.12));
    draw_bordered_rect(layer, sx1, sy1, sx2, sy2);
    layer.set_fill_color(color(0.70, 0.12, 0.12));
    let sw = est_width(stamp.as_str(), 24.0);
    draw_text(
        layer,
        stamp.as_str(),
        24.0,
        (sx1 + sx2) / 2.0 - sw / 2.0,
        (sy1 + sy2) / 2.0 - 6.0,
        &fonts.brush,
    );

    // 标题（居中，蓝色，加宽字距感）
    layer.set_fill_color(color(0.10, 0.32, 0.46));
    draw_centered_text(layer, "面试评估报告", 40.0, 176.0, &fonts.body);

    // 副标题（居中，灰）
    layer.set_fill_color(color(0.36, 0.43, 0.49));
    draw_centered_text(layer, &format!("{} · 面试评估", data.position), 18.0, 157.0, &fonts.body);

    // 分隔线
    layer.set_outline_color(color(0.10, 0.32, 0.46));
    draw_line(layer, 75.0, 144.0, 135.0, 144.0);

    // 元信息（标签灰 + 值深色，两段绘制）
    let meta: Vec<(String, String)> = vec![
        ("候选人姓名：".to_string(), data.candidate_name.clone()),
        ("应聘岗位：".to_string(), data.position.clone()),
        ("面试日期：".to_string(), data.interview_date.clone()),
        (
            "面试总分：".to_string(),
            format!(
                "{} / {} 分（得分率 {:.1}%）",
                data.total_score, data.total_max_score, data.score_rate
            ),
        ),
    ];
    let mut y = 122.0;
    for (label, value) in &meta {
        layer.set_fill_color(color(0.36, 0.43, 0.49));
        draw_text(layer, label, 14.0, 58.0, y, &fonts.body);
        let lw = est_width(label, 14.0);
        layer.set_fill_color(color(0.17, 0.24, 0.31));
        draw_text(layer, value, 14.0, 58.0 + lw, y, &fonts.body);
        y -= 13.0;
    }
}

fn draw_summary(layer: &PdfLayerReference, data: &ReportData, fonts: &Fonts) {
    let font = &fonts.body;
    layer.set_fill_color(color(0.10, 0.32, 0.46));
    draw_text(layer, "评分汇总", 19.0, LEFT, TOP, font);
    layer.set_outline_color(color(0.10, 0.32, 0.46));
    draw_line(layer, LEFT, TOP - 8.0, RIGHT, TOP - 8.0);

    let columns: [(f64, f64, Align); 7] = [
        (15.0, 10.0, Align::Right),
        (25.0, 70.0, Align::Left),
        (95.0, 40.0, Align::Left),
        (135.0, 14.0, Align::Left),
        (149.0, 14.0, Align::Right),
        (163.0, 14.0, Align::Right),
        (177.0, 18.0, Align::Left),
    ];
    let header = ["#", "题目标题", "分类", "难度", "满分", "得分", "状态"];

    let mut rows = Vec::new();
    let mut row_gray = Vec::new();
    let mut last_col = Vec::new();
    for (i, q) in data.questions.iter().enumerate() {
        let (status, sc) = if q.is_deleted {
            ("未问", Some((0.58f32, 0.65f32, 0.65f32)))
        } else if q.score.is_none() {
            ("待评", Some((0.72f32, 0.47f32, 0.05f32)))
        } else {
            ("已评", Some((0.12f32, 0.53f32, 0.29f32)))
        };
        rows.push(vec![
            (i + 1).to_string(),
            q.title.clone(),
            q.category.clone(),
            difficulty_label(&q.difficulty).to_string(),
            q.max_score.to_string(),
            q.score.map(|s| s.to_string()).unwrap_or_else(|| "—".into()),
            status.to_string(),
        ]);
        row_gray.push(q.is_deleted);
        last_col.push(sc);
    }
    let y_end = draw_table(
        layer, font, 11.0, &columns, &header, &rows, &row_gray, &last_col, TOP - 20.0,
    );

    // 结论框（浅底 + 左侧深蓝条）
    let cy = y_end - 8.0;
    if cy > BOTTOM {
        fill_rect(layer, LEFT, cy, RIGHT, cy - 16.0, color(0.98, 0.98, 0.98));
        fill_rect(layer, LEFT, cy, LEFT + 1.8, cy - 16.0, color(0.10, 0.32, 0.46));
        layer.set_fill_color(color(0.17, 0.24, 0.31));
        let conclusion = format!(
            "面试总分：{} / {} 分（得分率 {:.1}%，评级：{}）",
            data.total_score,
            data.total_max_score,
            data.score_rate,
            grade_of(data.score_rate)
        );
        draw_text(layer, &conclusion, 12.0, LEFT + 5.0, cy - 5.5, font);
        if data.original_max_score > data.total_max_score {
            let note = format!(
                "原始满分 {} 分，已扣除删除题目分值 {} 分。",
                data.original_max_score,
                data.original_max_score - data.total_max_score
            );
            layer.set_fill_color(color(0.36, 0.43, 0.49));
            draw_text(layer, &note, 11.0, LEFT + 5.0, cy - 13.5, font);
        }
    }
}

fn draw_evaluation(layer: &PdfLayerReference, data: &ReportData, fonts: &Fonts) {
    let ev = build_evaluation(data);
    let font = &fonts.body;
    layer.set_fill_color(color(0.10, 0.32, 0.46));
    draw_text(layer, "能力评估与面试总结", 19.0, LEFT, TOP, font);
    layer.set_outline_color(color(0.10, 0.32, 0.46));
    draw_line(layer, LEFT, TOP - 8.0, RIGHT, TOP - 8.0);

    // 一、分类能力得分
    layer.set_fill_color(color(0.10, 0.32, 0.46));
    draw_text(layer, "一、分类能力得分", 14.0, LEFT, TOP - 20.0, font);

    let columns: [(f64, f64, Align); 5] = [
        (15.0, 60.0, Align::Left),
        (75.0, 20.0, Align::Right),
        (95.0, 20.0, Align::Right),
        (115.0, 25.0, Align::Right),
        (140.0, 55.0, Align::Left),
    ];
    let header = ["技能领域", "得分", "满分", "得分率", "评价"];
    let mut rows = Vec::new();
    let mut grays = Vec::new();
    let mut lastc = Vec::new();
    for (c, got, max, rate, label) in &ev.cat_rows {
        let col = if *rate >= 80.0 {
            Some((0.12f32, 0.53f32, 0.29f32))
        } else if *rate >= 60.0 {
            Some((0.72f32, 0.47f32, 0.05f32))
        } else {
            Some((0.75f32, 0.22f32, 0.17f32))
        };
        rows.push(vec![
            c.clone(),
            got.to_string(),
            max.to_string(),
            format!("{rate:.0}%"),
            label.to_string(),
        ]);
        grays.push(false);
        lastc.push(col);
    }
    let y1 = draw_table(layer, font, 11.0, &columns, &header, &rows, &grays, &lastc, TOP - 28.0);

    // 二、未掌握要点
    let y2 = y1 - 10.0;
    layer.set_fill_color(color(0.10, 0.32, 0.46));
    draw_text(layer, &format!("二、未掌握要点（{} 项）", ev.missed.len()), 14.0, LEFT, y2, font);
    let mut y = y2 - 8.0;
    if ev.missed.is_empty() {
        layer.set_fill_color(color(0.12, 0.53, 0.29));
        draw_text(layer, "所有已评题目的回答要点均已覆盖，无遗漏项。", 11.0, LEFT + 6.0, y, font);
        y -= 11.0;
    } else {
        for (idx, (_c, _t, content)) in ev.missed.iter().enumerate() {
            let txt = format!("{}. {}", idx + 1, content);
            for line in wrap_text(&txt, 11.0, 118.0) {
                if y < BOTTOM {
                    break;
                }
                layer.set_fill_color(color(0.17, 0.24, 0.31));
                if !line.is_empty() {
                    draw_text(layer, &line, 11.0, LEFT + 6.0, y, font);
                }
                y -= 10.5;
            }
        }
    }

    // 三、综合结论
    y -= 6.0;
    layer.set_fill_color(color(0.10, 0.32, 0.46));
    draw_text(layer, "三、综合结论", 14.0, LEFT, y, font);
    y -= 8.0;

    let mut concl_lines = wrap_text(&strip_md(&ev.verdict), 11.0, 118.0);
    if let Some(r) = ev.hard_rate {
        let note = if r >= 70.0 {
            "具备解决复杂问题的能力，技术深度良好。"
        } else if r >= 40.0 {
            "有一定技术深度，复杂问题处理能力尚可。"
        } else {
            "复杂问题处理能力偏弱，技术深度有待加强。"
        };
        concl_lines.extend(wrap_text(&format!("难题（hard）得分率 {r:.0}%，{note}"), 11.0, 118.0));
    }
    concl_lines.push(format!(
        "总体评级：{}（总得分率 {:.1}%）",
        ev.grade, data.score_rate
    ));

    let box_h = (concl_lines.len() as f64 * 10.5 + 8.0).max(14.0);
    fill_rect(layer, LEFT, y, RIGHT, y - box_h, color(0.98, 0.98, 0.98));
    fill_rect(layer, LEFT, y, LEFT + 1.8, y - box_h, color(0.10, 0.32, 0.46));
    layer.set_fill_color(color(0.17, 0.24, 0.31));
    let mut ty = y - 5.0;
    for line in &concl_lines {
        if ty < BOTTOM {
            break;
        }
        if !line.is_empty() {
            draw_text(layer, line, 11.0, LEFT + 5.0, ty, font);
        }
        ty -= 10.5;
    }
}

fn draw_detail(layer: &PdfLayerReference, q: &InterviewQuestion, fonts: &Fonts) {
    let font = &fonts.body;
    layer.set_fill_color(color(0.10, 0.32, 0.46));
    draw_text(layer, &q.title, 16.0, LEFT, TOP, font);
    let meta = format!(
        "{} · 难度{} · 得分 {}/{}",
        q.category,
        difficulty_label(&q.difficulty),
        q.score.unwrap_or(0),
        q.max_score
    );
    layer.set_fill_color(color(0.50, 0.55, 0.55));
    draw_text(layer, &meta, 11.0, LEFT, TOP - 12.0, font);

    let mut y = TOP - 30.0;
    // 题目（带左侧蓝色竖条的小标题）
    fill_rect(layer, LEFT, y, LEFT + 1.8, y - 12.0, color(0.10, 0.32, 0.46));
    layer.set_fill_color(color(0.10, 0.32, 0.46));
    draw_text(layer, "题目", 13.0, LEFT + 5.0, y - 2.5, font);
    y -= 16.0;
    layer.set_fill_color(color(0.17, 0.24, 0.31));
    y = draw_lines(layer, &strip_md(&q.question_body), 11.0, LEFT + 6.0, y, BOTTOM, font);

    y -= 6.0;
    if y > BOTTOM {
        fill_rect(layer, LEFT, y, LEFT + 1.8, y - 12.0, color(0.10, 0.32, 0.46));
        layer.set_fill_color(color(0.10, 0.32, 0.46));
        draw_text(layer, "参考答案", 13.0, LEFT + 5.0, y - 2.5, font);
        y -= 16.0;
        layer.set_fill_color(color(0.17, 0.24, 0.31));
        let _ = draw_lines(layer, &strip_md(&q.reference_answer), 11.0, LEFT + 6.0, y, BOTTOM, font);
    }
}

/// 渲染完整报告 PDF 到指定路径
fn render_pdf(data: &ReportData, out_path: &str, fonts_dir: &PathBuf) -> Result<(), String> {
    let (doc, p1, l1) = PdfDocument::new("面试评估报告", mm(PAGE_W), mm(PAGE_H), "封面");
    let fonts = Fonts {
        body: load_font(&doc, fonts_dir, "NotoSansSC-Regular.ttf")?,
        brush: load_font(&doc, fonts_dir, "MaShanZheng-Regular.ttf")?,
    };

    draw_cover(&doc.get_page(p1).get_layer(l1), data, &fonts);

    let (pn, ln) = (doc.add_page(mm(PAGE_W), mm(PAGE_H), "汇总"));
    draw_summary(&doc.get_page(pn).get_layer(ln), data, &fonts);

    let (pn2, ln2) = (doc.add_page(mm(PAGE_W), mm(PAGE_H), "评估"));
    draw_evaluation(&doc.get_page(pn2).get_layer(ln2), data, &fonts);

    for q in data.questions.iter().filter(|q| !q.is_deleted && q.score.is_some()) {
        let (pn3, ln3) = doc.add_page(mm(PAGE_W), mm(PAGE_H), "详情");
        draw_detail(&doc.get_page(pn3).get_layer(ln3), q, &fonts);
    }

    let file = File::create(out_path).map_err(|e| format!("创建输出文件失败：{e}"))?;
    doc.save(&mut BufWriter::new(file)).map_err(|e| format!("保存 PDF 失败：{e}"))?;
    Ok(())
}

/// 查找本机可用的 Chrome / Chromium / Edge 可执行文件
fn find_chrome() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        const PATHS: [&str; 4] = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ];
        for p in PATHS {
            if Path::new(p).exists() {
                return Some(PathBuf::from(p));
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        // 用环境变量动态拼接，兼容不同安装位置 / 盘符 / 用户级安装
        let mut candidates: Vec<PathBuf> = Vec::new();
        let pf = std::env::var("PROGRAMFILES").ok();
        let pfx86 = std::env::var("PROGRAMFILES(X86)").ok();
        let local = std::env::var("LOCALAPPDATA").ok();
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());

        for base in [pf.as_deref(), pfx86.as_deref()].into_iter().flatten() {
            candidates.push(PathBuf::from(base).join("Microsoft").join("Edge").join("Application").join("msedge.exe"));
            candidates.push(PathBuf::from(base).join("Google").join("Chrome").join("Application").join("chrome.exe"));
        }
        if let Some(local) = local.as_deref() {
            candidates.push(PathBuf::from(local).join("Google").join("Chrome").join("Application").join("chrome.exe"));
            candidates.push(PathBuf::from(local).join("Microsoft").join("Edge").join("Application").join("msedge.exe"));
        }
        candidates.push(PathBuf::from(&drive).join("Program Files").join("Microsoft").join("Edge").join("Application").join("msedge.exe"));

        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
    }
    None
}

/// 读取毛笔字体并 base64 编码（用于 HTML 内嵌 @font-face，保证水印用真实毛笔字体）
fn brush_font_base64(fonts_dir: &Path) -> Option<String> {
    let data = std::fs::read(fonts_dir.join("MaShanZheng-Regular.ttf")).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(&data))
}

/// 用 headless Chrome 将 HTML 渲染为 PDF（复刻原项目 Chromium printToPDF）
fn render_html_to_pdf(html: &str, out_path: &str) -> Result<(), String> {
    let chrome = find_chrome().ok_or("未找到 Chrome / Chromium / Edge 浏览器，无法渲染报告")?;
    let tmp = std::env::temp_dir().join(format!("interview-report-{}.html", std::process::id()));
    std::fs::write(&tmp, html).map_err(|e| format!("写入临时 HTML 失败：{e}"))?;
    let file_url = format!("file://{}", tmp.to_string_lossy());

    let result = (|| -> Result<(), String> {
        let launch = headless_chrome::LaunchOptions::default_builder()
            .path(Some(chrome))
            .headless(true)
            .sandbox(false)
            .build()
            .map_err(|e| e.to_string())?;
        let browser = headless_chrome::Browser::new(launch).map_err(|e| e.to_string())?;
        let tab = browser.new_tab().map_err(|e| e.to_string())?;
        tab.navigate_to(&file_url).map_err(|e| e.to_string())?;
        // 固定等待页面加载（规避 CDP 事件等待在受限环境下的超时问题）
        std::thread::sleep(std::time::Duration::from_millis(1500));

        let opts = headless_chrome::types::PrintToPdfOptions {
            landscape: None,
            display_header_footer: Some(true),
            print_background: Some(true),
            scale: None,
            paper_width: Some(8.27),
            paper_height: Some(11.69),
            margin_top: Some(0.98),
            margin_bottom: Some(0.79),
            margin_left: Some(0.79),
            margin_right: Some(0.79),
            page_ranges: None,
            ignore_invalid_page_ranges: None,
            header_template: Some(
                "<div style=\"font-size:10pt;color:#95a5a6;width:100%;text-align:center;margin-top:4mm;\">面试评估报告</div>"
                    .into(),
            ),
            footer_template: Some(
                "<div style=\"font-size:10pt;color:#95a5a6;width:100%;text-align:center;margin-bottom:3mm;\">第 <span class=\"pageNumber\"></span> 页 / 共 <span class=\"totalPages\"></span> 页</div>"
                    .into(),
            ),
            prefer_css_page_size: None,
            transfer_mode: None,
            generate_document_outline: None,
            generate_tagged_pdf: None,
        };
        let pdf = tab.print_to_pdf(Some(opts)).map_err(|e| e.to_string())?;
        std::fs::write(out_path, pdf).map_err(|e| format!("写入 PDF 失败：{e}"))?;
        Ok(())
    })();

    let _ = std::fs::remove_file(&tmp);
    result
}

/// 导出 PDF 到指定路径：优先用 headless Chrome 渲染（与预览同一 HTML，版式完全一致），失败回退 printpdf
#[tauri::command]
pub async fn export_pdf_to_path(app: tauri::AppHandle, path: String, data: ReportData) -> Result<SaveResult, String> {
    if path.trim().is_empty() {
        return Ok(SaveResult { ok: false, message: Some("已取消保存".into()), ..Default::default() });
    }
    let fonts_dir = resolve_fonts_dir(Some(&app));
    let font_b64 = brush_font_base64(&fonts_dir);
    let html = build_report_html(&data, font_b64.as_deref());

    // 主路径：headless Chrome 渲染（与预览同一 HTML，版式完全一致）
    let path2 = path.clone();
    let chrome_result = tokio::task::spawn_blocking(move || render_html_to_pdf(&html, &path2))
        .await
        .map_err(|e| e.to_string())?;

    if chrome_result.is_ok() {
        return Ok(SaveResult {
            ok: true,
            path: Some(path),
            message: Some("已导出".into()),
            ..Default::default()
        });
    }

    // 兜底：printpdf（无 Chrome 环境时仍可导出）
    match render_pdf(&data, &path, &fonts_dir) {
        Ok(()) => Ok(SaveResult {
            ok: true,
            path: Some(path),
            message: Some("已导出".into()),
            ..Default::default()
        }),
        Err(e) => Ok(SaveResult { ok: false, message: Some(e), ..Default::default() }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::KeyPoint;

    fn sample_report() -> ReportData {
        ReportData {
            candidate_name: "张三".into(),
            position: "渗透测试工程师".into(),
            interview_date: "2026-08-11".into(),
            questions: vec![
                InterviewQuestion {
                    id: "q1".into(),
                    category: "Web 安全基础".into(),
                    title: "SQL 注入深度分析".into(),
                    difficulty: "medium".into(),
                    qtype: "basic".into(),
                    max_score: 8,
                    question_body: "1. 请说明 SQL 注入产生根因。\n2. 如何区分报错注入与盲注？".into(),
                    reference_answer: "参数化查询是根治方案。报错注入依赖错误回显；盲注通过布尔/时间差异判断。".into(),
                    key_points: vec![
                        KeyPoint { id: "kp1".into(), content: "指出注入根因".into(), score: 4, is_checked: true },
                        KeyPoint { id: "kp2".into(), content: "区分盲注".into(), score: 4, is_checked: false },
                    ],
                    score: Some(6),
                    is_deleted: false,
                    deleted_at: None,
                },
                InterviewQuestion {
                    id: "q2".into(),
                    category: "内网渗透".into(),
                    title: "域环境横向移动方案".into(),
                    difficulty: "hard".into(),
                    qtype: "comprehensive".into(),
                    max_score: 10,
                    question_body: "假设已拿下一台域内主机，设计横向移动方案。".into(),
                    reference_answer: "信息收集、凭据获取、横向手段、权限维持。".into(),
                    key_points: vec![],
                    score: Some(8),
                    is_deleted: false,
                    deleted_at: None,
                },
            ],
            total_score: 14,
            total_max_score: 18,
            original_max_score: 18,
            score_rate: 77.8,
        }
    }

    #[test]
    fn renders_pdf() {
        let out = std::path::PathBuf::from("target").join("test-report.pdf");
        let dir = std::path::PathBuf::from("resources").join("fonts");
        let data = sample_report();
        let r = render_pdf(&data, out.to_string_lossy().as_ref(), &dir);
        assert!(r.is_ok(), "render failed: {r:?}");
        assert!(out.exists(), "pdf not written");
        let meta = std::fs::metadata(&out).unwrap();
        assert!(meta.len() > 1000, "pdf too small: {}", meta.len());
        println!("PDF written: {} ({} bytes)", out.display(), meta.len());
    }

    #[test]
    fn preview_html_works() {
        let data = sample_report();
        let html = build_report_html(&data, None);
        assert!(html.contains("面试评估报告"), "missing title");
        assert!(html.contains("score-watermark"), "missing watermark");
        assert!(html.contains("sql 注入") || html.contains("SQL 注入"), "missing question");
        println!("report_html len: {}", html.len());
    }

    #[test]
    fn chrome_render_works() {
        let dir = std::path::PathBuf::from("resources").join("fonts");
        let data = sample_report();
        let font_b64 = brush_font_base64(&dir);
        let html = build_report_html(&data, font_b64.as_deref());
        let out = "target/test-chrome.pdf";
        let r = render_html_to_pdf(&html, out);
        assert!(r.is_ok(), "chrome render failed: {r:?}");
        let meta = std::fs::metadata(out).unwrap();
        assert!(meta.len() > 1000, "pdf too small: {}", meta.len());
        println!("Chrome PDF written: {} bytes", meta.len());
    }
}

