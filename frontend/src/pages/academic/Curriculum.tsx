import { CrudPage } from '@/features/crud/CrudPage';
import { Badge } from '@/components/ui';
import { Dict } from '@/lib/types';

export default function Curriculum() {
  return (
    <CrudPage<Dict> title="Kurikulum (CP / ATP / TP)" subtitle="Referensi Capaian Pembelajaran, Alur Tujuan Pembelajaran, dan Tujuan Pembelajaran per mapel." endpoint="/academic/curriculum" entityLabel="referensi" perm={{ write: 'academic:write' }} sort="order_no" order="ASC"
      columns={[{ key: 'subject_name', header: 'Mapel' }, { key: 'grade_level', header: 'Kelas', className: 'text-center' }, { key: 'type', header: 'Jenis', render: (r) => <Badge tone="brand">{r.type as string}</Badge> }, { key: 'code', header: 'Kode' }, { key: 'description', header: 'Deskripsi', render: (r) => <span className="line-clamp-2 max-w-lg text-sm">{r.description as string}</span> }]}
      filters={[{ name: 'subject_id', label: 'Mapel', type: 'async-select', source: { url: '/academic/subjects', label: 'name' } }, { name: 'type', label: 'Jenis', options: ['CP', 'ATP', 'TP', 'ELEMEN'].map((x) => ({ value: x, label: x })) }]}
      fields={[{ name: 'subject_id', label: 'Mapel', type: 'async-select', required: true, source: { url: '/academic/subjects', label: 'name' } }, { name: 'grade_level', label: 'Kelas', type: 'select', options: [10, 11, 12].map((g) => ({ value: g, label: `Kelas ${g}` })), toValue: (v) => (v ? Number(v) : null) }, { name: 'type', label: 'Jenis', type: 'select', defaultValue: 'CP', options: ['CP', 'ATP', 'TP', 'ELEMEN'].map((x) => ({ value: x, label: x })) }, { name: 'code', label: 'Kode' }, { name: 'order_no', label: 'Urutan', type: 'number', defaultValue: 0 }, { name: 'description', label: 'Deskripsi', type: 'textarea', required: true, span: 2 }]}
    />
  );
}
