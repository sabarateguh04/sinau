import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Play, KeyRound, Eye, RefreshCw, Users, StopCircle, Clock, BarChart3, ArrowLeft, Search } from 'lucide-react';
import { get, post, put, toApiError } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage, FormField } from '@/features/crud/CrudPage';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Table, Tabs, Progress, Avatar, cx } from '@/components/ui';
import { fmtDateTime, fmtScore, label, tone, QUESTION_TYPE_LABEL } from '@/lib/format';
import { Dict } from '@/lib/types';
import { QuestionPicker } from './Quizzes';
import { AttemptRunner } from './QuizAttempt';

export default function Exams() {
  const { has, hasRole } = useAuth();
  const canWrite = has('exam:write') || has('exam:schedule');
  if (hasRole('SISWA') && !canWrite && !has('exam:proctor')) return <StudentExams />;
  return <TeacherExams />;
}

/** ---------------- Student ---------------- */
function StudentExams() {
  const nav = useNavigate();
  const { activeRole } = useAuth();
  const p = rolePrefix(activeRole);
  const [rows, setRows] = useState<Dict[] | null>(null);
  const [tokenFor, setTokenFor] = useState<Dict | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => get<unknown>('/exams/sessions', { limit: 50 }).then((d) => setRows((d as { data?: Dict[] }).data ?? [])), []);
  useEffect(() => { load(); }, [load]);
  const start = async () => { if (!tokenFor) return; setBusy(true); try { const a = await post<Dict>(`/exams/sessions/${tokenFor.id}/start`, { token: token.trim().toUpperCase() }); nav(`/${p}/ujian/attempt/${a.id}`); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  if (!rows) return <Loading />;
  return (
    <div>
      <PageHeader title="Ujian" subtitle="Ujian terjadwal untuk kelas Anda. Masukkan token dari pengawas untuk memulai." />
      {rows.length === 0 ? <EmptyState title="Belum ada jadwal ujian" /> : (
        <div className="space-y-3">{rows.map((s) => { const live = s.live_status as string; const my = s.my_status as string | null; return (
          <Card key={s.id as string}><div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{s.exam_title as string}</span><Badge tone={s.exam_type === 'UAS' ? 'purple' : 'brand'}>{s.exam_type as string}</Badge><Badge tone={tone(live)}>{label(live)}</Badge>{my && <Badge tone={tone(my)}>{label(my)}</Badge>}</div><div className="mt-1 text-xs text-ink-2">{s.subject_name as string} · {fmtDateTime(s.start_at as string)} – {fmtDateTime(s.end_at as string)} · {s.duration_min as number} menit{s.room_name ? ` · ${s.room_name}` : ''}{s.proctor_name ? ` · Pengawas ${s.proctor_name}` : ''}</div></div>
            <div className="flex items-center gap-2">
              {my && my !== 'IN_PROGRESS' ? <div className="text-right"><div className="text-xs text-ink-3">Skor</div><div className="text-xl font-bold text-brand-700">{s.my_score === null || s.my_score === undefined ? '—' : fmtScore(s.my_score as number)}</div></div> : null}
              {my === 'IN_PROGRESS' && <Button icon={<Play className="h-4 w-4" />} onClick={() => nav(`/${p}/ujian/attempt/${s.my_attempt_id}`)}>Lanjutkan</Button>}
              {!my && live === 'ONGOING' && <Button icon={<KeyRound className="h-4 w-4" />} onClick={() => { setTokenFor(s); setToken(''); }}>Masukkan token</Button>}
              {my && my !== 'IN_PROGRESS' && <Button variant="outline" size="sm" onClick={() => nav(`/${p}/ujian/attempt/${s.my_attempt_id}`)}>Lihat</Button>}
            </div>
          </div></Card>
        ); })}</div>
      )}
      <Modal open={!!tokenFor} onClose={() => setTokenFor(null)} title={`Mulai: ${tokenFor?.exam_title ?? ''}`} size="sm" footer={<Button loading={busy} onClick={start} disabled={token.length < 4}>Mulai ujian</Button>}>
        <p className="text-sm text-ink-2">Durasi {tokenFor?.duration_min as number} menit sejak Anda mulai.{tokenFor?.lock_screen ? ' Jangan berpindah tab/aplikasi — pelanggaran dicatat dan dapat menghentikan ujian.' : ''}</p>
        <Input autoFocus className="mt-4 text-center font-mono text-2xl uppercase tracking-[0.3em]" maxLength={8} value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="TOKEN" />
      </Modal>
    </div>
  );
}

export function ExamAttemptPage() {
  const { attemptId } = useParams();
  const nav = useNavigate();
  return <AttemptRunner base="/exams" attemptId={attemptId!} onExit={() => nav(-1)} lockScreen />;
}

/** ---------------- Teacher / admin ---------------- */
function TeacherExams() {
  const { has } = useAuth();
  const [tab, setTab] = useState<'sesi' | 'ujian' | 'paket'>('sesi');
  return (
    <div>
      <PageHeader title="Ujian Online" subtitle="Paket soal → ujian (aturan) → sesi per kelas (jadwal & token). Pengawas memantau langsung." />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'sesi', label: 'Sesi & pengawasan' }, { value: 'ujian', label: 'Ujian' }, { value: 'paket', label: 'Paket soal' }]} />
      {tab === 'paket' && <Packages canWrite={has('exam:write')} />}
      {tab === 'ujian' && <ExamsCrud />}
      {tab === 'sesi' && <Sessions />}
    </div>
  );
}
function Packages({ canWrite }: { canWrite: boolean }) {
  const [editing, setEditing] = useState<Dict | null | 'new'>(null);
  const [key, setKey] = useState(0);
  return (
    <>
      <CrudPage<Dict> key={key} noHeader title="Paket soal" endpoint="/exams/packages" entityLabel="paket" perm={{ write: 'exam:write' }} canCreate={false} canEdit={false}
        headerActions={canWrite && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Paket baru</Button>}
        extraActions={canWrite && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Paket baru</Button>}
        onRowClick={(r) => setEditing(r)}
        columns={[{ key: 'title', header: 'Paket', render: (r) => <span className="font-medium">{r.title as string}</span> }, { key: 'subject_name', header: 'Mapel' }, { key: 'grade_level', header: 'Kelas', className: 'text-center' }, { key: 'question_count', header: 'Soal', className: 'text-center' }, { key: 'total_points', header: 'Poin', className: 'text-center' }, { key: 'exam_count', header: 'Dipakai', className: 'text-center' }, { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'READY' ? 'green' : 'gray'}>{r.status as string}</Badge> }]}
        filters={[{ name: 'subject_id', label: 'Mapel', type: 'async-select', source: { url: '/academic/subjects', label: 'name' } }, { name: 'status', label: 'Status', options: ['DRAFT', 'READY', 'ARCHIVED'].map((x) => ({ value: x, label: x })) }]}
      />
      <PackageEditor open={editing !== null} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setKey((k) => k + 1); }} canWrite={canWrite} />
    </>
  );
}
function PackageEditor({ open, row, onClose, onSaved, canWrite }: { open: boolean; row: Dict | null; onClose: () => void; onSaved: () => void; canWrite: boolean }) {
  const [f, setF] = useState<Dict>({});
  const [qs, setQs] = useState<{ question_id: string; points: number; text: string; type: string }[]>([]);
  const [subjects, setSubjects] = useState<Dict[]>([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; get<unknown>('/academic/subjects', { limit: 200 }).then((d) => setSubjects((d as { data?: Dict[] }).data ?? [])); if (row) { setF({ ...row }); get<Dict[]>(`/exams/packages/${row.id}/questions`).then((l) => setQs(l.map((q) => ({ question_id: q.id as string, points: Number(q.points), text: q.text as string, type: q.type as string })))); } else { setF({ title: '', subject_id: '', grade_level: '', description: '', status: 'DRAFT' }); setQs([]); } }, [open, row]);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => { setBusy(true); try { const body = { title: f.title, subject_id: f.subject_id || null, grade_level: f.grade_level ? Number(f.grade_level) : null, description: f.description || null, status: f.status, questions: qs.map((q) => ({ question_id: q.question_id, points: q.points })) }; if (row) await put(`/exams/packages/${row.id}`, body); else await post('/exams/packages', body); toast.success('Paket disimpan'); onSaved(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const total = qs.reduce((a, q) => a + q.points, 0);
  return (
    <Modal open={open} onClose={onClose} size="xl" title={row ? 'Paket soal' : 'Paket soal baru'} footer={<><Button variant="outline" onClick={onClose}>Tutup</Button>{canWrite && <Button loading={busy} onClick={save}>Simpan</Button>}</>}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Judul" required className="sm:col-span-2"><Input disabled={!canWrite} value={String(f.title ?? '')} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Mapel"><Select disabled={!canWrite} value={String(f.subject_id ?? '')} onChange={(e) => set('subject_id', e.target.value)} placeholder="—" options={subjects.map((s) => ({ value: s.id as string, label: s.name as string }))} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Kelas"><Select disabled={!canWrite} value={String(f.grade_level ?? '')} onChange={(e) => set('grade_level', e.target.value)} placeholder="—" options={[10, 11, 12].map((g) => ({ value: g, label: String(g) }))} /></Field><Field label="Status"><Select disabled={!canWrite} value={String(f.status)} onChange={(e) => set('status', e.target.value)} options={['DRAFT', 'READY', 'ARCHIVED'].map((x) => ({ value: x, label: x }))} /></Field></div>
        <Field label="Deskripsi" className="sm:col-span-4"><Input disabled={!canWrite} value={String(f.description ?? '')} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="sm:col-span-4"><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-ink-2">Soal ({qs.length}) · {total} poin</span>{canWrite && <Button size="sm" variant="outline" icon={<Search className="h-4 w-4" />} onClick={() => setPicker(true)}>Pilih dari bank soal</Button>}</div>
          {qs.length === 0 ? <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-3">Belum ada soal</div> : <ol className="max-h-[40vh] space-y-1 overflow-y-auto">{qs.map((q, i) => <li key={q.question_id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="w-6 text-ink-3">{i + 1}.</span><span className="min-w-0 flex-1 truncate">{q.text}</span><Badge tone="gray">{QUESTION_TYPE_LABEL[q.type]}</Badge><Input type="number" step="0.5" min={0.5} disabled={!canWrite} className="h-8 w-16 text-center" value={q.points} onChange={(e) => setQs((arr) => arr.map((x) => (x.question_id === q.question_id ? { ...x, points: Number(e.target.value) } : x)))} />{canWrite && <button className="text-red-500" onClick={() => setQs((arr) => arr.filter((x) => x.question_id !== q.question_id))}>✕</button>}</li>)}</ol>}
        </div>
      </div>
      <QuestionPicker open={picker} onClose={() => setPicker(false)} selected={qs.map((q) => q.question_id)} onAdd={(add) => { setQs((arr) => [...arr, ...add.filter((a) => !arr.some((x) => x.question_id === a.question_id))]); setPicker(false); }} subjectId={f.subject_id ? String(f.subject_id) : undefined} />
    </Modal>
  );
}
function ExamsCrud() {
  const fields: FormField[] = [
    { name: 'title', label: 'Judul ujian', required: true, span: 2 },
    { name: 'package_id', label: 'Paket soal', type: 'async-select', required: true, source: { url: '/exams/packages', params: { limit: 200 }, label: (r) => `${r.title} (${r.question_count} soal)` } },
    { name: 'type', label: 'Jenis', type: 'select', defaultValue: 'UH', options: ['UH', 'UTS', 'UAS', 'TRYOUT', 'LAINNYA'].map((x) => ({ value: x, label: x })) },
    { name: 'duration_min', label: 'Durasi (menit)', type: 'number', defaultValue: 60 }, { name: 'passing_score', label: 'KKM / nilai lulus', type: 'number' },
    { name: 'show_result', label: 'Tampilkan hasil', type: 'select', defaultValue: 'AFTER_CLOSE', options: [{ value: 'IMMEDIATE', label: 'Langsung' }, { value: 'AFTER_CLOSE', label: 'Setelah sesi berakhir' }, { value: 'NEVER', label: 'Tidak' }] },
    { name: 'grade_component', label: 'Komponen nilai', type: 'select', defaultValue: 'UH', options: ['UH', 'UTS', 'UAS', 'KUIS', 'TUGAS'].map((x) => ({ value: x, label: x })) },
    { name: 'max_violations', label: 'Maks. pelanggaran (0 = tak terbatas)', type: 'number', defaultValue: 3 },
    { name: 'status', label: 'Status', type: 'select', defaultValue: 'DRAFT', options: [{ value: 'DRAFT', label: 'Draf' }, { value: 'PUBLISHED', label: 'Terbit (bisa dijadwalkan)' }, { value: 'CLOSED', label: 'Ditutup' }] },
    { name: 'shuffle_questions', label: 'Acak soal', type: 'switch', defaultValue: true }, { name: 'shuffle_options', label: 'Acak opsi', type: 'switch', defaultValue: true }, { name: 'lock_screen', label: 'Kunci layar (deteksi pindah tab)', type: 'switch', defaultValue: true },
  ];
  return <CrudPage<Dict> noHeader title="Ujian" endpoint="/exams" entityLabel="ujian" modalSize="lg" perm={{ write: 'exam:write' }}
    columns={[{ key: 'title', header: 'Ujian', render: (r) => <div><div className="font-medium">{r.title as string}</div><div className="text-xs text-ink-3">{r.package_title as string} · {r.question_count as number} soal</div></div> }, { key: 'type', header: 'Jenis', render: (r) => <Badge tone="brand">{r.type as string}</Badge> }, { key: 'subject_name', header: 'Mapel' }, { key: 'duration_min', header: 'Durasi', render: (r) => `${r.duration_min} mnt` }, { key: 'session_count', header: 'Sesi', className: 'text-center' }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }]}
    filters={[{ name: 'status', label: 'Status', options: ['DRAFT', 'PUBLISHED', 'CLOSED'].map((x) => ({ value: x, label: label(x) })) }, { name: 'type', label: 'Jenis', options: ['UH', 'UTS', 'UAS', 'TRYOUT'].map((x) => ({ value: x, label: x })) }]}
    fields={fields} />;
}
function Sessions() {
  const { has, activeRole } = useAuth();
  const nav = useNavigate();
  const p = rolePrefix(activeRole);
  const [rows, setRows] = useState<Dict[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => get<unknown>('/exams/sessions', { limit: 100 }).then((d) => setRows((d as { data?: Dict[] }).data ?? [])), []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <Loading />;
  return (
    <div>
      <div className="mb-3 flex justify-end">{has('exam:schedule') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Jadwalkan sesi</Button>}</div>
      <Card padded={false}><Table<Dict> rows={rows} onRowClick={(r) => nav(`/${p}/ujian/sesi/${r.id}`)} columns={[
        { key: 'exam_title', header: 'Ujian', render: (r) => <div><div className="font-medium">{r.exam_title as string}</div><div className="text-xs text-ink-3">{r.subject_name as string} · {r.exam_type as string}</div></div> },
        { key: 'class_name', header: 'Kelas' }, { key: 'start_at', header: 'Waktu', render: (r) => <span className="text-xs">{fmtDateTime(r.start_at as string)}<br />s.d. {fmtDateTime(r.end_at as string)}</span> }, { key: 'proctor_name', header: 'Pengawas' },
        { key: 'live_status', header: 'Status', render: (r) => <Badge tone={tone(r.live_status as string)}>{label(r.live_status as string)}</Badge> },
        { key: 'progress', header: 'Peserta', render: (r) => <div className="flex items-center gap-2"><Progress value={(Number(r.finished_count) / Math.max(1, Number(r.student_count))) * 100} className="w-20" tone="green" /><span className="text-xs">{r.finished_count as number}/{r.student_count as number}</span></div> },
        { key: 'x', header: '', render: (r) => <Button size="sm" variant="outline" icon={<Eye className="h-4 w-4" />}>Pantau</Button> },
      ]} empty="Belum ada sesi ujian" /></Card>
      <SessionForm open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />
    </div>
  );
}
function SessionForm({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [exams, setExams] = useState<Dict[]>([]);
  const [classes, setClasses] = useState<Dict[]>([]);
  const [teachers, setTeachers] = useState<Dict[]>([]);
  const [rooms, setRooms] = useState<Dict[]>([]);
  const [f, setF] = useState({ exam_id: '', class_id: '', class_subject_id: '', start_at: '', end_at: '', proctor_id: '', room_id: '', note: '' });
  const [classSubjects, setClassSubjects] = useState<Dict[]>([]);
  useEffect(() => { if (f.class_id) get<Dict[]>(`/academic/classes/${f.class_id}/subjects`).then(setClassSubjects); else setClassSubjects([]); }, [f.class_id]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; get<unknown>('/exams', { status: 'PUBLISHED', limit: 200 }).then((d) => setExams((d as { data?: Dict[] }).data ?? [])); get<unknown>('/academic/classes', { active_year: 1, limit: 200 }).then((d) => setClasses((d as { data?: Dict[] }).data ?? [])); get<unknown>('/users', { role: 'GURU', limit: 300 }).then((d) => setTeachers((d as { data?: Dict[] }).data ?? [])); get<unknown>('/academic/rooms', { limit: 100 }).then((d) => setRooms((d as { data?: Dict[] }).data ?? [])); }, [open]);
  const submit = async () => { setBusy(true); try { await post('/exams/sessions', { ...f, class_subject_id: f.class_subject_id || null, proctor_id: f.proctor_id || null, room_id: f.room_id || null, note: f.note || null, start_at: new Date(f.start_at).toISOString(), end_at: new Date(f.end_at).toISOString() }); toast.success('Sesi dijadwalkan; siswa diberi tahu'); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Jadwalkan sesi ujian" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} onClick={submit} disabled={!f.exam_id || !f.class_id || !f.start_at || !f.end_at}>Jadwalkan</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ujian (terbit)" required className="sm:col-span-2"><Select value={f.exam_id} onChange={(e) => setF({ ...f, exam_id: e.target.value })} placeholder="— pilih —" options={exams.map((x) => ({ value: x.id as string, label: `${x.title} · ${x.subject_name ?? ''} (${x.duration_min} mnt)` }))} /></Field>
        <Field label="Kelas" required><Select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })} placeholder="— pilih —" options={classes.map((c) => ({ value: c.id as string, label: c.name as string }))} /></Field>
        <Field label="Mapel (untuk nilai)" hint="otomatis dari mapel ujian jika kosong"><Select value={f.class_subject_id} onChange={(e) => setF({ ...f, class_subject_id: e.target.value })} placeholder="— otomatis —" options={classSubjects.map((c) => ({ value: c.id as string, label: `${c.subject_name} (${c.teacher_name ?? '-'})` }))} /></Field>
        <Field label="Pengawas"><Select value={f.proctor_id} onChange={(e) => setF({ ...f, proctor_id: e.target.value })} placeholder="—" options={teachers.map((t) => ({ value: t.id as string, label: t.full_name as string }))} /></Field>
        <Field label="Mulai" required><Input type="datetime-local" value={f.start_at} onChange={(e) => setF({ ...f, start_at: e.target.value })} /></Field>
        <Field label="Selesai (jendela)" required><Input type="datetime-local" value={f.end_at} onChange={(e) => setF({ ...f, end_at: e.target.value })} /></Field>
        <Field label="Ruang"><Select value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })} placeholder="—" options={rooms.map((r) => ({ value: r.id as string, label: r.name as string }))} /></Field>
        <Field label="Catatan"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/** Proctor / results view for one session. */
export function ExamSessionPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const [s, setS] = useState<Dict | null>(null);
  const [tab, setTab] = useState<'pantau' | 'hasil'>('pantau');
  const [results, setResults] = useState<Dict | null>(null);
  const [grading, setGrading] = useState<Dict | null>(null);
  const load = useCallback(() => get<Dict>(`/exams/sessions/${id}`).then(setS).catch((e) => { toast.error(toApiError(e).message); nav(-1); }), [id, nav]);
  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (tab === 'hasil') get<Dict>(`/exams/sessions/${id}/results`).then(setResults); }, [tab, id]);
  if (!s) return <Loading />;
  const students = (s.students as Dict[]) ?? [];
  const canProctor = has('exam:proctor') || has('exam:schedule');
  return (
    <div>
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav(-1)}>Kembali</Button>
      <PageHeader title={s.exam_title as string} subtitle={<span>{s.class_name as string} · {fmtDateTime(s.start_at as string)} – {fmtDateTime(s.end_at as string)} · <Badge tone={tone(s.live_status as string)}>{label(s.live_status as string)}</Badge></span>}
        actions={canProctor && <>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5"><KeyRound className="h-4 w-4 text-brand-700" /><span className="font-mono text-2xl font-black tracking-[0.25em]">{s.token as string}</span><Button size="icon" variant="ghost" title="Token baru" onClick={async () => { await put(`/exams/sessions/${id}`, { regenerate_token: true }); load(); }} icon={<RefreshCw className="h-4 w-4" />} /></div>
          <Button variant="outline" icon={<Clock className="h-4 w-4" />} onClick={async () => { const m = Number(prompt('Tambah menit:', '10')); if (m > 0) { await post(`/exams/sessions/${id}/extend`, { minutes: m }); toast.success(`Diperpanjang ${m} menit`); load(); } }}>Perpanjang</Button>
          <Button variant="danger" icon={<StopCircle className="h-4 w-4" />} onClick={async () => { if (!confirm('Kumpulkan paksa semua peserta yang masih mengerjakan?')) return; await post(`/exams/sessions/${id}/force-submit`, {}); load(); }}>Akhiri semua</Button>
        </>} />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'pantau', label: 'Pantau', count: students.length }, { value: 'hasil', label: 'Hasil & analisis' }]} />
      {tab === 'pantau' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3"><Card><div className="text-xs text-ink-3">Belum mulai</div><div className="text-2xl font-bold">{students.filter((x) => !x.status).length}</div></Card><Card><div className="text-xs text-ink-3">Sedang mengerjakan</div><div className="text-2xl font-bold text-sky-600">{students.filter((x) => x.status === 'IN_PROGRESS').length}</div></Card><Card><div className="text-xs text-ink-3">Selesai</div><div className="text-2xl font-bold text-emerald-600">{students.filter((x) => x.status && x.status !== 'IN_PROGRESS').length}</div></Card></div>
          <Card padded={false}><Table<Dict> rows={students} rowKey={(r) => r.student_id as string} columns={[
            { key: 'full_name', header: 'Siswa', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.full_name as string} src={r.avatar_url as string} size="sm" /><div><div className="font-medium">{r.full_name as string}</div><div className="text-xs text-ink-3">{r.nis as string}</div></div></div> },
            { key: 'status', header: 'Status', render: (r) => r.status ? <Badge tone={tone(r.status as string)}>{label(r.status as string)}{r.submit_reason && r.submit_reason !== 'MANUAL' ? ` · ${r.submit_reason}` : ''}</Badge> : <Badge tone="gray">Belum mulai</Badge> },
            { key: 'answered', header: 'Dijawab', render: (r) => (r.attempt_id ? String(r.answered) : '-') },
            { key: 'last_saved_at', header: 'Aktivitas terakhir', render: (r) => r.last_saved_at ? fmtDateTime(r.last_saved_at as string) : r.started_at ? fmtDateTime(r.started_at as string) : '-' },
            { key: 'violations', header: 'Pelanggaran', render: (r) => Number(r.violations) > 0 ? <Badge tone="red">{r.violations as number}</Badge> : <span className="text-ink-3">0</span> },
            { key: 'score', header: 'Skor', render: (r) => fmtScore(r.score as number) },
            { key: 'x', header: '', render: (r) => <div className="flex gap-1">{r.status === 'IN_PROGRESS' && canProctor && <Button size="sm" variant="outline" onClick={async () => { await post(`/exams/sessions/${id}/force-submit`, { student_id: r.student_id }); load(); }}>Akhiri</Button>}{r.status === 'SUBMITTED' && has('exam:grade') && <Button size="sm" onClick={() => setGrading(r)}>Nilai esai</Button>}{!!r.attempt_id && r.status !== 'IN_PROGRESS' && <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setGrading(r)} />}</div> },
          ]} /></Card>
        </div>
      )}
      {tab === 'hasil' && (results ? <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[['Peserta', (results.summary as Dict).participants], ['Rata-rata', fmtScore((results.summary as Dict).average as number)], ['Tertinggi', fmtScore((results.summary as Dict).max as number)], ['Terendah', fmtScore((results.summary as Dict).min as number)], ['Lulus KKM', (results.summary as Dict).passed ?? '-']].map(([l, v]) => <Card key={String(l)}><div className="text-xs text-ink-3">{String(l)}</div><div className="text-2xl font-bold">{String(v ?? '-')}</div></Card>)}</div>
        <Card padded={false} title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Analisis butir</span>}><Table<Dict> dense rows={results.items as Dict[]} columns={[{ key: 'text', header: 'Soal', render: (r) => <span className="line-clamp-1 max-w-md">{r.text as string}</span> }, { key: 'concept_name', header: 'Konsep' }, { key: 'difficulty', header: 'Tingkat' }, { key: 'answered', header: 'Dijawab', className: 'text-center' }, { key: 'difficulty_index', header: 'P (benar)', render: (r) => { const v = r.difficulty_index as number | null; return v === null ? '-' : <div className="flex items-center gap-2"><Progress value={v * 100} className="w-24" tone={v < 0.3 ? 'red' : v > 0.8 ? 'green' : 'amber'} /><span>{Math.round(v * 100)}%</span></div>; } }]} /></Card>
      </div> : <Loading />)}
      <ExamEssayGrading attempt={grading} onClose={() => setGrading(null)} onDone={() => { setGrading(null); load(); }} />
      <span className={cx('hidden')}><Users /></span>
    </div>
  );
}
function ExamEssayGrading({ attempt, onClose, onDone }: { attempt: Dict | null; onClose: () => void; onDone: () => void }) {
  const [view, setView] = useState<Dict | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  useEffect(() => { if (attempt?.attempt_id) get<Dict>(`/exams/attempts/${attempt.attempt_id}`).then(setView); else setView(null); }, [attempt]);
  const qs = ((view?.questions as Dict[]) ?? []);
  const essays = qs.filter((q) => q.type === 'ESSAY');
  const save = async () => { try { await post(`/exams/attempts/${attempt!.attempt_id}/grade`, { scores: essays.map((q) => ({ question_id: q.id, score: Number(scores[q.id as string] ?? q.score ?? 0) })) }); toast.success('Nilai disimpan'); onDone(); } catch (e) { toast.error(toApiError(e).message); } };
  return (
    <Modal open={!!attempt} onClose={onClose} size="xl" title={`Jawaban — ${attempt?.full_name ?? ''}`} footer={<><Button variant="outline" onClick={onClose}>Tutup</Button>{essays.length > 0 && <Button onClick={save}>Simpan nilai esai</Button>}</>}>
      {!view ? <Loading /> : <div className="space-y-3">{qs.map((q, i) => <div key={q.id as string} className={cx('rounded-xl border p-3', q.is_correct === 1 ? 'border-emerald-300' : q.is_correct === 0 ? 'border-red-300' : 'border-line')}><div className="flex items-start justify-between gap-2"><div className="text-sm font-medium">{i + 1}. {q.text as string}</div><Badge tone="gray">{String(q.score ?? '-')}/{q.points as number}</Badge></div><div className="mt-2 text-xs text-ink-2">Jawaban: <b>{JSON.stringify(q.my_answer)}</b>{q.type !== 'ESSAY' ? <> · Kunci: <b>{JSON.stringify(q.answer_key)}</b></> : null}</div>{q.type === 'ESSAY' && <div className="mt-2 flex items-center gap-2 text-sm">Skor (maks {q.points as number}): <Input type="number" min={0} max={Number(q.points)} className="h-9 w-24" value={scores[q.id as string] ?? String(q.score ?? '')} onChange={(e) => setScores((s) => ({ ...s, [q.id as string]: e.target.value }))} /></div>}</div>)}</div>}
    </Modal>
  );
}
