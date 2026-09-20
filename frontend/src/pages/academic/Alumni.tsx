import { CrudPage } from '@/features/crud/CrudPage';
import { Badge } from '@/components/ui';
import { Dict } from '@/lib/types';

export default function Alumni() {
  return (
    <CrudPage<Dict> title="Alumni" endpoint="/academic/alumni" entityLabel="alumni" perm={{ write: 'alumni:write' }} sort="graduation_year"
      columns={[{ key: 'full_name', header: 'Nama', render: (r) => <span className="font-medium">{r.full_name as string}</span> }, { key: 'graduation_year', header: 'Lulus', className: 'text-center' }, { key: 'last_class', header: 'Kelas terakhir' }, { key: 'major_name', header: 'Jurusan' }, { key: 'continuing', header: 'Kegiatan', render: (r) => <Badge tone="blue">{r.continuing as string}</Badge> }, { key: 'institution', header: 'Institusi / tempat kerja' }]}
      filters={[{ name: 'graduation_year', label: 'Tahun lulus', type: 'text' }, { name: 'continuing', label: 'Kegiatan', options: ['KULIAH', 'KERJA', 'WIRAUSAHA', 'LAINNYA'].map((x) => ({ value: x, label: x })) }]}
      fields={[{ name: 'user_id', label: 'Siswa', type: 'async-select', required: true, createOnly: true, source: { url: '/users', params: { role: 'SISWA', limit: 500 }, label: 'full_name' }, span: 2 }, { name: 'graduation_year', label: 'Tahun lulus', type: 'number', required: true }, { name: 'continuing', label: 'Kegiatan', type: 'select', defaultValue: 'LAINNYA', options: ['KULIAH', 'KERJA', 'WIRAUSAHA', 'LAINNYA'].map((x) => ({ value: x, label: x })) }, { name: 'institution', label: 'Institusi / tempat kerja', span: 2 }, { name: 'phone', label: 'Telepon' }, { name: 'email', label: 'E-mail' }, { name: 'notes', label: 'Catatan', type: 'textarea', span: 2 }]}
    />
  );
}
