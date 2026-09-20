import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { get, post, del, put, toApiError, downloadFile } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Tabs, Progress, cx } from '@/components/ui';
import { fmtScore } from '@/lib/format';
import { Dict } from '@/lib/types';

type Recap = { class_subject: Dict; components: { code: string; name: string; weight: number }[]; scale: { min: number; predicate: string }[]; students: { student_id: string; full_name: string; nis: string; components: Record<string, { avg: number | null; items: { title: string; score: number; max: number; source_type: string; source_id: string | null }[] }>; final_score: number | null; predicate: string | null }[] };

export default function Grades() {
  const { has, hasRole, user } = useAuth();
  const [sp] = useSearchParams();
  const canRecap = has('grade:recap') || has('grade:write');
  const student = hasRole('SISWA') && !canRecap;
  const guardian = hasRole('WALI_MURID') && !canRecap;
  if (student) return <StudentGrades studentId="me" title="Nilai Saya" />;
  if (guardian) return <GuardianGrades initial={sp.get('student')} />;
  return <TeacherGrades teaching={user?.teaching ?? []} homeroom={user?.homeroom ?? []} />;
}

function TeacherGrades({ teaching, homeroom }: { teaching: { class_subject_id: string; class_name: string; subject_name: string; class_id: string }[]; homeroom: { id: string; name: string }[] }) {
  const { has, hasRole } = useAuth();
  const admin = hasRole('ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'AUDITOR', 'KAPRODI', 'BK');
  const [tab, setTab] = useState<'mapel' | 'kelas' | 'bobot'>('mapel');
  const [cs, setCs] = useState(teaching[0]?.class_subject_id ?? '');
  const [allCs, setAllCs] = useState<Dict[]>([]);
  const [classes, setClasses] = useState<Dict[]>([]);
  const [classId, setClassId] = useState(homeroom[0]?.id ?? '');
  useEffect(() => { if (admin) { get<Dict[]>('/academic/class-subjects').then((d) => { setAllCs(d); if (!cs && d[0]) setCs(String(d[0].id)); }); } get<unknown>('/academic/classes', { active_year: 1, limit: 200 }).then((d) => { const arr = (d as { data?: Dict[] }).data ?? []; setClasses(arr); if (!classId && arr[0]) setClassId(String(arr[0].id)); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [admin]);
  const options = admin ? allCs.map((x) => ({ value: String(x.id), label: `${x.class_name} · ${x.subject_name} (${x.teacher_name ?? '-'})` })) : teaching.map((t) => ({ value: t.class_subject_id, label: `${t.class_name} · ${t.subject_name}` }));
  return (
    <div>
      <PageHeader title="Nilai" subtitle="Rekap nilai berbobot per mapel, rekap kelas, dan pengaturan komponen." />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'mapel', label: 'Per mapel' }, { value: 'kelas', label: 'Rekap kelas' }, ...(has('academic:write') ? [{ value: 'bobot' as const, label: 'Bobot komponen' }] : [])]} />
      {tab === 'mapel' && <><Select value={cs} onChange={(e) => setCs(e.target.value)} className="mb-4 w-full max-w-md" placeholder="Pilih kelas & mapel" options={options} />{cs ? <ClassSubjectRecap csId={cs} canWrite={has('grade:write')} /> : <EmptyState title="Pilih kelas & mapel" />}</>}
      {tab === 'kelas' && <><Select value={classId} onChange={(e) => setClassId(e.target.value)} className="mb-4 w-full max-w-md" placeholder="Pilih kelas" options={classes.map((c) => ({ value: String(c.id), label: String(c.name) }))} />{classId ? <ClassRecap classId={classId} /> : <EmptyState title="Pilih kelas" />}</>}
      {tab === 'bobot' && <Weights />}
    </div>
  );
}

function ClassSubjectRecap({ csId, canWrite }: { csId: string; canWrite: boolean }) {
  const [r, setR] = useState<Recap | null>(null);
  const [manual, setManual] = useState(false);
  const load = useCallback(() => get<Recap>(`/grades/class-subject/${csId}`).then(setR).catch((e) => toast.error(toApiError(e).message)), [csId]);
  useEffect(() => { setR(null); load(); }, [load]);
  if (!r) return <Loading />;
  const manualCols = new Map<string, { title: string; component: string }>();
  for (const s of r.students) for (const [code, c] of Object.entries(s.components)) for (const it of c.items) if (it.source_type === 'MANUAL' && it.source_id) manualCols.set(it.source_id, { title: it.title, component: code });
  const removeCol = async (sourceId: string) => { if (!confirm('Hapus kolom nilai ini untuk semua siswa?')) return; await del(`/grades/class-subject/${csId}/source/${sourceId}`); load(); };
  return (
    <Card padded={false} title={`${r.class_subject.class_name} · ${r.class_subject.subject_name}`} action={<div className="flex gap-2">{canWrite && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setManual(true)}>Input nilai</Button>}<Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`/grades/class-subject/${csId}/export`, `nilai-${r.class_subject.class_name}-${r.class_subject.subject_name}.xlsx`)}>Excel</Button></div>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line bg-surface-2 text-left text-xs uppercase text-ink-3"><th className="sticky left-0 bg-surface-2 px-3 py-2">Siswa</th>{r.components.map((c) => <th key={c.code} className="px-3 py-2 text-center">{c.name}<div className="text-[10px] font-normal">{c.weight}%</div></th>)}<th className="px-3 py-2 text-center">Akhir</th><th className="px-3 py-2 text-center">Predikat</th></tr></thead>
          <tbody>{r.students.map((s) => <tr key={s.student_id} className="border-b border-line last:border-0"><td className="sticky left-0 bg-surface px-3 py-2"><div className="font-medium">{s.full_name}</div><div className="text-[11px] text-ink-3">{s.nis}</div></td>{r.components.map((c) => { const v = s.components[c.code]; return <td key={c.code} className="px-3 py-2 text-center" title={v?.items.map((i) => `${i.title}: ${i.score}/${i.max}`).join('\n')}>{v?.avg === null || v?.avg === undefined ? <span className="text-ink-3">-</span> : <span className={cx(v.avg < 70 && 'text-red-600')}>{fmtScore(v.avg)}</span>}{v?.items.length ? <div className="text-[10px] text-ink-3">{v.items.length} item</div> : null}</td>; })}<td className="px-3 py-2 text-center font-bold">{fmtScore(s.final_score)}</td><td className="px-3 py-2 text-center">{s.predicate ? <Badge tone={s.predicate === 'A' ? 'green' : s.predicate === 'B' ? 'blue' : s.predicate === 'C' ? 'amber' : 'red'}>{s.predicate}</Badge> : '-'}</td></tr>)}</tbody>
        </table>
      </div>
      {manualCols.size > 0 && canWrite && <div className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-xs text-ink-2"><span>Kolom manual:</span>{[...manualCols.entries()].map(([id, c]) => <span key={id} className="chip bg-surface-3">{c.component} · {c.title}<button className="ml-1 text-red-500" onClick={() => removeCol(id)}><Trash2 className="h-3 w-3" /></button></span>)}</div>}
      <ManualGradeModal open={manual} onClose={() => setManual(false)} recap={r} csId={csId} onSaved={() => { setManual(false); load(); }} />
    </Card>
  );
}
function ManualGradeModal({ open, onClose, recap, csId, onSaved }: { open: boolean; onClose: () => void; recap: Recap; csId: string; onSaved: () => void }) {
  const [component, setComponent] = useState(recap.components[0]?.code ?? 'UH');
  const [title, setTitle] = useState('');
  const [max, setMax] = useState('100');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => { if (!title) return toast.error('Judul wajib'); setBusy(true); try { await post(`/grades/class-subject/${csId}`, { component, title, max_score: Number(max) || 100, scores: recap.students.map((s) => ({ student_id: s.student_id, score: scores[s.student_id] === '' || scores[s.student_id] === undefined ? null : Number(scores[s.student_id]) })).filter((x) => x.score !== null) }); toast.success('Nilai disimpan'); setScores({}); setTitle(''); onSaved(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Input nilai manual" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button></>}>
      <div className="grid grid-cols-3 gap-3"><Field label="Komponen"><Select value={component} onChange={(e) => setComponent(e.target.value)} options={recap.components.map((c) => ({ value: c.code, label: c.name }))} /></Field><Field label="Judul" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="UH 2 - Subnetting" /></Field><Field label="Skor maks"><Input type="number" value={max} onChange={(e) => setMax(e.target.value)} /></Field></div>
      <div className="mt-4 max-h-[50vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">{recap.students.map((s) => <div key={s.student_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span>{s.full_name}</span><Input type="number" min={0} max={Number(max)} className="h-9 w-24 text-center" value={scores[s.student_id] ?? ''} onChange={(e) => setScores((x) => ({ ...x, [s.student_id]: e.target.value }))} /></div>)}</div>
    </Modal>
  );
}

function ClassRecap({ classId }: { classId: string }) {
  const [r, setR] = useState<Dict | null>(null);
  useEffect(() => { setR(null); get<Dict>(`/grades/class/${classId}`).then(setR).catch((e) => toast.error(toApiError(e).message)); }, [classId]);
  if (!r) return <Loading />;
  const subjects = r.subjects as Dict[];
  return (
    <Card padded={false} title={`Rekap ${(r.class as Dict).name}`}>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line bg-surface-2 text-left text-xs uppercase text-ink-3"><th className="px-3 py-2">#</th><th className="sticky left-0 bg-surface-2 px-3 py-2">Siswa</th>{subjects.map((s) => <th key={s.id as string} className="px-2 py-2 text-center">{s.subject_name as string}</th>)}<th className="px-3 py-2 text-center">Rata-rata</th><th className="px-3 py-2 text-center">Pred.</th></tr></thead>
        <tbody>{(r.students as Dict[]).map((s) => <tr key={s.student_id as string} className="border-b border-line last:border-0"><td className="px-3 py-2 text-ink-3">{(s.rank as number) ?? '-'}</td><td className="sticky left-0 bg-surface px-3 py-2 font-medium">{s.full_name as string}</td>{(s.scores as (number | null)[]).map((v, i) => <td key={i} className={cx('px-2 py-2 text-center', v !== null && v < 70 && 'text-red-600')}>{fmtScore(v)}</td>)}<td className="px-3 py-2 text-center font-bold">{fmtScore(s.average as number)}</td><td className="px-3 py-2 text-center">{s.predicate ? <Badge tone="brand">{s.predicate as string}</Badge> : '-'}</td></tr>)}</tbody></table></div>
    </Card>
  );
}

function Weights() {
  const [d, setD] = useState<{ components: { code: string; name: string; weight: number }[]; all: Dict[] } | null>(null);
  const [rows, setRows] = useState<{ code: string; name: string; weight: number }[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [subjects, setSubjects] = useState<Dict[]>([]);
  const load = useCallback(() => get<{ components: { code: string; name: string; weight: number }[]; all: Dict[] }>('/grades/components', { subject_id: subjectId || undefined }).then((x) => { setD(x); setRows(x.components.map((c) => ({ ...c }))); }), [subjectId]);
  useEffect(() => { load(); get<unknown>('/academic/subjects', { limit: 200 }).then((s) => setSubjects((s as { data?: Dict[] }).data ?? [])); }, [load]);
  const sum = rows.reduce((a, c) => a + Number(c.weight || 0), 0);
  const save = async () => { try { await put('/grades/components', { subject_id: subjectId || null, components: rows.map((c) => ({ ...c, weight: Number(c.weight) })) }); toast.success('Bobot disimpan'); load(); } catch (e) { toast.error(toApiError(e).message); } };
  if (!d) return <Loading />;
  return (
    <Card title={<span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Bobot komponen nilai</span>} action={<Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-56" placeholder="Default (semua mapel)" options={subjects.map((s) => ({ value: s.id as string, label: s.name as string }))} />}>
      <div className="space-y-2">{rows.map((c, i) => <div key={i} className="grid grid-cols-[110px_1fr_90px_auto] items-center gap-2"><Input value={c.code} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))} /><Input value={c.name} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /><Input type="number" value={c.weight} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} /><Button size="icon" variant="ghost" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} icon={<Trash2 className="h-4 w-4 text-red-500" />} /></div>)}</div>
      <div className="mt-3 flex items-center justify-between"><Button size="sm" variant="outline" onClick={() => setRows((r) => [...r, { code: '', name: '', weight: 0 }])}>+ Komponen</Button><div className="flex items-center gap-3"><span className={cx('text-sm font-semibold', sum === 100 ? 'text-emerald-600' : 'text-red-600')}>Total {sum}%</span><Button disabled={sum !== 100} onClick={save}>Simpan</Button></div></div>
    </Card>
  );
}

export function StudentGrades({ studentId, title }: { studentId: string; title?: string }) {
  const [d, setD] = useState<{ class: Dict | null; subjects: Dict[] } | null>(null);
  useEffect(() => { setD(null); get<{ class: Dict | null; subjects: Dict[] }>(`/grades/student/${studentId}`).then(setD).catch((e) => toast.error(toApiError(e).message)); }, [studentId]);
  if (!d) return <Loading />;
  const valid = d.subjects.filter((s) => s.final_score !== null);
  const avg = valid.length ? valid.reduce((a, s) => a + Number(s.final_score), 0) / valid.length : null;
  return (
    <div>
      {title && <PageHeader title={title} subtitle={d.class ? `Kelas ${(d.class as Dict).class_name}` : undefined} />}
      {!d.class ? <EmptyState title="Belum terdaftar di kelas aktif" /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="card p-4"><div className="text-xs text-ink-3">Rata-rata</div><div className="text-3xl font-extrabold text-brand-700">{fmtScore(avg)}</div></div><div className="card p-4"><div className="text-xs text-ink-3">Mapel dinilai</div><div className="text-3xl font-extrabold">{valid.length}/{d.subjects.length}</div></div><div className="card p-4"><div className="text-xs text-ink-3">Di bawah 70</div><div className="text-3xl font-extrabold text-red-600">{valid.filter((s) => Number(s.final_score) < 70).length}</div></div></div>
          {d.subjects.map((s) => (
            <details key={s.class_subject_id as string} className="card group">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4"><div className="min-w-0 flex-1"><div className="font-semibold">{s.subject_name as string}</div><div className="text-xs text-ink-3">{s.teacher_name as string}</div></div><Progress value={Number(s.final_score ?? 0)} className="hidden w-32 sm:block" tone={Number(s.final_score) >= 75 ? 'green' : 'amber'} /><div className="w-14 text-right text-xl font-bold">{fmtScore(s.final_score as number)}</div>{s.predicate ? <Badge tone="brand">{s.predicate as string}</Badge> : null}</summary>
              <div className="border-t border-line p-4">{(s.weights as { code: string; name: string; weight: number }[]).map((w) => { const c = (s.components as Record<string, { avg: number | null; items: { title: string; score: number; max: number }[] }>)[w.code]; return <div key={w.code} className="mb-3"><div className="flex items-center justify-between text-sm"><span className="font-medium">{w.name} <span className="text-xs text-ink-3">({w.weight}%)</span></span><span className="font-semibold">{fmtScore(c?.avg ?? null)}</span></div>{c?.items.length ? <ul className="mt-1 space-y-0.5 text-xs text-ink-2">{c.items.map((it, i) => <li key={i} className="flex justify-between"><span>{it.title}</span><span>{it.score}/{it.max}</span></li>)}</ul> : <div className="text-xs text-ink-3">Belum ada nilai</div>}</div>; })}</div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
function GuardianGrades({ initial }: { initial: string | null }) {
  const { user } = useAuth();
  const kids = user?.children ?? [];
  const [sid, setSid] = useState(initial ?? kids[0]?.id ?? '');
  if (!kids.length) return <EmptyState title="Belum ada anak yang ditautkan" />;
  return <div><PageHeader title="Nilai anak" actions={<Select value={sid} onChange={(e) => setSid(e.target.value)} options={kids.map((k) => ({ value: k.id, label: k.full_name }))} />} />{sid && <StudentGrades studentId={sid} />}</div>;
}
