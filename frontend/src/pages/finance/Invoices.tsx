import { useEffect, useMemo, useState } from 'react';
import { Plus, Layers, Wallet, Receipt, Ban } from 'lucide-react';
import { get, post, put, del, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { useResource, useAsyncOptions } from '@/features/crud/CrudPage';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Table, Textarea, useDebounce, Checkbox, StatCard } from '@/components/ui';
import { fmtDate, fmtMoney, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';
import { PaymentForm } from './Payments';

export default function Invoices() {
  const { has } = useAuth();
  const canWrite = has('finance:write');
  const [q, setQ] = useState(''); const dq = useDebounce(q);
  const [status, setStatus] = useState(''); const [classId, setClassId] = useState(''); const [period, setPeriod] = useState('');
  const [page, setPage] = useState(1);
  const [gen, setGen] = useState(false); const [single, setSingle] = useState(false);
  const [pay, setPay] = useState<Dict | null>(null);
  const [edit, setEdit] = useState<Dict | null>(null);
  const params = useMemo(() => ({ q: dq || undefined, status: status || undefined, class_id: classId || undefined, period: period || undefined, page, limit: 25 }), [dq, status, classId, period, page]);
  const { rows, meta, loading, reload } = useResource<Dict>('/finance/invoices', params);
  const classes = useAsyncOptions({ url: '/academic/classes', params: { active_year: 1 }, label: 'name' });
  useEffect(() => setPage(1), [dq, status, classId, period]);
  return (
    <div>
      <PageHeader title="Tagihan" subtitle="SPP dan biaya lain per siswa. Buat massal per kelas, terima pembayaran, pantau tunggakan." actions={canWrite && <><Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setSingle(true)}>Tagihan tunggal</Button><Button icon={<Layers className="h-4 w-4" />} onClick={() => setGen(true)}>Buat massal</Button></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><StatCard label="Sisa tunggakan (filter aktif)" value={fmtMoney((meta as unknown as { remaining?: number }).remaining ?? 0)} tone="red" icon={<Receipt className="h-5 w-5" />} /><StatCard label="Tagihan" value={String(meta.total)} tone="blue" /></div>
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3"><SearchInput value={q} onChange={setQ} className="w-64" placeholder="Nomor / nama / judul" /><Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" placeholder="Semua status" options={['UNPAID', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELLED'].map((x) => ({ value: x, label: label(x) }))} /><Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-40" placeholder="Semua kelas" options={classes} /><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" /></div>
        <Table<Dict> loading={loading} rows={rows} columns={[
          { key: 'number', header: 'Nomor', render: (r) => <code className="text-xs">{r.number as string}</code> },
          { key: 'student_name', header: 'Siswa', render: (r) => <div><div className="font-medium">{r.student_name as string}</div><div className="text-xs text-ink-3">{r.class_name as string} · {r.nis as string}</div></div> },
          { key: 'title', header: 'Tagihan', render: (r) => <div>{r.title as string}<div className="text-xs text-ink-3">Jatuh tempo {fmtDate(r.due_date as string)}</div></div> },
          { key: 'amount', header: 'Jumlah', render: (r) => <div className="text-right"><div>{fmtMoney(r.amount as number)}</div>{Number(r.late_fee) > 0 && <div className="text-xs text-red-600">+ denda {fmtMoney(r.late_fee as number)}</div>}{Number(r.discount) > 0 && <div className="text-xs text-emerald-600">− diskon {fmtMoney(r.discount as number)}</div>}</div> },
          { key: 'remaining', header: 'Sisa', render: (r) => <b className={Number(r.remaining) > 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtMoney(r.remaining as number)}</b> },
          { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> },
          { key: 'x', header: '', render: (r) => canWrite && ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(r.status as string) ? <div className="flex gap-1"><Button size="sm" icon={<Wallet className="h-4 w-4" />} onClick={() => setPay(r)}>Bayar</Button><Button size="sm" variant="ghost" onClick={() => setEdit(r)}>Ubah</Button></div> : null },
        ]} empty="Tidak ada tagihan" />
        <div className="border-t border-line px-2"><Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} /></div>
      </Card>
      <GenerateModal open={gen} onClose={() => setGen(false)} onDone={() => { setGen(false); reload(); }} />
      <SingleModal open={single} onClose={() => setSingle(false)} onDone={() => { setSingle(false); reload(); }} />
      <PaymentForm open={!!pay} studentId={pay?.student_id as string} studentName={pay?.student_name as string} invoice={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); reload(); }} />
      <EditModal inv={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />
    </div>
  );
}
function GenerateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const fees = useAsyncOptions({ url: '/finance/fee-types', label: (r) => `${r.name} (${Number(r.default_amount).toLocaleString('id-ID')})` });
  const [classes, setClasses] = useState<Dict[]>([]);
  const [f, setF] = useState({ fee_type_id: '', period: new Date().toISOString().slice(0, 7), due_date: '', amount: '', title: '' });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) get<unknown>('/academic/classes', { active_year: 1, limit: 200 }).then((d) => setClasses((d as { data?: Dict[] }).data ?? [])); }, [open]);
  const submit = async () => { setBusy(true); try { const r = await post<Dict>('/finance/invoices/generate', { fee_type_id: f.fee_type_id, period: f.period || null, due_date: f.due_date || null, amount: f.amount ? Number(f.amount) : undefined, title: f.title || undefined, class_ids: picked.size ? [...picked] : undefined }); toast.success(`${r.created} tagihan dibuat untuk ${r.students} siswa`); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Buat tagihan massal" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} disabled={!f.fee_type_id} onClick={submit}>Buat tagihan</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Jenis biaya" required className="sm:col-span-2"><Select value={f.fee_type_id} onChange={(e) => setF({ ...f, fee_type_id: e.target.value })} placeholder="— pilih —" options={fees} /></Field><Field label="Periode (bulan)" hint="Kosongkan untuk biaya sekali"><Input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field><Field label="Jatuh tempo"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field><Field label="Nominal (kosongkan = default)"><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field><Field label="Judul (opsional)"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
      <div className="mt-3"><div className="mb-1 text-xs font-semibold uppercase text-ink-3">Kelas (kosong = semua kelas aktif)</div><div className="flex flex-wrap gap-2">{classes.map((c) => <Checkbox key={c.id as string} checked={picked.has(c.id as string)} onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(c.id as string); else n.delete(c.id as string); return n; })} label={c.name as string} />)}</div></div>
    </Modal>
  );
}
function SingleModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const students = useAsyncOptions({ url: '/users', params: { role: 'SISWA', limit: 500 }, label: (r) => `${r.full_name}${r.class_name ? ` — ${r.class_name}` : ''}` });
  const fees = useAsyncOptions({ url: '/finance/fee-types', label: 'name' });
  const [f, setF] = useState({ student_id: '', fee_type_id: '', title: '', amount: '', discount: '', due_date: '', note: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await post('/finance/invoices', { student_id: f.student_id, fee_type_id: f.fee_type_id || null, title: f.title, amount: Number(f.amount), discount: f.discount ? Number(f.discount) : 0, due_date: f.due_date || null, note: f.note || null }); toast.success('Tagihan dibuat'); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Tagihan tunggal" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} disabled={!f.student_id || !f.title || !f.amount} onClick={submit}>Simpan</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Siswa" required className="sm:col-span-2"><Select value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })} placeholder="— pilih —" options={students} /></Field><Field label="Jenis biaya"><Select value={f.fee_type_id} onChange={(e) => setF({ ...f, fee_type_id: e.target.value })} placeholder="—" options={fees} /></Field><Field label="Judul" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Nominal" required><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field><Field label="Diskon"><Input type="number" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field><Field label="Jatuh tempo"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field><Field label="Catatan"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
    </Modal>
  );
}
function EditModal({ inv, onClose, onDone }: { inv: Dict | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ discount: '', late_fee: '', due_date: '', note: '' });
  useEffect(() => { if (inv) setF({ discount: String(inv.discount ?? 0), late_fee: String(inv.late_fee ?? 0), due_date: String(inv.due_date ?? '').slice(0, 10), note: String(inv.note ?? '') }); }, [inv]);
  const save = async () => { try { await put(`/finance/invoices/${inv!.id}`, { discount: Number(f.discount), late_fee: Number(f.late_fee), due_date: f.due_date || null, note: f.note || null }); toast.success('Tersimpan'); onDone(); } catch (e) { toast.error(toApiError(e).message); } };
  const cancel = async () => { if (!confirm('Batalkan tagihan ini?')) return; try { if (Number(inv!.paid) > 0) await put(`/finance/invoices/${inv!.id}`, { status: 'CANCELLED' }); else await del(`/finance/invoices/${inv!.id}`); toast.success('Tagihan dibatalkan'); onDone(); } catch (e) { toast.error(toApiError(e).message); } };
  return (
    <Modal open={!!inv} onClose={onClose} title={`Ubah ${inv?.number ?? ''}`} size="sm" footer={<><Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={cancel}>Batalkan</Button><Button onClick={save}>Simpan</Button></>}>
      <div className="space-y-3"><Field label="Diskon"><Input type="number" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field><Field label="Denda"><Input type="number" value={f.late_fee} onChange={(e) => setF({ ...f, late_fee: e.target.value })} /></Field><Field label="Jatuh tempo"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field><Field label="Catatan"><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
    </Modal>
  );
}
