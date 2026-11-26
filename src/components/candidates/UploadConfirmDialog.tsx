import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore } from '@/stores/useInterviewStore';
import type { UploadRow } from '@/stores/useInterviewStore';

/** 上传确认弹窗：逐行编辑姓名/岗位，支持一键应用同一岗位到全部 */
export function UploadConfirmDialog() {
  const uploadConfirm = useInterviewStore((s) => s.uploadConfirm);
  const cancelBatchUpload = useInterviewStore((s) => s.cancelBatchUpload);
  const confirmBatchUpload = useInterviewStore((s) => s.confirmBatchUpload);
  const [rows, setRows] = useState<UploadRow[]>([]);

  useEffect(() => {
    if (uploadConfirm) setRows(uploadConfirm.map((r) => ({ ...r })));
  }, [uploadConfirm]);

  if (!uploadConfirm) return null;

  const patch = (i: number, p: Partial<UploadRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const applyPositionToAll = () => {
    const pos = rows[0]?.position ?? '';
    if (pos.trim()) setRows((rs) => rs.map((r) => ({ ...r, position: pos })));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="flex max-h-[80vh] w-[720px] flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-3">
          <FontAwesomeIcon icon={faFileCircleCheck} className="text-primary" />
          <h2 className="text-sm font-semibold">确认候选人信息（{rows.length} 份简历）</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="pb-2 font-medium">文件</th>
                <th className="pb-2 font-medium">候选人姓名</th>
                <th className="pb-2 font-medium">
                  面试岗位
                  <button
                    onClick={applyPositionToAll}
                    className="ml-2 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50"
                    title="将第一行的岗位应用到全部"
                  >
                    应用到全部
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.path} className="border-t border-gray-100">
                  <td className="max-w-[180px] truncate py-2 pr-3 text-gray-500" title={r.name}>{r.name}</td>
                  <td className="py-2 pr-3">
                    <input
                      value={r.guessedName}
                      onChange={(e) => patch(i, { guessedName: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      value={r.position}
                      onChange={(e) => patch(i, { position: e.target.value })}
                      placeholder="如：渗透测试工程师"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-400">岗位留空的候选人将进入「待填岗位」，补填后自动开始出题。</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            onClick={cancelBatchUpload}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => void confirmBatchUpload(rows)}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            确认并开始出题
          </button>
        </div>
      </div>
    </div>
  );
}
