import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear } from '@fortawesome/free-solid-svg-icons';
import { PROVIDER_PRESETS, useInterviewStore } from '@/stores/useInterviewStore';

/** 信号条：模拟信号强度的 4 根柱子 */
function SignalBars({ status }: { status: 'unknown' | 'probing' | 'ok' | 'fail' }) {
  const lit =
    status === 'ok' ? 4 : status === 'probing' ? 2 : status === 'fail' ? 1 : 0;
  const color =
    status === 'ok'
      ? 'bg-emerald-500'
      : status === 'probing'
        ? 'bg-amber-400'
        : status === 'fail'
          ? 'bg-red-500'
          : 'bg-gray-300';
  return (
    <span className="flex items-end gap-[2px]" aria-hidden>
      {[3, 5, 7, 9].map((h, i) => (
        <span
          key={i}
          style={{ height: `${h}px` }}
          className={`w-[3px] rounded-sm transition-colors ${i < lit ? color : 'bg-gray-200'}`}
        />
      ))}
    </span>
  );
}

/** 左下角状态栏：AI 连通性信号（10 秒探测一次）+ 设置入口（图标） */
export function StatusBar() {
  const aiConfig = useInterviewStore((s) => s.aiConfig);
  const hasSavedKey = useInterviewStore((s) => s.hasSavedKey);
  const aiStatus = useInterviewStore((s) => s.aiStatus);
  const aiLatency = useInterviewStore((s) => s.aiLatency);
  const probeAi = useInterviewStore((s) => s.probeAi);
  const setSettingsOpen = useInterviewStore((s) => s.setSettingsOpen);

  // 每 10 秒探测一次连通性
  useEffect(() => {
    void probeAi();
    const timer = setInterval(() => void probeAi(), 10_000);
    return () => clearInterval(timer);
  }, [probeAi, aiConfig.provider, aiConfig.model, aiConfig.baseUrl, hasSavedKey]);

  const preset = PROVIDER_PRESETS[aiConfig.provider];
  const providerName = preset.label.split('（')[0];

  const statusText = !hasSavedKey
    ? '未配置 API Key'
    : aiStatus === 'probing'
      ? '探测中…'
      : aiStatus === 'ok'
        ? `${providerName} · ${aiLatency !== null ? `${aiLatency}ms` : '已连接'}`
        : aiStatus === 'fail'
          ? `${providerName} · 连接失败`
          : `${providerName}`;

  const statusColor =
    aiStatus === 'ok'
      ? 'text-emerald-600'
      : aiStatus === 'fail'
        ? 'text-red-500'
        : aiStatus === 'probing'
          ? 'text-amber-500'
          : 'text-gray-400';

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-t border-gray-200 bg-white px-2.5">
      <button
        onClick={() => void probeAi()}
        title={`AI 连通性：${statusText}（每 10 秒自动探测，点击立即重测）`}
        className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-gray-50"
      >
        <SignalBars status={hasSavedKey ? aiStatus : 'unknown'} />
        <span className={`truncate text-[11px] ${statusColor}`}>{statusText}</span>
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        title="设置"
        className="shrink-0 rounded-md p-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <FontAwesomeIcon icon={faGear} />
      </button>
    </div>
  );
}
