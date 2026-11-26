import { useInterviewStore } from '@/stores/useInterviewStore';

/** Word 预览：mammoth 已在主进程转为 HTML，这里直接渲染（自然滚动） */
export function WordViewer() {
  const resumeHtml = useInterviewStore((s) => s.resumeHtml);
  const resumeText = useInterviewStore((s) => s.resumeText);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl rounded-lg bg-white p-8 shadow-sm">
        {resumeHtml ? (
          <div
            className="word-preview text-sm text-gray-800"
            dangerouslySetInnerHTML={{ __html: resumeHtml }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm leading-7 text-gray-800">
            {resumeText}
          </pre>
        )}
      </div>
    </div>
  );
}
