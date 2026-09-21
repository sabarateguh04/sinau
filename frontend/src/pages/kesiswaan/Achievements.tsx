import { Paperclip } from 'lucide-react';
import { fileSrc } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Dict } from '@/lib/types';

const LEVELS = ['SEKOLAH', 'KECAMATAN', 'KOTA', 'PROVINSI', 'NASIONAL', 'INTERNASIONAL'];
export default function Achievements() {
  const { has } = useAuth();
  const canWrite = has('achievement:write');
  return (
    <CrudPage<Dict> title="Prestasi Siswa" subtitle="Prestasi akademik & non-akademik; yang ditandai publik tampil di situs sekolah dan rapor." endpoint="/kesiswaan/achievements" entityLabel="prestasi" modalSize="lg" perm={{ write: 'achievement:write' }} canCreate={canWrite} canEdit={canWrite} canDelete={canWrite}
      columns={[{ key: 'achieved_at', header: 'Tanggal', render: (r) => fmtDate(r.achieved_at as string) }, { key: 'student_name', header: 'Siswa', render: (r) => <div><div className="font-medium">{r.student_name as string}</div><div className="text-xs text-ink-3">{r.class_name as string}</div></div> }, { key: 'title', header: 'Prestasi' }, { key: 'level', header: 'Tingkat', render: (r) => <Badge tone={['NASIONAL', 'INTERNASIONAL'].includes(r.level as string) ? 'amber' : 'brand'}>{r.level as string}</Badge> }, { key: 'rank_label', header: 'Peringkat' }, { key: 'organizer', header: 'Penyelenggara' }, { key: 'certificate_url', header: '', render: (r) => r.certificate_url ? <a href={fileSrc(r.certificate_url as string)} target="_blank" rel="noreferrer" className="text-brand-700"><Paperclip className="h-4 w-4" /></a> : null }, { key: 'is_public', header: 'Publik', render: (r) => (r.is_public ? 'Ya' : '-') }]}
      filters={[{ name: 'level', label: 'Tingkat', options: LEVELS.map((x) => ({ value: x, label: x })) }, { name: 'class_id', label: 'Kelas', type: 'async-select', source: { url: '/academic/classes', params: { active_year: 1 }, label: 'name' } }]}
      fields={[{ name: 'student_id', label: 'Siswa', type: 'async-select', required: true, source: { url: '/users', params: { role: 'SISWA', limit: 500 }, label: (r) => `${r.full_name}${r.class_name ? ` — ${r.class_name}` : ''}` }, span: 2 }, { name: 'title', label: 'Prestasi', required: true, span: 2 }, { name: 'level', label: 'Tingkat', type: 'select', defaultValue: 'SEKOLAH', options: LEVELS.map((x) => ({ value: x, label: x })) }, { name: 'rank_label', label: 'Peringkat', placeholder: 'Juara 1' }, { name: 'organizer', label: 'Penyelenggara' }, { name: 'achieved_at', label: 'Tanggal', type: 'date' }, { name: 'is_public', label: 'Tampilkan di situs publik', type: 'switch' }]}
    />
  );
}
