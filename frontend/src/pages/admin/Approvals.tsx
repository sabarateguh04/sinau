import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, Banknote, ScrollText, Wallet, Boxes, Lock, ArrowRight } from 'lucide-react';
import { get } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { Card, EmptyState, Loading, PageHeader, StatCard } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { Dict } from '@/lib/types';

/** Principal inbox: everything waiting for a decision, with deep links. */
export default function Approvals() {
  const { activeRole } = useAuth();
  const p = rolePrefix(activeRole);
  const [d, setD] = useState<Dict | null>(null);
  useEffect(() => { get<Dict>('/rollover/approvals').then(setD); }, []);
  if (!d) return <Loading />;
  const rapor = d.rapor as Dict[]; const payroll = d.payroll as Dict[]; const letters = d.letters as Dict[]; const refunds = d.refunds as Dict[]; const bookings = d.asset_bookings as Dict[];
  const total = rapor.length + payroll.length + letters.length + refunds.length + bookings.length + Number(d.pdp);
  return (
    <div>
      <PageHeader title="Persetujuan" subtitle={total ? `${total} hal menunggu keputusan Anda.` : 'Tidak ada yang menunggu. 🎉'} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6"><StatCard label="Rapor" value={String(rapor.reduce((a, r) => a + Number(r.count), 0))} icon={<BookMarked className="h-5 w-5" />} /><StatCard label="Payroll" value={String(payroll.length)} tone="green" icon={<Banknote className="h-5 w-5" />} /><StatCard label="Surat" value={String(letters.length)} tone="blue" icon={<ScrollText className="h-5 w-5" />} /><StatCard label="Refund" value={String(refunds.length)} tone="accent" icon={<Wallet className="h-5 w-5" />} /><StatCard label="Pinjam aset" value={String(bookings.length)} tone="purple" icon={<Boxes className="h-5 w-5" />} /><StatCard label="Data pribadi" value={String(d.pdp)} tone="red" icon={<Lock className="h-5 w-5" />} /></div>
      {total === 0 ? <EmptyState title="Semua beres" /> : <div className="grid gap-4 lg:grid-cols-2">
        {rapor.length > 0 && <Card title="e-Rapor menunggu pengesahan" action={<Link to={`/${p}/rapor`} className="text-xs text-brand-700">Buka <ArrowRight className="inline h-3 w-3" /></Link>}><ul className="divide-y divide-line text-sm">{rapor.map((r, i) => <li key={i} className="flex justify-between py-2"><span>{r.class_name as string} · Semester {r.semester as number}</span><b>{r.count as number} rapor</b></li>)}</ul></Card>}
        {payroll.length > 0 && <Card title="Payroll menunggu persetujuan kepsek" action={<Link to={`/${p}/payroll`} className="text-xs text-brand-700">Buka <ArrowRight className="inline h-3 w-3" /></Link>}><ul className="divide-y divide-line text-sm">{payroll.map((r) => <li key={r.id as string} className="flex justify-between py-2"><span>Periode {r.period as string} · {r.employee_count as number} pegawai</span><b>{fmtMoney(r.total_net as number)}</b></li>)}</ul></Card>}
        {letters.length > 0 && <Card title="Surat menunggu tanda tangan" action={<Link to={`/${p}/surat`} className="text-xs text-brand-700">Buka <ArrowRight className="inline h-3 w-3" /></Link>}><ul className="divide-y divide-line text-sm">{letters.map((r) => <li key={r.id as string} className="flex justify-between py-2"><span>{r.subject as string}<span className="block text-xs text-ink-3">{r.number as string}</span></span><span className="text-xs">{fmtDate(r.letter_date as string)}</span></li>)}</ul></Card>}
        {refunds.length > 0 && <Card title="Refund menunggu persetujuan" action={<Link to={`/${p}/keuangan/jenis-biaya`} className="text-xs text-brand-700">Buka <ArrowRight className="inline h-3 w-3" /></Link>}><ul className="divide-y divide-line text-sm">{refunds.map((r) => <li key={r.id as string} className="flex justify-between py-2"><span>{r.full_name as string}<span className="block text-xs text-ink-3">{r.reason as string}</span></span><b>{fmtMoney(r.amount as number)}</b></li>)}</ul></Card>}
        {bookings.length > 0 && <Card title="Peminjaman aset" action={<Link to={`/${p}/aset`} className="text-xs text-brand-700">Buka <ArrowRight className="inline h-3 w-3" /></Link>}><ul className="divide-y divide-line text-sm">{bookings.map((r) => <li key={r.id as string} className="flex justify-between py-2"><span>{r.asset_name as string} · {r.full_name as string}</span><span className="text-xs">{fmtDateTime(r.start_at as string)}</span></li>)}</ul></Card>}
        {Number(d.pdp) > 0 && <Card title="Permintaan data pribadi" action={<Link to={`/${p}/pdp`} className="text-xs text-brand-700">Buka <ArrowRight className="inline h-3 w-3" /></Link>}><p className="text-sm">{String(d.pdp)} permintaan menunggu tinjauan petugas.</p></Card>}
      </div>}
    </div>
  );
}
