import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Card, EmptyState, Loading, PageHeader, Table, Tabs, Select } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Discipline() {
  const { has, hasRole, user } = useAuth();
  const canWrite = has('discipline:write');
  const [tab, setTab] = useState<'catatan' | 'rekap' | 'aturan'>('catatan');
  if ((hasRole('SISWA') || hasRole('WALI_MURID')) && !canWrite) return <StudentDiscipline kids={hasRole('WALI_MURID') ? user?.children ?? [] : []} />;
  return (
    <div>
      <PageHeader title="Kedisiplinan" subtitle="Poin pelanggaran & penghargaan siswa. Orang tua bisa diberi notifikasi otomatis." />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'catatan', label: 'Catatan' }, { value: 'rekap', label: 'Rekap poin' }, ...(canWrite ? [{ value: 'aturan' as const, label: 'Aturan & poin' }] : [])]} />
      {tab === 'catatan' && <CrudPage<Dict> noHeader title="Catatan kedisiplinan" endpoint="/kesiswaan/discipline/records" entityLabel="catatan" modalSize="lg" perm={{ write: 'discipline:write' }}
        columns={[{ key: 'incident_date', header: 'Tanggal', render: (r) => fmtDate(r.incident_date as string) }, { key: 'student_name', header: 'Siswa', render: (r) => <div><div className="font-medium">{r.student_name as string}</div><div className="text-xs text-ink-3">{r.class_name as string}</div></div> }, { key: 'rule_name', header: 'Jenis', render: (r) => <Badge tone={r.kind === 'PENGHARGAAN' ? 'green' : 'red'}>{(r.rule_name as string) ?? (r.kind as string) ?? '-'}</Badge> }, { key: 'points', header: 'Poin', className: 'text-center', render: (r) => <b className={Number(r.points) < 0 ? 'text-emerald-600' : 'text-red-600'}>{r.points as number}</b> }, { key: 'description', header: 'Keterangan', render: (r) => <span className="line-clamp-2 max-w-sm text-sm">{r.description as string}</span> }, { key: 'recorded_by_name', header: 'Pencatat' }]}
        filters={[{ name: 'kind', label: 'Jenis', options: [{ value: 'PELANGGARAN', label: 'Pelanggaran' }, { value: 'PENGHARGAAN', label: 'Penghargaan' }] }, { name: 'class_id', label: 'Kelas', type: 'async-select', source: { url: '/academic/classes', params: { active_year: 1 }, label: 'name' } }]}
        fields={[{ name: 'student_id', label: 'Siswa', type: 'async-select', required: true, source: { url: '/users', params: { role: 'SISWA', limit: 500 }, label: (r) => `${r.full_name}${r.class_name ? ` — ${r.class_name}` : ''}` }, span: 2 }, { name: 'rule_id', label: 'Aturan', type: 'async-select', source: { url: '/kesiswaan/discipline/rules', label: (r) => `${r.name} (${r.points} poin)` } }, { name: 'incident_date', label: 'Tanggal', type: 'date', required: true }, { name: 'points', label: 'Poin (kosongkan = dari aturan)', type: 'number' }, { name: 'parent_notified', label: 'Beri tahu orang tua', type: 'switch' }, { name: 'description', label: 'Kronologi', type: 'textarea', span: 2 }, { name: 'action_taken', label: 'Tindakan', type: 'textarea', span: 2 }]} />}
      {tab === 'rekap' && <Summary />}
      {tab === 'aturan' && <CrudPage<Dict> noHeader title="Aturan" endpoint="/kesiswaan/discipline/rules" entityLabel="aturan" perm={{ write: 'discipline:write' }} columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Nama' }, { key: 'kind', header: 'Jenis', render: (r) => <Badge tone={r.kind === 'PENGHARGAAN' ? 'green' : 'red'}>{r.kind as string}</Badge> }, { key: 'points', header: 'Poin', className: 'text-center' }, { key: 'is_active', header: 'Aktif', render: (r) => (r.is_active ? 'Ya' : '-') }]} fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama', required: true }, { name: 'kind', label: 'Jenis', type: 'select', defaultValue: 'PELANGGARAN', options: [{ value: 'PELANGGARAN', label: 'Pelanggaran (+poin)' }, { value: 'PENGHARGAAN', label: 'Penghargaan (−poin)' }] }, { name: 'points', label: 'Poin', type: 'number', required: true, defaultValue: 5 }, { name: 'description', label: 'Deskripsi', type: 'textarea', span: 2 }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />}
    </div>
  );
}
function Summary() {
  const [rows, setRows] = useState<Dict[] | null>(null);
  useEffect(() => { get<Dict[]>('/kesiswaan/discipline/summary').then(setRows); }, []);
  if (!rows) return <Loading />;
  return <Card padded={false} title="Akumulasi poin per siswa"><Table<Dict> rows={rows} columns={[{ key: 'full_name', header: 'Siswa' }, { key: 'class_name', header: 'Kelas' }, { key: 'records', header: 'Catatan', className: 'text-center' }, { key: 'violation_points', header: 'Poin pelanggaran', render: (r) => <b className={Number(r.violation_points) >= 50 ? 'text-red-600' : ''}>{r.violation_points as number}</b> }, { key: 'reward_points', header: 'Poin penghargaan', render: (r) => <span className="text-emerald-600">{r.reward_points as number}</span> }]} empty="Belum ada catatan" /></Card>;
}
function StudentDiscipline({ kids }: { kids: { id: string; full_name: string }[] }) {
  const [sid, setSid] = useState(kids[0]?.id ?? 'me');
  const [d, setD] = useState<Dict | null>(null);
  useEffect(() => { setD(null); get<Dict>(`/kesiswaan/student/${sid}/summary`).then(setD); }, [sid]);
  return (
    <div>
      <PageHeader title="Kedisiplinan & Prestasi" actions={kids.length > 0 && <Select value={sid} onChange={(e) => setSid(e.target.value)} options={kids.map((k) => ({ value: k.id, label: k.full_name }))} />} />
      {!d ? <Loading /> : <div className="grid gap-4 lg:grid-cols-2">
        <Card padded={false} title={<span>Catatan kedisiplinan · total poin <b className={Number(d.points) >= 50 ? 'text-red-600' : ''}>{d.points as number}</b></span>}>{(d.discipline as Dict[]).length === 0 ? <div className="p-6"><EmptyState title="Tidak ada catatan" /></div> : <Table<Dict> dense rows={d.discipline as Dict[]} columns={[{ key: 'incident_date', header: 'Tanggal', render: (r) => fmtDate(r.incident_date as string) }, { key: 'rule_name', header: 'Jenis', render: (r) => <Badge tone={r.kind === 'PENGHARGAAN' ? 'green' : 'red'}>{(r.rule_name as string) ?? '-'}</Badge> }, { key: 'points', header: 'Poin', className: 'text-center' }, { key: 'description', header: 'Keterangan' }]} />}</Card>
        <Card padded={false} title="Prestasi">{(d.achievements as Dict[]).length === 0 ? <div className="p-6"><EmptyState title="Belum ada prestasi tercatat" /></div> : <Table<Dict> dense rows={d.achievements as Dict[]} columns={[{ key: 'achieved_at', header: 'Tanggal', render: (r) => fmtDate(r.achieved_at as string) }, { key: 'title', header: 'Prestasi' }, { key: 'level', header: 'Tingkat', render: (r) => <Badge tone="brand">{r.level as string}</Badge> }, { key: 'rank_label', header: 'Peringkat' }]} />}</Card>
      </div>}
    </div>
  );
}
