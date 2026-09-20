import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { get } from '@/lib/api';
import { Button, Card, Loading, PageHeader, StatCard, Table } from '@/components/ui';
import { fmtMoney, fmtScore } from '@/lib/format';
import { Dict } from '@/lib/types';
import { useAuth } from '@/store/auth';

export default function SchoolReport() {
  const { user } = useAuth();
  const [d, setD] = useState<Dict | null>(null);
  const [concepts, setConcepts] = useState<Dict[]>([]);
  useEffect(() => { get<Dict>('/analytics/reports/summary').then(setD); get<Dict[]>('/analytics/concepts/school').then(setConcepts).catch(() => undefined); }, []);
  if (!d) return <Loading />;
  const g = (d.gender as Dict) ?? {};
  const fin = (d.finance as Dict) ?? {};
  return (
    <div className="space-y-5">
      <PageHeader title="Laporan Sekolah" subtitle={`${user?.tenant?.name ?? ''} · Tahun ajaran ${(d.academic_year as Dict)?.name ?? '-'}`} actions={<Button variant="outline" className="no-print" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Cetak</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Siswa aktif" value={String(g.total ?? 0)} hint={`L ${g.L ?? 0} · P ${g.P ?? 0}`} /><StatCard label="Kelas" value={String((d.by_class as Dict[]).length)} tone="blue" /><StatCard label="Pemasukan tahun ini" value={fmtMoney(fin.income_ytd as number)} tone="green" /><StatCard label="Tunggakan" value={fmtMoney(fin.outstanding as number)} hint={`${fin.students_overdue ?? 0} siswa terlambat`} tone="red" /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Rata-rata nilai per mapel" className="lg:col-span-2">{(d.subject_avg as Dict[]).length ? <ResponsiveContainer width="100%" height={260}><BarChart data={d.subject_avg as Dict[]}><CartesianGrid strokeDasharray="3 3" stroke="var(--line)" /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} /><Bar dataKey="avg" name="Rata-rata" fill="var(--brand-600)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="text-sm text-ink-3">Belum ada nilai.</p>}</Card>
        <Card title="Siswa per jurusan">{(d.by_major as Dict[]).length ? <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={d.by_major as Dict[]} dataKey="students" nameKey="code" innerRadius={55} outerRadius={90} paddingAngle={3}>{(d.by_major as Dict[]).map((_, i) => <Cell key={i} fill={['var(--brand-600)', 'var(--accent-500)', 'var(--brand-300)', '#7c3aed', '#0ea5e9'][i % 5]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} /></PieChart></ResponsiveContainer> : <p className="text-sm text-ink-3">Belum ada data.</p>}</Card>
      </div>
      <Card padded={false} title="Per kelas"><Table<Dict> dense rows={d.by_class as Dict[]} columns={[{ key: 'name', header: 'Kelas' }, { key: 'major', header: 'Jurusan' }, { key: 'students', header: 'Siswa', className: 'text-center' }, { key: 'avg_score', header: 'Rata-rata nilai', render: (r) => fmtScore(r.avg_score as number) }, { key: 'attendance_30d', header: 'Kehadiran 30 hari', render: (r) => r.attendance_30d === null ? '-' : `${r.attendance_30d}%` }]} /></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padded={false} title="Beban mengajar guru"><Table<Dict> dense rows={d.teacher_load as Dict[]} rowKey={(r) => r.full_name as string} columns={[{ key: 'full_name', header: 'Guru' }, { key: 'classes', header: 'Kelas×mapel', className: 'text-center' }, { key: 'hours', header: 'JP/minggu', className: 'text-center' }, { key: 'materials', header: 'Materi', className: 'text-center' }, { key: 'assignments', header: 'Tugas', className: 'text-center' }]} /></Card>
        <Card padded={false} title="Kedisiplinan 90 hari (poin pelanggaran per kelas)"><Table<Dict> dense rows={d.discipline as Dict[]} rowKey={(r) => r.class_name as string} columns={[{ key: 'class_name', header: 'Kelas' }, { key: 'incidents', header: 'Kejadian', className: 'text-center' }, { key: 'points', header: 'Poin', className: 'text-center' }]} empty="Tidak ada catatan" /></Card>
      </div>
      {concepts.length > 0 && <Card padded={false} title="Penguasaan konsep sekolah"><Table<Dict> dense rows={concepts} rowKey={(r) => `${r.subject_name}-${r.code}`} columns={[{ key: 'subject_name', header: 'Mapel' }, { key: 'code', header: 'Kode' }, { key: 'name', header: 'Konsep' }, { key: 'students', header: 'Siswa', className: 'text-center' }, { key: 'mastery', header: 'Penguasaan', render: (r) => <span className={Number(r.mastery) < 60 ? 'font-semibold text-red-600' : ''}>{r.mastery as number}%</span> }]} /></Card>}
    </div>
  );
}
