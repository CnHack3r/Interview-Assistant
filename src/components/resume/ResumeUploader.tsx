import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons';
import { useInterviewStore } from '@/stores/useInterviewStore';

/** 简历拖放 / 点击上传区域（空态） */
export function ResumeUploader() {
  const uploadResume = useInterviewStore((s) => s.uploadResume);

  return (
    <div
      className="flex h-full items-center justify-center p-8"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        // 拖放仅做提示：真实文件路径需通过系统对话框获取（安全策略）
        void uploadResume();
      }}
    >
      <button
        onClick={() => void uploadResume()}
        className="flex h-56 w-full max-w-lg flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white text-gray-500 transition-colors hover:border-primary hover:text-primary"
      >
        <FontAwesomeIcon icon={faCloudArrowUp} className="text-4xl" />
        <span className="text-sm font-medium">拖拽简历到此处 或 点击上传</span>
        <span className="text-xs text-gray-400">
          支持 PDF / DOCX 格式（旧版 .doc 请先另存为 .docx）
        </span>
      </button>
    </div>
  );
}
