import { Lock } from 'lucide-react';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Dict } from '@/lib/types';

const CATS = ['PRIBADI', 'SOSIAL', 'BELAJAR', 'KARIER', 'KELUARGA', 'LAINNYA'];
export default function Counseling() {
  return (
    <CrudPage<Dict> title="Catatan Konseling (BK)" subtitle="Rahasia — hanya guru BK, kepala sekolah, dan konselor pencatat yang dapat melihat." endpoint="/kesiswaan/counseling" entityLabel="catatan" modalSize="lg" perm={{ write: 'counseling:write' }}
      columns={[{ key: 'session_date', header: 'Tanggal', render: (r) => fmtDate(r.session_date as string) }, { key: 'student_name', header: 'Siswa', render: (r) => <div><div className="font-medium">{r.student_name as string}</div><div className="text-xs text-ink-3">{r.class_name as string}</div></div> }, { key: 'category', header: 'Kategori', render: (r) => <Badge tone="blue">{r.category as string}</Badge> }, { key: 'summary', header: 'Ringkasan', render: (r) => <span className="line-clamp-2 max-w-md text-sm">{r.summary as string}</span> }, { key: 'counselor_name', header: 'Konselor' }, { key: 'is_confidential', header: '', render: (r) => (r.is_confidential ? <Lock className="h-4 w-4 text-ink-3" /> : null) }]}
      filters={[{ name: 'category', label: 'Kategori', options: CATS.map((x) => ({ value: x, label: x })) }, { name: 'class_id', label: 'Kelas', type: 'async-select', source: { url: '/academic/classes', params: { active_year: 1 }, label: 'name' } }]}
      fields={[{ name: 'student_id', label: 'Siswa', type: 'async-select', required: true, source: { url: '/users', params: { role: 'SISWA', limit: 500 }, label: (r) => `${r.full_name}${r.class_name ? ` — ${r.class_name}` : ''}` }, span: 2 }, { name: 'session_date', label: 'Tanggal sesi', type: 'date', required: true }, { name: 'category', label: 'Kategori', type: 'select', defaultValue: 'PRIBADI', options: CATS.map((x) => ({ value: x, label: x })) }, { name: 'summary', label: 'Ringkasan sesi', type: 'textarea', required: true, span: 2 }, { name: 'follow_up', label: 'Tindak lanjut', type: 'textarea', span: 2 }, { name: 'is_confidential', label: 'Rahasia', type: 'switch', defaultValue: true }]}
    />
  );
}
