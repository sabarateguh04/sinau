import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Paperclip, Send, Save, CheckCircle2, Upload } from 'lucide-react';
import { get, post, del, toApiError, uploadFile, fileSrc } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Confirm, Loading, Table, Textarea, Input, Avatar, Field, Modal, cx } from '@/components/ui';
import { fmtDateTime, label, tone, fmtScore } from '@/lib/format';
import { Dict } from '@/lib/types';
import { AssignmentForm } from './Assignments';
import { markdownToHtml } from '@/lib/markdown';

export default function AssignmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has, hasRole } = useAuth();
  const [a, setA] = useState<Dict | null>(null);
  const [subs, setSubs] = useState<Dict[]>([]);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const canGrade = has('assignment:grade');
  const isStudent = hasRole('SISWA') && !canGrade;
  const load = useCallback(async () => {
    try { const d = await get<Dict>(`/assignments/${id}`); setA(d); if (!isStudent && (has('assignment:grade') || has('assignment:read'))) get<Dict[]>(`/assignments/${id}/submissions`).then(setSubs).catch(() => undefined); } catch (e) { toast.error(toApiError(e).message); nav(-1); }
  }, [id, isStudent, has, nav]);
  useEffect(() => { load(); }, [load]);
  if (!a) return <Loading />;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav(-1)}>Kembali</Button>
        {canGrade && <div className="flex gap-1"><Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Ubah</Button><Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)} /></div>}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-3"><Badge tone={tone(a.status as string)}>{label(a.status as string)}</Badge><span>{a.class_name as string} · {a.subject_name as string} · {a.teacher_name as string}</span></div>
      <h1 className="text-2xl font-bold sm:text-3xl">{a.title as string}</h1>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink-2"><span>Tenggat: <b className="text-ink">{a.due_at ? fmtDateTime(a.due_at as string) : 'Tidak ada'}</b></span><span>Skor maks: <b className="text-ink">{a.max_score as number}</b></span><span>Terlambat: {a.allow_late ? 'diterima' : 'ditolak'}</span></div>
      <Card className="mt-5">
        {a.instructions ? <div className="prose-sinau text-[15px]" dangerouslySetInnerHTML={{ __html: markdownToHtml(String(a.instructions)) }} /> : <p className="text-sm text-ink-3">Tidak ada instruksi tambahan.</p>}
        {a.attachment_url ? <a href={fileSrc(a.attachment_url as string)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-3"><Paperclip className="h-4 w-4" /> {a.attachment_name as string}</a> : null}
      </Card>
      {isStudent && <StudentSubmit a={a} onChange={load} />}
      {!isStudent && <SubmissionsPanel a={a} subs={subs} onChange={load} canGrade={canGrade} />}
      {canGrade && <AssignmentForm open={edit} row={a} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />}
      <Confirm open={confirm} onClose={() => setConfirm(false)} onConfirm={async () => { await del(`/assignments/${id}`); toast.success('Tugas dihapus'); nav(-1); }} title="Hapus tugas?" message="Semua pengumpulan siswa ikut terhapus." />
    </div>
  );
}

function StudentSubmit({ a, onChange }: { a: Dict; onChange: () => void }) {
  const my = a.my_submission as Dict | null;
  const [content, setContent] = useState(String(my?.content ?? ''));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setContent(String(my?.content ?? '')); }, [my?.content]);
  const graded = my?.status === 'GRADED';
  const submit = async (draft: boolean) => {
    setBusy(true);
    try { let attachment_file_id = (my?.attachment_file_id as string) ?? null; if (file) attachment_file_id = (await uploadFile('submissions', file)).id; await post(`/assignments/${a.id}/submit`, { content: content || null, attachment_file_id, draft }); toast.success(draft ? 'Draf disimpan' : 'Tugas dikumpulkan'); setFile(null); onChange(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); }
  };
  const allowText = a.submission_type !== 'FILE';
  const allowFile = a.submission_type !== 'TEXT';
  return (
    <Card className="mt-5" title="Pengumpulan saya" action={my ? <Badge tone={tone(my.status as string)}>{label(my.status as string)}{my.is_late ? ' · terlambat' : ''}</Badge> : <Badge tone="gray">Belum dikumpulkan</Badge>}>
      {graded ? (
        <div className="space-y-3"><div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 dark:bg-brand-900/30"><CheckCircle2 className="h-8 w-8 text-brand-700" /><div><div className="text-xs text-ink-2">Nilai</div><div className="text-3xl font-extrabold text-brand-800 dark:text-brand-200">{fmtScore(my!.score as number)}<span className="text-base font-medium text-ink-3">/{a.max_score as number}</span></div></div></div>{my!.feedback ? <div><div className="text-xs font-semibold uppercase text-ink-3">Umpan balik guru</div><p className="mt-1 whitespace-pre-line text-sm">{my!.feedback as string}</p></div> : null}{my!.content ? <div><div className="text-xs font-semibold uppercase text-ink-3">Jawaban Anda</div><p className="mt-1 whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm">{my!.content as string}</p></div> : null}</div>
      ) : (
        <div className="space-y-3">
          {my?.status === 'RETURNED' && my.feedback ? <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-900/20"><b>Dikembalikan guru:</b> {my.feedback as string}</div> : null}
          {a.status !== 'PUBLISHED' && <div className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">Tugas tidak menerima pengumpulan saat ini.</div>}
          {allowText && <Field label="Jawaban"><Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Tulis jawaban Anda di sini…" disabled={a.status !== 'PUBLISHED'} /></Field>}
          {allowFile && <Field label="Lampiran"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-3 hover:border-brand-400"><Upload className="h-5 w-5 text-ink-3" /><span className="text-sm text-ink-2">{file ? file.name : my?.attachment_name ? `Saat ini: ${my.attachment_name}` : 'Pilih berkas…'}</span><input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label></Field>}
          {a.status === 'PUBLISHED' && <div className="flex gap-2"><Button variant="outline" loading={busy} icon={<Save className="h-4 w-4" />} onClick={() => submit(true)}>Simpan draf</Button><Button loading={busy} icon={<Send className="h-4 w-4" />} onClick={() => submit(false)}>{my?.status === 'SUBMITTED' ? 'Kumpulkan ulang' : 'Kumpulkan'}</Button></div>}
          {my?.submitted_at ? <div className="text-xs text-ink-3">Dikumpulkan {fmtDateTime(my.submitted_at as string)}</div> : null}
        </div>
      )}
    </Card>
  );
}

function SubmissionsPanel({ a, subs, onChange, canGrade }: { a: Dict; subs: Dict[]; onChange: () => void; canGrade: boolean }) {
  const [view, setView] = useState<Dict | null>(null);
  const [scores, setScores] = useState<Record<string, { score: string; feedback: string }>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { const s: Record<string, { score: string; feedback: string }> = {}; for (const x of subs) s[x.student_id as string] = { score: x.score === null || x.score === undefined ? '' : String(x.score), feedback: String(x.feedback ?? '') }; setScores(s); }, [subs]);
  const saveAll = async () => {
    const grades = Object.entries(scores).filter(([sid, v]) => { const orig = subs.find((s) => s.student_id === sid); return v.score !== '' && (String(orig?.score ?? '') !== v.score || String(orig?.feedback ?? '') !== v.feedback); }).map(([student_id, v]) => ({ student_id, score: Number(v.score), feedback: v.feedback || null }));
    if (!grades.length) return toast.info('Tidak ada perubahan nilai');
    setBusy(true);
    try { await post(`/assignments/${a.id}/grade`, { grades }); toast.success(`${grades.length} nilai disimpan`); onChange(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); }
  };
  const returnOne = async (sid: string, feedback: string) => { await post(`/assignments/${a.id}/grade`, { grades: [{ student_id: sid, score: null, feedback: feedback || 'Perbaiki dan kumpulkan lagi', return: true }] }); toast.success('Dikembalikan ke siswa'); setView(null); onChange(); };
  const done = subs.filter((s) => s.status === 'GRADED').length;
  return (
    <Card className="mt-5" padded={false} title={`Pengumpulan (${subs.filter((s) => s.status !== 'NONE' && s.status !== 'DRAFT').length}/${subs.length}) · dinilai ${done}`} action={canGrade && <Button size="sm" loading={busy} onClick={saveAll} icon={<Save className="h-4 w-4" />}>Simpan nilai</Button>}>
      <Table<Dict> rowKey={(r) => r.student_id as string} rows={subs} columns={[
        { key: 'full_name', header: 'Siswa', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.full_name as string} src={r.avatar_url as string} size="sm" /><div><div className="font-medium">{r.full_name as string}</div><div className="text-xs text-ink-3">{r.nis as string}</div></div></div> },
        { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}{r.is_late ? ' · terlambat' : ''}</Badge> },
        { key: 'submitted_at', header: 'Dikumpulkan', render: (r) => r.submitted_at ? fmtDateTime(r.submitted_at as string) : '-' },
        { key: 'view', header: 'Jawaban', render: (r) => (r.content || r.attachment_url) ? <button className="link text-xs" onClick={() => setView(r)}>Lihat</button> : <span className="text-xs text-ink-3">-</span> },
        { key: 'score', header: `Nilai (0–${a.max_score})`, width: '110px', render: (r) => canGrade ? <Input type="number" min={0} max={Number(a.max_score)} className="h-9 w-24 text-center" value={scores[r.student_id as string]?.score ?? ''} onChange={(e) => setScores((s) => ({ ...s, [r.student_id as string]: { ...s[r.student_id as string], score: e.target.value } }))} /> : fmtScore(r.score as number) },
        { key: 'feedback', header: 'Umpan balik', render: (r) => canGrade ? <Input className="h-9" placeholder="opsional" value={scores[r.student_id as string]?.feedback ?? ''} onChange={(e) => setScores((s) => ({ ...s, [r.student_id as string]: { ...s[r.student_id as string], feedback: e.target.value } }))} /> : (r.feedback as string) ?? '' },
      ]} />
      <Modal open={!!view} onClose={() => setView(null)} title={`Jawaban ${view?.full_name ?? ''}`} size="lg" footer={canGrade && view?.status !== 'GRADED' ? <Button variant="outline" onClick={() => returnOne(view!.student_id as string, scores[view!.student_id as string]?.feedback ?? '')}>Kembalikan untuk diperbaiki</Button> : undefined}>
        {view?.content ? <p className={cx('whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm')}>{view.content as string}</p> : null}
        {view?.attachment_url ? <a href={fileSrc(view.attachment_url as string)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-3"><Paperclip className="h-4 w-4" /> {view.attachment_name as string}</a> : null}
      </Modal>
    </Card>
  );
}
