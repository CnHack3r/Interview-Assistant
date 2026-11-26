import type { Candidate } from '@/types';

/** 启动恢复：上次中断的 generating 降级为 queued 重新排队 */
export function downgradeGenerating(candidates: Candidate[]): Candidate[] {
  return candidates.map((c) =>
    c.status === 'generating' ? { ...c, status: 'queued' as const, genStartedAt: undefined } : c
  );
}

/** 取队首：第一个 queued 且岗位已填的候选人 */
export function nextToGenerate(candidates: Candidate[]): Candidate | undefined {
  return candidates.find((c) => c.status === 'queued' && c.position.trim().length > 0);
}
