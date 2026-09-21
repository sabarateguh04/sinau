import { useCallback, useEffect, useState } from 'react';
import { Download, Lock, Send, Check, X, Shield } from 'lucide-react';
import { get, post, put, downloadFile, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button, Card, Field, Loading, PageHeader, Select, StatCard, Switch, Table, Tabs, Textarea } from '@/components/ui';
import { fmtDateTime, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Pdp() {
  const { has } = useAuth();
  const [tab, setTab] = useState<'saya' | 'permintaan' | 'retensi'>(has('pdp:review') ? 'permintaan' : 'saya');
  return (
    <div>
      <PageHeader title="Pelindungan Data Pribadi" subtitle="Hak akses, perbaikan, ekspor, dan penghapusan data pribadi sesuai UU 27/2022; persetujuan; retensi otomatis." />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'saya', label: 'Data saya' }, ...(has('pdp:review') ? [{ value: 'permintaan' as const, label: 'Permintaan' }, { value: 'retensi' as const, label: 'Retensi' }] : [])]} />
      {tab === 'saya' && <MyData />}
      {tab === 'permintaan' && <Requests />}
      {tab === 'retensi' && <Retention />}
    </div>
  );
}
function MyData() {
  const [d, setD] = useState<Dict | null>(null);
  const [purposes, setPurposes] = useState<{ key: string; label: string }[]>([]);
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [reqs, setReqs] = useState<Dict[]>([]);
  const [type, setType] = useState('CORRECTION'); const [reason, setReason] = useState('');
  const load = useCallback(async () => { const [x, p, r] = await Promise.all([get<Dict>('/pdp/me'), get<{ key: string; label: string }[]>('/pdp/purposes'), get<Dict[]>('/pdp/me/requests')]); setD(x); setPurposes(p); setReqs(r); const c: Record<string, boolean> = {}; for (const pp of p) c[pp.key] = !!(x.consents as Dict[]).find((y) => y.purpose === pp.key && y.granted); setConsents(c); }, []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Loading />;
  const u = d.user as Dict;
  const saveConsents = async () => { await put('/pdp/me/consents', { consents: purposes.map((p) => ({ purpose: p.key, granted: !!consents[p.key] })) }); toast.success('Persetujuan disimpan'); };
  const submit = async () => { try { await post('/pdp/me/requests', { type, reason }); toast.success('Permintaan dikirim ke petugas'); setReason(''); load(); } catch (e) { toast.error(toApiError(e).message); } };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Data yang kami simpan</span>} action={<Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile('/pdp/me/export', 'data-pribadi.json')}>Ekspor JSON</Button>}>
        <dl className="grid grid-cols-2 gap-2 text-sm">{[['Nama', u.full_name], ['Nama pengguna', u.username], ['E-mail', u.email], ['HP', u.phone], ['Peran', (d.roles as string[]).join(', ')], ['Akun dibuat', fmtDateTime(u.created_at as string)]].map(([k, v]) => <div key={String(k)}><dt className="text-[11px] uppercase text-ink-3">{String(k)}</dt><dd>{String(v ?? '-')}</dd></div>)}</dl>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-2"><Badge tone="gray">{(d.grades as Dict[]).length} nilai</Badge><Badge tone="gray">{(d.attendance as Dict[]).length} absensi</Badge><Badge tone="gray">{(d.invoices as Dict[]).length} tagihan</Badge><Badge tone="gray">{(d.logins as Dict[]).length} login terakhir</Badge></div>
      </Card>
      <Card title="Persetujuan (consent)" action={<Button size="sm" onClick={saveConsents}>Simpan</Button>}><ul className="space-y-3">{purposes.map((p) => <li key={p.key} className="flex items-center justify-between gap-3 text-sm"><span>{p.label}</span><Switch checked={!!consents[p.key]} onChange={(v) => setConsents((c) => ({ ...c, [p.key]: v }))} /></li>)}</ul></Card>
      <Card title="Ajukan permintaan"><div className="space-y-3"><Field label="Jenis"><Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'CORRECTION', label: 'Perbaikan data' }, { value: 'RESTRICT', label: 'Pembatasan pemrosesan' }, { value: 'DELETE', label: 'Penghapusan akun & data pribadi' }]} /></Field><Field label="Alasan / detail" required><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>{type === 'DELETE' && <p className="text-xs text-red-600">Penghapusan menonaktifkan akun dan menganonimkan identitas; catatan akademik tetap disimpan sesuai kewajiban hukum.</p>}<Button icon={<Send className="h-4 w-4" />} disabled={reason.length < 5} onClick={submit}>Kirim</Button></div></Card>
      <Card padded={false} title="Riwayat permintaan"><Table<Dict> dense rows={reqs} columns={[{ key: 'created_at', header: 'Tanggal', render: (r) => fmtDateTime(r.created_at as string) }, { key: 'type', header: 'Jenis' }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'review_note', header: 'Catatan' }]} empty="Belum ada permintaan" /></Card>
    </div>
  );
}
function Requests() {
  const [stats, setStats] = useState<Dict | null>(null);
  useEffect(() => { get<Dict>('/pdp/stats').then(setStats); }, []);
  return <div className="space-y-4">{stats && <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><StatCard label="Menunggu tinjauan" value={String(stats.pending)} tone="accent" icon={<Lock className="h-5 w-5" />} /><StatCard label="Retensi terakhir" value={(stats.last_retention as Dict)?.at ? fmtDateTime((stats.last_retention as Dict).at as string) : '-'} tone="blue" /></div>}
    <CrudPage<Dict> noHeader title="Permintaan" endpoint="/pdp/requests" entityLabel="permintaan" perm={{ write: 'pdp:review' }} canCreate={false} canEdit={false} canDelete={false}
      columns={[{ key: 'created_at', header: 'Tanggal', render: (r) => fmtDateTime(r.created_at as string) }, { key: 'full_name', header: 'Pemohon', render: (r) => <div>{r.full_name as string}<div className="text-xs text-ink-3">@{r.username as string}</div></div> }, { key: 'type', header: 'Jenis', render: (r) => <Badge tone={r.type === 'DELETE' ? 'red' : 'blue'}>{r.type as string}</Badge> }, { key: 'reason', header: 'Alasan', render: (r) => <span className="line-clamp-2 max-w-md text-sm">{r.reason as string}</span> }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'reviewed_by_name', header: 'Ditinjau' }]}
      filters={[{ name: 'status', label: 'Status', options: ['PENDING', 'APPROVED', 'REJECTED'].map((x) => ({ value: x, label: label(x) })) }]}
      rowActions={(r, reload) => r.status === 'PENDING' ? <div className="flex gap-1"><Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={async () => { const note = prompt('Alasan penolakan:'); await post(`/pdp/requests/${r.id}/review`, { approve: false, note }); reload(); }}>Tolak</Button><Button size="sm" icon={<Check className="h-4 w-4" />} onClick={async () => { if (r.type === 'DELETE' && !confirm('Setujui penghapusan? Akun akan dinonaktifkan dan identitas dianonimkan.')) return; await post(`/pdp/requests/${r.id}/review`, { approve: true }); toast.success('Disetujui'); reload(); }}>Setujui</Button></div> : null} /></div>;
}
function Retention() {
  return <CrudPage<Dict> noHeader title="Kebijakan retensi" endpoint="/pdp/retention" entityLabel="kebijakan" perm={{ write: 'pdp:review' }} searchable={false}
    columns={[{ key: 'entity', header: 'Data' }, { key: 'retention_months', header: 'Simpan (bulan)', className: 'text-center' }, { key: 'action', header: 'Aksi' }, { key: 'is_active', header: 'Aktif', render: (r) => (r.is_active ? 'Ya' : '-') }, { key: 'last_run_at', header: 'Terakhir dijalankan', render: (r) => r.last_run_at ? fmtDateTime(r.last_run_at as string) : '-' }]}
    fields={[{ name: 'entity', label: 'Data', type: 'select', required: true, options: [{ value: 'audit_logs', label: 'Audit log' }, { value: 'notifications', label: 'Notifikasi' }, { value: 'alumni', label: 'Kontak alumni' }, { value: 'ppdb_applicants', label: 'Pendaftar PPDB ditolak' }, { value: 'counseling_notes', label: 'Catatan BK' }] }, { name: 'retention_months', label: 'Masa simpan (bulan)', type: 'number', required: true, defaultValue: 60 }, { name: 'action', label: 'Aksi setelah masa simpan', type: 'select', defaultValue: 'ANONYMIZE', options: [{ value: 'ANONYMIZE', label: 'Anonimkan' }, { value: 'DELETE', label: 'Hapus' }] }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />;
}
