import { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore, type LogEntry } from '@/stores/useInterviewStore';

const LEVEL_STYLE: Record<LogEntry['level'], string> = {
  info: 'text-gray-600',
  success: 'text-green-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
};

/** 出题日志弹窗：展示某候选人的出题详细进度（实时追加、自动滚动） */
export function GenLogDialog() {
  const candidateId = useInterviewStore((s) => s.genLogCandidateId);
  const closeGenLog = useInterviewStore((s) => s.closeGenLog);
  const logs = useInterviewStore((s) => s.logs);
  const candidates = useInterviewStore((s) => s.candidates);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length, candidateId]);

  if (!candidateId) return null;

  const candidate = candidates.find((c) => c.id === candidateId);
  const genLogs = logs.filter((l) => l.candidateId === candidateId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeGenLog}>
      <div
        className="flex max-h-[70vh] w-[520px] flex-col rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {candidate?.status === 'generating' && (
              <FontAwesomeIcon icon={faCircleNotch} spin className="text-emerald-500" />
            )}
            {candidate?.name ?? '候选人'} 出题进度
          </h2>
          <button onClick={closeGenLog} className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">
            ✕ 关闭
          </button>
        </div>

        <div
          ref={scrollRef}
          className="min-h-[240px] flex-1 overflow-y-auto rounded-lg bg-gray-50 p-3 font-mono text-xs leading-6"
        >
          {genLogs.length === 0 ? (
            <div className="py-10 text-center text-gray-400">暂无日志</div>
          ) : (
            genLogs.map((l) => (
              <div key={l.id} className={LEVEL_STYLE[l.level]}>
                <span className="text-gray-400">[{l.time}]</span> {l.message}
              </div>
            ))
          )}
          {candidate?.status === 'generating' && (
            <div className="mt-2 flex items-center gap-2 text-emerald-600">
              <FontAwesomeIcon icon={faCircleNotch} spin />
              出题进行中，请稍候…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
