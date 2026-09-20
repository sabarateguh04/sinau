import { CrudPage } from '@/features/crud/CrudPage';
import { Badge } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Dict } from '@/lib/types';

const TYPES = ['LIBUR', 'UJIAN', 'KEGIATAN', 'RAPAT', 'LAINNYA'];
const TONE: Record<string, 'red' | 'amber' | 'brand' | 'blue' | 'gray'> = { LIBUR: 'red', UJIAN: 'amber', KEGIATAN: 'brand', RAPAT: 'blue', LAINNYA: 'gray' };
const range = (r: Dict) => (r.end_date !== r.start_date ? `${fmtDate(r.start_date as string)} – ${fmtDate(r.end_date as string)}` : fmtDate(r.start_date as string));

export default function Calendar() {
  return (
    <CrudPage<Dict> title="Kalender Akademik" endpoint="/academic/calendar" entityLabel="agenda" perm={{ write: 'academic:write' }} sort="start_date" order="ASC"
      columns={[{ key: 'start_date', header: 'Tanggal', render: range }, { key: 'title', header: 'Agenda', render: (r) => <span className="font-medium">{r.title as string}</span> }, { key: 'type', header: 'Jenis', render: (r) => <Badge tone={TONE[r.type as string]}>{r.type as string}</Badge> }, { key: 'is_holiday', header: 'Libur', render: (r) => (r.is_holiday ? 'Ya' : '-') }]}
      filters={[{ name: 'type', label: 'Jenis', options: TYPES.map((x) => ({ value: x, label: x })) }]}
      fields={[{ name: 'title', label: 'Judul', required: true, span: 2 }, { name: 'start_date', label: 'Mulai', type: 'date', required: true }, { name: 'end_date', label: 'Selesai', type: 'date', required: true }, { name: 'type', label: 'Jenis', type: 'select', defaultValue: 'KEGIATAN', options: TYPES.map((x) => ({ value: x, label: x })) }, { name: 'academic_year_id', label: 'Tahun ajaran', type: 'async-select', source: { url: '/academic/years', label: 'name' } }, { name: 'is_holiday', label: 'Hari libur (tidak ada KBM)', type: 'switch' }, { name: 'description', label: 'Keterangan', type: 'textarea', span: 2 }]}
    />
  );
}
