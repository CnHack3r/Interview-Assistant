import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faUserTie } from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore } from '@/stores/useInterviewStore';
import { isElectron } from '@/lib/api';

export function TopBar() {
  const view = useInterviewStore((s) => s.view);
  const backToList = useInterviewStore((s) => s.backToList);
  const candidateName = useInterviewStore((s) => s.candidateName);
  const position = useInterviewStore((s) => s.position);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-2">
        {view === 'workbench' && (
          <button
            onClick={backToList}
            className="mr-1 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            返回列表
          </button>
        )}
        <FontAwesomeIcon icon={faUserTie} className="text-lg text-primary" />
        <h1 className="text-base font-semibold">面试官助手PRO</h1>
        {!isElectron && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">浏览器预览模式</span>
        )}
        {view === 'workbench' && candidateName && (
          <span className="ml-2 text-sm text-gray-500">
            {candidateName} · {position}
          </span>
        )}
      </div>
    </header>
  );
}
