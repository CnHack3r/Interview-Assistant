import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import { PROVIDER_PRESETS, useInterviewStore } from '@/stores/useInterviewStore';
import { api } from '@/lib/api';
import type { AIProvider } from '@/types';

/** 设置弹窗：AI 服务商 / 模型（在线拉取下拉选择）/ Base URL / API Key（加密存储于本地配置文件） */
export function SettingsDialog() {
  const open = useInterviewStore((s) => s.settingsOpen);
  const setOpen = useInterviewStore((s) => s.setSettingsOpen);
  const aiConfig = useInterviewStore((s) => s.aiConfig);
  const hasSavedKey = useInterviewStore((s) => s.hasSavedKey);
  const saveSettings = useInterviewStore((s) => s.saveSettings);
  const testSettings = useInterviewStore((s) => s.testSettings);

  const [draft, setDraft] = useState(aiConfig);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  if (!open) return null;

  const preset = PROVIDER_PRESETS[draft.provider];

  const changeProvider = (provider: AIProvider) => {
    const p = PROVIDER_PRESETS[provider];
    setDraft({ ...draft, provider, baseUrl: p.baseUrl, model: p.defaultModel });
    setModels([]);
    setStatus(null);
  };

/** 各服务商推荐置顶的新模型（网关 /models 返回过时别名时也能选到） */
const RECOMMENDED_MODELS: Partial<Record<AIProvider, string[]>> = {
  // 截至 2026-08：deepseek-chat / deepseek-reasoner 已于 7 月 24 日退役，
  // 新接入统一使用 V4 系列
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
};

  const handleFetchModels = async () => {
    setLoadingModels(true);
    setStatus(null);
    try {
      const r = await api.settings.listModels(draft);
      if (r.ok) {
        // 推荐模型置顶合并（去重），保证新模型始终可选
        const recommended = RECOMMENDED_MODELS[draft.provider] ?? [];
        const merged = [...recommended, ...r.models.filter((m) => !recommended.includes(m))];
        const staleCount = merged.length - r.models.length;
        setModels(merged);
        setStatus({
          ok: true,
          text: `获取到 ${r.models.length} 个可用模型${staleCount > 0 ? `，已置顶 ${staleCount} 个推荐新模型` : ''}，请从下拉列表选择`,
        });
        // 当前模型不在列表中时，自动选中第一个（推荐新模型）
        if (!merged.includes(draft.model) && merged.length > 0) {
          setDraft((d) => ({ ...d, model: merged[0] }));
        }
      } else {
        setModels([]);
        setStatus({ ok: false, text: r.message ?? '获取模型列表失败' });
      }
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus(null);
    const r = await saveSettings(draft);
    setBusy(false);
    setStatus(
      r.ok
        ? { ok: true, text: '已保存。API Key 已加密存储在本地配置文件中。' }
        : { ok: false, text: r.message ?? '保存失败' }
    );
    if (r.ok) setTimeout(() => setOpen(false), 800);
  };

  const handleTest = async () => {
    setBusy(true);
    setStatus(null);
    const r = await testSettings(draft);
    setBusy(false);
    setStatus(
      r.ok
        ? { ok: true, text: r.message ?? '连接成功' }
        : { ok: false, text: r.message ?? '连接失败' }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[460px] rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold">AI 服务设置</h2>

        <label className="mb-1 block text-xs font-medium text-gray-500">服务商</label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(Object.keys(PROVIDER_PRESETS) as AIProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => changeProvider(p)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                draft.provider === p
                  ? 'border-primary bg-primary-50 font-medium text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {PROVIDER_PRESETS[p].label}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500">API Key</label>
        <input
          type="password"
          value={draft.apiKey}
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
          placeholder={hasSavedKey ? '已保存（输入新 Key 以覆盖）' : '请输入 API Key'}
          className="mb-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <p className="mb-4 text-xs text-gray-400">
          <FontAwesomeIcon icon={faLock} className="mr-1" />
          API Key 使用系统安全加密（safeStorage）后存储在本地配置文件中，不会明文保存。
        </p>

        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-medium text-gray-500">模型</label>
          <button
            onClick={handleFetchModels}
            disabled={loadingModels}
            className="text-xs text-primary hover:underline disabled:text-gray-400"
          >
            {loadingModels ? '正在获取…' : models.length > 0 ? '⟳ 刷新模型列表' : '获取可用模型'}
          </button>
        </div>
        {models.length > 0 ? (
          <select
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            className="mb-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            {!models.includes(draft.model) && draft.model && (
              <option value={draft.model}>{draft.model}（当前）</option>
            )}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            placeholder={preset.modelHint}
            className="mb-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        )}
        <p className="mb-4 text-xs text-gray-400">
          {models.length > 0
            ? '从可用模型中选择；如使用自定义接入点（如豆包推理接入点 ID），可清空后改回手动输入'
            : '可点击右上角「获取可用模型」在线拉取列表后下拉选择'}
        </p>
        {models.length > 0 && (
          <button
            onClick={() => setModels([])}
            className="mb-4 -mt-2 block text-xs text-gray-400 hover:text-gray-600"
          >
            切换为手动输入
          </button>
        )}

        <label className="mb-1 block text-xs font-medium text-gray-500">API 地址（Base URL）</label>
        <input
          value={draft.baseUrl}
          onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />

        {status && (
          <div
            className={`mb-3 rounded-md px-3 py-2 text-sm ${
              status.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {status.text}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={handleTest}
            disabled={busy}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            测试连接
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:bg-gray-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
