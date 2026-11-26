// 前端 ↔ Rust 后端桥接：使用 Tauri invoke，代替原 Electron 的 window.api
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import type { WindowAPI, InterviewSet, AIConfig, ReportData, SaveResult } from '@/types';

// 检测是否运行在 Tauri 桌面上下文中
export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// TopBar 用 isElectron 判断是否显示浏览器-only 提示；Tauri 视为桌面端
export const isElectron = isTauri;

function b64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 浏览器环境 mock：让界面在没有 Tauri 时也能完整预览 */
const mockQuestions: InterviewSet = {
  categories: ['Web 安全基础', '内网渗透'],
  questions: [
    {
      id: 'mock-q1',
      category: 'Web 安全基础',
      title: 'SQL 注入深度分析',
      difficulty: 'medium',
      type: 'basic',
      maxScore: 8,
      questionBody:
        '你在项目中提到过对某后台系统进行过渗透测试。\n\n1. 请说明 SQL 注入产生根因。\n2. 如何区分报错注入与盲注？\n3. 给出一种绕过简单关键字过滤的思路。',
      referenceAnswer:
        '**根因**：用户输入未经过滤直接拼接到 SQL 语句中。\n\n1. 参数化查询是根治方案。\n2. 报错注入依赖数据库错误信息回显；盲注通过布尔/时间差异判断。\n3. 可使用大小写混写、内联注释、等价函数替换等。',
      keyPoints: [
        { id: 'kp1', content: '指出注入根因是字符串拼接', score: 2, isChecked: false },
        { id: 'kp2', content: '能区分报错注入与盲注', score: 3, isChecked: false },
        { id: 'kp3', content: '给出至少一种合理的绕过思路', score: 3, isChecked: false },
      ],
      score: null,
      isDeleted: false,
    },
    {
      id: 'mock-q2',
      category: '内网渗透',
      title: '域环境横向移动方案设计',
      difficulty: 'hard',
      type: 'comprehensive',
      maxScore: 10,
      questionBody:
        '假设你已拿下一台域内普通主机，请设计一套完整的横向移动与权限提升方案，并说明每一步的检测风险。',
      referenceAnswer:
        '应覆盖：信息收集（域结构、SPN、ACL）、凭据获取（LSASS、Kerberoasting）、横向手段（PtH/PtT、WMI、WinRM）、权限维持与痕迹清理，并能说明各环节的 EDR/日志检测点。',
      keyPoints: [],
      score: null,
      isDeleted: false,
    },
  ],
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mockApi: WindowAPI = {
  resume: {
    upload: async () => ({ path: '/mock/简历-张三.pdf', name: '简历-张三.pdf' }),
    uploadMany: async () => [
      { path: '/mock/简历-张三.pdf', name: '简历-张三.pdf' },
      { path: '/mock/李四CV.docx', name: '李四CV.docx' },
    ],
    extractText: async () => ({
      text: '【浏览器预览模式】示例简历文本：张三，3 年渗透测试经验，熟悉 Web 安全、内网渗透……',
      html: '<h2>张三 — 渗透测试工程师</h2><p>3 年安全从业经验，主导过多个红队项目，熟悉 Web 安全、内网横向、代码审计。</p>',
      format: 'docx',
    }),
    readFile: async () => new ArrayBuffer(0),
  },
  ai: {
    generateQuestions: async () => {
      await delay(1500);
      return structuredClone(mockQuestions);
    },
  },
  settings: {
    get: async () => ({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      baseUrl: 'https://api.deepseek.com/v1',
      hasKey: false,
      maskedKey: '',
    }),
    save: async () => ({ ok: true, message: '预览模式：配置未真实保存' }),
    test: async () => ({ ok: true, message: '预览模式：模拟连接成功' }),
    listModels: async () => ({
      ok: true,
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    }),
    ping: async () => ({ ok: true, latencyMs: 86 }),
  },
  report: {
    exportPDF: async () => ({
      ok: false,
      message: '浏览器预览模式不支持 PDF 导出，请在桌面应用中使用',
    }),
    preview: async () => {
      // 浏览器模式返回一个简单的预览 HTML
      return `<html><body style="font-family:sans-serif"><h1>报告预览</h1><p>浏览器预览模式不支持报告预览，请在桌面应用中使用。</p></body></html>`;
    },
  },
  session: {
    load: async () => ({
      candidates: [
        { id: 'm1', name: '张三', position: '渗透测试工程师', status: 'interviewing' as const,
          resume: { name: '简历-张三.pdf', path: '/mock/a.pdf', text: '示例', html: '<h2>张三</h2>', format: 'docx' as const },
          questions: structuredClone(mockQuestions.questions).map((q, i) => i === 0 ? { ...q, score: 6 } : q),
          createdAt: '', updatedAt: '' },
      ],
      activeCandidateId: null,
      savedAt: new Date().toISOString(),
    }),
    save: async () => {},
    clear: async () => {},
  },
};

export const api: WindowAPI = isTauri ? tauriApi() : mockApi;

/** 基于 Tauri invoke 的真实后端实现 */
function tauriApi(): WindowAPI {
  return {
    resume: {
      upload: async () => invoke('pick_resume_file'),
      uploadMany: async () => invoke('pick_resume_files'),
      extractText: async (filePath) => invoke('extract_text', { filePath }),
      readFile: async (filePath) => {
        const b64: string = await invoke('read_file_b64', { filePath });
        const bytes = b64ToUint8(b64);
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        return ab;
      },
    },
    ai: {
      generateQuestions: async (resumeText, position, config) =>
        invoke('generate_questions', { resumeText, position, config }),
    },
    settings: {
      get: async () => invoke('get_config'),
      save: async (config) => invoke('save_config', { config }),
      test: async (config) => invoke('settings_test', { config }),
      listModels: async (config) => invoke('settings_list_models', { config }),
      ping: async (config) => invoke('settings_ping', { config }),
    },
    report: {
      exportPDF: async (reportData) => {
        // 用 tauri-plugin-dialog 唤起系统保存对话框（可靠处理 macOS 主线程/父窗口）
        const defaultPath = `面试评估报告-${reportData.candidateName || '候选人'}-${reportData.interviewDate}.pdf`;
        const path = await save({
          title: '保存面试报告',
          defaultPath,
          filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        });
        if (!path) return { ok: false, message: '已取消保存' };
        return invoke('export_pdf_to_path', { path, data: reportData });
      },
      preview: async (reportData) => invoke('preview_html', { data: reportData }),
    },
    session: {
      load: async () => invoke('session_load'),
      save: async (state) => invoke('session_save', { state }),
      clear: async () => invoke('session_clear'),
    },
  };
}

// 供类型检查 / 未来使用
export type { WindowAPI, AIConfig, ReportData, SaveResult };
