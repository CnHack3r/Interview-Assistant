import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useInterviewStore } from '@/stores/useInterviewStore';
import { api } from '@/lib/api';

// 配置 pdf.js worker（Vite 打包友好写法）
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * PDF 预览：连续滚动模式
 * - 所有页面依次渲染，滚轮/触摸板自然滚动（非书本式跳页）
 * - IntersectionObserver 追踪当前可视页面，更新页码指示器
 * - 按钮/键盘翻页 = 平滑滚动到目标页
 */
export function PDFViewer() {
  const resumeFile = useInterviewStore((s) => s.resumeFile);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(720);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setFileUrl(null);
    setPage(1);
    setNumPages(0);
    setError(null);
    if (resumeFile?.path) {
      api.resume
        .readFile(resumeFile.path)
        .then((buf) => {
          if (cancelled) return;
          // 用 Blob URL 交给 pdf.js 自行 fetch，避免 ArrayBuffer 传入 Worker 后被 detach
          objectUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
          setFileUrl(objectUrl);
        })
        .catch((err) => !cancelled && setError(String(err)));
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resumeFile?.path]);

  // 跟随容器宽度调整页面渲染宽度
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setPageWidth(Math.min(760, el.clientWidth - 64));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 追踪当前可视页面
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const p = Number((entry.target as HTMLElement).dataset.page);
            if (p) setPage(p);
          }
        }
      },
      { root, threshold: 0.4 }
    );
    root.querySelectorAll('[data-page]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [numPages, fileUrl]);

  // 平滑滚动到指定页
  const goPage = useCallback(
    (target: number) => {
      const root = scrollRef.current;
      if (!root || numPages === 0) return;
      const p = Math.max(1, Math.min(numPages, target));
      const el = root.querySelector(`[data-page="${p}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [numPages]
  );

  // 键盘翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 输入框聚焦时不劫持按键
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['ArrowDown', 'PageDown'].includes(e.key)) goPage(page + 1);
      if (['ArrowUp', 'PageUp'].includes(e.key)) goPage(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPage, page]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        PDF 加载失败：{error}
      </div>
    );
  }
  if (!fileUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        正在加载 PDF…
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden">
      {/* 连续滚动区 */}
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(err) => setError(err.message)}
          loading={<div className="py-10 text-center text-sm text-gray-400">PDF 渲染中…</div>}
        >
          {numPages > 0 &&
            Array.from({ length: numPages }, (_, i) => (
              <div
                key={i + 1}
                data-page={i + 1}
                className="flex justify-center py-2 first:pt-4 last:pb-16"
              >
                <Page
                  pageNumber={i + 1}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-sm"
                />
              </div>
            ))}
        </Document>
      </div>

      {/* 页码指示器 + 翻页控制 */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-gray-800/80 px-3 py-1.5 text-xs text-white shadow">
        <button
          onClick={() => goPage(page - 1)}
          disabled={page <= 1}
          className="px-1 disabled:opacity-30"
        >
          ←
        </button>
        <span>
          第 {page} / {numPages || '…'} 页
        </span>
        <button
          onClick={() => goPage(page + 1)}
          disabled={page >= numPages}
          className="px-1 disabled:opacity-30"
        >
          →
        </button>
      </div>
    </div>
  );
}
