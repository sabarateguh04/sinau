import { useEffect, useMemo, useState } from 'react';
import { Plus, FileDown, Ban } from 'lucide-react';
import { get, post, toApiError, downloadFile, uploadFile } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { useResource, useAsyncOptions } from '@/features/crud/CrudPage';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Table, useDebounce, StatCard, Checkbox } from '@/components/ui';
import { fmtDateTime, fmtMoney, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

const METHODS = ['TUNAI', 'TRANSFER', 'QRIS', 'VA', 'LAINNYA'];
export default function Payments() {
  const { has } = useAuth();
  const [q, setQ] = useState(''); const dq = useDebounce(q);
  const [method, setMethod] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const params = useMemo(() => ({ q: dq || undefined, method: method || undefined, from: from || undefined, to: to || undefined, page, limit: 25 }), [dq, method, from, to, page]);
  const { rows, meta, loading, reload } = useResource<Dict>('/finance/payments', params);
  useEffect(() => setPage(1), [dq, method, from, to]);
  return (
    <div>
      <PageHeader title="Pembayaran" subtitle="Penerimaan pembayaran siswa dan alokasinya ke tagihan." actions={has('finance:write') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Terima pembayaran</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3"><StatCard label="Total (filter aktif, terkonfirmasi)" value={fmtMoney((meta as unknown as { sum?: number }).sum ?? 0)} tone="green" /><StatCard label="Transaksi" value={String(meta.total)} tone="blue" /></div>
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3"><SearchInput value={q} onChange={setQ} className="w-64" placeholder="Nomor / nama / referensi" /><Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-36" placeholder="Semua metode" options={METHODS.map((x) => ({ value: x, label: x }))} /><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        <Table<Dict> loading={loading} rows={rows} columns={[
          { key: 'paid_at', header: 'Waktu', render: (r) => fmtDateTime(r.paid_at as string) }, { key: 'number', header: 'Nomor', render: (r) => <code className="text-xs">{r.number as string}</code> },
          { key: 'student_name', header: 'Siswa', render: (r) => <div><div className="font-medium">{r.student_name as string}</div><div className="text-xs text-ink-3">{r.class_name as string}</div></div> },
          { key: 'amount', header: 'Jumlah', render: (r) => <b>{fmtMoney(r.amount as number)}</b> }, { key: 'method', header: 'Metode', render: (r) => <Badge tone="gray">{r.method as string}</Badge> },
          { key: 'allocations', header: 'Alokasi', render: (r) => <span className="text-xs text-ink-2">{(r.allocations as string) ?? '-'}</span> },
          { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> },
          { key: 'x', header: '', render: (r) => <div className="flex gap-1"><Button size="sm" variant="ghost" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/finance/payments/${r.id}/receipt`, `kwitansi-${r.number}.pdf`)} />{has('finance:approve') && r.status === 'CONFIRMED' && <Button size="sm" variant="ghost" className="text-red-600" icon={<Ban className="h-4 w-4" />} onClick={async () => { if (!confirm('Batalkan pembayaran ini? Alokasi ke tagihan akan dikembalikan.')) return; await post(`/finance/payments/${r.id}/cancel`); reload(); }} />}</div> },
        ]} empty="Belum ada pembayaran" />
        <div className="border-t border-line px-2"><Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} /></div>
      </Card>
      <PaymentForm open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />
    </div>
  );
}

export function PaymentForm({ open, onClose, onDone, studentId, studentName, invoice }: { open: boolean; onClose: () => void; onDone: () => void; studentId?: string; studentName?: string; invoice?: Dict | null }) {
  const students = useAsyncOptions(open && !studentId ? { url: '/users', params: { role: 'SISWA', limit: 500 }, label: (r) => `${r.full_name}${r.class_name ? ` — ${r.class_name}` : ''}` } : undefined);
  const [sid, setSid] = useState(studentId ?? '');
  const [open_, setOpenInv] = useState<Dict[]>([]);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [f, setF] = useState({ amount: '', method: 'TUNAI', reference: '', paid_at: new Date().toISOString().slice(0, 16), note: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSid(studentId ?? ''); setAlloc(invoice ? { [invoice.id as string]: Number(invoice.remaining) } : {}); setF({ amount: invoice ? String(invoice.remaining) : '', method: 'TUNAI', reference: '', paid_at: new Date().toISOString().slice(0, 16), note: '' }); setFile(null); } }, [open, studentId, invoice]);
  useEffect(() => { if (sid) get<unknown>('/finance/invoices', { student_id: sid, open: 1, limit: 50 }).then((d) => setOpenInv((d as { data?: Dict[] }).data ?? [])); else setOpenInv([]); }, [sid]);
  const total = Object.values(alloc).reduce((a, b) => a + (b || 0), 0);
  const submit = async () => {
    setBusy(true);
    try { let proof_file_id: string | null = null; if (file) proof_file_id = (await uploadFile('payments', file)).id; const allocations = Object.entries(alloc).filter(([, v]) => v > 0).map(([invoice_id, amount]) => ({ invoice_id, amount })); await post('/finance/payments', { student_id: sid, amount: Number(f.amount), method: f.method, reference: f.reference || null, paid_at: new Date(f.paid_at).toISOString(), note: f.note || null, proof_file_id, allocations: allocations.length ? allocations : undefined }); toast.success('Pembayaran dicatat'); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={`Terima pembayaran${studentName ? ` — ${studentName}` : ''}`} footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} disabled={!sid || !Number(f.amount)} onClick={submit}>Simpan</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {!studentId && <Field label="Siswa" required className="sm:col-span-2"><Select value={sid} onChange={(e) => setSid(e.target.value)} placeholder="— pilih —" options={students} /></Field>}
        <Field label="Jumlah" required><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Metode"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={METHODS.map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="Referensi / no. transfer"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Waktu bayar"><Input type="datetime-local" value={f.paid_at} onChange={(e) => setF({ ...f, paid_at: e.target.value })} /></Field>
        <Field label="Bukti (opsional)"><input type="file" className="text-sm" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="Catatan"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <div className="mt-4"><div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase text-ink-3"><span>Alokasi ke tagihan (kosong = otomatis ke yang terlama)</span><span className={total > Number(f.amount) ? 'text-red-600' : ''}>Teralokasi {fmtMoney(total)}</span></div>
        {open_.length === 0 ? <div className="text-sm text-ink-3">Tidak ada tagihan terbuka.</div> : <div className="divide-y divide-line rounded-xl border border-line">{open_.map((i) => <div key={i.id as string} className="flex items-center gap-3 px-3 py-2 text-sm"><Checkbox checked={!!alloc[i.id as string]} onChange={(v) => setAlloc((a) => ({ ...a, [i.id as string]: v ? Number(i.remaining) : 0 }))} /><div className="min-w-0 flex-1"><div className="truncate">{i.title as string}</div><div className="text-xs text-ink-3">{i.number as string} · sisa {fmtMoney(i.remaining as number)}</div></div><Input type="number" className="h-8 w-32" value={alloc[i.id as string] ?? ''} onChange={(e) => setAlloc((a) => ({ ...a, [i.id as string]: Number(e.target.value) }))} /></div>)}</div>}
      </div>
    </Modal>
  );
}
