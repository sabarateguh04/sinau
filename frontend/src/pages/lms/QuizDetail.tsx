import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Play, BarChart3, Clock } from 'lucide-react';
import { get, post, del, toApiError } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Confirm, Loading, Table, Tabs, Progress, Input, Modal } from '@/components/ui';
import { fmtDateTime, label, tone, fmtScore, QUESTION_TYPE_LABEL } from '@/lib/format';
import { Dict } from '@/lib/types';
import { QuizForm } from './Quizzes';

export default function QuizDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has, hasRole, activeRole } = useAuth();
  const p = rolePrefix(activeRole);
  const [qz, setQz] = useState<Dict | null>(null);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<'soal' | 'hasil' | 'analisis'>('soal');
  const [analysis, setAnalysis] = useState<Dict | null>(null);
  const [grading, setGrading] = useState<Dict | null>(null);
  const canWrite = has('quiz:write');
  const isStudent = hasRole('SISWA') && !canWrite;
  const load = useCallback(() => get<Dict>(`/quizzes/${id}`).then(setQz).catch((e) => { toast.error(toApiError(e).message); nav(-1); }), [id, nav]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'analisis' && !analysis) get<Dict>(`/quizzes/${id}/analysis`).then(setAnalysis).catch(() => undefined); }, [tab, analysis, id]);
  if (!qz) return <Loading />;
  const attempts = (qz.attempts as Dict[]) ?? [];
  const start = async () => { try { const a = await post<Dict>(`/quizzes/${id}/start`); nav(`/${p}/kuis/attempt/${a.id}`); } catch (e) { toast.error(toApiError(e).message); } };
  const inProgress = attempts.find((a) => a.status === 'IN_PROGRESS');
  const remaining = Number(qz.max_attempts) - attempts.length;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav(-1)}>Kembali</Button>
        {canWrite && <div className="flex gap-1"><Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Ubah</Button><Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)} /></div>}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">{canWrite ? <Badge tone={tone(qz.status as string)}>{label(qz.status as string)}</Badge> : <Badge tone={qz.is_open ? 'green' : 'gray'}>{qz.is_open ? 'Dibuka' : 'Ditutup'}</Badge>}<span>{qz.class_name as string} · {qz.subject_name as string}</span></div>
      <h1 className="text-2xl font-bold sm:text-3xl">{qz.title as string}</h1>
      {qz.description ? <p className="mt-2 text-ink-2">{qz.description as string}</p> : null}
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-2"><span>{qz.question_count as number} soal · {qz.total_points as number} poin</span><span className="flex items-center gap-1"><Clock className="h-4 w-4" />{qz.duration_min as number} menit</span><span>Maks. {qz.max_attempts as number}× percobaan</span>{qz.open_at ? <span>Buka {fmtDateTime(qz.open_at as string)}</span> : null}{qz.close_at ? <span>Tutup {fmtDateTime(qz.close_at as string)}</span> : null}</div>

      {isStudent && (
        <Card className="mt-5" title="Percobaan saya">
          {attempts.length === 0 ? <p className="text-sm text-ink-2">Anda belum pernah mengerjakan kuis ini.</p> : (
            <Table<Dict> dense rows={attempts} columns={[{ key: 'attempt_no', header: '#' }, { key: 'started_at', header: 'Mulai', render: (r) => fmtDateTime(r.started_at as string) }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'score', header: 'Skor', render: (r) => (qz.show_result === 'NEVER' ? '—' : fmtScore(r.score as number)) }, { key: 'x', header: '', render: (r) => <Button size="sm" variant="outline" onClick={() => nav(`/${p}/kuis/attempt/${r.id}`)}>{r.status === 'IN_PROGRESS' ? 'Lanjutkan' : 'Lihat'}</Button> }]} />
          )}
          <div className="mt-4 flex items-center gap-3">
            {inProgress ? <Button icon={<Play className="h-4 w-4" />} onClick={() => nav(`/${p}/kuis/attempt/${inProgress.id}`)}>Lanjutkan percobaan</Button> : qz.is_open && remaining > 0 ? <Button icon={<Play className="h-4 w-4" />} onClick={start}>Mulai kuis</Button> : null}
            <span className="text-xs text-ink-3">{remaining > 0 ? `Sisa ${remaining} percobaan` : 'Kesempatan habis'}</span>
          </div>
        </Card>
      )}

      {!isStudent && (
        <div className="mt-5">
          <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'soal', label: 'Soal', count: (qz.questions as Dict[]).length }, { value: 'hasil', label: 'Hasil siswa', count: attempts.length }, { value: 'analisis', label: 'Analisis butir' }]} />
          {tab === 'soal' && <Card padded={false}><ol className="divide-y divide-line">{(qz.questions as Dict[]).map((q, i) => <li key={q.id as string} className="p-4"><div className="flex items-start gap-3"><span className="w-6 shrink-0 text-sm font-bold text-ink-3">{i + 1}.</span><div className="min-w-0 flex-1"><div className="text-sm">{q.text as string}</div>{Array.isArray(q.options) && <ul className="mt-2 grid gap-1 sm:grid-cols-2">{(q.options as Dict[]).map((o) => <li key={o.key as string} className={`rounded-lg px-2 py-1 text-xs ${o.is_correct ? 'bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-900/30' : 'bg-surface-2'}`}>{o.key as string}. {o.text as string}{o.misconception ? <span className="ml-1 text-ink-3">· {o.misconception as string}</span> : null}</li>)}</ul>}{q.type !== 'MC' && q.type !== 'MCX' && q.answer_key !== undefined ? <div className="mt-1 text-xs text-emerald-700">Kunci: {JSON.stringify(q.answer_key)}</div> : null}<div className="mt-1 flex gap-2 text-[11px] text-ink-3"><span>{QUESTION_TYPE_LABEL[q.type as string]}</span><span>· {q.points as number} poin</span>{q.concept_name ? <span>· {q.concept_name as string}</span> : null}</div></div></div></li>)}</ol></Card>}
          {tab === 'hasil' && <Card padded={false}><Table<Dict> rows={attempts} columns={[{ key: 'full_name', header: 'Siswa' }, { key: 'attempt_no', header: '#', className: 'text-center' }, { key: 'started_at', header: 'Mulai', render: (r) => fmtDateTime(r.started_at as string) }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }, { key: 'score', header: 'Skor', render: (r) => <div className="flex items-center gap-2"><Progress value={Number(r.score ?? 0)} className="w-20" tone={Number(r.score) >= 75 ? 'green' : 'amber'} /><b>{fmtScore(r.score as number)}</b></div> }, { key: 'x', header: '', render: (r) => <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => nav(`/${p}/kuis/attempt/${r.id}`)}>Lihat</Button>{r.status === 'SUBMITTED' && canWrite && <Button size="sm" onClick={() => setGrading(r)}>Nilai esai</Button>}</div> }]} empty="Belum ada siswa yang mengerjakan" /></Card>}
          {tab === 'analisis' && (analysis ? <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Percobaan', (analysis.summary as Dict).attempts], ['Rata-rata', fmtScore((analysis.summary as Dict).average as number)], ['Tertinggi', fmtScore((analysis.summary as Dict).max as number)], ['Terendah', fmtScore((analysis.summary as Dict).min as number)]].map(([l, v]) => <div key={String(l)} className="card p-4"><div className="text-xs text-ink-3">{String(l)}</div><div className="text-2xl font-bold">{String(v ?? '-')}</div></div>)}</div>
            <Card padded={false} title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Tingkat kesukaran per butir (proporsi benar)</span>}><Table<Dict> dense rows={analysis.items as Dict[]} columns={[{ key: 'text', header: 'Soal', render: (r) => <span className="line-clamp-1 max-w-md">{r.text as string}</span> }, { key: 'concept_name', header: 'Konsep' }, { key: 'answered', header: 'Dijawab', className: 'text-center' }, { key: 'difficulty_index', header: 'P (benar)', render: (r) => { const v = r.difficulty_index as number | null; return v === null ? '-' : <div className="flex items-center gap-2"><Progress value={v * 100} className="w-24" tone={v < 0.3 ? 'red' : v > 0.8 ? 'green' : 'amber'} /><span>{Math.round(v * 100)}%</span></div>; } }, { key: 'distribution', header: 'Distribusi jawaban', render: (r) => <div className="flex flex-wrap gap-1">{(r.distribution as Dict[]).map((d, i) => <Badge key={i} tone="gray">{JSON.stringify(d.answer)}: {d.count as number}</Badge>)}</div> }]} /></Card>
          </div> : <Loading />)}
        </div>
      )}
      {canWrite && <QuizForm open={edit} row={qz} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />}
      <EssayGrading attempt={grading} onClose={() => setGrading(null)} onDone={() => { setGrading(null); load(); }} />
      <Confirm open={confirm} onClose={() => setConfirm(false)} onConfirm={async () => { await del(`/quizzes/${id}`); toast.success('Kuis dihapus'); nav(-1); }} title="Hapus kuis?" message="Semua percobaan siswa ikut terhapus." />
    </div>
  );
}

function EssayGrading({ attempt, onClose, onDone }: { attempt: Dict | null; onClose: () => void; onDone: () => void }) {
  const [view, setView] = useState<Dict | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  useEffect(() => { if (attempt) get<Dict>(`/quizzes/attempts/${attempt.id}`).then(setView); else setView(null); }, [attempt]);
  const essays = ((view?.questions as Dict[]) ?? []).filter((q) => q.type === 'ESSAY');
  const save = async () => { try { await post(`/quizzes/attempts/${attempt!.id}/grade`, { scores: essays.map((q) => ({ question_id: q.id, score: Number(scores[q.id as string] ?? 0) })) }); toast.success('Nilai esai disimpan'); onDone(); } catch (e) { toast.error(toApiError(e).message); } };
  return (
    <Modal open={!!attempt} onClose={onClose} size="lg" title={`Nilai esai — ${attempt?.full_name ?? ''}`} footer={<><Button variant="outline" onClick={onClose}>Batal</Button><Button onClick={save}>Simpan</Button></>}>
      {!view ? <Loading /> : essays.length === 0 ? <p className="text-sm text-ink-2">Tidak ada soal esai.</p> : essays.map((q, i) => <div key={q.id as string} className="mb-4 rounded-xl border border-line p-3"><div className="text-sm font-medium">{i + 1}. {q.text as string}</div>{q.answer_key ? <div className="mt-1 text-xs text-ink-3">Rubrik: {String(q.answer_key)}</div> : null}<div className="mt-2 whitespace-pre-line rounded-lg bg-surface-2 p-2 text-sm">{(q.my_answer as string) || <i className="text-ink-3">Tidak dijawab</i>}</div><div className="mt-2 flex items-center gap-2 text-sm">Skor (maks {q.points as number}): <Input type="number" min={0} max={Number(q.points)} className="h-9 w-24" value={scores[q.id as string] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [q.id as string]: e.target.value }))} /></div></div>)}
    </Modal>
  );
}
