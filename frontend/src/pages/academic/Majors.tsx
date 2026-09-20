import { CrudPage } from '@/features/crud/CrudPage';
import { Badge } from '@/components/ui';
import { Dict } from '@/lib/types';

export default function Majors() {
  return (
    <CrudPage<Dict> title="Jurusan / Program Keahlian" endpoint="/academic/majors" entityLabel="jurusan" perm={{ write: 'academic:write' }}
      columns={[{ key: 'code', header: 'Kode', render: (r) => <Badge tone="brand">{r.code as string}</Badge> }, { key: 'name', header: 'Nama' }, { key: 'head_name', header: 'Kaprodi' }, { key: 'class_count', header: 'Kelas aktif', className: 'text-center' }, { key: 'is_active', header: 'Status', render: (r) => <Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge> }]}
      fields={[{ name: 'code', label: 'Kode', required: true, placeholder: 'TKJ' }, { name: 'name', label: 'Nama', required: true }, { name: 'head_user_id', label: 'Ketua program (guru)', type: 'async-select', source: { url: '/users', params: { role: 'GURU', limit: 300 }, label: 'full_name' }, span: 2 }, { name: 'description', label: 'Deskripsi', type: 'textarea', span: 2 }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]}
    />
  );
}
