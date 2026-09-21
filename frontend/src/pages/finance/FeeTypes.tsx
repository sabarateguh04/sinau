import { useState } from 'react';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Tabs } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function FeeTypes() {
  const [tab, setTab] = useState<'biaya' | 'denda' | 'refund'>('biaya');
  return (
    <div>
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'biaya', label: 'Jenis biaya' }, { value: 'denda', label: 'Aturan denda' }, { value: 'refund', label: 'Refund' }]} />
      {tab === 'biaya' && <CrudPage<Dict> title="Jenis Biaya" endpoint="/finance/fee-types" entityLabel="jenis biaya" perm={{ write: 'finance:write' }} columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Nama' }, { key: 'default_amount', header: 'Nominal default', render: (r) => fmtMoney(r.default_amount as number) }, { key: 'period', header: 'Periode', render: (r) => <Badge tone="gray">{r.period as string}</Badge> }, { key: 'is_active', header: 'Aktif', render: (r) => (r.is_active ? 'Ya' : '-') }]} fields={[{ name: 'code', label: 'Kode', required: true, placeholder: 'SPP' }, { name: 'name', label: 'Nama', required: true }, { name: 'default_amount', label: 'Nominal default', type: 'number', required: true }, { name: 'period', label: 'Periode', type: 'select', defaultValue: 'BULANAN', options: ['BULANAN', 'SEMESTER', 'TAHUNAN', 'SEKALI'].map((x) => ({ value: x, label: x })) }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />}
      {tab === 'denda' && <CrudPage<Dict> title="Aturan Denda Keterlambatan" subtitle="Diterapkan otomatis setiap hari oleh worker ke tagihan yang lewat jatuh tempo." endpoint="/finance/late-fee-rules" entityLabel="aturan" perm={{ write: 'finance:write' }} searchable={false} columns={[{ key: 'fee_type_name', header: 'Jenis biaya', render: (r) => (r.fee_type_name as string) ?? 'Semua' }, { key: 'grace_days', header: 'Tenggang (hari)', className: 'text-center' }, { key: 'mode', header: 'Mode', render: (r) => <Badge tone="gray">{r.mode as string}</Badge> }, { key: 'amount', header: 'Besaran', render: (r) => (r.mode === 'PERCENT' ? `${r.amount}%` : fmtMoney(r.amount as number)) }, { key: 'max_amount', header: 'Maks', render: (r) => (r.max_amount ? fmtMoney(r.max_amount as number) : '-') }, { key: 'is_active', header: 'Aktif', render: (r) => (r.is_active ? 'Ya' : '-') }]} fields={[{ name: 'fee_type_id', label: 'Jenis biaya (kosong = semua)', type: 'async-select', source: { url: '/finance/fee-types', label: 'name' } }, { name: 'grace_days', label: 'Masa tenggang (hari)', type: 'number', defaultValue: 7 }, { name: 'mode', label: 'Mode', type: 'select', defaultValue: 'FLAT', options: [{ value: 'FLAT', label: 'Tetap (Rp)' }, { value: 'PERCENT', label: 'Persen dari tagihan' }, { value: 'PER_DAY', label: 'Per hari keterlambatan (Rp)' }] }, { name: 'amount', label: 'Besaran', type: 'number', required: true }, { name: 'max_amount', label: 'Maksimal denda', type: 'number' }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />}
      {tab === 'refund' && <RefundsTab />}
    </div>
  );
}
import { post, toApiError } from '@/lib/api';
import { toast } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui';
import { label, tone } from '@/lib/format';
function RefundsTab() {
  const { has } = useAuth();
  return <CrudPage<Dict> title="Refund" endpoint="/finance/refunds" entityLabel="refund" perm={{ write: 'finance:write' }} canEdit={false}
    columns={[{ key: 'student_name', header: 'Siswa' }, { key: 'amount', header: 'Jumlah', render: (r) => fmtMoney(r.amount as number) }, { key: 'reason', header: 'Alasan' }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'approved_by_name', header: 'Disetujui' }]}
    rowActions={(r, reload) => has('finance:approve') && r.status === 'PENDING' ? <div className="flex gap-1"><Button size="sm" variant="outline" onClick={async () => { try { await post(`/finance/refunds/${r.id}/approve`, { approve: false }); reload(); } catch (e) { toast.error(toApiError(e).message); } }}>Tolak</Button><Button size="sm" onClick={async () => { try { await post(`/finance/refunds/${r.id}/approve`, { approve: true, paid: true }); toast.success('Refund disetujui & dicatat di arus kas'); reload(); } catch (e) { toast.error(toApiError(e).message); } }}>Setujui & bayar</Button></div> : null}
    fields={[{ name: 'student_id', label: 'Siswa', type: 'async-select', required: true, source: { url: '/users', params: { role: 'SISWA', limit: 500 }, label: 'full_name' }, span: 2 }, { name: 'amount', label: 'Jumlah', type: 'number', required: true }, { name: 'reason', label: 'Alasan', type: 'textarea', span: 2 }]} />;
}
