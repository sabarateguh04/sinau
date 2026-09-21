import { useEffect, useState } from 'react';
import { FileDown, Receipt } from 'lucide-react';
import { get, downloadFile } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Select, StatCard, Table } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtMoney, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

/** Student / guardian view of invoices and payments. */
export default function StudentInvoices() {
  const { user, hasRole } = useAuth();
  const kids = hasRole('WALI_MURID') ? user?.children ?? [] : [];
  const [sid, setSid] = useState(kids[0]?.id ?? 'me');
  const [d, setD] = useState<Dict | null>(null);
  useEffect(() => { setD(null); get<Dict>(`/finance/invoices/student/${sid}`).then(setD); }, [sid]);
  return (
    <div>
      <PageHeader title="Tagihan & Pembayaran" subtitle="Bayar ke bendahara sekolah / transfer sesuai petunjuk; status diperbarui setelah dikonfirmasi." actions={kids.length > 0 && <Select value={sid} onChange={(e) => setSid(e.target.value)} options={kids.map((k) => ({ value: k.id, label: k.full_name }))} />} />
      {!d ? <Loading /> : <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><StatCard label="Total tunggakan" value={fmtMoney(d.outstanding as number)} tone={Number(d.outstanding) > 0 ? 'red' : 'green'} icon={<Receipt className="h-5 w-5" />} /><StatCard label="Tagihan terbuka" value={String((d.invoices as Dict[]).filter((i) => ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(i.status as string)).length)} tone="blue" /></div>
        <Card padded={false} title="Tagihan">{(d.invoices as Dict[]).length === 0 ? <div className="p-6"><EmptyState title="Tidak ada tagihan" /></div> : <Table<Dict> rows={d.invoices as Dict[]} columns={[{ key: 'title', header: 'Tagihan', render: (r) => <div><div className="font-medium">{r.title as string}</div><div className="text-xs text-ink-3">{r.number as string} · jatuh tempo {fmtDate(r.due_date as string)}</div></div> }, { key: 'amount', header: 'Jumlah', render: (r) => fmtMoney(r.amount as number) }, { key: 'paid', header: 'Dibayar', render: (r) => fmtMoney(r.paid as number) }, { key: 'remaining', header: 'Sisa', render: (r) => <b className={Number(r.remaining) > 0 ? 'text-red-600' : 'text-emerald-600'}>{fmtMoney(r.remaining as number)}</b> }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }]} />}</Card>
        <Card padded={false} title="Riwayat pembayaran">{(d.payments as Dict[]).length === 0 ? <div className="p-6"><EmptyState title="Belum ada pembayaran" /></div> : <Table<Dict> dense rows={d.payments as Dict[]} columns={[{ key: 'paid_at', header: 'Waktu', render: (r) => fmtDateTime(r.paid_at as string) }, { key: 'number', header: 'Nomor', render: (r) => <code className="text-xs">{r.number as string}</code> }, { key: 'amount', header: 'Jumlah', render: (r) => <b>{fmtMoney(r.amount as number)}</b> }, { key: 'method', header: 'Metode' }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'x', header: '', render: (r) => <Button size="sm" variant="ghost" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/finance/payments/${r.id}/receipt`, `kwitansi-${r.number}.pdf`)}>Kwitansi</Button> }]} />}</Card>
      </div>}
    </div>
  );
}
