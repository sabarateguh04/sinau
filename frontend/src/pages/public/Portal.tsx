import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, Video, Link2, FileText, Eye, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Input, Loading, EmptyState, Badge, Pagination } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Dict } from '@/lib/types';
import { MaterialBody } from '@/pages/lms/MaterialBody';

const ICON: Record<string, typeof BookOpen> = { FILE: FileText, VIDEO: Video, LINK: Link2, TEXT: BookOpen };

export default function Portal() {
  const { id } = useParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Dict[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 24, total: 0 });
  const [one, setOne] = useState<Dict | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (id) { setLoading(true); api.get(`/public/portal/${id}`).then((r) => setOne(r.data.data)).finally(() => setLoading(false)); } }, [id]);
  useEffect(() => { if (id) return; const t = setTimeout(() => { setLoading(true); api.get('/public/portal', { params: { q: q || undefined, page, limit: 24 } }).then((r) => { setRows(r.data.data); setMeta(r.data.meta); }).finally(() => setLoading(false)); }, 300); return () => clearTimeout(t); }, [q, page, id]);
  if (id) {
    if (loading || !one) return <Loading />;
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link to="/portal" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Portal materi</Link>
        <div className="text-xs text-ink-3">{one.tenant_name as string} · {fmtDate(one.published_at as string)} · <Eye className="inline h-3 w-3" /> {one.view_count as number}</div>
        <h1 className="mt-1 text-3xl font-bold">{one.title as string}</h1>
        {one.description ? <p className="mt-2 text-ink-2">{one.description as string}</p> : null}
        <div className="mt-6"><MaterialBody m={one} publicMode /></div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold">Portal Materi Publik</h1>
      <p className="mt-1 text-ink-2">Bahan ajar yang dibagikan lembaga-lembaga di SINAU. Gratis, tanpa login.</p>
      <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari materi…" className="mt-5 max-w-md" />
      {loading ? <Loading /> : rows.length === 0 ? <div className="mt-6"><EmptyState title="Belum ada materi publik" description="Lembaga dapat membagikan materi ke portal dari menu Materi." /></div> : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => { const I = ICON[m.type as string] ?? BookOpen; return (
            <Link key={m.id as string} to={`/portal/${m.id}`} className="card p-5 transition hover:border-brand-400">
              <div className="flex items-center justify-between"><I className="h-5 w-5 text-brand-700" />{m.is_featured ? <Badge tone="amber">Pilihan</Badge> : null}</div>
              <div className="mt-3 font-semibold">{m.title as string}</div>
              <div className="mt-1 line-clamp-2 text-sm text-ink-2">{m.description as string}</div>
              <div className="mt-3 text-[11px] text-ink-3">{m.tenant_name as string}{m.subject_name ? ` · ${m.subject_name}` : ''} · {m.view_count as number} dilihat</div>
            </Link>
          ); })}
        </div>
      )}
      <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
    </div>
  );
}
