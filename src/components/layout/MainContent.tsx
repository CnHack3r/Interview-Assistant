import { useInterviewStore } from '@/stores/useInterviewStore';
import { ResumeView } from '@/components/resume/ResumeView';
import { QuestionCard } from '@/components/question/QuestionCard';
import { SummaryView } from '@/components/summary/SummaryView';

export function MainContent() {
  const activeNav = useInterviewStore((s) => s.activeNav);

  return (
    <main className="min-w-0 flex-1 overflow-hidden bg-gray-50">
      {activeNav === 'resume' && <ResumeView />}
      {activeNav === 'questions' && <QuestionCard />}
      {activeNav === 'summary' && <SummaryView />}
    </main>
  );
}
