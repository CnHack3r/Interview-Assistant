// 通用工具：Markdown 渲染 + 评分计算

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 极简 Markdown → HTML：粗体、行内代码、有序/无序列表、标题、段落 */
export function mdToHtml(md: string): string {
  const lines = escapeHtml(md).split('\n');
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const l = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    const ordered = line.match(/^\s*(\d+)[.、)]\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      if (inList) { out.push('</ol>'); inList = false; }
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level} class="font-semibold mt-3 mb-1">${heading[2]}</h${level}>`);
    } else if (ordered) {
      if (!inList) { out.push('<ol class="list-decimal pl-5 space-y-1">'); inList = true; }
      out.push(`<li>${ordered[2]}</li>`);
    } else if (bullet) {
      if (!inList) { out.push('<ol class="list-disc pl-5 space-y-1">'); inList = true; }
      out.push(`<li>${bullet[1]}</li>`);
    } else {
      if (inList) { out.push('</ol>'); inList = false; }
      if (l.trim()) out.push(`<p class="my-1.5">${l}</p>`);
    }
  }
  if (inList) out.push('</ol>');
  return out.join('\n');
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '易',
  medium: '中',
  hard: '难',
};

export const DIFFICULTY_COLOR: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

export function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
