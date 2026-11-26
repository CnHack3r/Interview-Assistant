import type { Candidate } from '@/types';

/** 从文件名猜测候选人姓名：去扩展名、去「简历/CV/个人」等修饰词与分隔符 */
export function guessNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  const noWords = base.replace(/个人|求职|应聘|最新版|最终版|简历|CV|cv/g, '').trim();
  // 仅对中文名去掉分隔符（张三-简历 → 张三）；英文文件名保留原样
  const cleaned = /[\u4e00-\u9fff]/.test(noWords)
    ? noWords.replace(/[-_（()）\[\]【】\s]+/g, '').trim()
    : noWords;
  return cleaned || base;
}

/** 进度：已评题数 / 未删除题总数（score 为 0 也算已评） */
export function deriveProgress(c: Candidate): { scored: number; total: number } {
  const active = c.questions.filter((q) => !q.isDeleted);
  return { scored: active.filter((q) => q.score !== null).length, total: active.length };
}

/** 得分汇总（仅 done 状态在 UI 展示） */
export function deriveScore(c: Candidate): { totalScore: number; totalMaxScore: number; rate: number } {
  const active = c.questions.filter((q) => !q.isDeleted);
  const totalScore = active.reduce((s, q) => s + (q.score ?? 0), 0);
  const totalMaxScore = active.reduce((s, q) => s + q.maxScore, 0);
  const rate = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 1000) / 10 : 0;
  return { totalScore, totalMaxScore, rate };
}

/** 工作台评分数据 → 状态（仅 ready/interviewing/done 之间自动流转） */
export function deriveWorkbenchStatus(c: Candidate): 'ready' | 'interviewing' | 'done' {
  const { scored, total } = deriveProgress(c);
  if (total > 0 && scored === total) return 'done';
  if (scored > 0) return 'interviewing';
  return 'ready';
}

const ORDER: Record<Candidate['status'], number> = {
  interviewing: 0, ready: 1, queued: 2, generating: 2, failed: 3, pending_position: 4, done: 5,
};

/** 列表排序：面试中最前，已完成最后（返回新数组，同状态保持原先后顺序） */
export function sortCandidates(list: Candidate[]): Candidate[] {
  return [...list].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
}
