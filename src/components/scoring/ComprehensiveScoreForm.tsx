import type { InterviewQuestion } from '@/types';
import { useInterviewStore } from '@/stores/useInterviewStore';

const TIERS = [
  { label: '表现优秀', ratio: [0.8, 1.0] },
  { label: '表现良好', ratio: [0.6, 0.8] },
  { label: '基本合格', ratio: [0.4, 0.6] },
  { label: '有待提高', ratio: [0.0, 0.4] },
] as const;

/**
 * 档位区间：上不重叠（下一档上限 = 上一档下限 - 1），与设计规范一致：
 * 满分 10 时 → 优秀 8-10 / 良好 6-7 / 合格 4-5 / 提高 0-3
 */
function tierRanges(maxScore: number): Array<[number, number]> {
  const bounds = TIERS.map((t) => Math.round(maxScore * t.ratio[0]));
  return TIERS.map((t, i) => {
    const lo = bounds[i];
    const hi = i === 0 ? maxScore : Math.max(lo, bounds[i - 1] - 1);
    return [Math.min(lo, hi), hi] as [number, number];
  });
}

/** 综合题评分：档位单选（自动填充区间中值）+ 手动微调 */
export function ComprehensiveScoreForm({ question }: { question: InterviewQuestion }) {
  const setQuestionScore = useInterviewStore((s) => s.setQuestionScore);
  const ranges = tierRanges(question.maxScore);

  return (
    <div>
      <div className="mb-2 text-xs font-medium text-gray-500">整体评价：</div>
      <div className="space-y-1.5">
        {TIERS.map((tier, i) => {
          const [lo, hi] = ranges[i];
          const mid = Math.round((lo + hi) / 2);
          const selected = question.score !== null && question.score >= lo && question.score <= hi;
          return (
            <label
              key={tier.label}
              className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                selected
                  ? 'border-primary bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`tier-${question.id}`}
                  checked={selected}
                  onChange={() => setQuestionScore(question.id, mid)}
                  className="accent-primary"
                />
                {tier.label}
              </span>
              <span className="text-xs text-gray-400">
                {lo}-{hi} 分
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-gray-500">本题得分</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={question.maxScore}
            value={question.score ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setQuestionScore(question.id, v === '' ? 0 : Number(v));
            }}
            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-center text-sm focus:border-primary focus:outline-none"
          />
          <span className="text-sm text-gray-400">/ {question.maxScore}</span>
        </div>
      </div>
      <div className="mt-1 text-right text-xs text-gray-400">选择档位自动填中值，可手动微调</div>
    </div>
  );
}
