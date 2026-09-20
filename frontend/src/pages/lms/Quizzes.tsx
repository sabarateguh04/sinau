import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Plus, Clock, Search } from 'lucide-react';
import { get, post, put, toApiError } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { toast } from '@/store/ui';
import { useResource } from '@/features/crud/CrudPage';
import { Badge, Button, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Switch, Tabs, Textarea, useDebounce, cx } from '@/components/ui';
import { fmtDateTime, label, tone, toInputDateTime, fmtScore, QUESTION_TYPE_LABEL } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Quizzes() {
  const { has, activeRole, user, hasRole } = useAuth();
  const p = rolePrefix(activeRole);
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [status, setStatus] = useState('');
  const [cs, setCs] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const canWrite = has('quiz:write');
  const isStudent = hasRole('SISWA') && !canWrite;
  const params = useMemo(() => ({ q: dq || undefined, status: status || undefined, class_subject_id: cs || undefined, page, limit: 20 }), [dq, status, cs, page]);
  const { rows, meta, loading, reload } = useResource<Dict>('/quizzes', params);
  useEffect(() => setPage(1), [dq, status, cs]);
  return (
    <div>
      <PageHeader title="Kuis" subtitle={canWrite ? 'Kuis dari bank soal, dinilai otomatis (kecuali esai).' : 'Kuis dari guru Anda. Nilai terbaik yang dihitung.'} actions={canWrite && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Buat kuis</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} className="w-full sm:w-64" />
        {canWrite && <Tabs value={status} onChange={setStatus} tabs={[{ value: '', label: 'Semua' }, { value: 'PUBLISHED', label: 'Terbit' }, { value: 'DRAFT', label: 'Draf' }, { value: 'CLOSED', label: 'Ditutup' }]} />}
        {user?.teaching?.length ? <Select value={cs} onChange={(e) => setCs(e.target.value)} className="w-56" placeholder="Semua kelas/mapel" options={user.teaching.map((t) => ({ value: t.class_subject_id, label: `${t.class_name} · ${t.subject_name}` }))} /> : null}
      </div>
      {!loading && rows.length === 0 ? <EmptyState title="Belum ada kuis" icon={<ListChecks className="h-6 w-6" />} /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((qz) => (
            <Link key={qz.id as string} to={`/${p}/kuis/${qz.id}`} className={cx('card p-4 transition hover:border-brand-400', !qz.is_published && 'border-dashed')}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-semibold">{qz.title as string}</div><div className="text-xs text-ink-3">{qz.class_name as string} · {qz.subject_name as string}</div></div>{canWrite ? <Badge tone={tone(qz.status as string)}>{label(qz.status as string)}</Badge> : <Badge tone={qz.is_open ? 'green' : 'gray'}>{qz.is_open ? 'Dibuka' : 'Ditutup'}</Badge>}</div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-2"><span>{qz.question_count as number} soal</span><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{qz.duration_min as number} menit</span>{qz.close_at ? <span>s.d. {fmtDateTime(qz.close_at as string)}</span> : null}</div>
              {isStudent ? <div className="mt-2 flex items-center justify-between text-xs"><span className="text-ink-3">Percobaan {qz.my_attempts as number}/{qz.max_attempts as number}</span>{qz.my_best !== null && qz.my_best !== undefined ? <span className="font-bold text-brand-700">Terbaik {fmtScore(qz.my_best as number)}</span> : null}</div> : <div className="mt-2 text-xs text-ink-3">{qz.attempted_count as number}/{qz.student_count as number} siswa mengerjakan</div>}
            </Link>
          ))}
        </div>
      )}
      <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
      {canWrite && <QuizForm open={open} row={null} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
    </div>
  );
}

export function QuizForm({ open, row, onClose, onSaved }: { open: boolean; row: Dict | null; onClose: () => void; onSaved: (q: Dict) => void }) {
  const { user } = useAuth();
  const teaching = user?.teaching ?? [];
  const [f, setF] = useState<Dict>({});
  const [selected, setSelected] = useState<{ question_id: string; points: number; text: string; type: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const locked = !!row && Number(row.attempted_count) > 0;
  useEffect(() => {
    if (!open) return;
    if (row) { setF({ ...row, open_at: toInputDateTime(row.open_at as string), close_at: toInputDateTime(row.close_at as string) }); setSelected(((row.questions as Dict[]) ?? []).map((q) => ({ question_id: q.id as string, points: Number(q.points), text: q.text as string, type: q.type as string }))); }
    else { setF({ class_subject_id: teaching[0]?.class_subject_id ?? '', title: '', description: '', duration_min: 20, open_at: '', close_at: '', shuffle_questions: true, shuffle_options: true, max_attempts: 1, show_result: 'IMMEDIATE', status: 'DRAFT', grade_component: 'KUIS' }); setSelected([]); }
  }, [open, row, teaching]);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const body: Dict = { class_subject_id: f.class_subject_id, title: f.title, description: f.description || null, duration_min: Number(f.duration_min) || 20, open_at: f.open_at ? new Date(String(f.open_at)).toISOString() : null, close_at: f.close_at ? new Date(String(f.close_at)).toISOString() : null, shuffle_questions: !!f.shuffle_questions, shuffle_options: !!f.shuffle_options, max_attempts: Number(f.max_attempts) || 1, show_result: f.show_result, status: f.status, grade_component: f.grade_component || 'KUIS' };
      if (!locked) body.questions = selected.map((s) => ({ question_id: s.question_id, points: s.points }));
      const saved = row ? await put<Dict>(`/quizzes/${row.id}`, body) : await post<Dict>('/quizzes', body);
      toast.success('Kuis disimpan'); onSaved(saved);
    } catch (e) { toast.error('Gagal menyimpan', toApiError(e).message); } finally { setBusy(false); }
  };
  const total = selected.reduce((a, s) => a + s.points, 0);
  return (
    <Modal open={open} onClose={onClose} size="xl" title={row ? 'Ubah kuis' : 'Kuis baru'} footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} onClick={save}>Simpan</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Judul" required className="sm:col-span-2"><Input value={String(f.title ?? '')} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Kelas & mapel" required><Select value={String(f.class_subject_id ?? '')} onChange={(e) => set('class_subject_id', e.target.value)} placeholder="— pilih —" options={teaching.map((t) => ({ value: t.class_subject_id, label: `${t.class_name} · ${t.subject_name}` }))} /></Field>
        <Field label="Deskripsi" className="sm:col-span-3"><Textarea rows={2} value={String(f.description ?? '')} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Durasi (menit)"><Input type="number" min={1} value={String(f.duration_min ?? 20)} onChange={(e) => set('duration_min', e.target.value)} /></Field>
        <Field label="Dibuka"><Input type="datetime-local" value={String(f.open_at ?? '')} onChange={(e) => set('open_at', e.target.value)} /></Field>
        <Field label="Ditutup"><Input type="datetime-local" value={String(f.close_at ?? '')} onChange={(e) => set('close_at', e.target.value)} /></Field>
        <Field label="Maks. percobaan"><Input type="number" min={1} max={10} value={String(f.max_attempts ?? 1)} onChange={(e) => set('max_attempts', e.target.value)} /></Field>
        <Field label="Tampilkan hasil"><Select value={String(f.show_result)} onChange={(e) => set('show_result', e.target.value)} options={[{ value: 'IMMEDIATE', label: 'Langsung setelah submit' }, { value: 'AFTER_CLOSE', label: 'Setelah kuis ditutup' }, { value: 'NEVER', label: 'Tidak ditampilkan' }]} /></Field>
        <Field label="Status"><Select value={String(f.status)} onChange={(e) => set('status', e.target.value)} options={[{ value: 'DRAFT', label: 'Draf' }, { value: 'PUBLISHED', label: 'Terbit' }, { value: 'CLOSED', label: 'Ditutup' }]} /></Field>
        <Field label="Komponen nilai"><Select value={String(f.grade_component ?? 'KUIS')} onChange={(e) => set('grade_component', e.target.value)} options={['KUIS', 'TUGAS', 'UH', 'UTS', 'UAS'].map((x) => ({ value: x, label: x }))} /></Field>
        <div className="flex items-end gap-4 sm:col-span-2"><Switch checked={!!f.shuffle_questions} onChange={(v) => set('shuffle_questions', v)} label="Acak soal" /><Switch checked={!!f.shuffle_options} onChange={(v) => set('shuffle_options', v)} label="Acak opsi" /></div>
        <div className="sm:col-span-3">
          <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-ink-2">Soal ({selected.length}) · total {total} poin</span>{!locked && <Button size="sm" variant="outline" icon={<Search className="h-4 w-4" />} onClick={() => setPickerOpen(true)}>Pilih dari bank soal</Button>}</div>
          {locked && <div className="mb-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20">Soal terkunci karena sudah ada siswa yang mengerjakan.</div>}
          {selected.length === 0 ? <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-3">Belum ada soal dipilih</div> : <ol className="space-y-1">{selected.map((s, i) => <li key={s.question_id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="w-6 text-ink-3">{i + 1}.</span><span className="min-w-0 flex-1 truncate">{s.text}</span><Badge tone="gray">{QUESTION_TYPE_LABEL[s.type]}</Badge><Input type="number" step="0.5" min={0.5} className="h-8 w-16 text-center" disabled={locked} value={s.points} onChange={(e) => setSelected((arr) => arr.map((x) => (x.question_id === s.question_id ? { ...x, points: Number(e.target.value) } : x)))} />{!locked && <button className="text-red-500" onClick={() => setSelected((arr) => arr.filter((x) => x.question_id !== s.question_id))}>✕</button>}</li>)}</ol>}
        </div>
      </div>
      <QuestionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} selected={selected.map((s) => s.question_id)} onAdd={(qs) => { setSelected((arr) => [...arr, ...qs.filter((q) => !arr.some((x) => x.question_id === q.question_id))]); setPickerOpen(false); }} subjectId={teaching.find((t) => t.class_subject_id === f.class_subject_id)?.subject_id} />
    </Modal>
  );
}

export function QuestionPicker({ open, onClose, selected, onAdd, subjectId }: { open: boolean; onClose: () => void; selected: string[]; onAdd: (q: { question_id: string; points: number; text: string; type: string }[]) => void; subjectId?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [subject, setSubject] = useState(subjectId ?? '');
  const [rows, setRows] = useState<Dict[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [subjects, setSubjects] = useState<Dict[]>([]);
  useEffect(() => { if (open) { setPicked(new Set()); setSubject(subjectId ?? ''); get<unknown>('/academic/subjects', { limit: 200 }).then((d) => setSubjects((d as { data?: Dict[] }).data ?? (Array.isArray(d) ? d as Dict[] : []))).catch(() => undefined); } }, [open, subjectId]);
  useEffect(() => { if (!open) return; get<unknown>('/questions', { q: dq || undefined, subject_id: subject || undefined, limit: 100, is_active: 1 }).then((d) => setRows((d as { data?: Dict[] }).data ?? [])).catch(() => undefined); }, [open, dq, subject]);
  return (
    <Modal open={open} onClose={onClose} size="xl" title="Pilih soal" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button disabled={!picked.size} onClick={() => onAdd(rows.filter((r) => picked.has(r.id as string)).map((r) => ({ question_id: r.id as string, points: Number(r.points) || 1, text: r.text as string, type: r.type as string })))}>Tambah {picked.size} soal</Button></>}>
      <div className="mb-3 flex gap-2"><SearchInput value={q} onChange={setQ} className="flex-1" /><Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-48" placeholder="Semua mapel" options={subjects.map((s) => ({ value: s.id as string, label: s.name as string }))} /></div>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {rows.map((r) => { const already = selected.includes(r.id as string); return (
          <label key={r.id as string} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm', already ? 'border-line opacity-50' : picked.has(r.id as string) ? 'border-brand-400 bg-brand-50/50 dark:bg-brand-900/10' : 'border-line hover:bg-surface-2')}>
            <Checkbox checked={already || picked.has(r.id as string)} onChange={(v) => { if (already) return; setPicked((s) => { const n = new Set(s); if (v) n.add(r.id as string); else n.delete(r.id as string); return n; }); }} />
            <div className="min-w-0 flex-1"><div className="line-clamp-2">{r.text as string}</div><div className="mt-1 flex gap-2 text-[11px] text-ink-3"><span>{QUESTION_TYPE_LABEL[r.type as string]}</span><span>· {r.difficulty as string}</span>{r.concept_name ? <span>· {r.concept_name as string}</span> : null}<span>· {r.points as number} poin</span></div></div>
          </label>
        ); })}
        {rows.length === 0 && <div className="py-8 text-center text-sm text-ink-3">Tidak ada soal. Buat dulu di Bank Soal.</div>}
      </div>
    </Modal>
  );
}
