import { useEffect, useRef } from 'react';
import { useInterviewStore } from '@/stores/useInterviewStore';

const LEVEL_STYLE: Record<string, string> = {
  info: 'text-gray-500',
  success: 'text-emerald-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
};

const LEVEL_TAG_STYLE: Record<string, string> = {
  info: 'bg-gray-100 text-gray-400',
  success: 'bg-emerald-50 text-emerald-600',
  warn: 'bg-amber-50 text-amber-600',
  error: 'bg-red-50 text-red-600',
};

const LEVEL_TAG: Record<string, string> = {
  info: 'INFO',
  success: ' OK ',
  warn: 'WARN',
  error: 'ERR ',
};

/** 运行日志面板：占窗口半高，贴左栏底部，新日志从下往上滚 */
export function LogPanel() {
  const logs = useInterviewStore((s) => s.logs);
  const clearLogs = useInterviewStore((s) => s.clearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <div className="flex h-[50vh] shrink-0 flex-col border-t border-gray-200 bg-gray-50">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          运行日志
        </span>
        {logs.length > 0 && (
          <button
            onClick={clearLogs}
            className="text-[10px] text-gray-400 transition-colors hover:text-gray-600"
          >
            清空
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-[1.7]"
      >
        {logs.length === 0 ? (
          <div className="text-gray-300">暂无日志</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="mb-1 break-all">
              <div className="flex items-center gap-1.5 leading-4">
                <span className="text-[10px] text-gray-300">{log.time}</span>
                <span
                  className={`rounded px-1 text-[9px] leading-3 ${LEVEL_TAG_STYLE[log.level]}`}
                >
                  {LEVEL_TAG[log.level]}
                </span>
              </div>
              <div className={LEVEL_STYLE[log.level]}>{log.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
