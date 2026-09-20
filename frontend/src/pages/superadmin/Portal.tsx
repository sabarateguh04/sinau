import { useCallback, useEffect, useState } from 'react';
import { Globe, Star, StarOff, Trash2 } from 'lucide-react';
import { get, post, del, toApiError } from '@/lib/api';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Input, PageHeader, Table, Tabs, useDebounce } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Dict } from '@/lib/types';

/** Curate the public material portal: pick candidates (materials flagged public by teachers) and feature them. */
export default function Portal() {
  const [tab, setTab] = useState<'shared' | 'candidates'>('shared');
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [rows, setRows] = useState<Dict[]>([]);
  const load = useCallback(() => get<Dict[]>(`/landing/portal/${tab}`, { q: dq || undefined }).then(setRows).catch((e) => toast.error(toApiError(e).message)), [tab, dq]);
  useEffect(() => { load(); }, [load]);
  const share = async (id: string, featured = false) => { await post('/landing/portal/share', { material_id: id, is_featured: featured }); toast.success('Dibagikan ke portal'); load(); };
  const unshare = async (id: string) => { await del(`/landing/portal/share/${id}`); toast.success('Dihapus dari portal'); load(); };
  return (
    <div>
      <PageHeader title="Portal Materi Publik" subtitle="Materi yang ditandai 'boleh dibagikan' oleh guru muncul sebagai kandidat. Yang dibagikan tampil di /portal tanpa login." actions={<a href="/portal" target="_blank" rel="noreferrer"><Button variant="outline" icon={<Globe className="h-4 w-4" />}>Lihat portal</Button></a>} />
      <div className="mb-4 flex flex-wrap gap-2"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'shared', label: 'Dibagikan' }, { value: 'candidates', label: 'Kandidat' }]} /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" className="w-64" /></div>
      <Card padded={false}><Table<Dict> rows={rows} columns={[
        { key: 'title', header: 'Materi', render: (r) => <div><div className="font-medium">{r.title as string}</div><div className="text-xs text-ink-3">{r.tenant_name as string} · {r.subject_name as string} · {r.type as string}</div></div> },
        { key: 'author_name', header: 'Guru' }, { key: 'view_count', header: 'Dilihat', className: 'text-center' }, { key: 'published_at', header: 'Terbit', render: (r) => fmtDate(r.published_at as string) },
        { key: 'x', header: '', render: (r) => tab === 'shared' ? <div className="flex gap-1">{r.is_featured ? <Badge tone="amber">Pilihan</Badge> : null}<Button size="sm" variant="ghost" icon={r.is_featured ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />} onClick={() => share(r.id as string, !r.is_featured)} /><Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => unshare(r.id as string)} /></div> : <Button size="sm" onClick={() => share(r.id as string)}>Bagikan</Button> },
      ]} empty={tab === 'shared' ? 'Belum ada materi dibagikan' : 'Tidak ada kandidat — minta guru menandai materi sebagai publik'} /></Card>
    </div>
  );
}
