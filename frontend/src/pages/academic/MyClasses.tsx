import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, ClipboardList, ListChecks, CalendarCheck, GraduationCap, Users } from 'lucide-react';
import { get } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { Avatar, Card, EmptyState, PageHeader, Table, Loading } from '@/components/ui';
import { Dict } from '@/lib/types';

/** Teacher home for their classes: quick links per class-subject + homeroom roster. */
export default function MyClasses() {
  const { user, activeRole } = useAuth();
  const p = rolePrefix(activeRole);
  const [sp] = useSearchParams();
  const teaching = user?.teaching ?? [];
  const homeroom = user?.homeroom ?? [];
  const [sel, setSel] = useState(sp.get('cs') ?? teaching[0]?.class_subject_id ?? '');
  const [students, setStudents] = useState<Dict[] | null>(null);
  const cs = teaching.find((t) => t.class_subject_id === sel);
  useEffect(() => { if (cs) { setStudents(null); get<Dict[]>(`/academic/classes/${cs.class_id}/students`).then(setStudents); } }, [cs]);
  if (!teaching.length && !homeroom.length) return <EmptyState title="Belum ada penugasan kelas" description="Minta admin sekolah menugaskan Anda pada kelas & mapel." />;
  return (
    <div>
      <PageHeader title="Kelas Saya" subtitle="Kelas & mapel yang Anda ampu tahun ajaran ini." />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          {teaching.map((t) => <button key={t.class_subject_id} onClick={() => setSel(t.class_subject_id)} className={`card w-full p-3 text-left transition ${sel === t.class_subject_id ? 'border-brand-500 ring-2 ring-brand-500/20' : 'hover:border-brand-300'}`}><div className="font-semibold">{t.class_name}</div><div className="text-sm text-ink-2">{t.subject_name}</div></button>)}
          {homeroom.map((h) => <Link key={h.id} to={`/${p}/absensi?class_id=${h.id}`} className="card block p-3 hover:border-brand-300"><div className="text-xs font-semibold uppercase text-ink-3">Wali kelas</div><div className="font-semibold">{h.name}</div><div className="text-xs text-ink-2">Absensi harian & rekap</div></Link>)}
        </div>
        {cs ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[[BookOpen, 'Materi', `materi?cs=${cs.class_subject_id}`], [ClipboardList, 'Tugas', `tugas?class_subject_id=${cs.class_subject_id}`], [ListChecks, 'Kuis', `kuis?class_subject_id=${cs.class_subject_id}`], [CalendarCheck, 'Absensi', 'absensi'], [GraduationCap, 'Nilai', 'nilai']].map(([I, l, to]) => { const Icon = I as typeof BookOpen; return <Link key={String(l)} to={`/${p}/${to}`} className="card flex flex-col items-center gap-2 p-4 text-sm font-medium hover:border-brand-400"><Icon className="h-6 w-6 text-brand-700" />{String(l)}</Link>; })}
            </div>
            <Card padded={false} title={<span className="flex items-center gap-2"><Users className="h-4 w-4" /> Siswa {cs.class_name} ({students?.length ?? '…'})</span>}>
              {!students ? <Loading /> : <Table<Dict> dense rows={students} columns={[{ key: 'full_name', header: 'Nama', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.full_name as string} src={r.avatar_url as string} size="sm" />{r.full_name as string}</div> }, { key: 'nis', header: 'NIS' }, { key: 'gender', header: 'L/P' }, { key: 'parent_phone', header: 'Kontak ortu' }]} />}
            </Card>
          </div>
        ) : <EmptyState title="Pilih kelas" />}
      </div>
    </div>
  );
}
