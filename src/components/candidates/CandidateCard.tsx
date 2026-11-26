import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck, faCircleExclamation, faCircleNotch, faClock,
  faEye, faFilePdf, faHourglassHalf, faPenToSquare, faPlay, faRotateRight, faTrashCan,
} from '@fortawesome/free-solid-svg-icons';
import type { Candidate, CandidateStatus } from '@/types';
import { deriveProgress, deriveScore } from '@/lib/candidate';
import { useInterviewStore } from '@/stores/useInterviewStore';

const STATUS_META: Record<CandidateStatus, { label: string; className: string; icon: typeof faClock }> = {
  pending_position: { label: '待填岗位', className: 'bg-gray-100 text-gray-600', icon: faPenToSquare },
  queued: { label: '排队中', className: 'bg-blue-50 text-blue-600', icon: faClock },
  generating: { label: '出题中', className: 'bg-blue-100 text-blue-700', icon: faCircleNotch },
  failed: { label: '出题失败', className: 'bg-red-50 text-red-600', icon: faCircleExclamation },
  ready: { label: '待面试', className: 'bg-emerald-50 text-emerald-700', icon: faHourglassHalf },
  interviewing: { label: '面试中', className: 'bg-amber-50 text-amber-700', icon: faPlay },
  done: { label: '已完成', className: 'bg-gray-100 text-gray-500', icon: faCircleCheck },
};

export function CandidateCard({ candidate: c }: { candidate: Candidate }) {
  const openCandidate = useInterviewStore((s) => s.openCandidate);
  const deleteCandidate = useInterviewStore((s) => s.deleteCandidate);
  const retryCandidate = useInterviewStore((s) => s.retryCandidate);
  const updateCandidateMeta = useInterviewStore((s) => s.updateCandidateMeta);
  const exportCandidateReport = useInterviewStore((s) => s.exportCandidateReport);
  const previewCandidateReport = useInterviewStore((s) => s.previewCandidateReport);
  const openGenLog = useInterviewStore((s) => s.openGenLog);

  const [elapsed, setElapsed] = useState(0);

  // 出题中：每秒刷新耗时，驱动进度条
  useEffect(() => {
    if (c.status !== 'generating') return;
    const started = c.genStartedAt ? new Date(c.genStartedAt).getTime() : Date.now();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [c.status, c.genStartedAt]);

  const meta = STATUS_META[c.status];
  const { scored, total } = deriveProgress(c);
  const score = c.status === 'done' ? deriveScore(c) : null;
  const canInterview = c.status === 'ready' || c.status === 'interviewing' || c.status === 'done';
  const generating = c.status === 'generating';
  // 生成进度无真实字节进度，用时间估算到 90% 后保持，配合炫光扫过
  const progressPct = generating ? Math.min(90, Math.round((elapsed / 30) * 90)) : 0;

  return (
    <div
      onClick={generating ? () => openGenLog(c.id) : undefined}
      className={`flex flex-col rounded-lg border bg-white p-4 shadow-sm transition-shadow ${
        generating
          ? 'cursor-pointer border-emerald-300 ring-1 ring-emerald-100 hover:shadow-md'
          : 'border-gray-200'
      }`}
      title={generating ? '点击查看详细出题日志' : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={c.name}>{c.name}</div>
          {c.status === 'pending_position' ? (
            <input
              defaultValue={c.position}
              placeholder="点击填写面试岗位"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => updateCandidateMeta(c.id, { position: e.target.value })}
              className="mt-0.5 w-full rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 focus:border-primary focus:outline-none"
            />
          ) : (
            <div className="mt-0.5 truncate text-xs text-gray-500" title={c.position}>{c.position || '—'}</div>
          )}
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${meta.className}`}>
          <FontAwesomeIcon icon={meta.icon} className={c.status === 'generating' ? 'animate-spin' : ''} />
          {meta.label}
        </span>
      </div>

      {c.status === 'failed' && (
        <div className="mt-2 truncate text-xs text-red-500" title={c.genError}>{c.genError}</div>
      )}

      {/* 出题进度条（绿色 + 炫光） */}
      {generating && (
        <div className="mt-3">
          <div className="flex justify-between text-xs">
            <span className="text-emerald-600">正在生成面试题…</span>
            <span className="text-gray-400">{elapsed} 秒</span>
          </div>
          <div className="gen-progress-glow mt-1.5 h-2 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openGenLog(c.id);
            }}
            className="mt-1.5 text-xs text-emerald-600 hover:underline"
          >
            查看详细出题日志 →
          </button>
        </div>
      )}

      {total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400">
            <span>已评 {scored}/{total} 题</span>
            {/* 面试进行中不显示得分，避免影响打分心态；完成后才亮分 */}
            {score && <span className="font-medium text-gray-700">{score.totalScore}/{score.totalMaxScore}（{score.rate}%）</span>}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${total ? (scored / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
        {canInterview && (
          <button
            onClick={() => openCandidate(c.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium text-white hover:opacity-90 ${
              c.status === 'done' ? 'bg-gray-600' : 'bg-primary hover:bg-primary-700'
            }`}
          >
            {c.status === 'ready' ? '开始面试' : c.status === 'done' ? '查看' : '继续面试'}
          </button>
        )}
        {c.status === 'failed' && (
          <button
            onClick={() => void retryCandidate(c.id)}
            className="flex-1 rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            <FontAwesomeIcon icon={faRotateRight} className="mr-1" />重试出题
          </button>
        )}
        {c.questions.length > 0 && (
          <button
            onClick={() => void previewCandidateReport(c.id)}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:border-primary hover:text-primary"
            title="预览面试评估报告"
          >
            <FontAwesomeIcon icon={faEye} className="mr-1" />预览
          </button>
        )}
        {c.questions.length > 0 && (
          <button
            onClick={() => void exportCandidateReport(c.id)}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:border-primary hover:text-primary"
            title="导出 PDF 面试报告"
          >
            <FontAwesomeIcon icon={faFilePdf} className="mr-1" />导出
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`确定删除候选人「${c.name}」吗？其题目与评分数据将一并删除。`)) deleteCandidate(c.id);
          }}
          className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500"
          title="删除候选人"
        >
          <FontAwesomeIcon icon={faTrashCan} />
        </button>
      </div>
    </div>
  );
}
