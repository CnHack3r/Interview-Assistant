// 面试题 / 评分 / 全局状态相关类型定义（主进程与渲染进程共享）

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'basic' | 'comprehensive';
export type ResumeFormat = 'pdf' | 'docx';
export type AIProvider = 'deepseek' | 'doubao' | 'openai' | 'kimi';

export interface KeyPoint {
  id: string;
  content: string; // 要点描述
  score: number; // 该要点分值
  isChecked: boolean; // 是否勾选
}

export interface InterviewQuestion {
  id: string;
  category: string; // 技能领域分类
  title: string;
  difficulty: Difficulty;
  maxScore: number;
  type: QuestionType;
  questionBody: string; // Markdown 题目正文
  referenceAnswer: string; // Markdown 参考答案
  keyPoints: KeyPoint[]; // 基础题有，综合题为空
  score: number | null; // null = 未评
  isDeleted: boolean;
  deletedAt?: string;
}

export interface InterviewSet {
  categories: string[];
  questions: InterviewQuestion[];
}

export interface AIConfig {
  provider: AIProvider;
  apiKey: string; // 仅渲染进程临时持有，持久化由主进程加密负责
  model: string;
  baseUrl: string;
}

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  defaultModel: string;
  modelHint: string;
}

export interface ReportData {
  candidateName: string;
  position: string;
  interviewDate: string;
  questions: InterviewQuestion[];
  totalScore: number;
  totalMaxScore: number;
  originalMaxScore: number;
  scoreRate: number;
}

export interface PersistedState {
  resumeName: string | null;
  resumePath: string | null;
  resumeText: string;
  resumeHtml: string | null;
  resumeFormat: ResumeFormat | null;
  position: string;
  candidateName: string;
  questions: InterviewQuestion[];
  savedAt: string;
}

export interface ExtractResult {
  text: string;
  html: string | null; // docx 预览用 HTML；pdf 为 null
  format: ResumeFormat;
}

export interface FilePickResult {
  path: string;
  name: string;
}

export interface SaveResult {
  ok: boolean;
  message?: string;
}

// preload 暴露给渲染进程的 API
export interface WindowAPI {
  resume: {
    upload: () => Promise<FilePickResult | null>;
    uploadMany: () => Promise<FilePickResult[]>;
    extractText: (filePath: string) => Promise<ExtractResult>;
    readFile: (filePath: string) => Promise<ArrayBuffer>;
  };
  ai: {
    generateQuestions: (
      resumeText: string,
      position: string,
      config: AIConfig
    ) => Promise<InterviewSet>;
  };
  settings: {
    get: () => Promise<Omit<AIConfig, 'apiKey'> & { hasKey: boolean; maskedKey: string }>;
    save: (config: AIConfig) => Promise<SaveResult>;
    test: (config: AIConfig) => Promise<SaveResult>;
    listModels: (config: AIConfig) => Promise<SaveResult & { models: string[] }>;
    ping: (config: AIConfig) => Promise<SaveResult & { latencyMs?: number }>;
  };
  report: {
    exportPDF: (reportData: ReportData) => Promise<SaveResult & { path?: string }>;
    preview: (reportData: ReportData) => Promise<string>;
  };
  session: {
    load: () => Promise<PersistedState | CandidatesFile | null>;
    save: (state: PersistedState | CandidatesFile) => Promise<void>;
    clear: () => Promise<void>;
  };
}

export type CandidateStatus =
  | 'pending_position'
  | 'queued'
  | 'generating'
  | 'failed'
  | 'ready'
  | 'interviewing'
  | 'done';

export interface Candidate {
  id: string;
  name: string;
  position: string;
  resume: { name: string; path: string; text: string; html: string | null; format: ResumeFormat };
  questions: InterviewQuestion[];
  status: CandidateStatus;
  genError?: string;
  /** 出题开始时间（ISO），用于展示生成进度条与耗时 */
  genStartedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CandidatesFile {
  candidates: Candidate[];
  activeCandidateId: string | null;
  savedAt: string;
}
