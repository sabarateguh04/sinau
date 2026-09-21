import { useCallback, useEffect, useState } from 'react';
import { Upload, Link2 } from 'lucide-react';
import { api, get, put, toApiError } from '@/lib/api';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Table, Select } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Reconciliation() {
  const [batches, setBatches] = useState<Dict[] | null>(null);
  const [sel, setSel] = useState<Dict | null>(null);
  const [items, setItems] = useState<Dict[]>([]);
  const [upl, setUpl] = useState(false);
  const load = useCallback(() => get<Dict[]>('/finance/reconciliation').then(setBatches), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (sel) get<{ items: Dict[] }>(`/finance/reconciliation/${sel.id}`).then((d) => setItems(d.items)); }, [sel]);
  if (!batches) return <Loading />;
  return (
    <div>
      <PageHeader title="Rekonsiliasi Bank" subtitle="Unggah mutasi bank (CSV/XLSX: date, description, amount, reference). Dicocokkan otomatis dengan pembayaran transfer/VA/QRIS berdasarkan referensi atau nominal ±3 hari." actions={<Button icon={<Upload className="h-4 w-4" />} onClick={() => setUpl(true)}>Unggah mutasi</Button>} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card padded={false} title="Batch"><ul className="divide-y divide-line">{batches.map((b) => <li key={b.id as string}><button onClick={() => setSel(b)} className={`w-full px-4 py-3 text-left text-sm hover:bg-surface-2 ${sel?.id === b.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}><div className="font-medium">{b.file_name as string}</div><div className="text-xs text-ink-3">{fmtDateTime(b.created_at as string)} · {b.bank_name as string}</div><div className="mt-1 flex gap-1"><Badge tone="green">{b.matched as number} cocok</Badge><Badge tone="amber">{b.unmatched as number} belum</Badge></div></button></li>)}{batches.length === 0 && <li className="p-6 text-center text-sm text-ink-3">Belum ada batch</li>}</ul></Card>
        <Card padded={false} title={sel ? `Mutasi — ${sel.file_name}` : 'Pilih batch'}>{sel && <Table<Dict> dense rows={items} columns={[{ key: 'tx_date', header: 'Tanggal', render: (r) => fmtDate(r.tx_date as string) }, { key: 'description', header: 'Keterangan', render: (r) => <span className="line-clamp-1 max-w-xs text-xs">{r.description as string}</span> }, { key: 'reference', header: 'Ref', render: (r) => <code className="text-xs">{r.reference as string}</code> }, { key: 'amount', header: 'Nominal', render: (r) => fmtMoney(r.amount as number) }, { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'MATCHED' ? 'green' : 'amber'}>{r.status === 'MATCHED' ? 'Cocok' : 'Belum'}</Badge> }, { key: 'payment_number', header: 'Pembayaran', render: (r) => r.payment_number ? <span className="text-xs">{r.payment_number as string}<br />{r.student_name as string}</span> : <MatchButton item={r} onDone={() => { get<{ items: Dict[] }>(`/finance/reconciliation/${sel.id}`).then((d) => setItems(d.items)); load(); }} /> }]} />}</Card>
      </div>
      <UploadModal open={upl} onClose={() => setUpl(false)} onDone={() => { setUpl(false); load(); }} />
    </div>
  );
}
function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null); const [bank, setBank] = useState(''); const [busy, setBusy] = useState(false);
  const run = async () => { if (!file) return; setBusy(true); try { const fd = new FormData(); fd.append('file', file); fd.append('bank_name', bank); const r = await api.post('/finance/reconciliation', fd); toast.success(`${r.data.data.matched} dari ${r.data.data.total} baris cocok`); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return <Modal open={open} onClose={onClose} title="Unggah mutasi bank" size="sm" footer={<Button loading={busy} disabled={!file} onClick={run}>Proses</Button>}><div className="space-y-3"><Field label="Bank"><Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="BCA / Mandiri / BRI" /></Field><Field label="Berkas CSV/XLSX"><input type="file" accept=".csv,.xlsx" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field></div></Modal>;
}
function MatchButton({ item, onDone }: { item: Dict; onDone: () => void }) {
  const [open, setOpen] = useState(false); const [pays, setPays] = useState<Dict[]>([]); const [pid, setPid] = useState('');
  useEffect(() => { if (open) get<unknown>('/finance/payments', { limit: 100, method: 'TRANSFER' }).then((d) => setPays((d as { data?: Dict[] }).data ?? [])); }, [open]);
  return <><Button size="sm" variant="ghost" icon={<Link2 className="h-4 w-4" />} onClick={() => setOpen(true)}>Cocokkan</Button><Modal open={open} onClose={() => setOpen(false)} size="sm" title="Cocokkan manual" footer={<Button disabled={!pid} onClick={async () => { await put(`/finance/reconciliation/items/${item.id}`, { payment_id: pid }); toast.success('Dicocokkan'); setOpen(false); onDone(); }}>Simpan</Button>}><Select value={pid} onChange={(e) => setPid(e.target.value)} placeholder="— pilih pembayaran —" options={pays.map((p) => ({ value: p.id as string, label: `${p.number} · ${p.student_name} · ${fmtMoney(p.amount as number)}` }))} /></Modal></>;
}
