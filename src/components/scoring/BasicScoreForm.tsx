import type { InterviewQuestion } from '@/types';
import { useInterviewStore, autoScore } from '@/stores/useInterviewStore';

/** 基础题评分：按回答要点逐项勾选，自动折算为本题得分，可手动调整 */
export function BasicScoreForm({ question }: { question: InterviewQuestion }) {
  const toggleKeyPoint = useInterviewStore((s) => s.toggleKeyPoint);
  const setQuestionScore = useInterviewStore((s) => s.setQuestionScore);

  const kpTotal = question.keyPoints.reduce((s, kp) => s + kp.score, 0);
  const kpGot = question.keyPoints.filter((kp) => kp.isChecked).reduce((s, kp) => s + kp.score, 0);
  const suggested = autoScore(question);

  return (
    <div>
      <div className="mb-2 text-xs font-medium text-gray-500">回答要点核对：</div>
      <div className="space-y-2">
        {question.keyPoints.map((kp) => (
          <label
            key={kp.id}
            className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={kp.isChecked}
              onChange={() => toggleKeyPoint(question.id, kp.id)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span className={`flex-1 ${kp.isChecked ? 'text-gray-900' : 'text-gray-600'}`}>
              {kp.content}
            </span>
            <span className="shrink-0 text-xs text-gray-400">
              ({kp.isChecked ? kp.score : 0}/{kp.score})
            </span>
          </label>
        ))}
      </div>

      <div className="my-3 border-t border-dashed border-gray-200" />
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">小计</span>
        <span className="font-medium">
          {kpGot}/{kpTotal}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">本题得分</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={question.maxScore}
            value={question.score ?? ''}
            placeholder={String(suggested)}
            onChange={(e) => {
              const v = e.target.value;
              setQuestionScore(question.id, v === '' ? 0 : Number(v));
            }}
            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-center text-sm focus:border-primary focus:outline-none"
          />
          <span className="text-sm text-gray-400">/ {question.maxScore}</span>
        </div>
      </div>
      <div className="mt-1 text-right text-xs text-gray-400">
        要点 {kpGot}/{kpTotal} 分，自动折算为 {suggested} 分（可手动调整）
      </div>
    </div>
  );
}
