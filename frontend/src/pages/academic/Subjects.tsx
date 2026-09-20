import { CrudPage } from '@/features/crud/CrudPage';
import { Badge } from '@/components/ui';
import { Dict } from '@/lib/types';

const CATS = [['UMUM', 'Umum'], ['KEJURUAN', 'Kejuruan'], ['MULOK', 'Muatan lokal'], ['P5', 'Projek P5'], ['PILIHAN', 'Pilihan']];
export default function Subjects() {
  return (
    <CrudPage<Dict> title="Mata Pelajaran" endpoint="/academic/subjects" entityLabel="mapel" perm={{ write: 'academic:write' }} sort="name" order="ASC"
      columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Nama', render: (r) => <span className="font-medium">{r.name as string}</span> }, { key: 'category', header: 'Kategori', render: (r) => <Badge tone={r.category === 'KEJURUAN' ? 'purple' : 'gray'}>{r.category as string}</Badge> }, { key: 'hours_per_week', header: 'JP/minggu', className: 'text-center' }, { key: 'is_competency', header: 'Kompetensi', render: (r) => (r.is_competency ? 'Ya' : '-') }, { key: 'is_active', header: 'Status', render: (r) => <Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge> }]}
      filters={[{ name: 'category', label: 'Kategori', options: CATS.map(([v, l]) => ({ value: v, label: l })) }]}
      fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama', required: true }, { name: 'category', label: 'Kategori', type: 'select', defaultValue: 'UMUM', options: CATS.map(([v, l]) => ({ value: v, label: l })) }, { name: 'hours_per_week', label: 'Jam pelajaran / minggu', type: 'number', defaultValue: 2 }, { name: 'is_competency', label: 'Berbasis kompetensi (uji kompetensi)', type: 'switch' }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]}
    />
  );
}
