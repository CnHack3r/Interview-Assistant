import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen, faListCheck } from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore } from '@/stores/useInterviewStore';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, mdToHtml } from '@/lib/utils';

/** 题目详情卡片：题目正文 + 参考答案折叠 + 回答要点 */
export function QuestionCard() {
  const questions = useInterviewStore((s) => s.questions);
  const activeQuestionId = useInterviewStore((s) => s.activeQuestionId);
  const [answerOpen, setAnswerOpen] = useState(false);

  const question = questions.find((q) => q.id === activeQuestionId && !q.isDeleted);

  if (questions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
        还没有面试题。
        <br />
        请先在「简历」页面上传简历、输入面试岗位，然后点击「AI 生成面试题」。
      </div>
    );
  }

  if (!question) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        请从左侧选择一道题目
      </div>
    );
  }

  const index = questions.indexOf(question) + 1;

  return (
    <div className="h-full overflow-y-auto p-5" key={question.id}>
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* 头部 */}
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
              题目 {index}：{question.title}
            </h2>
            <span
              className={`shrink-0 rounded px-2 py-0.5 text-xs ${DIFFICULTY_COLOR[question.difficulty]}`}
            >
              难度：{DIFFICULTY_LABEL[question.difficulty]}
            </span>
            <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {question.maxScore} 分
            </span>
            <span className="shrink-0 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
              {question.type === 'basic' ? '基础题' : '综合题'}
            </span>
          </div>

          {/* 题目正文 */}
          <div className="px-5 py-4">
            <div
              className="text-sm leading-7 text-gray-800"
              dangerouslySetInnerHTML={{ __html: mdToHtml(question.questionBody) }}
            />
          </div>

          {/* 参考答案（折叠） */}
          {question.referenceAnswer && (
            <div className="border-t border-gray-100">
              <button
                onClick={() => setAnswerOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                <span>{answerOpen ? '▾' : '▸'}</span>
                <span>
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  参考答案（点击{answerOpen ? '收起' : '展开'}）
                </span>
              </button>
              {answerOpen && (
                <div
                  className="border-t border-gray-50 bg-gray-50/60 px-5 py-4 text-sm leading-7 text-gray-700"
                  dangerouslySetInnerHTML={{ __html: mdToHtml(question.referenceAnswer) }}
                />
              )}
            </div>
          )}

          {/* 回答要点 */}
          {question.keyPoints.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-4">
              <div className="mb-2 text-sm font-medium text-gray-600">
                <FontAwesomeIcon icon={faListCheck} className="mr-1.5" />
                回答要点（面试时在右侧评分栏勾选）
              </div>
              <ul className="space-y-1.5">
                {question.keyPoints.map((kp) => (
                  <li key={kp.id} className="flex items-start gap-2 text-sm text-gray-700">
                    <span
                      className={`mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded border ${
                        kp.isChecked ? 'border-primary bg-primary' : 'border-gray-300'
                      }`}
                    />
                    <span className="flex-1">{kp.content}</span>
                    <span className="shrink-0 text-xs text-gray-400">{kp.score} 分</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
