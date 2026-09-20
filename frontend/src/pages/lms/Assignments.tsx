import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Clock } from 'lucide-react';
import { get, post, put, toApiError, uploadFile } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { toast } from '@/store/ui';
import { useResource } from '@/features/crud/CrudPage';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Switch, Tabs, Textarea, useDebounce, Table, cx } from '@/components/ui';
import { fmtDateTime, label, tone, toInputDateTime, fmtScore } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Assignments() {
  const { has, activeRole, user, hasRole } = useAuth();
  const p = rolePrefix(activeRole);
  const [sp] = useSearchParams();
  const studentParam = sp.get('student');
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [status, setStatus] = useState('');
  const [cs, setCs] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const canWrite = has('assignment:write');
  const isStudent = hasRole('SISWA') && !canWrite;
  const params = useMemo(() => ({ q: dq || undefined, status: status || undefined, class_subject_id: cs || undefined, page, limit: 20 }), [dq, status, cs, page]);
  const { rows, meta, loading, reload } = useResource<Dict>('/assignments', params, [studentParam]);
  const [childRows, setChildRows] = useState<Dict[] | null>(null);
  useEffect(() => { if (studentParam) get<Dict[]>(`/assignments/student/${studentParam}`).then(setChildRows); }, [studentParam]);
  useEffect(() => setPage(1), [dq, status, cs]);
  if (studentParam && childRows) return <div><PageHeader title="Tugas anak" /><Card padded={false}><Table<Dict> columns={[{ key: 'title', header: 'Tugas' }, { key: 'subject_name', header: 'Mapel' }, { key: 'due_at', header: 'Tenggat', render: (r) => fmtDateTime(r.due_at as string) }, { key: 'submission_status', header: 'Status', render: (r) => <Badge tone={tone((r.submission_status as string) ?? 'NONE')}>{label((r.submission_status as string) ?? 'NONE')}</Badge> }, { key: 'score', header: 'Nilai', render: (r) => fmtScore(r.score as number) }]} rows={childRows} /></Card></div>;
  return (
    <div>
      <PageHeader title="Tugas" subtitle={canWrite ? 'Kelola tugas, pantau pengumpulan, dan beri nilai.' : 'Tugas dari guru Anda.'} actions={canWrite && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Buat tugas</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} className="w-full sm:w-64" />
        {canWrite && <Tabs value={status} onChange={setStatus} tabs={[{ value: '', label: 'Semua' }, { value: 'PUBLISHED', label: 'Terbit' }, { value: 'DRAFT', label: 'Draf' }, { value: 'CLOSED', label: 'Ditutup' }]} />}
        {user?.teaching?.length ? <Select value={cs} onChange={(e) => setCs(e.target.value)} className="w-56" placeholder="Semua kelas/mapel" options={user.teaching.map((t) => ({ value: t.class_subject_id, label: `${t.class_name} · ${t.subject_name}` }))} /> : null}
      </div>
      {!loading && rows.length === 0 ? <EmptyState title="Belum ada tugas" icon={<ClipboardList className="h-6 w-6" />} /> : (
        <div className="space-y-2">
          {rows.map((a) => {
            const overdue = a.due_at && new Date(a.due_at as string) < new Date();
            const my = a.my_status as string | null;
            return (
              <Link key={a.id as string} to={`/${p}/tugas/${a.id}`} className="card flex flex-col gap-2 p-4 transition hover:border-brand-400 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{a.title as string}</span>{canWrite && <Badge tone={tone(a.status as string)}>{label(a.status as string)}</Badge>}{isStudent && <Badge tone={tone(my ?? 'NONE')}>{my ? label(my) : 'Belum dikerjakan'}</Badge>}</div>
                  <div className="text-xs text-ink-3">{a.class_name as string} · {a.subject_name as string}{a.teacher_name ? ` · ${a.teacher_name}` : ''}</div>
                </div>
                <div className={cx('flex items-center gap-1.5 text-xs', overdue && my !== 'GRADED' && my !== 'SUBMITTED' ? 'text-red-600' : 'text-ink-2')}><Clock className="h-3.5 w-3.5" />{a.due_at ? fmtDateTime(a.due_at as string) : 'Tanpa tenggat'}</div>
                {canWrite ? <div className="text-xs text-ink-2 sm:w-40 sm:text-right">{a.submitted_count as number}/{a.student_count as number} dikumpulkan · {a.graded_count as number} dinilai</div> : my === 'GRADED' ? <div className="text-sm font-bold text-brand-700 sm:w-24 sm:text-right">{fmtScore(a.my_score as number)}/{a.max_score as number}</div> : null}
              </Link>
            );
          })}
        </div>
      )}
      <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} />
      {canWrite && <AssignmentForm open={open} row={null} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
    </div>
  );
}

export function AssignmentForm({ open, row, onClose, onSaved }: { open: boolean; row: Dict | null; onClose: () => void; onSaved: (a: Dict) => void }) {
  const { user } = useAuth();
  const teaching = user?.teaching ?? [];
  const [f, setF] = useState<Dict>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF(row ? { ...row, due_at: toInputDateTime(row.due_at as string) } : { class_subject_id: teaching[0]?.class_subject_id ?? '', title: '', instructions: '', due_at: '', allow_late: true, max_score: 100, status: 'PUBLISHED', submission_type: 'BOTH' }); setFile(null); } }, [open, row, teaching]);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      let attachment_file_id = (f.attachment_file_id as string) ?? null;
      if (file) attachment_file_id = (await uploadFile('assignments', file)).id;
      const body = { class_subject_id: f.class_subject_id, title: f.title, instructions: f.instructions || null, due_at: f.due_at ? new Date(String(f.due_at)).toISOString() : null, allow_late: !!f.allow_late, max_score: Number(f.max_score) || 100, status: f.status, submission_type: f.submission_type, attachment_file_id };
      const saved = row ? await put<Dict>(`/assignments/${row.id}`, body) : await post<Dict>('/assignments', body);
      toast.success('Tugas disimpan'); onSaved(saved);
    } catch (e) { toast.error('Gagal menyimpan', toApiError(e).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={row ? 'Ubah tugas' : 'Tugas baru'} footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} onClick={save}>Simpan</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Judul" required className="sm:col-span-2"><Input value={String(f.title ?? '')} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Kelas & mapel" required><Select value={String(f.class_subject_id ?? '')} onChange={(e) => set('class_subject_id', e.target.value)} placeholder="— pilih —" options={teaching.map((t) => ({ value: t.class_subject_id, label: `${t.class_name} · ${t.subject_name}` }))} /></Field>
        <Field label="Status"><Select value={String(f.status)} onChange={(e) => set('status', e.target.value)} options={[{ value: 'DRAFT', label: 'Draf' }, { value: 'PUBLISHED', label: 'Terbit (siswa bisa mengumpulkan)' }, { value: 'CLOSED', label: 'Ditutup' }]} /></Field>
        <Field label="Instruksi" className="sm:col-span-2"><Textarea rows={5} value={String(f.instructions ?? '')} onChange={(e) => set('instructions', e.target.value)} /></Field>
        <Field label="Tenggat"><Input type="datetime-local" value={String(f.due_at ?? '')} onChange={(e) => set('due_at', e.target.value)} /></Field>
        <Field label="Skor maksimal"><Input type="number" min={1} value={String(f.max_score ?? 100)} onChange={(e) => set('max_score', e.target.value)} /></Field>
        <Field label="Bentuk pengumpulan"><Select value={String(f.submission_type)} onChange={(e) => set('submission_type', e.target.value)} options={[{ value: 'BOTH', label: 'Teks dan/atau berkas' }, { value: 'TEXT', label: 'Teks saja' }, { value: 'FILE', label: 'Berkas saja' }]} /></Field>
        <Field label="Terima keterlambatan"><div className="pt-2"><Switch checked={!!f.allow_late} onChange={(v) => set('allow_late', v)} label={f.allow_late ? 'Ya, ditandai terlambat' : 'Tidak'} /></div></Field>
        <Field label="Lampiran (opsional)" className="sm:col-span-2"><input type="file" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{row?.attachment_name ? <div className="text-xs text-ink-3">Saat ini: {row.attachment_name as string}</div> : null}</Field>
      </div>
    </Modal>
  );
}
