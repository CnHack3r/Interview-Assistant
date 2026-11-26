import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faCloudArrowUp, faRotateRight, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore } from '@/stores/useInterviewStore';
import { sortCandidates } from '@/lib/candidate';
import { StatusBar } from '@/components/layout/StatusBar';
import { CandidateCard } from './CandidateCard';

/** 候选人列表页（应用落地页）：活跃区卡片网格 + 已完成折叠区 */
export function CandidateListView() {
  const candidates = useInterviewStore((s) => s.candidates);
  const startBatchUpload = useInterviewStore((s) => s.startBatchUpload);
  const retryAllFailed = useInterviewStore((s) => s.retryAllFailed);
  const hasSavedKey = useInterviewStore((s) => s.hasSavedKey);
  const setSettingsOpen = useInterviewStore((s) => s.setSettingsOpen);
  const [doneOpen, setDoneOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const sorted = sortCandidates(candidates);
  const active = sorted.filter((c) => c.status !== 'done');
  const done = sorted.filter((c) => c.status === 'done');
  const failedCount = candidates.filter((c) => c.status === 'failed').length;
  const pendingGen = candidates.some((c) => c.status === 'queued' || c.status === 'failed' || c.status === 'generating');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
    <div
      className="relative min-h-0 flex-1 overflow-y-auto p-5"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); void startBatchUpload(); }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-blue-50/80 text-sm text-primary">
          松开以选择简历文件
        </div>
      )}

      {!hasSavedKey && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <span className="flex items-center gap-2">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            {pendingGen
              ? '未配置 AI 模型，出题队列已暂停。配置后将自动继续出题。'
              : '尚未配置 AI 模型，上传简历前请先完成配置。'}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            去配置
          </button>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">候选人列表（{candidates.length}）</h2>
        <div className="flex items-center gap-2">
          {failedCount > 0 && (
            <button
              onClick={retryAllFailed}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              <FontAwesomeIcon icon={faRotateRight} className="mr-1.5" />
              全部重试（{failedCount}）
            </button>
          )}
          <button
            onClick={() => void startBatchUpload()}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            <FontAwesomeIcon icon={faCloudArrowUp} className="mr-1.5" />
            批量上传简历
          </button>
        </div>
      </div>

      {candidates.length === 0 ? (
        <button
          onClick={() => void startBatchUpload()}
          className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary hover:text-primary"
        >
          <FontAwesomeIcon icon={faCloudArrowUp} className="text-3xl" />
          <span className="text-sm">点击或拖拽上传简历（支持 PDF / DOCX 多选），AI 将自动排队出题</span>
        </button>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((c) => <CandidateCard key={c.id} candidate={c} />)}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setDoneOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <FontAwesomeIcon icon={faChevronDown} className={`transition-transform ${doneOpen ? '' : '-rotate-90'}`} />
                已完成（{done.length}）
              </button>
              {doneOpen && (
                <div className="mt-3 grid grid-cols-1 gap-4 opacity-80 md:grid-cols-2 xl:grid-cols-3">
                  {done.map((c) => <CandidateCard key={c.id} candidate={c} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
    <StatusBar />
    </div>
  );
}
