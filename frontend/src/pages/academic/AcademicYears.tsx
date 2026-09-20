import { Check } from 'lucide-react';
import { post } from '@/lib/api';
import { toast } from '@/store/ui';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function AcademicYears() {
  return (
    <CrudPage<Dict> title="Tahun Ajaran" subtitle="Satu tahun ajaran aktif menentukan kelas, jadwal, dan rapor yang berjalan." endpoint="/academic/years" entityLabel="tahun ajaran" perm={{ write: 'academic:write' }} sort="name" order="DESC"
      columns={[
        { key: 'name', header: 'Tahun', render: (r) => <span className="font-semibold">{r.name as string}</span> },
        { key: 'start_date', header: 'Mulai', render: (r) => fmtDate(r.start_date as string) },
        { key: 'end_date', header: 'Selesai', render: (r) => fmtDate(r.end_date as string) },
        { key: 'active_semester', header: 'Semester aktif', className: 'text-center' },
        { key: 'is_active', header: 'Status', render: (r) => r.is_active ? <Badge tone="green">Aktif</Badge> : <Badge tone="gray">Nonaktif</Badge> },
      ]}
      rowActions={(r, reload) => !r.is_active && <Button size="sm" variant="outline" icon={<Check className="h-4 w-4" />} onClick={async () => { await post(`/academic/years/${r.id}/activate`); toast.success('Tahun ajaran diaktifkan'); reload(); }}>Aktifkan</Button>}
      fields={[
        { name: 'name', label: 'Nama (mis. 2026/2027)', required: true, placeholder: '2026/2027' },
        { name: 'active_semester', label: 'Semester aktif', type: 'select', defaultValue: 1, options: [{ value: 1, label: 'Ganjil (1)' }, { value: 2, label: 'Genap (2)' }], toValue: (v) => Number(v) },
        { name: 'start_date', label: 'Tanggal mulai', type: 'date' },
        { name: 'end_date', label: 'Tanggal selesai', type: 'date' },
        { name: 'is_active', label: 'Jadikan aktif', type: 'switch' },
      ]}
    />
  );
}
