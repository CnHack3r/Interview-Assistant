import { useInterviewStore } from '@/stores/useInterviewStore';
import { ResumeUploader } from './ResumeUploader';
import { PDFViewer } from './PDFViewer';
import { WordViewer } from './WordViewer';

/** 简历视图：预览 + 当前候选人信息（姓名/岗位只读，在候选人卡片上修改） */
export function ResumeView() {
  const resumeFile = useInterviewStore((s) => s.resumeFile);
  const resumeFormat = useInterviewStore((s) => s.resumeFormat);
  const resumeError = useInterviewStore((s) => s.resumeError);
  const extracting = useInterviewStore((s) => s.extracting);
  const position = useInterviewStore((s) => s.position);
  const candidateName = useInterviewStore((s) => s.candidateName);
  const generating = useInterviewStore((s) => s.generating);
  const generateError = useInterviewStore((s) => s.generateError);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部信息栏 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        {resumeFile && (
          <>
            <span className="max-w-[220px] truncate text-sm font-medium" title={resumeFile.name}>
              {resumeFile.name}
            </span>
            <span className="mx-1 h-4 w-px bg-gray-200" />
          </>
        )}
        <span className="text-sm text-gray-700">
          <span className="text-gray-400">候选人：</span>{candidateName || '—'}
        </span>
        <span className="text-sm text-gray-700">
          <span className="text-gray-400">岗位：</span>{position || '—'}
        </span>
      </div>

      {(generateError || resumeError) && (
        <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
          {generateError ?? resumeError}
        </div>
      )}

      {generating && (
        <div className="shrink-0 border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-600">
          AI 正在分析简历并结合「{position}」岗位生成面试题，通常需要 15-60 秒，请稍候…
        </div>
      )}

      {/* 预览区 */}
      <div className="min-h-0 flex-1">
        {!resumeFile && <ResumeUploader />}
        {resumeFile && extracting && (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            正在解析简历…
          </div>
        )}
        {resumeFile && !extracting && resumeFormat === 'pdf' && <PDFViewer />}
        {resumeFile && !extracting && resumeFormat === 'docx' && <WordViewer />}
      </div>
    </div>
  );
}
