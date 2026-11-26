// 简历上传 / 文本提取（对应原 Electron resume-handler + text-extractor）
use base64::Engine;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::types::{ExtractResult, FilePick};

/// 单文件选择对话框（过滤 pdf/docx/doc，.doc 明确拒绝）
#[tauri::command]
pub fn pick_resume_file() -> Result<Option<serde_json::Value>, String> {
    let file = rfd::FileDialog::new()
        .set_title("选择候选人简历")
        .add_filter("简历文件 (PDF / DOCX)", &["pdf", "docx", "doc"])
        .pick_file();

    match file {
        None => Ok(None),
        Some(p) => {
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if ext == "doc" {
                return Ok(Some(serde_json::json!({
                    "error": "暂不支持旧版 .doc 格式，请将该文件另存为 .docx 后重新上传"
                })));
            }
            if ext != "pdf" && ext != "docx" {
                return Ok(Some(serde_json::json!({
                    "error": format!("不支持的文件格式 .{ext}，请上传 PDF 或 DOCX 文件")
                })));
            }
            Ok(Some(serde_json::json!({
                "path": p.to_string_lossy().to_string(),
                "name": p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string()
            })))
        }
    }
}

/// 多选文件对话框（.doc 由前端统一提示跳过）
#[tauri::command]
pub fn pick_resume_files() -> Result<Vec<FilePick>, String> {
    let files = rfd::FileDialog::new()
        .set_title("批量选择简历（可多选）")
        .add_filter("简历文件 (PDF / DOCX)", &["pdf", "docx", "doc"])
        .pick_files();

    Ok(files
        .unwrap_or_default()
        .into_iter()
        .map(|p| FilePick {
            path: p.to_string_lossy().to_string(),
            name: p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
        })
        .collect())
}

/// 读取文件为 base64（供前端 react-pdf 生成本地 Blob URL 预览）
#[tauri::command]
pub fn read_file_b64(file_path: String) -> Result<String, String> {
    let mut buf = Vec::new();
    File::open(&file_path)
        .map_err(|e| e.to_string())?
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

/// 提取简历文本（PDF 用 pdf-extract；DOCX 解析 word/document.xml 得到文本 + HTML 预览）
#[tauri::command]
pub async fn extract_text(file_path: String) -> Result<ExtractResult, String> {
    let result = tokio::task::spawn_blocking(move || extract_sync(&file_path))
        .await
        .map_err(|e| e.to_string())??;
    Ok(result)
}

fn extract_sync(file_path: &str) -> Result<ExtractResult, String> {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "pdf" => {
            let text = pdf_extract::extract_text(file_path)
                .map_err(|e| format!("未能从 PDF 中提取到文本（可能是扫描件/图片型 PDF）：{e}"))?;
            let text = text.trim().to_string();
            if text.is_empty() {
                return Err("未能从 PDF 中提取到文本（可能是扫描件/图片型 PDF）".into());
            }
            Ok(ExtractResult { text, html: None, format: "pdf".into() })
        }
        "docx" => {
            let (text, html) = parse_docx(file_path)?;
            let text = text.trim().to_string();
            if text.is_empty() {
                return Err("未能从 Word 文档中提取到文本".into());
            }
            Ok(ExtractResult { text, html: Some(html), format: "docx".into() })
        }
        "doc" => Err("暂不支持旧版 .doc 格式，请将文件另存为 .docx 后重新上传".into()),
        other => Err(format!("不支持的文件格式：.{other}，请上传 PDF 或 DOCX 文件")),
    }
}

// ============================ DOCX 解析 ============================

/// 解析 word/document.xml，返回（纯文本, HTML 预览）
fn parse_docx(path: &str) -> Result<(String, String), String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("无法打开 DOCX：{e}"))?;
    let mut xml = String::new();
    {
        let entry = archive
            .by_name("word/document.xml")
            .map_err(|_| "无效的 DOCX 文件（缺少 word/document.xml）".to_string())?;
        let mut reader = entry;
        reader.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    }
    let (text, html) = docx_xml_to_content(&xml)?;
    Ok((text, html))
}

/// 将 DOCX 正文 XML 转成（纯文本, HTML）
fn docx_xml_to_content(xml: &str) -> Result<(String, String), String> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut text_buf: Vec<String> = Vec::new(); // 每个段落一行 / 单元格用 \t / 行用 \n

    // HTML 构建
    let mut html = String::new();
    let mut para_html = String::new(); // 当前段落 HTML
    let mut paras_html: Vec<String> = Vec::new();
    let mut current_text = String::new(); // 当前段落的纯文本
    let mut pending_text = String::new(); // 当前段落的已收集文本

    let mut bold = 0u32;
    let mut in_table = false;
    let mut in_row = false;
    let mut in_cell = false;
    let mut cell_buf = String::new();
    let mut row_cells: Vec<String> = Vec::new();
    let mut table_rows: Vec<Vec<String>> = Vec::new();
    let mut cur_style = String::new(); // 当前段落样式名
    let mut in_para = false;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = e.local_name().as_ref().to_vec();
                match name.as_slice() {
                    b"tbl" => {
                        in_table = true;
                        table_rows.clear();
                    }
                    b"tr" => {
                        in_row = true;
                        row_cells.clear();
                    }
                    b"tc" => {
                        in_cell = true;
                        cell_buf.clear();
                    }
                    b"p" => {
                        in_para = true;
                        para_html.clear();
                        pending_text = String::new();
                        cur_style.clear();
                    }
                    b"pStyle" => {
                        // <w:pStyle w:val="Heading1"/>
                        if let Ok(attr) = e.try_get_attribute("val") {
                            if let Some(v) = attr {
                                cur_style = v
                                    .unescape_value()
                                    .map(|s| s.to_string())
                                    .unwrap_or_default()
                                    .to_lowercase();
                            }
                        }
                    }
                    b"b" => bold += 1,
                    b"br" => {
                        if in_cell {
                            cell_buf.push_str("<br/>");
                            pending_text.push('\n');
                        } else {
                            para_html.push_str("<br/>");
                            pending_text.push('\n');
                        }
                    }
                    b"tab" => {
                        pending_text.push('\t');
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(e)) => {
                let name = e.local_name().as_ref().to_vec();
                match name.as_slice() {
                    b"br" => {
                        if in_cell {
                            cell_buf.push_str("<br/>");
                            pending_text.push('\n');
                        } else {
                            para_html.push_str("<br/>");
                            pending_text.push('\n');
                        }
                    }
                    b"tab" => pending_text.push('\t'),
                    b"pStyle" => {
                        if let Ok(attr) = e.try_get_attribute("val") {
                            if let Some(v) = attr {
                                cur_style = v
                                    .unescape_value()
                                    .map(|s| s.to_string())
                                    .unwrap_or_default()
                                    .to_lowercase();
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(t)) => {
                let s = t
                    .unescape()
                    .map_err(|e| e.to_string())?
                    .to_string();
                pending_text.push_str(&s);
                let esc = escape_html(&s);
                if in_cell {
                    cell_buf.push_str(&esc);
                } else if bold > 0 {
                    para_html.push_str(&format!("<strong>{esc}</strong>"));
                } else {
                    para_html.push_str(&esc);
                }
            }
            Ok(Event::End(e)) => {
                let name = e.local_name().as_ref().to_vec();
                match name.as_slice() {
                    b"b" => bold = bold.saturating_sub(1),
                    b"p" => {
                        in_para = false;
                        let txt = pending_text.trim().to_string();
                        let h = para_html.trim().to_string();
                        let styled = style_to_tag(&cur_style);
                        if !txt.is_empty() {
                            text_buf.push(txt);
                            let tagged = match styled {
                                (1, t) => format!("<h1>{h}</h1>", h = h),
                                (2, t) => format!("<h2>{h}</h2>"),
                                (3, t) => format!("<h3>{h}</h3>"),
                                _ => format!("<p>{h}</p>"),
                            };
                            paras_html.push(tagged);
                        }
                    }
                    b"tc" => {
                        in_cell = false;
                        row_cells.push(cell_buf.trim().to_string());
                    }
                    b"tr" => {
                        in_row = false;
                        table_rows.push(std::mem::take(&mut row_cells));
                    }
                    b"tbl" => {
                        in_table = false;
                        html.push_str(&table_to_html(&table_rows));
                        text_buf.push(table_rows_text(&table_rows));
                        table_rows.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                // 容忍未知的 XML 错误（如非法字符），不中断整体解析
                if e.to_string().contains("Eof") {
                    break;
                }
            }
            _ => {}
        }
        buf.clear();
    }

    for p in paras_html {
        html.push_str(&p);
    }

    let text = text_buf.join("\n");
    let html = if html.trim().is_empty() {
        // 兜底：没有可识别的段落时退化为纯文本
        format!("<pre>{}</pre>", escape_html(&text))
    } else {
        html
    };
    Ok((text, html))
}

fn style_to_tag(style: &str) -> (u8, String) {
    if style.contains("heading1") || style == "title" {
        (1, "h1".into())
    } else if style.contains("heading2") {
        (2, "h2".into())
    } else if style.contains("heading3") {
        (3, "h3".into())
    } else {
        (0, "p".into())
    }
}

fn table_to_html(rows: &[Vec<String>]) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let mut out = String::from("<table class=\"preview-table\">");
    for (i, row) in rows.iter().enumerate() {
        out.push_str("<tr>");
        for cell in row {
            let tag = if i == 0 { "th" } else { "td" };
            out.push_str(&format!("<{tag}>{}</{tag}>", cell));
        }
        out.push_str("</tr>");
    }
    out.push_str("</table>");
    out
}

fn table_rows_text(rows: &[Vec<String>]) -> String {
    rows.iter()
        .map(|row| row.join(" | "))
        .collect::<Vec<_>>()
        .join("\n")
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
