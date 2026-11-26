import { create } from 'zustand';
import type {
  AIConfig,
  AIProvider,
  Candidate,
  CandidatesFile,
  InterviewQuestion,
  PersistedState,
  ResumeFormat,
} from '@/types';
import { api } from '@/lib/api';
import { todayString } from '@/lib/utils';
import { deriveWorkbenchStatus, guessNameFromFile } from '@/lib/candidate';
import { migrateLegacyState } from '@/lib/migration';
import { downgradeGenerating, nextToGenerate } from '@/lib/queue';

export type NavKey = 'resume' | 'questions' | 'summary';

export const PROVIDER_PRESETS: Record<
  AIProvider,
  { label: string; baseUrl: string; defaultModel: string; modelHint: string }
> = {
  deepseek: {
    label: 'DeepSeek（默认）',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    modelHint: 'deepseek-v4-flash / deepseek-v4-pro',
  },
  doubao: {
    label: '豆包（火山方舟）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-32k',
    modelHint: '模型 ID 或推理接入点 ID，如 doubao-pro-32k',
  },
  openai: {
    label: 'ChatGPT（OpenAI）',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    modelHint: 'gpt-4o-mini / gpt-4o 等',
  },
  kimi: {
    label: 'Kimi（Moonshot）',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    modelHint: 'moonshot-v1-8k / 32k / 128k',
  },
};

export interface LogEntry {
  id: number;
  time: string; // HH:MM:SS
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  /** 关联的候选人 id（出题日志）；undefined 表示全局日志 */
  candidateId?: string;
}

export interface UploadRow {
  path: string;
  name: string;
  guessedName: string;
  position: string;
}

let logSeq = 0;

/** 出题请求的兜底超时：即使后端 invoke 因异常永不返回，也不能让卡片无限「出题中」 */
const GENERATE_TIMEOUT_MS = 300_000;

/** 给可能永久 pending 的 Tauri invoke 套一个前端超时 */
function withGenerateTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `AI 出题超时（${Math.round(GENERATE_TIMEOUT_MS / 1000)} 秒未返回），已停止等待；请检查网络/API 配置后重试`
            )
          ),
        GENERATE_TIMEOUT_MS
      )
    ),
  ]);
}

function nowTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface AppState {
  // 简历（工作台编辑副本，来自当前候选人）
  resumeFile: { path: string; name: string } | null;
  resumeText: string;
  resumeHtml: string | null;
  resumeFormat: ResumeFormat | null;
  resumeError: string | null;
  extracting: boolean;

  // 面试信息（工作台编辑副本）
  position: string;
  candidateName: string;

  // 导航
  activeNav: NavKey;
  activeQuestionId: string | null;

  // 题目（工作台编辑副本）
  questions: InterviewQuestion[];
  generating: boolean;
  generateError: string | null;

  // AI 配置
  aiConfig: AIConfig;
  hasSavedKey: boolean;

  // 设置弹窗
  settingsOpen: boolean;

  // 导出
  exporting: boolean;

  // 运行日志
  logs: LogEntry[];

  // AI 连通性状态
  aiStatus: 'unknown' | 'probing' | 'ok' | 'fail';
  aiLatency: number | null;

  // 多候选人
  candidates: Candidate[];
  activeCandidateId: string | null;
  view: 'list' | 'workbench';
  uploadConfirm: UploadRow[] | null;

  // 报告预览（覆盖层 HTML）
  reportPreviewHtml: string | null;
  setReportPreviewHtml: (html: string | null) => void;

  // 出题日志弹窗（当前展示的候选人 id；null 表示关闭）
  genLogCandidateId: string | null;
  openGenLog: (id: string) => void;
  closeGenLog: () => void;

  // Actions
  addLog: (level: LogEntry['level'], message: string, candidateId?: string) => void;
  clearLogs: () => void;
  probeAi: () => Promise<void>;
  init: () => Promise<void>;
  uploadResume: () => Promise<void>;
  setPosition: (v: string) => void;
  setCandidateName: (v: string) => void;
  setNav: (nav: NavKey) => void;
  setActiveQuestion: (id: string) => void;
  generateQuestions: () => Promise<void>;
  toggleKeyPoint: (questionId: string, keyPointId: string) => void;
  setQuestionScore: (questionId: string, score: number) => void;
  markUnanswered: (questionId: string) => void;
  deleteQuestion: (questionId: string) => void;
  restoreQuestion: (questionId: string) => void;
  setAiConfig: (config: Partial<AIConfig>) => void;
  loadSettings: () => Promise<void>;
  saveSettings: (config: AIConfig) => Promise<{ ok: boolean; message?: string }>;
  testSettings: (config: AIConfig) => Promise<{ ok: boolean; message?: string }>;
  setSettingsOpen: (open: boolean) => void;
  exportReport: () => Promise<void>;
  previewReport: () => Promise<void>;
  resetInterview: () => Promise<void>;

  // 多候选人 actions
  openCandidate: (id: string) => void;
  backToList: () => void;
  startBatchUpload: () => Promise<void>;
  confirmBatchUpload: (rows: UploadRow[]) => Promise<void>;
  cancelBatchUpload: () => void;
  updateCandidateMeta: (id: string, patch: { name?: string; position?: string }) => void;
  deleteCandidate: (id: string) => void;
  retryCandidate: (id: string) => Promise<void>;
  retryAllFailed: () => void;
  pumpQueue: () => Promise<void>;
  exportCandidateReport: (id: string) => Promise<void>;
  previewCandidateReport: (id: string) => Promise<void>;
}

/** 基础题自动评分：要点勾选分 / 要点总分 × 题目满分，四舍五入取整 */
export function autoScore(q: InterviewQuestion): number {
  if (q.type !== 'basic' || q.keyPoints.length === 0) return q.score ?? 0;
  const total = q.keyPoints.reduce((s, kp) => s + kp.score, 0);
  const got = q.keyPoints.filter((kp) => kp.isChecked).reduce((s, kp) => s + kp.score, 0);
  if (total === 0) return 0;
  return Math.round((got / total) * q.maxScore);
}

type Get = () => AppState;
type Set = (partial: Partial<AppState>) => void;

function persist(state: Pick<AppState, 'candidates' | 'activeCandidateId'>): void {
  const file: CandidatesFile = {
    candidates: state.candidates,
    activeCandidateId: state.activeCandidateId,
    savedAt: new Date().toISOString(),
  };
  void api.session.save(file);
}

/** 把工作台编辑副本回写到当前候选人，并按评分数据自动流转 ready/interviewing/done */
function syncToCandidate(get: Get): Candidate[] {
  const s = get();
  if (!s.activeCandidateId) return s.candidates;
  return s.candidates.map((c) => {
    if (c.id !== s.activeCandidateId) return c;
    const next: Candidate = {
      ...c,
      name: s.candidateName,
      position: s.position,
      questions: s.questions,
      updatedAt: new Date().toISOString(),
    };
    if (c.status === 'ready' || c.status === 'interviewing' || c.status === 'done') {
      next.status = deriveWorkbenchStatus(next);
    }
    return next;
  });
}

/** 所有工作台变更的统一出口：回写候选人 + set + 落盘 */
function commit(set: Set, get: Get): void {
  const candidates = syncToCandidate(get);
  set({ candidates });
  persist({ candidates, activeCandidateId: get().activeCandidateId });
}

export const useInterviewStore = create<AppState>((set, get) => ({
  resumeFile: null,
  resumeText: '',
  resumeHtml: null,
  resumeFormat: null,
  resumeError: null,
  extracting: false,

  position: '',
  candidateName: '',

  activeNav: 'resume',
  activeQuestionId: null,

  questions: [],
  generating: false,
  generateError: null,

  aiConfig: {
    provider: 'deepseek',
    apiKey: '',
    model: PROVIDER_PRESETS.deepseek.defaultModel,
    baseUrl: PROVIDER_PRESETS.deepseek.baseUrl,
  },
  hasSavedKey: false,
  settingsOpen: false,
  exporting: false,

  logs: [],
  aiStatus: 'unknown',
  aiLatency: null,

  candidates: [],
  activeCandidateId: null,
  view: 'list',
  uploadConfirm: null,
  reportPreviewHtml: null,

  setReportPreviewHtml: (html) => set({ reportPreviewHtml: html }),

  genLogCandidateId: null,
  openGenLog: (id) => set({ genLogCandidateId: id }),
  closeGenLog: () => set({ genLogCandidateId: null }),

  addLog: (level, message, candidateId) => {
    set((s) => ({
      logs: [...s.logs.slice(-199), { id: ++logSeq, time: nowTime(), level, message, candidateId }],
    }));
  },

  clearLogs: () => set({ logs: [] }),

  probeAi: async () => {
    const { aiConfig, hasSavedKey, aiStatus } = get();
    if (!aiConfig.apiKey && !hasSavedKey) {
      set({ aiStatus: 'unknown', aiLatency: null });
      return;
    }
    if (aiStatus === 'probing') return;
    set({ aiStatus: 'probing' });
    try {
      const r = await api.settings.ping(aiConfig);
      if (r.ok) {
        set({ aiStatus: 'ok', aiLatency: r.latencyMs ?? null });
      } else {
        set({ aiStatus: 'fail', aiLatency: null });
      }
    } catch {
      set({ aiStatus: 'fail', aiLatency: null });
    }
  },

  init: async () => {
    await get().loadSettings();
    const saved = await api.session.load().catch(() => null);
    if (!saved) return;
    // 新格式 CandidatesFile
    if (Array.isArray((saved as CandidatesFile).candidates)) {
      const file = saved as CandidatesFile;
      const candidates = downgradeGenerating(file.candidates);
      set({ candidates, activeCandidateId: file.activeCandidateId, view: 'list' });
      if (candidates.length) get().addLog('info', `已恢复 ${candidates.length} 位候选人数据`);
      void get().pumpQueue();
      return;
    }
    // 旧格式 PersistedState → 迁移为候选人卡片
    const legacy = saved as PersistedState;
    if (legacy.resumeName || legacy.questions?.length) {
      const migrated = migrateLegacyState(legacy);
      set({ candidates: [migrated], view: 'list' });
      persist({ candidates: [migrated], activeCandidateId: null });
      get().addLog('info', `已将上次面试会话迁移为候选人「${migrated.name}」`);
    }
  },

  uploadResume: async () => {
    const log = get().addLog;
    set({ resumeError: null });
    log('info', '打开文件选择器，等待选择简历…');
    try {
      const picked = await api.resume.upload();
      if (!picked) {
        log('info', '已取消选择文件');
        return;
      }
      if ('error' in picked) {
        set({ resumeError: String(picked.error) });
        log('warn', `简历格式不支持：${picked.error}`);
        return;
      }
      log('info', `已选择文件：${picked.name}，开始解析…`);
      set({ extracting: true, resumeFile: { path: picked.path, name: picked.name } });
      const result = await api.resume.extractText(picked.path);
      set({
        extracting: false,
        resumeText: result.text,
        resumeHtml: result.html,
        resumeFormat: result.format,
        activeNav: 'resume',
      });
      commit(set, get);
      log(
        'success',
        `简历解析成功：${picked.name}（${result.format.toUpperCase()}，提取 ${result.text.length} 字符）`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ extracting: false, resumeError: msg });
      log('error', `简历解析失败：${msg}`);
    }
  },

  setPosition: (v) => { set({ position: v }); commit(set, get); },
  setCandidateName: (v) => { set({ candidateName: v }); commit(set, get); },
  setNav: (nav) => set({ activeNav: nav }),

  setActiveQuestion: (id) => set({ activeQuestionId: id, activeNav: 'questions' }),

  generateQuestions: async () => {
    const { resumeText, position, aiConfig, hasSavedKey } = get();
    if (!resumeText) {
      set({ generateError: '请先上传并解析简历' });
      return;
    }
    if (!position.trim()) {
      set({ generateError: '请先输入面试岗位' });
      return;
    }
    if (!aiConfig.apiKey && !hasSavedKey) {
      set({ generateError: '请先在「设置」中配置 API Key', settingsOpen: true });
      return;
    }
    set({ generating: true, generateError: null });
    const log = get().addLog;
    log('info', `开始生成面试题（岗位：${position}，模型：${aiConfig.model}）…`);
    const startTs = Date.now();
    // 进度心跳：每 5 秒打印一次已等待时长
    const ticker = setInterval(() => {
      const secs = Math.round((Date.now() - startTs) / 1000);
      log('info', `AI 正在分析简历并出题…已等待 ${secs} 秒`);
    }, 5000);
    try {
      const result = await withGenerateTimeout(api.ai.generateQuestions(resumeText, position, aiConfig));
      const first = result.questions.find((q) => !q.isDeleted);
      set({
        generating: false,
        questions: result.questions,
        activeNav: 'questions',
        activeQuestionId: first?.id ?? null,
      });
      commit(set, get);
      const secs = ((Date.now() - startTs) / 1000).toFixed(1);
      log(
        'success',
        `面试题生成成功：共 ${result.questions.length} 道（${result.categories.length} 个技能领域），耗时 ${secs} 秒`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const secs = Math.round((Date.now() - startTs) / 1000);
      set({ generating: false, generateError: msg });
      log('error', `面试题生成失败（${secs} 秒）：${msg}`);
    } finally {
      clearInterval(ticker);
    }
  },

  toggleKeyPoint: (questionId, keyPointId) => {
    const questions = get().questions.map((q) => {
      if (q.id !== questionId) return q;
      const keyPoints = q.keyPoints.map((kp) =>
        kp.id === keyPointId ? { ...kp, isChecked: !kp.isChecked } : kp
      );
      const updated = { ...q, keyPoints };
      return { ...updated, score: autoScore(updated) };
    });
    set({ questions });
    commit(set, get);
    const q = questions.find((x) => x.id === questionId);
    const kp = q?.keyPoints.find((x) => x.id === keyPointId);
    if (q && kp) {
      get().addLog(
        'info',
        `「${q.title}」${kp.isChecked ? '勾选' : '取消勾选'}要点「${kp.content.slice(0, 18)}${kp.content.length > 18 ? '…' : ''}」，本题 ${q.score}/${q.maxScore} 分`
      );
    }
  },

  setQuestionScore: (questionId, score) => {
    const questions = get().questions.map((q) =>
      q.id === questionId
        ? { ...q, score: Math.max(0, Math.min(q.maxScore, score)) }
        : q
    );
    set({ questions });
    commit(set, get);
    const q = questions.find((x) => x.id === questionId);
    if (q) {
      get().addLog('info', `「${q.title}」手动评分：${q.score}/${q.maxScore} 分`);
    }
  },

  markUnanswered: (questionId) => {
    const before = get().questions;
    const idx = before.findIndex((q) => q.id === questionId);
    if (idx < 0) return;
    // 未答出：清空要点勾选并记 0 分（视为已评分），随后跳到下一道未删除题目
    const questions = before.map((q) =>
      q.id === questionId
        ? { ...q, keyPoints: q.keyPoints.map((kp) => ({ ...kp, isChecked: false })), score: 0 }
        : q
    );
    const next = questions.slice(idx + 1).find((q) => !q.isDeleted);
    set({ questions, ...(next ? { activeQuestionId: next.id } : {}) });
    commit(set, get);
    const q = questions[idx];
    get().addLog(
      'warn',
      `「${q.title}」标记为未答出（0/${q.maxScore} 分）${next ? `，已跳转至「${next.title}」` : '，已是最后一题'}`
    );
  },

  deleteQuestion: (questionId) => {
    const before = get().questions;
    const deletedIndex = before.findIndex((q) => q.id === questionId);
    const questions = before.map((q) =>
      q.id === questionId ? { ...q, isDeleted: true, deletedAt: new Date().toISOString() } : q
    );
    const current = get().activeQuestionId;
    // 优先跳到被删题目之后的下一道未删除题目；后面没有了再往前找
    const next =
      questions.slice(deletedIndex + 1).find((q) => !q.isDeleted) ??
      questions
        .slice(0, deletedIndex)
        .reverse()
        .find((q) => !q.isDeleted);
    set({
      questions,
      activeQuestionId: current === questionId ? next?.id ?? null : current,
    });
    commit(set, get);
    const q = questions.find((x) => x.id === questionId);
    const remain = questions.filter((x) => !x.isDeleted);
    get().addLog(
      'warn',
      `已删除题目「${q?.title ?? questionId}」，剩余 ${remain.length} 题，总分已重算${next && current === questionId ? `，已跳转至「${next.title}」` : ''}`
    );
  },

  restoreQuestion: (questionId) => {
    const questions = get().questions.map((q) =>
      q.id === questionId ? { ...q, isDeleted: false, deletedAt: undefined } : q
    );
    set({ questions, activeQuestionId: questionId, activeNav: 'questions' });
    commit(set, get);
    const q = questions.find((x) => x.id === questionId);
    get().addLog('info', `已恢复题目「${q?.title ?? questionId}」`);
  },

  setAiConfig: (config) => set({ aiConfig: { ...get().aiConfig, ...config } }),

  loadSettings: async () => {
    const saved = await api.settings.get().catch(() => null);
    if (saved) {
      const preset = PROVIDER_PRESETS[saved.provider as AIProvider] ?? PROVIDER_PRESETS.deepseek;
      set({
        aiConfig: {
          provider: (saved.provider as AIProvider) ?? 'deepseek',
          apiKey: '',
          model: saved.model || preset.defaultModel,
          baseUrl: saved.baseUrl || preset.baseUrl,
        },
        hasSavedKey: saved.hasKey,
      });
    }
  },

  saveSettings: async (config) => {
    try {
      const r = await api.settings.save(config);
      if (r.ok) {
        set({ hasSavedKey: true, aiConfig: { ...config, apiKey: '' } });
        // 保存成功后自动恢复出题队列：重试失败卡片并继续排队中的任务
        get().addLog('info', 'AI 配置已保存，自动恢复出题队列');
        get().retryAllFailed();
        void get().pumpQueue();
      }
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('error', `保存设置失败：${msg}`);
      return { ok: false, message: msg };
    }
  },

  testSettings: async (config) => {
    try {
      return await api.settings.test(config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  exportReport: async () => {
    const { questions, candidateName, position } = get();
    const active = questions.filter((q) => !q.isDeleted);
    const totalScore = active.reduce((s, q) => s + (q.score ?? 0), 0);
    const totalMaxScore = active.reduce((s, q) => s + q.maxScore, 0);
    const originalMaxScore = questions.reduce((s, q) => s + q.maxScore, 0);
    const scoreRate = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

    set({ exporting: true });
    get().addLog('info', `正在生成 PDF 报告（总分 ${totalScore}/${totalMaxScore}）…`);
    try {
      const result = await api.report.exportPDF({
        candidateName,
        position,
        interviewDate: todayString(),
        questions,
        totalScore,
        totalMaxScore,
        originalMaxScore,
        scoreRate,
      });
      if (result.ok) {
        get().addLog('success', `PDF 报告已导出：${result.path ?? '保存成功'}`);
      } else if (result.message === '已取消保存') {
        get().addLog('info', '已取消导出 PDF');
      } else if (result.message) {
        get().addLog('error', `PDF 导出失败：${result.message}`);
        alert(`导出失败：${result.message}`);
      }
    } finally {
      set({ exporting: false });
    }
  },

  previewReport: async () => {
    const { questions, candidateName, position } = get();
    const active = questions.filter((q) => !q.isDeleted);
    const totalScore = active.reduce((s, q) => s + (q.score ?? 0), 0);
    const totalMaxScore = active.reduce((s, q) => s + q.maxScore, 0);
    const originalMaxScore = questions.reduce((s, q) => s + q.maxScore, 0);
    const scoreRate = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    get().addLog('info', '正在生成报告预览…');
    try {
      const html = await api.report.preview({
        candidateName,
        position,
        interviewDate: todayString(),
        questions,
        totalScore,
        totalMaxScore,
        originalMaxScore,
        scoreRate,
      });
      get().setReportPreviewHtml(html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('error', `报告预览失败：${msg}`);
    }
  },

  resetInterview: async () => {
    await api.session.clear().catch(() => {});
    set({
      candidates: [],
      activeCandidateId: null,
      view: 'list',
      resumeFile: null,
      resumeText: '',
      resumeHtml: null,
      resumeFormat: null,
      resumeError: null,
      position: '',
      candidateName: '',
      activeNav: 'resume',
      activeQuestionId: null,
      questions: [],
      generateError: null,
    });
    get().addLog('info', '已清空全部候选人数据');
  },

  // ---- 多候选人 ----

  openCandidate: (id) => {
    const c = get().candidates.find((x) => x.id === id);
    if (!c) return;
    set({
      activeCandidateId: id,
      view: 'workbench',
      resumeFile: { path: c.resume.path, name: c.resume.name },
      resumeText: c.resume.text,
      resumeHtml: c.resume.html,
      resumeFormat: c.resume.format,
      resumeError: null,
      generateError: null,
      position: c.position,
      candidateName: c.name,
      questions: c.questions,
      activeNav: c.questions.length ? 'questions' : 'resume',
      activeQuestionId: c.questions.find((q) => !q.isDeleted)?.id ?? null,
    });
    persist({ candidates: get().candidates, activeCandidateId: id });
  },

  backToList: () => {
    const candidates = syncToCandidate(get);
    set({ view: 'list', candidates });
    persist({ candidates, activeCandidateId: get().activeCandidateId });
  },

  startBatchUpload: async () => {
    const log = get().addLog;
    const files = await api.resume.uploadMany();
    if (!files.length) {
      log('info', '已取消选择文件');
      return;
    }
    const supported = files.filter((f) => /\.(pdf|docx)$/i.test(f.name));
    const skipped = files.length - supported.length;
    if (skipped > 0) {
      log('warn', `已跳过 ${skipped} 个不支持的文件（仅支持 PDF/DOCX，.doc 请先转 .docx）`);
    }
    if (!supported.length) return;
    log('info', `已选择 ${supported.length} 份简历，等待确认候选人信息…`);
    set({
      uploadConfirm: supported.map((f) => ({
        path: f.path,
        name: f.name,
        guessedName: guessNameFromFile(f.name),
        position: '',
      })),
    });
  },

  cancelBatchUpload: () => set({ uploadConfirm: null }),

  confirmBatchUpload: async (rows) => {
    const log = get().addLog;
    set({ uploadConfirm: null });
    const now = new Date().toISOString();
    const news: Candidate[] = [];
    for (const row of rows) {
      try {
        log('info', `正在解析简历：${row.name}…`);
        const result = await api.resume.extractText(row.path);
        news.push({
          id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: row.guessedName.trim() || guessNameFromFile(row.name),
          position: row.position.trim(),
          resume: { name: row.name, path: row.path, text: result.text, html: result.html, format: result.format },
          questions: [],
          status: row.position.trim() ? 'queued' : 'pending_position',
          createdAt: now,
          updatedAt: now,
        });
        log('success', `简历解析成功：${row.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('error', `简历解析失败：${row.name}：${msg}`);
        // 解析失败也生成卡片（标红、可删除/重试），resume.text 为空，重试时先重新解析
        news.push({
          id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: row.guessedName.trim() || guessNameFromFile(row.name),
          position: row.position.trim(),
          resume: { name: row.name, path: row.path, text: '', html: null, format: 'pdf' },
          questions: [],
          status: 'failed',
          genError: `简历解析失败：${msg}`,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    const candidates = [...get().candidates, ...news];
    set({ candidates });
    persist({ candidates, activeCandidateId: get().activeCandidateId });
    void get().pumpQueue();
  },

  updateCandidateMeta: (id, patch) => {
    const candidates = get().candidates.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch, updatedAt: new Date().toISOString() };
      // 补填岗位后自动入队
      if (next.status === 'pending_position' && next.position.trim()) next.status = 'queued';
      return next;
    });
    set({ candidates });
    persist({ candidates, activeCandidateId: get().activeCandidateId });
    void get().pumpQueue();
  },

  deleteCandidate: (id) => {
    const c = get().candidates.find((x) => x.id === id);
    const candidates = get().candidates.filter((x) => x.id !== id);
    set({ candidates });
    persist({ candidates, activeCandidateId: get().activeCandidateId });
    get().addLog('info', `已删除候选人「${c?.name ?? id}」`);
  },

  retryCandidate: async (id) => {
    const target = get().candidates.find((c) => c.id === id);
    if (!target || target.status !== 'failed') return;
    // 解析失败的卡片（resume.text 为空）：先重新解析简历，成功后再入队
    if (!target.resume.text) {
      try {
        const result = await api.resume.extractText(target.resume.path);
        const candidates = get().candidates.map((c) =>
          c.id === id
            ? {
                ...c,
                resume: { ...c.resume, text: result.text, html: result.html, format: result.format },
                status: 'queued' as const,
                genError: undefined,
                updatedAt: new Date().toISOString(),
              }
            : c
        );
        set({ candidates });
        persist({ candidates, activeCandidateId: get().activeCandidateId });
        get().addLog('success', `「${target.name}」简历重新解析成功，已加入出题队列`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const candidates = get().candidates.map((c) =>
          c.id === id ? { ...c, genError: `简历解析失败：${msg}`, updatedAt: new Date().toISOString() } : c
        );
        set({ candidates });
        persist({ candidates, activeCandidateId: get().activeCandidateId });
        get().addLog('error', `「${target.name}」重新解析仍失败：${msg}`);
        return;
      }
    } else {
      const candidates = get().candidates.map((c) =>
        c.id === id ? { ...c, status: 'queued' as const, genError: undefined } : c
      );
      set({ candidates });
      persist({ candidates, activeCandidateId: get().activeCandidateId });
    }
    void get().pumpQueue();
  },

  retryAllFailed: () => {
    // 逐个走 retryCandidate（解析失败的卡片需要先重新解析简历）
    for (const c of get().candidates.filter((x) => x.status === 'failed')) {
      void get().retryCandidate(c.id);
    }
  },

  pumpQueue: async () => {
    const { candidates, aiConfig, hasSavedKey } = get();
    if (candidates.some((c) => c.status === 'generating')) return; // 全局串行
    const next = nextToGenerate(candidates);
    if (!next) return;
    if (!aiConfig.apiKey && !hasSavedKey) {
      get().addLog('error', '未配置 API Key，出题队列已暂停（设置后点失败卡片重试）');
      return;
    }
    const log = get().addLog;
    const setStatus = (id: string, status: Candidate['status'], genError?: string) => {
      const list = get().candidates.map((c) =>
        c.id === id
          ? {
              ...c,
              status,
              genError,
              ...(status === 'generating' ? { genStartedAt: new Date().toISOString() } : {}),
              updatedAt: new Date().toISOString(),
            }
          : c
      );
      set({ candidates: list });
      persist({ candidates: list, activeCandidateId: get().activeCandidateId });
    };
    setStatus(next.id, 'generating');
    log('info', `开始为「${next.name}」出题（岗位：${next.position}，模型：${aiConfig.model}）…`, next.id);
    const startTs = Date.now();
    const ticker = setInterval(() => {
      log('info', `正在为「${next.name}」出题…已等待 ${Math.round((Date.now() - startTs) / 1000)} 秒`, next.id);
    }, 5000);
    try {
      const result = await withGenerateTimeout(api.ai.generateQuestions(next.resume.text, next.position, aiConfig));
      const list = get().candidates.map((c) =>
        c.id === next.id
          ? { ...c, questions: result.questions, status: 'ready' as const, updatedAt: new Date().toISOString() }
          : c
      );
      set({ candidates: list });
      persist({ candidates: list, activeCandidateId: get().activeCandidateId });
      log('success', `「${next.name}」出题完成：${result.questions.length} 道，耗时 ${((Date.now() - startTs) / 1000).toFixed(1)} 秒`, next.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(next.id, 'failed', msg);
      log('error', `「${next.name}」出题失败：${msg}`, next.id);
    } finally {
      clearInterval(ticker);
    }
    void get().pumpQueue(); // 递归消费队列
  },

  exportCandidateReport: async (id) => {
    const c = get().candidates.find((x) => x.id === id);
    if (!c || c.questions.length === 0) return;
    const active = c.questions.filter((q) => !q.isDeleted);
    const unscored = active.filter((q) => q.score === null).length;
    if (unscored > 0 && !confirm(`「${c.name}」还有 ${unscored} 道题目未评分，确认要导出吗？`)) return;
    const totalScore = active.reduce((s, q) => s + (q.score ?? 0), 0);
    const totalMaxScore = active.reduce((s, q) => s + q.maxScore, 0);
    const originalMaxScore = c.questions.reduce((s, q) => s + q.maxScore, 0);
    const scoreRate = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    get().addLog('info', `正在导出「${c.name}」的 PDF 报告（${totalScore}/${totalMaxScore}）…`);
    const result = await api.report.exportPDF({
      candidateName: c.name,
      position: c.position,
      interviewDate: todayString(),
      questions: c.questions,
      totalScore,
      totalMaxScore,
      originalMaxScore,
      scoreRate,
    });
    if (result.ok) {
      get().addLog('success', `「${c.name}」PDF 报告已导出：${result.path ?? '保存成功'}`);
    } else if (result.message && result.message !== '已取消保存') {
      get().addLog('error', `「${c.name}」PDF 导出失败：${result.message}`);
    }
  },

  previewCandidateReport: async (id) => {
    const c = get().candidates.find((x) => x.id === id);
    if (!c || c.questions.length === 0) return;
    const active = c.questions.filter((q) => !q.isDeleted);
    const totalScore = active.reduce((s, q) => s + (q.score ?? 0), 0);
    const totalMaxScore = active.reduce((s, q) => s + q.maxScore, 0);
    const originalMaxScore = c.questions.reduce((s, q) => s + q.maxScore, 0);
    const scoreRate = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    get().addLog('info', `正在生成「${c.name}」报告预览…`);
    try {
      const html = await api.report.preview({
        candidateName: c.name,
        position: c.position,
        interviewDate: todayString(),
        questions: c.questions,
        totalScore,
        totalMaxScore,
        originalMaxScore,
        scoreRate,
      });
      get().setReportPreviewHtml(html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().addLog('error', `「${c.name}」报告预览失败：${msg}`);
    }
  },
}));

// 选择器：汇总数据
export function useSummary() {
  const questions = useInterviewStore((s) => s.questions);
  const active = questions.filter((q) => !q.isDeleted);
  const scored = active.filter((q) => q.score !== null);
  return {
    active,
    totalScore: active.reduce((s, q) => s + (q.score ?? 0), 0),
    totalMaxScore: active.reduce((s, q) => s + q.maxScore, 0),
    originalMaxScore: questions.reduce((s, q) => s + q.maxScore, 0),
    scoredCount: scored.length,
    unscoredCount: active.length - scored.length,
  };
}
