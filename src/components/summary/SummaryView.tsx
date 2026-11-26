import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashCan, faCircleCheck, faClock } from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore, useSummary } from '@/stores/useInterviewStore';
import { DIFFICULTY_LABEL } from '@/lib/utils';

/** 汇总视图：所有题目得分一览，点击行跳转详情 */
export function SummaryView() {
  const questions = useInterviewStore((s) => s.questions);
  const setActiveQuestion = useInterviewStore((s) => s.setActiveQuestion);
  const restoreQuestion = useInterviewStore((s) => s.restoreQuestion);
  const { totalScore, totalMaxScore, originalMaxScore, scoredCount, unscoredCount } = useSummary();

  if (questions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        暂无题目，请先生成面试题
      </div>
    );
  }

  const activeCount = questions.filter((q) => !q.isDeleted).length;

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-3 text-base font-semibold">面试汇总</h2>

        {activeCount > 0 && activeCount <= 2 && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            题目数量较少，评估结果仅供参考
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">题目标题</th>
                <th className="px-4 py-2.5 font-medium">分类</th>
                <th className="px-4 py-2.5 font-medium">难度</th>
                <th className="px-4 py-2.5 font-medium">满分</th>
                <th className="px-4 py-2.5 font-medium">得分</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => (
                <tr
                  key={q.id}
                  onClick={() => !q.isDeleted && setActiveQuestion(q.id)}
                  className={`border-b border-gray-100 ${
                    q.isDeleted
                      ? 'text-gray-400'
                      : 'cursor-pointer hover:bg-primary-50/50'
                  }`}
                >
                  <td className="px-4 py-2.5">{i + 1}</td>
                  <td className={`max-w-[220px] truncate px-4 py-2.5 ${q.isDeleted ? 'line-through' : ''}`}>
                    {q.title}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{q.category}</td>
                  <td className="px-4 py-2.5">{DIFFICULTY_LABEL[q.difficulty]}</td>
                  <td className="px-4 py-2.5">{q.maxScore}</td>
                  <td className="px-4 py-2.5 font-medium">
                    {q.isDeleted ? '—' : q.score ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {q.isDeleted ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-gray-400">
                          <FontAwesomeIcon icon={faTrashCan} className="mr-1" />
                          已删除
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            restoreQuestion(q.id);
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          恢复
                        </button>
                      </span>
                    ) : q.score !== null ? (
                      <span className="text-green-600">
                        <FontAwesomeIcon icon={faCircleCheck} className="mr-1" />
                        已评
                      </span>
                    ) : (
                      <span className="text-amber-600">
                        <FontAwesomeIcon icon={faClock} className="mr-1" />
                        待评
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3" colSpan={4}>
                  合计
                </td>
                <td className="px-4 py-3">{totalMaxScore}</td>
                <td className="px-4 py-3">{totalScore}</td>
                <td className="px-4 py-3 text-xs font-normal text-gray-500">
                  {totalMaxScore !== originalMaxScore
                    ? `已扣除删除项（原满分 ${originalMaxScore}）`
                    : `已评 ${scoredCount} 题${unscoredCount > 0 ? `，待评 ${unscoredCount} 题` : ''}`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
