import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Megaphone, Pin, ArrowLeft, Paperclip } from 'lucide-react';
import { get, fileSrc } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button, Card, Loading } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { Dict, ROLE_LABELS, Role } from '@/lib/types';

export default function Announcements() {
  const { id } = useParams();
  const { has, activeRole } = useAuth();
  const nav = useNavigate();
  const p = rolePrefix(activeRole);
  if (id) return <Detail id={id} />;
  const canWrite = has('announcement:write');
  return (
    <CrudPage
      title="Pengumuman" subtitle="Informasi resmi lembaga untuk seluruh warga sekolah, peran tertentu, atau kelas." endpoint="/communication/announcements" entityLabel="pengumuman" modalSize="lg"
      perm={{ write: 'announcement:write' }} canEdit={canWrite} canDelete={canWrite}
      onRowClick={(r) => nav(`/${p}/pengumuman/${r.id}`)}
      columns={[
        { key: 'title', header: 'Judul', render: (r) => <div className="flex items-center gap-2">{r.is_pinned ? <Pin className="h-3.5 w-3.5 text-amber-500" /> : <Megaphone className="h-3.5 w-3.5 text-ink-3" />}<span className="font-medium">{r.title as string}</span></div> },
        { key: 'audience', header: 'Untuk', render: (r) => <Badge tone={r.audience === 'ALL' ? 'brand' : r.audience === 'ROLE' ? 'blue' : 'purple'}>{r.audience === 'ALL' ? 'Semua' : r.audience === 'ROLE' ? ROLE_LABELS[r.audience_role as Role] ?? (r.audience_role as string) : (r.class_name as string)}</Badge> },
        { key: 'author_name', header: 'Oleh' },
        { key: 'created_at', header: 'Tanggal', render: (r) => fmtDateTime(r.created_at as string) },
      ]}
      filters={[{ name: 'audience', label: 'Audiens', options: [{ value: 'ALL', label: 'Semua' }, { value: 'ROLE', label: 'Peran' }, { value: 'CLASS', label: 'Kelas' }] }]}
      fields={[
        { name: 'title', label: 'Judul', required: true, span: 2 },
        { name: 'body', label: 'Isi', type: 'textarea', required: true, span: 2 },
        { name: 'audience', label: 'Audiens', type: 'select', required: true, defaultValue: 'ALL', options: [{ value: 'ALL', label: 'Semua pengguna' }, { value: 'ROLE', label: 'Peran tertentu' }, { value: 'CLASS', label: 'Kelas tertentu' }] },
        { name: 'audience_role', label: 'Peran', type: 'select', showIf: (v) => v.audience === 'ROLE', options: (Object.keys(ROLE_LABELS) as Role[]).filter((r) => r !== 'SUPER_ADMIN').map((r) => ({ value: r, label: ROLE_LABELS[r] })) },
        { name: 'class_id', label: 'Kelas', type: 'async-select', showIf: (v) => v.audience === 'CLASS', source: { url: '/academic/classes', params: { active_year: 1, limit: 200 }, label: 'name' } },
        { name: 'is_pinned', label: 'Sematkan di atas', type: 'switch' },
        { name: 'publish_at', label: 'Tayang mulai', type: 'datetime', hint: 'Kosongkan = sekarang' },
        { name: 'expires_at', label: 'Berakhir', type: 'datetime' },
      ]}
    />
  );
}
function Detail({ id }: { id: string }) {
  const [a, setA] = useState<Dict | null>(null);
  const nav = useNavigate();
  useEffect(() => { get<Dict>(`/communication/announcements/${id}`).then(setA).catch(() => setA({})); }, [id]);
  if (!a) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav(-1)}>Kembali</Button>
      <Card className="mt-3"><div className="text-xs text-ink-3">{fmtDateTime(a.created_at as string)} · {a.author_name as string}{a.is_pinned ? ' · Disematkan' : ''}</div><h1 className="mt-1 text-2xl font-bold">{a.title as string}</h1><div className="prose-sinau mt-4 whitespace-pre-line text-[15px]">{a.body as string}</div>{a.attachment_url ? <a href={fileSrc(a.attachment_url as string)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-3"><Paperclip className="h-4 w-4" /> Lampiran</a> : null}</Card>
    </div>
  );
}
