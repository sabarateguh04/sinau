import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, ChevronLeft, ChevronRight, Send, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { get, post, toApiError } from '@/lib/api';
import { toast } from '@/store/ui';
import { Button, Card, Loading, Confirm, Textarea, Input, cx, Badge } from '@/components/ui';
import { fmtScore } from '@/lib/format';
import { Dict } from '@/lib/types';

/**
 * Shared attempt runner for quizzes and exams. Autosaves each answer immediately, keeps a local
 * countdown, and auto-submits when the deadline passes. `base` = '/quizzes' | '/exams'.
 */
export function AttemptRunner({ base, attemptId, onExit, lockScreen }: { base: string; attemptId: string; onExit: () => void; lockScreen?: boolean }) {
  const [a, setA] = useState<Dict | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [remaining, setRemaining] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [violations, setViolations] = useState(0);
  const submittedRef = useRef(false);
  const load = useCallback(async () => {
    try {
      const d = await get<Dict>(`${base}/attempts/${attemptId}`);
      setA(d);
      const ans: Record<string, unknown> = {};
      for (const q of d.questions as Dict[]) if (q.my_answer !== null && q.my_answer !== undefined) ans[q.id as string] = q.my_answer;
      setAnswers(ans);
      setRemaining(Number(d.remaining_sec ?? 0));
    } catch (e) { toast.error(toApiError(e).message); onExit(); }
  }, [base, attemptId, onExit]);
  useEffect(() => { load(); }, [load]);
  const finished = a && a.status !== 'IN_PROGRESS';

  const submit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try { await post(`${base}/attempts/${attemptId}/submit`, auto ? { reason: 'TIMEOUT' } : {}); toast.success(auto ? 'Waktu habis — jawaban dikumpulkan otomatis' : 'Jawaban dikumpulkan'); await load(); } catch (e) { submittedRef.current = false; toast.error(toApiError(e).message); }
  }, [base, attemptId, load]);

  useEffect(() => {
    if (!a || finished) return;
    const t = setInterval(() => setRemaining((r) => { if (r <= 1) { clearInterval(t); submit(true); return 0; } return r - 1; }), 1000);
    return () => clearInterval(t);
  }, [a, finished, submit]);

  // Lock-screen (exam): count tab switches / focus loss.
  useEffect(() => {
    if (!lockScreen || !a || finished) return;
    const h = () => { if (document.hidden) { setViolations((v) => v + 1); post(`${base}/attempts/${attemptId}/violation`, {}).catch(() => undefined); toast.warning('Anda meninggalkan halaman ujian', 'Pelanggaran dicatat.'); } };
    document.addEventListener('visibilitychange', h);
    const fs = () => window.dispatchEvent(new CustomEvent('noop'));
    window.addEventListener('blur', fs);
    const forced = () => submit(true);
    window.addEventListener('sinau:exam-force-submit', forced);
    return () => { document.removeEventListener('visibilitychange', h); window.removeEventListener('blur', fs); window.removeEventListener('sinau:exam-force-submit', forced); };
  }, [lockScreen, a, finished, base, attemptId, submit]);

  const save = useCallback(async (qid: string, value: unknown) => {
    setAnswers((s) => ({ ...s, [qid]: value }));
    setSaving((s) => ({ ...s, [qid]: 'saving' }));
    try { await post(`${base}/attempts/${attemptId}/answer`, { question_id: qid, answer: value }); setSaving((s) => ({ ...s, [qid]: 'saved' })); } catch (e) { setSaving((s) => ({ ...s, [qid]: 'error' })); const err = toApiError(e); if (err.status === 400 && /habis|aktif/i.test(err.message)) load(); }
  }, [base, attemptId, load]);

  const questions = useMemo(() => (a?.questions as Dict[]) ?? [], [a]);
  if (!a) return <Loading />;
  const q = questions[idx];
  const answered = questions.filter((x) => answers[x.id as string] !== undefined && answers[x.id as string] !== null && answers[x.id as string] !== '').length;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0'); const ss = String(remaining % 60).padStart(2, '0');

  if (finished) {
    const show = a.show_result !== 'NEVER' && a.score !== null;
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" /><h1 className="mt-3 text-2xl font-bold">{a.title as string}</h1><p className="text-sm text-ink-2">Status: <Badge tone="green">{String(a.status)}</Badge></p>{show ? <div className="mt-4 text-5xl font-extrabold text-brand-700">{fmtScore(a.score as number)}</div> : <p className="mt-4 text-sm text-ink-3">Hasil akan ditampilkan sesuai pengaturan guru.</p>}<Button className="mt-6" onClick={onExit}>Kembali</Button></Card>
        {show && questions.some((x) => x.answer_key !== undefined || x.explanation) && (
          <div className="mt-6 space-y-3">{questions.map((x, i) => { const my = answers[x.id as string]; const correct = isCorrect(x, my); return (
            <Card key={x.id as string}><div className="flex items-start gap-3">{correct === null ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /> : correct ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}<div className="min-w-0 flex-1"><div className="text-sm font-medium">{i + 1}. {x.text as string}</div>{Array.isArray(x.options) && <ul className="mt-2 space-y-1">{(x.options as Dict[]).map((o) => { const key = (x.answer_key as string[]) ?? []; const isKey = key.includes(o.key as string); const mine = Array.isArray(my) ? my.includes(o.key) : my === o.key; return <li key={o.key as string} className={cx('rounded-lg px-2 py-1 text-xs', isKey ? 'bg-emerald-100 dark:bg-emerald-900/30' : mine ? 'bg-red-100 dark:bg-red-900/30' : 'bg-surface-2')}>{o.key as string}. {o.text as string}{mine ? ' ← jawaban Anda' : ''}{isKey ? ' ✓' : ''}{mine && !isKey && o.misconception ? <span className="ml-1 italic text-ink-2">({o.misconception as string})</span> : null}</li>; })}</ul>}{!Array.isArray(x.options) && <div className="mt-1 text-xs text-ink-2">Jawaban Anda: <b>{fmtAns(my)}</b>{x.answer_key !== undefined && x.type !== 'ESSAY' ? <> · Kunci: <b>{fmtAns(x.answer_key)}</b></> : null}</div>}{x.explanation ? <div className="mt-2 rounded-lg bg-brand-50 p-2 text-xs dark:bg-brand-900/20"><b>Pembahasan:</b> {x.explanation as string}</div> : null}</div></div></Card>
          ); })}</div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="sticky top-16 z-20 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{a.title as string}</div><div className="text-xs text-ink-3">{answered}/{questions.length} dijawab{lockScreen && violations > 0 ? ` · ${violations} pelanggaran` : ''}</div></div>
        <div className={cx('flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-lg font-bold', remaining < 60 ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : remaining < 300 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30' : 'bg-surface-3')}><Clock className="h-4 w-4" />{mm}:{ss}</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <Card>
          <div className="mb-3 flex items-center justify-between text-xs text-ink-3"><span>Soal {idx + 1} dari {questions.length} · {q.points as number} poin</span><span>{saving[q.id as string] === 'saving' ? 'menyimpan…' : saving[q.id as string] === 'saved' ? '✓ tersimpan' : saving[q.id as string] === 'error' ? '⚠ gagal simpan' : ''}</span></div>
          <div className="text-[15px] leading-7 whitespace-pre-line">{q.text as string}</div>
          {q.image_url ? <img src={q.image_url as string} alt="" className="mt-3 max-h-72 rounded-xl" /> : null}
          <div className="mt-5"><AnswerInput q={q} value={answers[q.id as string]} onChange={(v) => save(q.id as string, v)} /></div>
          <div className="mt-6 flex items-center justify-between"><Button variant="outline" disabled={idx === 0} onClick={() => setIdx(idx - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Sebelumnya</Button>{idx < questions.length - 1 ? <Button onClick={() => setIdx(idx + 1)}>Berikutnya <ChevronRight className="h-4 w-4" /></Button> : <Button variant="accent" icon={<Send className="h-4 w-4" />} onClick={() => setConfirm(true)}>Kumpulkan</Button>}</div>
        </Card>
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Card padded={false}><div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase text-ink-3">Navigasi</div><div className="grid grid-cols-6 gap-1.5 p-3 lg:grid-cols-5">{questions.map((x, i) => { const done = answers[x.id as string] !== undefined && answers[x.id as string] !== null && answers[x.id as string] !== ''; return <button key={x.id as string} onClick={() => setIdx(i)} className={cx('h-9 rounded-lg text-sm font-semibold', i === idx ? 'ring-2 ring-brand-500' : '', done ? 'bg-brand-600 text-white' : 'bg-surface-3 text-ink-2')}>{i + 1}</button>; })}</div><div className="border-t border-line p-3"><Button className="w-full" variant="accent" icon={<Send className="h-4 w-4" />} onClick={() => setConfirm(true)}>Kumpulkan</Button></div></Card>
        </div>
      </div>
      <Confirm open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); submit(false); }} danger={false} title="Kumpulkan jawaban?" message={answered < questions.length ? `Masih ada ${questions.length - answered} soal belum dijawab. Tetap kumpulkan?` : 'Semua soal sudah dijawab. Kumpulkan sekarang?'} />
    </div>
  );
}
const fmtAns = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Benar' : 'Salah') : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v));
function isCorrect(q: Dict, my: unknown): boolean | null {
  if (q.type === 'ESSAY') return null;
  const key = q.answer_key;
  if (key === undefined) return null;
  if (q.type === 'MC') return Array.isArray(key) && key[0] === my;
  if (q.type === 'MCX') { const a = new Set(Array.isArray(my) ? my : []); const k = new Set(Array.isArray(key) ? key : []); return a.size === k.size && [...a].every((x) => k.has(x)); }
  if (q.type === 'TF') return Boolean(my) === Boolean(key);
  if (q.type === 'SHORT') return Array.isArray(key) && key.some((k) => String(k).trim().toLowerCase() === String(my ?? '').trim().toLowerCase());
  if (q.type === 'MATCH') { const pairs = Array.isArray(key) ? key as { left: string; right: string }[] : []; const g = (my ?? {}) as Record<string, string>; return pairs.every((p) => g[p.left] === p.right); }
  return null;
}

export function AnswerInput({ q, value, onChange }: { q: Dict; value: unknown; onChange: (v: unknown) => void }) {
  const type = q.type as string;
  const options = (q.options as Dict[]) ?? [];
  if (type === 'MC') return <div className="space-y-2">{options.map((o) => <button key={o.key as string} onClick={() => onChange(o.key)} className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition', value === o.key ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-line hover:bg-surface-2')}><span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', value === o.key ? 'bg-brand-600 text-white' : 'bg-surface-3')}>{o.key as string}</span><span className="pt-1">{o.text as string}</span></button>)}</div>;
  if (type === 'MCX') { const arr = Array.isArray(value) ? (value as string[]) : []; return <div className="space-y-2">{options.map((o) => { const on = arr.includes(o.key as string); return <button key={o.key as string} onClick={() => onChange(on ? arr.filter((x) => x !== o.key) : [...arr, o.key])} className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm', on ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-line hover:bg-surface-2')}><span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold', on ? 'bg-brand-600 text-white' : 'bg-surface-3')}>{on ? '✓' : (o.key as string)}</span><span className="pt-1">{o.text as string}</span></button>; })}<div className="text-xs text-ink-3">Pilih semua jawaban yang benar.</div></div>; }
  if (type === 'TF') return <div className="flex gap-3">{[[true, 'Benar'], [false, 'Salah']].map(([v, l]) => <button key={String(l)} onClick={() => onChange(v)} className={cx('flex-1 rounded-xl border p-4 text-sm font-semibold', value === v ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-line hover:bg-surface-2')}>{String(l)}</button>)}</div>;
  if (type === 'SHORT') return <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(e.target.value)} placeholder="Jawaban singkat" />;
  if (type === 'MATCH') { const m = q.match as { lefts: string[]; rights: string[] } | undefined; const pairs = (Array.isArray(q.answer_key) ? q.answer_key : []) as { left: string; right: string }[]; const lefts = m?.lefts ?? pairs.map((p) => p.left); const rights = m?.rights ?? [...new Set(pairs.map((p) => p.right))]; const g = (value ?? {}) as Record<string, string>; return <div className="space-y-2">{lefts.map((l) => <div key={l} className="grid grid-cols-2 items-center gap-2 text-sm"><span className="rounded-lg bg-surface-2 px-3 py-2">{l}</span><select className="input" value={g[l] ?? ''} onChange={(e) => onChange({ ...g, [l]: e.target.value })}><option value="">— pilih —</option>{rights.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>)}</div>; }
  return <Textarea rows={8} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder="Tulis jawaban Anda…" />;
}

export default function QuizAttempt() {
  const { attemptId } = useParams();
  const nav = useNavigate();
  return <AttemptRunner base="/quizzes" attemptId={attemptId!} onExit={() => nav(-1)} />;
}
