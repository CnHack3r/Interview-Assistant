import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight, faCircleXmark, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore, useSummary, autoScore } from '@/stores/useInterviewStore';
import { BasicScoreForm } from '@/components/scoring/BasicScoreForm';
import { ComprehensiveScoreForm } from '@/components/scoring/ComprehensiveScoreForm';

/** 右栏：当前题评分 + 下一题 + 删除 + 全局总分 + 导出 */
export function ScorePanel() {
  const questions = useInterviewStore((s) => s.questions);
  const activeQuestionId = useInterviewStore((s) => s.activeQuestionId);
  const setActiveQuestion = useInterviewStore((s) => s.setActiveQuestion);
  const markUnanswered = useInterviewStore((s) => s.markUnanswered);
  const deleteQuestion = useInterviewStore((s) => s.deleteQuestion);
  const exportReport = useInterviewStore((s) => s.exportReport);
  const previewReport = useInterviewStore((s) => s.previewReport);
  const exporting = useInterviewStore((s) => s.exporting);
  const { active, totalScore, totalMaxScore, originalMaxScore, unscoredCount } = useSummary();

  const question = questions.find((q) => q.id === activeQuestionId && !q.isDeleted);

  // 下一题：当前题之后的第一道未删除题目
  const nextQuestion = question
    ? questions
        .slice(questions.indexOf(question) + 1)
        .find((q) => !q.isDeleted)
    : undefined;

  // 上一题：当前题之前的最后一道未删除题目
  const prevQuestion = question
    ? questions
        .slice(0, questions.indexOf(question))
        .reverse()
        .find((q) => !q.isDeleted)
    : undefined;

  const rate = totalMaxScore > 0 ? ((totalScore / totalMaxScore) * 100).toFixed(1) : '0.0';

  const handleExport = () => {
    if (unscoredCount > 0) {
      if (!confirm(`还有 ${unscoredCount} 道题目未评分，确认要导出吗？`)) return;
    }
    void exportReport();
  };

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-gray-200 bg-white">
      {/* 当前题评分区 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {question ? (
          <>
            <div className="mb-3">
              <div className="text-xs text-gray-400">当前题目</div>
              <div className="mt-0.5 truncate text-sm font-medium" title={question.title}>
                {question.title}
              </div>
            </div>

            {question.type === 'basic' ? (
              <BasicScoreForm question={question} />
            ) : (
              <ComprehensiveScoreForm question={question} />
            )}

            <button
              onClick={() => markUnanswered(question.id)}
              className="mt-4 w-full rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50"
              title="本题记 0 分并跳到下一题"
            >
              <FontAwesomeIcon icon={faCircleXmark} className="mr-1.5" />
              未答出（0 分）
            </button>

            <button
              onClick={() => prevQuestion && setActiveQuestion(prevQuestion.id)}
              disabled={!prevQuestion}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="mr-1.5" />
              {prevQuestion ? '上一题' : '已是第一题'}
            </button>

            <button
              onClick={() => nextQuestion && setActiveQuestion(nextQuestion.id)}
              disabled={!nextQuestion}
              className="mt-2 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              {nextQuestion ? '下一题' : '已是最后一题'}
              {nextQuestion && <FontAwesomeIcon icon={faArrowRight} className="ml-1.5" />}
            </button>

            <button
              onClick={() => {
                if (confirm(`确定删除题目「${question.title}」吗？\n删除后面试总分将自动重新计算。`)) {
                  deleteQuestion(question.id);
                }
              }}
              className="mt-2 w-full rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <FontAwesomeIcon icon={faTrashCan} className="mr-1.5" />
              删除本题
            </button>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-gray-400">
            {active.length === 0 && questions.length > 0
              ? '当前没有活跃题目，请重新生成面试题'
              : '选择题目后在此评分'}
          </div>
        )}
      </div>

      {/* 全局总分区 */}
      {active.length > 0 && (
        <div className="shrink-0 border-t border-gray-200 p-4">
          <div className="rounded-lg bg-gray-50 p-4 text-center">
            <div className="text-xs font-medium text-gray-500">面试总分</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">
              {totalScore}
              <span className="text-base font-normal text-gray-400"> / {totalMaxScore}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {totalMaxScore !== originalMaxScore && (
                <>
                  满分 {totalMaxScore}（原 {originalMaxScore}，已删{' '}
                  {originalMaxScore - totalMaxScore}）<br />
                </>
              )}
              得分率 {rate}%
            </div>
          </div>
          <button
            onClick={() => void previewReport()}
            className="mt-3 w-full rounded-md border border-primary/40 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-50"
          >
            预览报告
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="mt-2 w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:bg-gray-300"
          >
            {exporting ? '正在生成 PDF…' : '结束面试，生成报告'}
          </button>
        </div>
      )}
    </aside>
  );
}
