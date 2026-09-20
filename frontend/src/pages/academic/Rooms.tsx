import { CrudPage } from '@/features/crud/CrudPage';
import { Dict } from '@/lib/types';

export default function Rooms() {
  return (
    <CrudPage<Dict> title="Ruang" endpoint="/academic/rooms" entityLabel="ruang" perm={{ write: 'academic:write' }}
      columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Nama' }, { key: 'type', header: 'Jenis' }, { key: 'capacity', header: 'Kapasitas', className: 'text-center' }]}
      fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama', required: true }, { name: 'type', label: 'Jenis', type: 'select', defaultValue: 'KELAS', options: ['KELAS', 'LAB', 'BENGKEL', 'AULA', 'PERPUS', 'LAINNYA'].map((x) => ({ value: x, label: x })) }, { name: 'capacity', label: 'Kapasitas', type: 'number', defaultValue: 36 }]}
    />
  );
}
