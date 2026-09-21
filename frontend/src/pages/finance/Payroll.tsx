import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Check, X, Banknote, FileDown, Save } from 'lucide-react';
import { get, post, put, toApiError, downloadFile } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Table, Tabs, StatCard } from '@/components/ui';
import { fmtDateTime, fmtMoney, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Payroll() {
  const { has } = useAuth();
  const [tab, setTab] = useState<'run' | 'struktur' | 'master' | 'config'>('run');
  return (
    <div>
      <PageHeader title="Payroll" subtitle="Hitung → validasi → setujui (keuangan) → setujui (kepsek) → bayarkan. PPh 21 skema TER & BPJS dihitung otomatis." />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'run', label: 'Penggajian bulanan' }, ...(has('payroll:write') ? [{ value: 'struktur' as const, label: 'Struktur gaji' }, { value: 'master' as const, label: 'Jabatan & komponen' }, { value: 'config' as const, label: 'BPJS & pajak' }] : [])]} />
      {tab === 'run' && <Runs />}
      {tab === 'struktur' && <Structures />}
      {tab === 'master' && <Master />}
      {tab === 'config' && <Config />}
    </div>
  );
}
function Runs() {
  const { has } = useAuth();
  const [runs, setRuns] = useState<Dict[] | null>(null);
  const [sel, setSel] = useState<Dict | null>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const load = useCallback(() => get<Dict[]>('/payroll/runs').then(setRuns), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => { try { const r = await post<Dict>('/payroll/runs', { period }); toast.success(`Payroll ${period} dihitung: ${r.employee_count} pegawai`); load(); setSel(r); } catch (e) { toast.error(toApiError(e).message); } };
  const act = async (run: Dict, action: string) => { try { const r = await post<Dict>(`/payroll/runs/${run.id}/${action}`); toast.success(`Status: ${label(r.status as string)}`); load(); setSel(r); } catch (e) { toast.error(toApiError(e).message); } };
  if (!runs) return <Loading />;
  const actions = (r: Dict) => { const s = r.status as string; return <div className="flex flex-wrap gap-1">
    {s === 'DRAFT' && has('payroll:write') && <><Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => post(`/payroll/runs/${r.id}/recompute`).then(() => { toast.success('Dihitung ulang'); load(); })}>Hitung ulang</Button><Button size="sm" onClick={() => act(r, 'validate')}>Validasi</Button></>}
    {s === 'VALIDATED' && has('payroll:approve_finance') && <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => act(r, 'approve_finance')}>Setujui (keuangan)</Button>}
    {s === 'FINANCE_APPROVED' && has('payroll:approve_principal') && <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => act(r, 'approve_principal')}>Setujui (kepsek)</Button>}
    {s === 'PRINCIPAL_APPROVED' && has('payroll:write') && <Button size="sm" variant="accent" icon={<Banknote className="h-4 w-4" />} onClick={() => { if (confirm('Tandai sudah dibayarkan & terbitkan slip gaji?')) act(r, 'pay'); }}>Bayarkan</Button>}
    {['VALIDATED', 'FINANCE_APPROVED', 'PRINCIPAL_APPROVED'].includes(s) && has('payroll:approve_finance') && <Button size="sm" variant="ghost" className="text-red-600" icon={<X className="h-4 w-4" />} onClick={() => act(r, 'reject')}>Kembalikan</Button>}
  </div>; };
  return (
    <div className="space-y-4">
      {has('payroll:write') && <Card><div className="flex flex-wrap items-end gap-3"><Field label="Periode baru"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field><Button icon={<Plus className="h-4 w-4" />} onClick={create}>Hitung payroll</Button></div></Card>}
      <Card padded={false}><Table<Dict> rows={runs} onRowClick={(r) => setSel(r)} columns={[{ key: 'period', header: 'Periode', render: (r) => <b>{r.period as string}</b> }, { key: 'employee_count', header: 'Pegawai', className: 'text-center' }, { key: 'total_gross', header: 'Bruto', render: (r) => fmtMoney(r.total_gross as number) }, { key: 'total_net', header: 'Bersih', render: (r) => <b>{fmtMoney(r.total_net as number)}</b> }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'x', header: '', render: (r) => <div onClick={(e) => e.stopPropagation()}>{actions(r)}</div> }]} empty="Belum ada periode payroll" /></Card>
      <RunDetail run={sel} onClose={() => setSel(null)} />
    </div>
  );
}
function RunDetail({ run, onClose }: { run: Dict | null; onClose: () => void }) {
  const [d, setD] = useState<Dict | null>(null);
  useEffect(() => { if (run) get<Dict>(`/payroll/runs/${run.id}`).then(setD); else setD(null); }, [run]);
  return (
    <Modal open={!!run} onClose={onClose} size="full" title={`Payroll ${run?.period ?? ''}`}>
      {!d ? <Loading /> : <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><StatCard label="Pegawai" value={String(d.employee_count)} /><StatCard label="Total bruto" value={fmtMoney(d.total_gross as number)} tone="blue" /><StatCard label="Total bersih" value={fmtMoney(d.total_net as number)} tone="green" /><StatCard label="Status" value={label(d.status as string)} hint={d.paid_at ? `dibayar ${fmtDateTime(d.paid_at as string)}` : undefined} tone="accent" /></div>
        <Table<Dict> dense rows={d.items as Dict[]} columns={[{ key: 'full_name', header: 'Pegawai', render: (r) => <div><div className="font-medium">{r.full_name as string}</div><div className="text-xs text-ink-3">{r.position_name as string} · {r.bank_name as string} {r.bank_account as string}</div></div> }, { key: 'gross', header: 'Bruto', render: (r) => fmtMoney(r.gross as number) }, { key: 'deductions', header: 'Potongan', render: (r) => fmtMoney(r.deductions as number) }, { key: 'bpjs_employee', header: 'BPJS', render: (r) => fmtMoney(r.bpjs_employee as number) }, { key: 'pph21', header: 'PPh 21', render: (r) => fmtMoney(r.pph21 as number) }, { key: 'net', header: 'Bersih', render: (r) => <b>{fmtMoney(r.net as number)}</b> }, { key: 'attendance_days', header: 'Hari', className: 'text-center', render: (r) => String(r.attendance_days ?? '-') }, { key: 'detail', header: 'Rincian', render: (r) => <details><summary className="cursor-pointer text-xs text-brand-700">lihat</summary><ul className="mt-1 text-xs">{((r.detail_lines as Dict[]) ?? []).map((l, i) => <li key={i} className={l.kind === 'DEDUCTION' ? 'text-red-600' : ''}>{l.name as string}: {fmtMoney(l.amount as number)}</li>)}</ul></details> }]} />
      </div>}
    </Modal>
  );
}
function Structures() {
  const [staff, setStaff] = useState<Dict[] | null>(null);
  const [sel, setSel] = useState<Dict | null>(null);
  const load = useCallback(() => get<Dict[]>('/payroll/staff').then(setStaff), []);
  useEffect(() => { load(); }, [load]);
  if (!staff) return <Loading />;
  return <><Card padded={false}><Table<Dict> rows={staff} onRowClick={(r) => setSel(r)} columns={[{ key: 'full_name', header: 'Pegawai', render: (r) => <div><div className="font-medium">{r.full_name as string}</div><div className="text-xs text-ink-3">{r.nip as string} · {r.employment_status as string}</div></div> }, { key: 'position_name', header: 'Jabatan' }, { key: 'ptkp_status', header: 'PTKP' }, { key: 'gross_estimate', header: 'Estimasi bruto', render: (r) => Number(r.gross_estimate) ? fmtMoney(r.gross_estimate as number) : <Badge tone="amber">belum diatur</Badge> }]} /></Card><StructureModal user={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(); }} /></>;
}
function StructureModal({ user, onClose, onSaved }: { user: Dict | null; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Dict[]>([]);
  const [positions, setPositions] = useState<Dict[]>([]);
  const [pos, setPos] = useState(''); const [ptkp, setPtkp] = useState('TK/0');
  useEffect(() => { if (!user) return; get<Dict[]>(`/payroll/staff/${user.id}/structure`).then(setRows); get<unknown>('/payroll/positions', { limit: 100 }).then((d) => setPositions((d as { data?: Dict[] }).data ?? [])); setPtkp(String(user.ptkp_status ?? 'TK/0')); }, [user]);
  const save = async () => { try { await put(`/payroll/staff/${user!.id}/structure`, { position_id: pos || undefined, ptkp_status: ptkp, items: rows.map((r) => ({ component_id: r.component_id, amount: r.amount === null || r.amount === '' ? null : Number(r.amount) })) }); toast.success('Struktur gaji disimpan'); onSaved(); } catch (e) { toast.error(toApiError(e).message); } };
  return (
    <Modal open={!!user} onClose={onClose} title={`Struktur gaji — ${user?.full_name ?? ''}`} footer={<Button icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button>}>
      <div className="mb-3 grid grid-cols-2 gap-3"><Field label="Jabatan"><Select value={pos} onChange={(e) => setPos(e.target.value)} placeholder={String(user?.position_name ?? '—')} options={positions.map((p) => ({ value: p.id as string, label: p.name as string }))} /></Field><Field label="Status PTKP"><Select value={ptkp} onChange={(e) => setPtkp(e.target.value)} options={['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'].map((x) => ({ value: x, label: x }))} /></Field></div>
      <div className="divide-y divide-line rounded-xl border border-line">{rows.map((r, i) => <div key={r.component_id as string} className="flex items-center gap-3 px-3 py-2 text-sm"><div className="min-w-0 flex-1"><div>{r.name as string}</div><div className="text-xs text-ink-3">{r.kind as string} · {r.calc as string}{r.taxable ? ' · kena pajak' : ''}</div></div><Input type="number" className="h-8 w-40" placeholder={`default ${Number(r.default_amount).toLocaleString('id-ID')}`} value={r.amount === null || r.amount === undefined ? '' : String(r.amount)} onChange={(e) => setRows((a) => a.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></div>)}</div>
    </Modal>
  );
}
function Master() {
  const [tab, setTab] = useState<'pos' | 'comp'>('comp');
  return <div><Tabs className="mb-3 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'comp', label: 'Komponen gaji' }, { value: 'pos', label: 'Jabatan' }]} />
    {tab === 'comp' ? <CrudPage<Dict> noHeader title="Komponen" endpoint="/payroll/components" entityLabel="komponen" perm={{ write: 'payroll:write' }} columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Nama' }, { key: 'kind', header: 'Jenis', render: (r) => <Badge tone={r.kind === 'DEDUCTION' ? 'red' : 'green'}>{r.kind as string}</Badge> }, { key: 'calc', header: 'Perhitungan' }, { key: 'default_amount', header: 'Default', render: (r) => fmtMoney(r.default_amount as number) }, { key: 'taxable', header: 'Pajak', render: (r) => (r.taxable ? 'Ya' : '-') }]} fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama', required: true }, { name: 'kind', label: 'Jenis', type: 'select', defaultValue: 'ALLOWANCE', options: [{ value: 'EARNING', label: 'Gaji pokok' }, { value: 'ALLOWANCE', label: 'Tunjangan' }, { value: 'DEDUCTION', label: 'Potongan' }] }, { name: 'calc', label: 'Perhitungan', type: 'select', defaultValue: 'FIXED', options: [{ value: 'FIXED', label: 'Tetap per bulan' }, { value: 'PER_DAY', label: 'Per hari hadir' }, { value: 'PERCENT', label: '% dari bruto sebelumnya' }] }, { name: 'default_amount', label: 'Nominal default', type: 'number', defaultValue: 0 }, { name: 'order_no', label: 'Urutan', type: 'number', defaultValue: 0 }, { name: 'taxable', label: 'Kena pajak', type: 'switch', defaultValue: true }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />
      : <CrudPage<Dict> noHeader title="Jabatan" endpoint="/payroll/positions" entityLabel="jabatan" perm={{ write: 'payroll:write' }} columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Nama' }, { key: 'base_salary', header: 'Gaji dasar', render: (r) => fmtMoney(r.base_salary as number) }]} fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama', required: true }, { name: 'base_salary', label: 'Gaji dasar (referensi)', type: 'number', defaultValue: 0 }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />}
  </div>;
}
function Config() {
  const [c, setC] = useState<Dict | null>(null);
  useEffect(() => { get<Dict>('/payroll/config').then(setC); }, []);
  if (!c) return <Loading />;
  const F = ([k, l]: [string, string]) => <Field key={k} label={l}><Input type="number" step="0.01" value={String(c[k] ?? '')} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></Field>;
  const save = async () => { const body: Dict = {}; for (const [k, v] of Object.entries(c)) if (!['id', 'tenant_id', 'created_at', 'updated_at'].includes(k)) body[k] = k === 'apply_pph21' ? !!Number(v) : Number(v); try { await put('/payroll/config', body); toast.success('Tersimpan'); } catch (e) { toast.error(toApiError(e).message); } };
  return <Card title="Parameter BPJS & PPh 21" action={<Button size="sm" onClick={save} icon={<Save className="h-4 w-4" />}>Simpan</Button>}><div className="grid gap-3 sm:grid-cols-3">{([['pay_day', 'Tanggal gajian'], ['bpjs_kes_employee', 'BPJS Kes pegawai %'], ['bpjs_kes_employer', 'BPJS Kes pemberi kerja %'], ['bpjs_kes_cap', 'Batas upah BPJS Kes'], ['bpjs_tk_jht_employee', 'JHT pegawai %'], ['bpjs_tk_jht_employer', 'JHT pemberi kerja %'], ['bpjs_tk_jp_employee', 'JP pegawai %'], ['bpjs_tk_jp_employer', 'JP pemberi kerja %'], ['bpjs_tk_jkk', 'JKK %'], ['bpjs_tk_jkm', 'JKM %']] as [string, string][]).map(F)}<Field label="Terapkan PPh 21 TER"><Select value={String(Number(c.apply_pph21 ?? 1))} onChange={(e) => setC({ ...c, apply_pph21: e.target.value })} options={[{ value: '1', label: 'Ya' }, { value: '0', label: 'Tidak' }]} /></Field></div><p className="mt-3 text-xs text-ink-3">Tarif efektif rata-rata (TER) mengikuti PP 58/2023. Verifikasi tabel dengan regulasi terbaru sebelum produksi.</p></Card>;
}

export function MySlips() {
  const [rows, setRows] = useState<Dict[] | null>(null);
  useEffect(() => { get<Dict[]>('/payroll/slips/mine').then(setRows); }, []);
  if (!rows) return <Loading />;
  return <div><PageHeader title="Slip Gaji Saya" />{rows.length === 0 ? <EmptyState title="Belum ada slip gaji" /> : <Card padded={false}><Table<Dict> rows={rows} columns={[{ key: 'period', header: 'Periode', render: (r) => <b>{r.period as string}</b> }, { key: 'gross', header: 'Bruto', render: (r) => fmtMoney(r.gross as number) }, { key: 'bpjs_employee', header: 'BPJS', render: (r) => fmtMoney(r.bpjs_employee as number) }, { key: 'pph21', header: 'PPh 21', render: (r) => fmtMoney(r.pph21 as number) }, { key: 'net', header: 'Diterima', render: (r) => <b className="text-brand-700">{fmtMoney(r.net as number)}</b> }, { key: 'issued_at', header: 'Terbit', render: (r) => fmtDateTime(r.issued_at as string) }, { key: 'x', header: '', render: (r) => <Button size="sm" variant="outline" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/payroll/slips/${r.id}/pdf`, `slip-${r.period}.pdf`)}>PDF</Button> }]} /></Card>}</div>;
}
