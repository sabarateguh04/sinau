import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { get, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Card, EmptyState, Loading, PageHeader, Progress, Select, Badge, cx } from '@/components/ui';
import { Dict } from '@/lib/types';

/** Concept mastery: per-student (SISWA/WALI) or per-class heatmap (teacher/admin). Computed from labelled quiz/exam answers. */
export default function ConceptMap() {
  const { hasRole, has, user } = useAuth();
  const teacherView = has('grade:recap');
  if (!teacherView) return <StudentConcepts studentId={hasRole('WALI_MURID') ? user?.children?.[0]?.id ?? 'me' : 'me'} />;
  return <ClassConcepts />;
}
const toneOf = (m: number | null): 'green' | 'amber' | 'red' | 'brand' => (m === null ? 'brand' : m >= 75 ? 'green' : m >= 50 ? 'amber' : 'red');

function StudentConcepts({ studentId }: { studentId: string }) {
  const [d, setD] = useState<{ concepts: Dict[]; misconceptions: Dict[] } | null>(null);
  useEffect(() => { get<{ concepts: Dict[]; misconceptions: Dict[] }>(`/analytics/concepts/student/${studentId}`).then(setD).catch((e) => toast.error(toApiError(e).message)); }, [studentId]);
  if (!d) return <Loading />;
  const weak = d.concepts.filter((c) => c.mastery !== null && Number(c.mastery) < 60);
  return (
    <div>
      <PageHeader title="Peta Penguasaan Konsep" subtitle="Dihitung dari jawaban kuis & ujian yang soalnya berlabel konsep. Semakin banyak mengerjakan, semakin akurat." />
      {d.concepts.length === 0 ? <EmptyState title="Belum ada data" description="Kerjakan kuis atau ujian dulu." icon={<Sparkles className="h-6 w-6" />} /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Penguasaan per konsep"><ul className="space-y-3">{d.concepts.map((c) => <li key={c.id as string}><div className="mb-1 flex items-center justify-between text-sm"><span><b>{c.code as string}</b> {c.name as string}<span className="ml-2 text-xs text-ink-3">{c.subject_name as string} · {c.answered as number} soal</span></span><span className="font-semibold">{c.mastery === null ? '-' : `${c.mastery}%`}</span></div><Progress value={Number(c.mastery ?? 0)} tone={toneOf(c.mastery as number | null)} /></li>)}</ul></Card>
          <div className="space-y-4">
            <Card title="Perlu diperkuat">{weak.length === 0 ? <p className="text-sm text-ink-2">Semua konsep di atas 60%. 🎉</p> : <ul className="space-y-1 text-sm">{weak.map((c) => <li key={c.id as string} className="flex items-center justify-between"><span>{c.name as string}</span><Badge tone="red">{c.mastery as number}%</Badge></li>)}</ul>}</Card>
            <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Miskonsepsi terdeteksi</span>}>{d.misconceptions.length === 0 ? <p className="text-sm text-ink-2">Belum ada pola miskonsepsi.</p> : <ul className="space-y-1 text-sm">{d.misconceptions.map((m, i) => <li key={i}><span className="font-medium">{m.label as string}</span><span className="block text-xs text-ink-3">{m.concept as string} · {m.count as number}×</span></li>)}</ul>}</Card>
          </div>
        </div>
      )}
    </div>
  );
}
function ClassConcepts() {
  const [classes, setClasses] = useState<Dict[]>([]);
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<Dict[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [d, setD] = useState<{ concepts: Dict[]; students: { id: string; full_name: string; mastery: Record<string, number> }[] } | null>(null);
  useEffect(() => { get<unknown>('/academic/classes', { active_year: 1, limit: 200 }).then((x) => { const arr = (x as { data?: Dict[] }).data ?? []; setClasses(arr); if (arr[0]) setClassId(String(arr[0].id)); }); get<unknown>('/academic/subjects', { limit: 200 }).then((x) => setSubjects((x as { data?: Dict[] }).data ?? [])); }, []);
  useEffect(() => { if (!classId) return; setD(null); get<typeof d>(`/analytics/concepts/class/${classId}`, { subject_id: subjectId || undefined }).then(setD).catch((e) => toast.error(toApiError(e).message)); }, [classId, subjectId]);
  return (
    <div>
      <PageHeader title="Peta Penguasaan Konsep" subtitle="Heatmap kelas: konsep mana yang lemah, siswa mana yang butuh remedial." actions={<div className="flex gap-2"><Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-48" placeholder="Kelas" options={classes.map((c) => ({ value: String(c.id), label: String(c.name) }))} /><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-56" placeholder="Semua mapel" options={subjects.map((s) => ({ value: String(s.id), label: String(s.name) }))} /></div>} />
      {!classId ? <EmptyState title="Pilih kelas" /> : !d ? <Loading /> : d.concepts.length === 0 ? <EmptyState title="Belum ada data" description="Belum ada kuis/ujian berlabel konsep yang dikerjakan kelas ini." /> : (
        <div className="space-y-4">
          <Card title="Rata-rata kelas per konsep"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{d.concepts.map((c) => <div key={c.id as string} className="rounded-xl border border-line p-3"><div className="flex items-center justify-between text-sm"><span className="truncate"><b>{c.code as string}</b> {c.name as string}</span><Badge tone={toneOf(c.mastery as number | null)}>{c.mastery as number}%</Badge></div><Progress value={Number(c.mastery ?? 0)} tone={toneOf(c.mastery as number | null)} className="mt-2" /><div className="mt-1 text-[11px] text-ink-3">{c.students as number} siswa · {c.answered as number} jawaban</div></div>)}</div></Card>
          <Card padded={false} title="Heatmap siswa × konsep"><div className="overflow-x-auto"><table className="text-xs"><thead><tr className="bg-surface-2"><th className="sticky left-0 bg-surface-2 px-3 py-2 text-left">Siswa</th>{d.concepts.map((c) => <th key={c.id as string} className="px-2 py-2 font-semibold" title={c.name as string}>{c.code as string}</th>)}</tr></thead><tbody>{d.students.map((s) => <tr key={s.id} className="border-t border-line"><td className="sticky left-0 bg-surface px-3 py-1.5 font-medium whitespace-nowrap">{s.full_name}</td>{d.concepts.map((c) => { const m = s.mastery[c.id as string]; return <td key={c.id as string} className="px-1 py-1 text-center"><span className={cx('inline-block w-12 rounded py-1 font-semibold', m === undefined ? 'bg-surface-3 text-ink-3' : m >= 75 ? 'bg-emerald-100 text-emerald-800' : m >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')}>{m === undefined ? '·' : `${m}%`}</span></td>; })}</tr>)}</tbody></table></div></Card>
        </div>
      )}
    </div>
  );
}
