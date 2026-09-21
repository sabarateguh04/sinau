import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { get } from '@/lib/api';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Card, StatCard, Table } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function CashFlows() {
  const [s, setS] = useState<Dict | null>(null);
  useEffect(() => { get<Dict>('/finance/summary').then(setS).catch(() => setS({})); }, []);
  const t = (s?.totals as Dict) ?? {};
  return (
    <div className="space-y-5">
      {s && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Pemasukan tahun ini" value={fmtMoney(t.income_ytd as number)} tone="green" /><StatCard label="Pengeluaran tahun ini" value={fmtMoney(t.expense_ytd as number)} tone="red" /><StatCard label="Tunggakan" value={fmtMoney(t.outstanding as number)} hint={`${t.overdue_count ?? 0} tagihan terlambat`} tone="accent" /><StatCard label="Saldo bersih" value={fmtMoney(Number(t.income_ytd ?? 0) - Number(t.expense_ytd ?? 0))} tone="brand" /></div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Arus kas 12 bulan" className="lg:col-span-2">{(s.monthly as Dict[] | undefined)?.length ? <ResponsiveContainer width="100%" height={240}><BarChart data={s.monthly as Dict[]}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}jt`} /><Tooltip formatter={(v) => fmtMoney(v as number)} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} /><Legend /><Bar dataKey="income" name="Masuk" fill="var(--brand-600)" radius={[4, 4, 0, 0]} /><Bar dataKey="expense" name="Keluar" fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="text-sm text-ink-3">Belum ada data.</p>}</Card>
          <Card padded={false} title="Tunggakan per kelas"><Table<Dict> dense rows={(s.outstanding_by_class as Dict[]) ?? []} rowKey={(r) => r.name as string} columns={[{ key: 'name', header: 'Kelas' }, { key: 'students', header: 'Siswa', className: 'text-center' }, { key: 'remaining', header: 'Sisa', render: (r) => fmtMoney(r.remaining as number) }]} empty="Tidak ada tunggakan" /></Card>
        </div>
      </>}
      <CrudPage<Dict> title="Arus Kas" subtitle="Pembayaran siswa, gaji, dan refund tercatat otomatis; tambahkan transaksi lain secara manual." endpoint="/finance/cash-flows" entityLabel="transaksi" perm={{ write: 'finance:write' }} limit={30}
        columns={[{ key: 'tx_date', header: 'Tanggal', render: (r) => String(r.tx_date).slice(0, 10) }, { key: 'direction', header: '', render: (r) => <Badge tone={r.direction === 'IN' ? 'green' : 'red'}>{r.direction === 'IN' ? 'Masuk' : 'Keluar'}</Badge> }, { key: 'category', header: 'Kategori' }, { key: 'description', header: 'Keterangan' }, { key: 'amount', header: 'Nominal', render: (r) => <b className={r.direction === 'IN' ? 'text-emerald-600' : 'text-red-600'}>{fmtMoney(r.amount as number)}</b> }, { key: 'created_by_name', header: 'Oleh' }]}
        filters={[{ name: 'direction', label: 'Arah', options: [{ value: 'IN', label: 'Masuk' }, { value: 'OUT', label: 'Keluar' }] }, { name: 'from', label: 'Dari', type: 'text' }, { name: 'to', label: 'Sampai', type: 'text' }]}
        fields={[{ name: 'tx_date', label: 'Tanggal', type: 'date', required: true, defaultValue: new Date().toISOString().slice(0, 10) }, { name: 'direction', label: 'Arah', type: 'select', defaultValue: 'OUT', options: [{ value: 'IN', label: 'Masuk' }, { value: 'OUT', label: 'Keluar' }] }, { name: 'category', label: 'Kategori', required: true, placeholder: 'OPERASIONAL / LISTRIK / ATK' }, { name: 'amount', label: 'Nominal', type: 'number', required: true }, { name: 'description', label: 'Keterangan', span: 2 }]} />
    </div>
  );
}
