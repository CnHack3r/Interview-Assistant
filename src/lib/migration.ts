import type { Candidate, PersistedState } from '@/types';
import { deriveWorkbenchStatus, guessNameFromFile } from './candidate';

/** 旧版单会话 → 候选人卡片（status 按评分数据推断） */
export function migrateLegacyState(saved: PersistedState): Candidate {
  const candidate: Candidate = {
    id: `migrated-${Date.now()}`,
    name: saved.candidateName || guessNameFromFile(saved.resumeName ?? '未命名'),
    position: saved.position,
    resume: {
      name: saved.resumeName ?? '',
      path: saved.resumePath ?? '',
      text: saved.resumeText,
      html: saved.resumeHtml,
      format: saved.resumeFormat ?? 'pdf',
    },
    questions: saved.questions,
    status: 'ready',
    createdAt: saved.savedAt,
    updatedAt: saved.savedAt,
  };
  candidate.status = candidate.questions.length > 0 ? deriveWorkbenchStatus(candidate) : 'ready';
  return candidate;
}
