import { useEffect, useState } from 'react';
import { Users, UserPlus, Star } from 'lucide-react';
import { get, post, put, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button, Card, EmptyState, Input, Loading, Modal, PageHeader, Select, Table, Checkbox, useDebounce } from '@/components/ui';
import { Dict } from '@/lib/types';

export default function Extracurriculars() {
  const { has, hasRole } = useAuth();
  const manage = has('extracurricular:write') || has('extracurricular:members');
  const [members, setMembers] = useState<Dict | null>(null);
  if (hasRole('SISWA') && !manage) return <StudentView />;
  return (
    <>
      <CrudPage<Dict> title="Ekstrakurikuler" subtitle="Kegiatan, pembina, dan anggota. Nilai ekskul masuk ke rapor." endpoint="/kesiswaan/extracurriculars" entityLabel="ekskul" perm={{ write: 'extracurricular:write' }}
        columns={[{ key: 'name', header: 'Nama', render: (r) => <div><div className="font-medium">{r.name as string}</div><div className="text-xs text-ink-3">{r.code as string}{r.schedule_text ? ` · ${r.schedule_text}` : ''}</div></div> }, { key: 'coach_name', header: 'Pembina' }, { key: 'member_count', header: 'Anggota', render: (r) => <span>{r.member_count as number}{r.quota ? ` / ${r.quota}` : ''}</span> }, { key: 'is_active', header: 'Status', render: (r) => <Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge> }]}
        rowActions={(r) => <Button size="sm" variant="outline" icon={<Users className="h-4 w-4" />} onClick={() => setMembers(r)}>Anggota</Button>}
        fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama', required: true }, { name: 'coach_id', label: 'Pembina', type: 'async-select', source: { url: '/users', params: { role: 'GURU', limit: 300 }, label: 'full_name' } }, { name: 'schedule_text', label: 'Jadwal (teks)', placeholder: 'Jumat 14:00' }, { name: 'quota', label: 'Kuota', type: 'number' }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }, { name: 'description', label: 'Deskripsi', type: 'textarea', span: 2 }]} />
      <MembersModal ek={members} onClose={() => setMembers(null)} canManage={has('extracurricular:members')} />
    </>
  );
}
function MembersModal({ ek, onClose, canManage }: { ek: Dict | null; onClose: () => void; canManage: boolean }) {
  const [rows, setRows] = useState<Dict[]>([]);
  const [add, setAdd] = useState(false);
  const [q, setQ] = useState(''); const dq = useDebounce(q);
  const [cands, setCands] = useState<Dict[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const load = () => { if (ek) get<Dict[]>(`/kesiswaan/extracurriculars/${ek.id}/members`).then(setRows); };
  useEffect(() => { load(); setAdd(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ek]);
  useEffect(() => { if (add) get<unknown>('/users', { role: 'SISWA', q: dq || undefined, limit: 50 }).then((d) => setCands((d as { data?: Dict[] }).data ?? [])); }, [add, dq]);
  const setScore = async (sid: string, score: string) => { await put(`/kesiswaan/extracurriculars/${ek!.id}/members/${sid}`, { score: score || null }); };
  return (
    <Modal open={!!ek} onClose={onClose} size="lg" title={`Anggota ${ek?.name ?? ''}`} footer={canManage && (add ? <Button disabled={!picked.size} onClick={async () => { await post(`/kesiswaan/extracurriculars/${ek!.id}/members`, { student_ids: [...picked] }); toast.success('Anggota ditambahkan'); setPicked(new Set()); setAdd(false); load(); }}>Tambahkan {picked.size}</Button> : <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdd(true)}>Tambah anggota</Button>)}>
      {add ? <div><Input placeholder="Cari siswa…" value={q} onChange={(e) => setQ(e.target.value)} /><div className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">{cands.map((c) => <label key={c.id as string} className="flex items-center gap-3 px-3 py-2 text-sm"><Checkbox checked={picked.has(c.id as string)} onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(c.id as string); else n.delete(c.id as string); return n; })} />{c.full_name as string} <span className="text-xs text-ink-3">{c.class_name as string}</span></label>)}</div></div>
        : <Table<Dict> dense rows={rows} columns={[{ key: 'full_name', header: 'Siswa', render: (r) => <div>{r.full_name as string}<div className="text-xs text-ink-3">{r.class_name as string}</div></div> }, { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'AKTIF' ? 'green' : 'gray'}>{r.status as string}</Badge> }, { key: 'score', header: 'Nilai (A/B/C)', render: (r) => canManage ? <Select className="w-24" defaultValue={String(r.score ?? '')} onChange={(e) => setScore(r.student_id as string, e.target.value)} placeholder="—" options={['A', 'B', 'C', 'D'].map((x) => ({ value: x, label: x }))} /> : (r.score as string) ?? '-' }, { key: 'x', header: '', render: (r) => canManage && r.status === 'AKTIF' ? <button className="text-xs text-red-600" onClick={async () => { await put(`/kesiswaan/extracurriculars/${ek!.id}/members/${r.student_id}`, { status: 'KELUAR' }); load(); }}>Keluarkan</button> : null }]} empty="Belum ada anggota" />}
    </Modal>
  );
}
function StudentView() {
  const [rows, setRows] = useState<Dict[] | null>(null);
  const [mine, setMine] = useState<Dict[]>([]);
  const load = () => { get<unknown>('/kesiswaan/extracurriculars', { is_active: 1, limit: 100 }).then((d) => setRows((d as { data?: Dict[] }).data ?? [])); get<Dict[]>('/kesiswaan/extracurriculars/mine/list').then(setMine); };
  useEffect(load, []);
  if (!rows) return <Loading />;
  const joined = new Set(mine.filter((m) => m.status === 'AKTIF').map((m) => m.extracurricular_id));
  return (
    <div>
      <PageHeader title="Ekstrakurikuler" subtitle="Pilih kegiatan yang ingin diikuti." />
      {rows.length === 0 ? <EmptyState title="Belum ada ekskul" /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((e) => <Card key={e.id as string}><div className="flex items-start justify-between"><div><div className="font-semibold">{e.name as string}</div><div className="text-xs text-ink-3">{e.coach_name as string}{e.schedule_text ? ` · ${e.schedule_text}` : ''}</div></div>{joined.has(e.id as string) && <Badge tone="green"><Star className="h-3 w-3" /> Anggota</Badge>}</div><p className="mt-2 line-clamp-3 text-sm text-ink-2">{e.description as string}</p><div className="mt-3 flex items-center justify-between text-xs text-ink-3"><span>{e.member_count as number}{e.quota ? `/${e.quota}` : ''} anggota</span>{!joined.has(e.id as string) && <Button size="sm" variant="outline" onClick={async () => { try { await post(`/kesiswaan/extracurriculars/${e.id}/members`, {}); toast.success('Berhasil bergabung'); load(); } catch (err) { toast.error(toApiError(err).message); } }}>Gabung</Button>}</div></Card>)}</div>}
    </div>
  );
}
