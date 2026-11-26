import { useInterviewStore } from '@/stores/useInterviewStore';

/** 报告预览覆盖层：在应用内以 iframe 渲染后端返回的报告 HTML（A4 居中排版） */
export function ReportPreviewOverlay() {
  const html = useInterviewStore((s) => s.reportPreviewHtml);
  const setHtml = useInterviewStore((s) => s.setReportPreviewHtml);

  if (!html) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70">
      <div className="flex items-center justify-between bg-gray-900 px-4 py-2 text-white">
        <span className="flex items-center gap-2 text-sm">
          <span className="text-lg">📄</span> 报告预览
        </span>
        <button
          onClick={() => setHtml(null)}
          className="rounded px-3 py-1 text-sm hover:bg-white/10"
        >
          ✕ 关闭
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-gray-200">
        <iframe
          srcDoc={html}
          title="报告预览"
          sandbox="allow-same-origin"
          className="mx-auto block h-full w-full"
        />
      </div>
    </div>
  );
}
