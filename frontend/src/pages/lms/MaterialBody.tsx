import { useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Play } from 'lucide-react';
import { markdownToHtml, youtubeId } from '@/lib/markdown';
import { fileSrc } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui';
import { fmtBytes } from '@/lib/format';
import { Dict } from '@/lib/types';

/** Renders a material by type. publicMode = no auth token (portal). */
export function MaterialBody({ m, publicMode, onProgress }: { m: Dict; publicMode?: boolean; onProgress?: (p: number) => void }) {
  const { user } = useAuth();
  const dataSaver = !publicMode && !!user?.data_saver;
  const [playVideo, setPlayVideo] = useState(!dataSaver);
  const html = useMemo(() => (m.type === 'TEXT' ? markdownToHtml(String(m.content_text ?? '')) : ''), [m.type, m.content_text]);
  const src = publicMode ? (m.file_url as string) : fileSrc(m.file_url as string);
  if (m.type === 'TEXT') return <article className="prose-sinau max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: html }} onMouseLeave={() => onProgress?.(100)} />;
  if (m.type === 'VIDEO') {
    const yt = youtubeId(String(m.content_url ?? ''));
    if (!playVideo) return <button onClick={() => { setPlayVideo(true); onProgress?.(50); }} className="flex aspect-video w-full items-center justify-center rounded-2xl bg-surface-3 text-ink-2"><Play className="mr-2 h-6 w-6" /> Putar video (mode hemat data aktif)</button>;
    if (yt) return <div className="aspect-video overflow-hidden rounded-2xl bg-black"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`} title={String(m.title)} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen onLoad={() => onProgress?.(50)} /></div>;
    return <video controls className="w-full rounded-2xl bg-black" src={String(m.content_url)} onEnded={() => onProgress?.(100)} />;
  }
  if (m.type === 'LINK') return <a href={String(m.content_url)} target="_blank" rel="noopener noreferrer" onClick={() => onProgress?.(100)} className="flex items-center gap-3 rounded-2xl border border-line p-4 hover:border-brand-400"><ExternalLink className="h-5 w-5 text-brand-700" /><span className="truncate">{String(m.content_url)}</span></a>;
  // FILE
  const mime = String(m.file_mime ?? '');
  const isPdf = mime === 'application/pdf';
  const isImage = mime.startsWith('image/');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line p-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-6 w-6 shrink-0 text-brand-700" /><div className="min-w-0"><div className="truncate text-sm font-medium">{String(m.file_name ?? 'Berkas')}</div><div className="text-xs text-ink-3">{mime}{m.file_size ? ` · ${fmtBytes(Number(m.file_size))}` : ''}</div></div></div><a href={`${src}${src.includes('?') ? '&' : '?'}download=1`} onClick={() => onProgress?.(100)}><Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />}>Unduh</Button></a></div>
      {isPdf && !dataSaver && <iframe title="pdf" src={src} className="h-[75vh] w-full rounded-2xl border border-line bg-white" onLoad={() => onProgress?.(50)} />}
      {isImage && !dataSaver && <img src={src} alt="" className="max-h-[70vh] rounded-2xl" onLoad={() => onProgress?.(100)} />}
      {dataSaver && (isPdf || isImage) && <div className="rounded-xl bg-surface-2 p-3 text-xs text-ink-2">Pratinjau dimatikan (mode hemat data). Unduh untuk membuka.</div>}
    </div>
  );
}
