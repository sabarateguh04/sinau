import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAuth, rolePrefix } from '@/store/auth';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge } from '@/components/ui';
import { Dict } from '@/lib/types';

export default function Classes() {
  const nav = useNavigate();
  const { activeRole } = useAuth();
  const p = rolePrefix(activeRole);
  return (
    <CrudPage<Dict> title="Kelas & Rombongan Belajar" subtitle="Klik kelas untuk mengelola anggota dan penugasan guru per mapel." endpoint="/academic/classes" entityLabel="kelas" perm={{ write: 'academic:write' }} sort="name" order="ASC" defaultParams={{ active_year: 1 }}
      onRowClick={(r) => nav(`/${p}/akademik/kelas/${r.id}`)}
      columns={[
        { key: 'name', header: 'Kelas', render: (r) => <span className="font-semibold">{r.name as string}</span> },
        { key: 'grade_level', header: 'Tingkat', className: 'text-center' },
        { key: 'major_code', header: 'Jurusan', render: (r) => r.major_code ? <Badge tone="brand">{r.major_code as string}</Badge> : '-' },
        { key: 'homeroom_name', header: 'Wali kelas' },
        { key: 'room_name', header: 'Ruang' },
        { key: 'student_count', header: 'Siswa', render: (r) => <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-ink-3" />{r.student_count as number}/{r.capacity as number}</span> },
        { key: 'subject_count', header: 'Mapel', className: 'text-center' },
        { key: 'academic_year', header: 'TA' },
      ]}
      filters={[{ name: 'academic_year_id', label: 'Tahun ajaran', type: 'async-select', source: { url: '/academic/years', label: 'name' } }, { name: 'major_id', label: 'Jurusan', type: 'async-select', source: { url: '/academic/majors', label: 'code' } }, { name: 'grade_level', label: 'Tingkat', options: [10, 11, 12].map((g) => ({ value: String(g), label: `Kelas ${g}` })) }]}
      fields={[
        { name: 'name', label: 'Nama kelas', required: true, placeholder: 'X TKJ 1' },
        { name: 'academic_year_id', label: 'Tahun ajaran', type: 'async-select', required: true, source: { url: '/academic/years', label: 'name' } },
        { name: 'grade_level', label: 'Tingkat', type: 'select', required: true, defaultValue: 10, options: [7, 8, 9, 10, 11, 12, 13].map((g) => ({ value: g, label: `Kelas ${g}` })), toValue: (v) => Number(v) },
        { name: 'major_id', label: 'Jurusan', type: 'async-select', source: { url: '/academic/majors', label: (r) => `${r.code} — ${r.name}` } },
        { name: 'homeroom_teacher_id', label: 'Wali kelas', type: 'async-select', source: { url: '/users', params: { role: 'GURU', limit: 300 }, label: 'full_name' } },
        { name: 'room_id', label: 'Ruang', type: 'async-select', source: { url: '/academic/rooms', label: 'name' } },
        { name: 'capacity', label: 'Kapasitas', type: 'number', defaultValue: 36 },
        { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true },
      ]}
    />
  );
}
