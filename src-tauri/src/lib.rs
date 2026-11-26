// 面试官助手PRO Rust 后端（Tauri v2）
// 对应原 Electron 主进程：简历解析、AI 代理、设置加密、会话持久化、PDF 报告、文件对话框。

mod ai;
mod resume;
mod report;
mod settings;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            resume::pick_resume_file,
            resume::pick_resume_files,
            resume::extract_text,
            resume::read_file_b64,
            ai::generate_questions,
            ai::settings_ping,
            ai::settings_list_models,
            ai::settings_test,
            settings::get_config,
            settings::save_config,
            report::export_pdf_to_path,
            report::preview_html,
            settings::session_load,
            settings::session_save,
            settings::session_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
