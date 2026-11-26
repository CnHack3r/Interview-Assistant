import { useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileLines,
  faClipboardQuestion,
  faChartSimple,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore, type NavKey } from '@/stores/useInterviewStore';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL } from '@/lib/utils';
import { LogPanel } from './LogPanel';
import { StatusBar } from './StatusBar';

const NAV_ITEMS: Array<{ key: NavKey; icon: IconDefinition; label: string }> = [
  { key: 'resume', icon: faFileLines, label: '简历' },
  { key: 'questions', icon: faClipboardQuestion, label: '题目' },
  { key: 'summary', icon: faChartSimple, label: '汇总' },
];

export function Sidebar() {
  const activeNav = useInterviewStore((s) => s.activeNav);
  const setNav = useInterviewStore((s) => s.setNav);
  const questions = useInterviewStore((s) => s.questions);
  const activeQuestionId = useInterviewStore((s) => s.activeQuestionId);
  const setActiveQuestion = useInterviewStore((s) => s.setActiveQuestion);

  // 当前题变化时，让列表跟随滚动到可视区域（如点击「下一题」）
  useEffect(() => {
    if (!activeQuestionId) return;
    const el = document.querySelector(`[data-qid="${activeQuestionId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeQuestionId]);

  // 按分类分组
  const grouped = useMemo(() => {
    const map = new Map<string, typeof questions>();
    for (const q of questions) {
      const list = map.get(q.category) ?? [];
      list.push(q);
      map.set(q.category, list);
    }
    return [...map.entries()];
  }, [questions]);

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-gray-200 bg-white">
      <nav className="p-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setNav(item.key)}
            className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              activeNav === item.key
                ? 'bg-primary font-medium text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span className="w-4 text-center">
              <FontAwesomeIcon icon={item.icon} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* 题目列表：始终占据剩余空间，把日志面板推到底部 */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-gray-100 p-2">
        {grouped.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-gray-300">
            生成面试题后将在此列出
          </div>
        ) : (
          grouped.map(([category, list]) => (
            <div key={category} className="mb-2">
              <div className="px-2 py-1 text-xs font-medium text-gray-400">{category}</div>
              {list.map((q) => {
                const idx = questions.indexOf(q) + 1;
                const active = q.id === activeQuestionId && activeNav === 'questions';
                return (
                  <button
                    key={q.id}
                    data-qid={q.id}
                    onClick={() => !q.isDeleted && setActiveQuestion(q.id)}
                    disabled={q.isDeleted}
                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      q.isDeleted
                        ? 'cursor-not-allowed text-gray-300 line-through'
                        : active
                          ? 'bg-primary-50 font-medium text-primary-700'
                          : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    title={q.title}
                  >
                    <span className="shrink-0 text-gray-400">{idx}.</span>
                    <span className="min-w-0 flex-1 truncate">{q.title}</span>
                    <span
                      className={`shrink-0 rounded px-1 text-[10px] ${DIFFICULTY_COLOR[q.difficulty]}`}
                    >
                      {DIFFICULTY_LABEL[q.difficulty]}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <LogPanel />
      <StatusBar />
    </aside>
  );
}
