import { useEffect } from 'react';
import { useInterviewStore } from '@/stores/useInterviewStore';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainContent } from '@/components/layout/MainContent';
import { ScorePanel } from '@/components/layout/ScorePanel';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { CandidateListView } from '@/components/candidates/CandidateListView';
import { UploadConfirmDialog } from '@/components/candidates/UploadConfirmDialog';
import { GenLogDialog } from '@/components/candidates/GenLogDialog';
import { ReportPreviewOverlay } from '@/components/report/ReportPreviewOverlay';

export default function App() {
  const init = useInterviewStore((s) => s.init);
  const view = useInterviewStore((s) => s.view);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-full flex-col bg-gray-100 text-gray-900">
      <TopBar />
      {view === 'list' ? (
        <CandidateListView />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <MainContent />
          <ScorePanel />
        </div>
      )}
      <SettingsDialog />
      <UploadConfirmDialog />
      <GenLogDialog />
      <ReportPreviewOverlay />
    </div>
  );
}
