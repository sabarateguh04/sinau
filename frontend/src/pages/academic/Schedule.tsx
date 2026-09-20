import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { get, post, del, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Loading, cx } from '@/components/ui';
import { DAYS, fmtTime } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Schedule() {
  const { has, hasRole, user } = useAuth();
  const admin = has('academic:write');
  const isStudent = hasRole('SISWA') && !admin;
  const isTeacherOnly = hasRole('GURU', 'KAPRODI') && !admin && !hasRole('WAKEPSEK');
  const [mode, setMode] = useState<'class' | 'teacher' | 'room'>(isStudent ? 'class' : isTeacherOnly ? 'teacher' : 'class');
  const [classes, setClasses] = useState<Dict[]>([]);
  const [teachers, setTeachers] = useState<Dict[]>([]);
  const [rooms, setRooms] = useState<Dict[]>([]);
  const [sel, setSel] = useState<string>(isStudent ? 'me' : isTeacherOnly ? 'me' : '');
  const [rows, setRows] = useState<Dict[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (isStudent) return;
    get<unknown>('/academic/classes', { active_year: 1, limit: 200 }).then((d) => { const arr = (d as { data?: Dict[] }).data ?? []; setClasses(arr); if (!sel && arr[0] && mode === 'class') setSel(String(arr[0].id)); });
    if (admin || hasRole('WAKEPSEK', 'KEPSEK')) { get<unknown>('/users', { role: 'GURU', limit: 300 }).then((d) => setTeachers((d as { data?: Dict[] }).data ?? [])); get<unknown>('/academic/rooms', { limit: 200 }).then((d) => setRooms((d as { data?: Dict[] }).data ?? [])); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const load = useCallback(() => {
    if (!sel) return;
    setRows(null);
    const params: Dict = {};
    if (isStudent) params.student_id = 'me'; else if (mode === 'class') params.class_id = sel; else if (mode === 'teacher') params.teacher_id = sel; else params.room_id = sel;
    get<Dict[]>('/academic/schedule', params).then(setRows).catch((e) => toast.error(toApiError(e).message));
  }, [sel, mode, isStudent]);
  useEffect(() => { load(); }, [load]);
  const grid = useMemo(() => { const g: Record<number, Dict[]> = {}; for (let d = 1; d <= 6; d++) g[d] = []; for (const r of rows ?? []) (g[Number(r.day_of_week)] ??= []).push(r); return g; }, [rows]);
  const title = isStudent ? 'Jadwal Pelajaran Saya' : isTeacherOnly ? 'Jadwal Mengajar' : 'Jadwal Pelajaran';
  return (
    <div>
      <PageHeader title={title} subtitle={admin ? 'Bentrok guru/kelas/ruang dideteksi otomatis.' : undefined} actions={admin && mode === 'class' && sel && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Tambah jam</Button>} />
      {!isStudent && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(admin || hasRole('WAKEPSEK', 'KEPSEK')) && <Select value={mode} onChange={(e) => { setMode(e.target.value as 'class'); setSel(''); }} className="w-40" options={[{ value: 'class', label: 'Per kelas' }, { value: 'teacher', label: 'Per guru' }, { value: 'room', label: 'Per ruang' }]} />}
          {mode === 'class' && <Select value={sel} onChange={(e) => setSel(e.target.value)} className="w-56" placeholder="Pilih kelas" options={classes.map((c) => ({ value: String(c.id), label: String(c.name) }))} />}
          {mode === 'teacher' && (isTeacherOnly ? null : <Select value={sel} onChange={(e) => setSel(e.target.value)} className="w-56" placeholder="Pilih guru" options={[{ value: 'me', label: 'Saya' }, ...teachers.map((t) => ({ value: String(t.id), label: String(t.full_name) }))]} />)}
          {mode === 'room' && <Select value={sel} onChange={(e) => setSel(e.target.value)} className="w-56" placeholder="Pilih ruang" options={rooms.map((r) => ({ value: String(r.id), label: String(r.name) }))} />}
        </div>
      )}
      {!sel ? <EmptyState title="Pilih filter" /> : rows === null ? <Loading /> : rows.length === 0 ? <EmptyState title="Belum ada jadwal" /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <Card key={d} padded={false} title={DAYS[d]} className={cx(grid[d].length === 0 && 'opacity-60')}>
              {grid[d].length === 0 ? <div className="p-4 text-center text-xs text-ink-3">—</div> : <ul className="divide-y divide-line">{grid[d].map((s) => <li key={s.id as string} className="flex items-center gap-3 px-4 py-2.5"><div className="w-16 text-xs font-semibold text-brand-700">{fmtTime(s.start_time as string)}<br />{fmtTime(s.end_time as string)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{s.subject_name as string}</div><div className="truncate text-xs text-ink-2">{mode === 'class' || isStudent ? (s.teacher_name as string) ?? '-' : (s.class_name as string)}{s.room_name ? ` · ${s.room_name}` : ''}</div></div>{admin && <button className="text-ink-3 hover:text-red-600" onClick={async () => { await del(`/academic/schedule/${s.id}`); load(); }}><Trash2 className="h-4 w-4" /></button>}</li>)}</ul>}
            </Card>
          ))}
        </div>
      )}
      {admin && <AddModal open={open} classId={sel} rooms={rooms} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
      <span className="hidden">{user?.id}</span>
    </div>
  );
}
function AddModal({ open, classId, rooms, onClose, onDone }: { open: boolean; classId: string; rooms: Dict[]; onClose: () => void; onDone: () => void }) {
  const [subjects, setSubjects] = useState<Dict[]>([]);
  const [f, setF] = useState({ class_subject_id: '', day_of_week: '1', start_time: '07:30', end_time: '09:00', room_id: '' });
  const [conflicts, setConflicts] = useState<Dict[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && classId) { get<Dict[]>(`/academic/classes/${classId}/subjects`).then(setSubjects); setConflicts(null); } }, [open, classId]);
  const submit = async (force = false) => { if (!f.class_subject_id) return toast.error('Pilih mapel'); setBusy(true); try { await post(`/academic/schedule${force ? '?force=1' : ''}`, { class_subject_id: f.class_subject_id, day_of_week: Number(f.day_of_week), start_time: f.start_time, end_time: f.end_time, room_id: f.room_id || null }); toast.success('Jadwal ditambahkan'); onDone(); } catch (e) { const err = toApiError(e); if (err.status === 409 && Array.isArray(err.details)) setConflicts(err.details as Dict[]); else toast.error(err.message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Tambah jam pelajaran" size="sm" footer={<><Button variant="outline" onClick={onClose}>Batal</Button>{conflicts ? <Button variant="danger" loading={busy} onClick={() => submit(true)}>Tetap simpan</Button> : <Button loading={busy} onClick={() => submit(false)}>Simpan</Button>}</>}>
      <div className="space-y-3">
        <Field label="Mapel" required><Select value={f.class_subject_id} onChange={(e) => setF({ ...f, class_subject_id: e.target.value })} placeholder="— pilih —" options={subjects.map((s) => ({ value: s.id as string, label: `${s.subject_name} (${s.teacher_name ?? 'belum ada guru'})` }))} /></Field>
        <Field label="Hari"><Select value={f.day_of_week} onChange={(e) => setF({ ...f, day_of_week: e.target.value })} options={[1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: DAYS[d] }))} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Mulai"><Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field><Field label="Selesai"><Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field></div>
        <Field label="Ruang"><Select value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })} placeholder="— ruang kelas —" options={rooms.map((r) => ({ value: r.id as string, label: r.name as string }))} /></Field>
        {conflicts && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs dark:bg-amber-900/20"><div className="mb-1 flex items-center gap-1 font-semibold text-amber-800"><AlertTriangle className="h-4 w-4" /> Bentrok:</div><ul className="list-disc pl-4">{conflicts.map((c) => <li key={c.id as string}>[{c.reason as string}] {c.class_name as string} · {c.subject_name as string} · {c.teacher_name as string} ({fmtTime(c.start_time as string)}–{fmtTime(c.end_time as string)})</li>)}</ul></div>}
      </div>
    </Modal>
  );
}
