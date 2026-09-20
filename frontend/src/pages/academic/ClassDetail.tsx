import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, UserPlus, GraduationCap } from 'lucide-react';
import { get, post, put, del, toApiError } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { toast } from '@/store/ui';
import { Avatar, Badge, Button, Card, Checkbox, Confirm, Field, Input, Loading, Modal, PageHeader, Select, Table, Tabs, useDebounce } from '@/components/ui';
import { Dict } from '@/lib/types';

export default function ClassDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has, activeRole } = useAuth();
  const p = rolePrefix(activeRole);
  const [cls, setCls] = useState<Dict | null>(null);
  const [students, setStudents] = useState<Dict[]>([]);
  const [subjects, setSubjects] = useState<Dict[]>([]);
  const [tab, setTab] = useState<'siswa' | 'mapel'>('siswa');
  const [addStudents, setAddStudents] = useState(false);
  const [addSubject, setAddSubject] = useState(false);
  const [graduate, setGraduate] = useState(false);
  const canWrite = has('enrollment:write');
  const load = useCallback(async () => { try { const [c, s, m] = await Promise.all([get<Dict>(`/academic/classes/${id}`), get<Dict[]>(`/academic/classes/${id}/students`), get<Dict[]>(`/academic/classes/${id}/subjects`)]); setCls(c); setStudents(s); setSubjects(m); } catch (e) { toast.error(toApiError(e).message); nav(-1); } }, [id, nav]);
  useEffect(() => { load(); }, [load]);
  if (!cls) return <Loading />;
  return (
    <div>
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav(`/${p}/akademik/kelas`)}>Semua kelas</Button>
      <PageHeader title={cls.name as string} subtitle={<span>Tingkat {cls.grade_level as number} · {(cls.major_name as string) ?? 'Umum'} · Wali kelas {(cls.homeroom_name as string) ?? '-'} · {cls.academic_year as string}</span>} actions={has('rollover:write') || has('alumni:write') ? <Button variant="outline" icon={<GraduationCap className="h-4 w-4" />} onClick={() => setGraduate(true)}>Luluskan kelas</Button> : undefined} />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'siswa', label: 'Siswa', count: students.length }, { value: 'mapel', label: 'Mapel & guru', count: subjects.length }]} />
      {tab === 'siswa' && (
        <Card padded={false} title="Anggota kelas" action={canWrite && <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAddStudents(true)}>Tambah siswa</Button>}>
          <Table<Dict> rows={students} rowKey={(r) => r.id as string} columns={[
            { key: 'full_name', header: 'Nama', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.full_name as string} src={r.avatar_url as string} size="sm" /><div><div className="font-medium">{r.full_name as string}</div><div className="text-xs text-ink-3">@{r.username as string}</div></div></div> },
            { key: 'nis', header: 'NIS' }, { key: 'nisn', header: 'NISN' }, { key: 'gender', header: 'L/P', className: 'text-center' }, { key: 'parent_name', header: 'Orang tua', render: (r) => <span className="text-xs">{r.parent_name as string}{r.parent_phone ? ` · ${r.parent_phone}` : ''}</span> },
            { key: 'x', header: '', render: (r) => canWrite ? <Button size="icon" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { if (!confirm(`Keluarkan ${r.full_name} dari kelas?`)) return; await del(`/academic/classes/${id}/students/${r.id}`); load(); }} /> : null },
          ]} empty="Belum ada siswa" />
        </Card>
      )}
      {tab === 'mapel' && (
        <Card padded={false} title="Mata pelajaran & guru pengampu" action={canWrite && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAddSubject(true)}>Tambah mapel</Button>}>
          <Table<Dict> rows={subjects} columns={[
            { key: 'subject_name', header: 'Mapel', render: (r) => <div><div className="font-medium">{r.subject_name as string}</div><div className="text-xs text-ink-3">{r.subject_code as string} · {r.category as string} · {r.hours_per_week as number} JP</div></div> },
            { key: 'teacher_name', header: 'Guru', render: (r) => canWrite ? <TeacherPicker value={r.teacher_id as string} onChange={async (v) => { await put(`/academic/class-subjects/${r.id}`, { teacher_id: v || null }); toast.success('Guru diperbarui'); load(); }} /> : ((r.teacher_name as string) ?? <Badge tone="amber">Belum ada guru</Badge>) },
            { key: 'semester', header: 'Semester', render: (r) => (r.semester === 0 ? 'Ganjil & Genap' : String(r.semester)) },
            { key: 'material_count', header: 'Materi', className: 'text-center' }, { key: 'assignment_count', header: 'Tugas', className: 'text-center' },
            { key: 'x', header: '', render: (r) => canWrite ? <Button size="icon" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { if (!confirm('Hapus mapel dari kelas ini? Materi/tugas terkait ikut terhapus.')) return; await del(`/academic/class-subjects/${r.id}`); load(); }} /> : null },
          ]} empty="Belum ada mapel" />
        </Card>
      )}
      <AddStudentsModal open={addStudents} classId={id!} onClose={() => setAddStudents(false)} onDone={() => { setAddStudents(false); load(); }} />
      <AddSubjectModal open={addSubject} classId={id!} onClose={() => setAddSubject(false)} onDone={() => { setAddSubject(false); load(); }} />
      <Confirm open={graduate} onClose={() => setGraduate(false)} danger={false} title="Luluskan seluruh siswa kelas ini?" message="Siswa ditandai LULUS dan dicatat sebagai alumni tahun ini." onConfirm={async () => { try { const r = await post<Dict>(`/academic/classes/${id}/graduate`, { graduation_year: new Date().getFullYear() }); toast.success(`${r.graduated} siswa diluluskan`); setGraduate(false); load(); } catch (e) { toast.error(toApiError(e).message); } }} />
    </div>
  );
}
function TeacherPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [opts, setOpts] = useState<Dict[]>([]);
  useEffect(() => { get<unknown>('/users', { role: 'GURU', limit: 300 }).then((d) => setOpts((d as { data?: Dict[] }).data ?? [])); }, []);
  return <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="w-56" placeholder="— belum ada guru —" options={opts.map((o) => ({ value: o.id as string, label: o.full_name as string }))} />;
}
function AddStudentsModal({ open, classId, onClose, onDone }: { open: boolean; classId: string; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [onlyFree, setOnlyFree] = useState(true);
  const [rows, setRows] = useState<Dict[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) get<unknown>('/users', { role: 'SISWA', q: dq || undefined, no_class: onlyFree ? 1 : undefined, limit: 100 }).then((d) => setRows((d as { data?: Dict[] }).data ?? [])); }, [open, dq, onlyFree]);
  const submit = async () => { setBusy(true); try { const r = await post<Dict>(`/academic/classes/${classId}/students`, { student_ids: [...picked] }); toast.success(`${r.added} siswa ditambahkan`); setPicked(new Set()); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Tambah siswa ke kelas" size="lg" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} disabled={!picked.size} onClick={submit}>Tambahkan {picked.size}</Button></>}>
      <div className="mb-3 flex items-center gap-3"><Input placeholder="Cari nama / NIS…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" /><Checkbox checked={onlyFree} onChange={setOnlyFree} label="Hanya yang belum punya kelas" /></div>
      <div className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">{rows.map((r) => <label key={r.id as string} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2"><Checkbox checked={picked.has(r.id as string)} onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.id as string); else n.delete(r.id as string); return n; })} /><Avatar name={r.full_name as string} size="sm" /><span className="flex-1">{r.full_name as string}<span className="block text-xs text-ink-3">{r.nis as string}{r.class_name ? ` · sekarang di ${r.class_name}` : ''}</span></span></label>)}{rows.length === 0 && <div className="p-6 text-center text-sm text-ink-3">Tidak ada siswa</div>}</div>
    </Modal>
  );
}
function AddSubjectModal({ open, classId, onClose, onDone }: { open: boolean; classId: string; onClose: () => void; onDone: () => void }) {
  const [subjects, setSubjects] = useState<Dict[]>([]);
  const [teachers, setTeachers] = useState<Dict[]>([]);
  const [f, setF] = useState({ subject_id: '', teacher_id: '', semester: '0' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { get<unknown>('/academic/subjects', { limit: 200, is_active: 1 }).then((d) => setSubjects((d as { data?: Dict[] }).data ?? [])); get<unknown>('/users', { role: 'GURU', limit: 300 }).then((d) => setTeachers((d as { data?: Dict[] }).data ?? [])); } }, [open]);
  const submit = async () => { if (!f.subject_id) return; setBusy(true); try { await post(`/academic/classes/${classId}/subjects`, { subject_id: f.subject_id, teacher_id: f.teacher_id || null, semester: Number(f.semester) }); toast.success('Mapel ditambahkan'); onDone(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Tambah mapel ke kelas" size="sm" footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} onClick={submit}>Tambah</Button></>}>
      <div className="space-y-3"><Field label="Mata pelajaran" required><Select value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })} placeholder="— pilih —" options={subjects.map((s) => ({ value: s.id as string, label: `${s.code} — ${s.name}` }))} /></Field><Field label="Guru pengampu"><Select value={f.teacher_id} onChange={(e) => setF({ ...f, teacher_id: e.target.value })} placeholder="— nanti —" options={teachers.map((t) => ({ value: t.id as string, label: t.full_name as string }))} /></Field><Field label="Semester"><Select value={f.semester} onChange={(e) => setF({ ...f, semester: e.target.value })} options={[{ value: '0', label: 'Ganjil & Genap' }, { value: '1', label: 'Ganjil' }, { value: '2', label: 'Genap' }]} /></Field></div>
    </Modal>
  );
}
