import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload, Download } from 'lucide-react';
import { api, get, post, put, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage, useAsyncOptions } from '@/features/crud/CrudPage';
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Textarea, Tabs, cx } from '@/components/ui';
import { QUESTION_TYPE_LABEL } from '@/lib/format';
import { Dict } from '@/lib/types';

const DIFF_TONE = { MUDAH: 'green', SEDANG: 'amber', SULIT: 'red' } as const;

export default function QuestionBank() {
  const { has } = useAuth();
  const [tab, setTab] = useState<'soal' | 'konsep'>('soal');
  const [editing, setEditing] = useState<Dict | null | 'new'>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const canWrite = has('question:write');
  return (
    <div>
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'soal', label: 'Bank soal' }, { value: 'konsep', label: 'Konsep / TP' }]} />
      {tab === 'soal' ? (
        <CrudPage<Dict> key={reloadKey} title="Bank Soal" subtitle="Soal berlabel konsep — dipakai lintas kuis dan ujian. Pengecoh boleh diberi label miskonsepsi." endpoint="/questions" entityLabel="soal" limit={25}
          perm={{ write: 'question:write' }} canCreate={false} canEdit={false}
          headerActions={canWrite && <><Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Impor</Button><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Soal baru</Button></>}
          onRowClick={(r) => setEditing(r)}
          columns={[
            { key: 'text', header: 'Soal', render: (r) => <div className="max-w-xl line-clamp-2 text-sm">{r.text as string}</div> },
            { key: 'type', header: 'Tipe', render: (r) => <Badge tone="brand">{QUESTION_TYPE_LABEL[r.type as string]}</Badge> },
            { key: 'concept_name', header: 'Konsep', render: (r) => (r.concept_name as string) ?? <span className="text-ink-3">-</span> },
            { key: 'subject_name', header: 'Mapel' },
            { key: 'difficulty', header: 'Tingkat', render: (r) => <Badge tone={DIFF_TONE[r.difficulty as keyof typeof DIFF_TONE] ?? 'gray'}>{r.difficulty as string}</Badge> },
            { key: 'usage_count', header: 'Dipakai', className: 'text-center' },
          ]}
          filters={[{ name: 'subject_id', label: 'Mapel', type: 'async-select', source: { url: '/academic/subjects', label: 'name' } }, { name: 'type', label: 'Tipe', options: Object.entries(QUESTION_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l })) }, { name: 'difficulty', label: 'Tingkat', options: ['MUDAH', 'SEDANG', 'SULIT'].map((x) => ({ value: x, label: x })) }, { name: 'concept_id', label: 'Konsep', type: 'async-select', source: { url: '/questions/concepts', label: (r) => `${r.code} — ${r.name}` } }]}
        />
      ) : (
        <CrudPage<Dict> title="Konsep / Tujuan Pembelajaran" subtitle="Peta konsep per mapel — dasar analisis penguasaan siswa." endpoint="/questions/concepts" entityLabel="konsep" perm={{ write: 'question:write' }}
          columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Nama' }, { key: 'subject_name', header: 'Mapel' }, { key: 'grade_level', header: 'Tingkat' }, { key: 'question_count', header: 'Soal', className: 'text-center' }]}
          filters={[{ name: 'subject_id', label: 'Mapel', type: 'async-select', source: { url: '/academic/subjects', label: 'name' } }]}
          fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama konsep', required: true }, { name: 'subject_id', label: 'Mapel', type: 'async-select', source: { url: '/academic/subjects', label: 'name' } }, { name: 'grade_level', label: 'Tingkat', type: 'select', options: [10, 11, 12].map((g) => ({ value: g, label: `Kelas ${g}` })) }, { name: 'description', label: 'Deskripsi', type: 'textarea', span: 2 }]}
        />
      )}
      <QuestionEditor open={editing !== null} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReloadKey((k) => k + 1); }} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); setReloadKey((k) => k + 1); }} />
    </div>
  );
}

type Opt = { key: string; text: string; is_correct: boolean; misconception: string };
export function QuestionEditor({ open, row, onClose, onSaved, defaultSubject }: { open: boolean; row: Dict | null; onClose: () => void; onSaved: (q: Dict) => void; defaultSubject?: string }) {
  const { has } = useAuth();
  const subjects = useAsyncOptions({ url: '/academic/subjects', label: 'name' });
  const [f, setF] = useState<Dict>({});
  const [opts, setOpts] = useState<Opt[]>([]);
  const [shortAnswers, setShortAnswers] = useState('');
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const concepts = useAsyncOptions(f.subject_id ? { url: '/questions/concepts', params: { subject_id: f.subject_id }, label: (r) => `${r.code} — ${r.name}` } : undefined);
  const readOnly = !has('question:write');
  useEffect(() => {
    if (!open) return;
    if (row) {
      setF({ ...row });
      const o = (row.options as Opt[] | null) ?? [];
      setOpts(o.map((x) => ({ key: x.key, text: x.text, is_correct: !!x.is_correct, misconception: x.misconception ?? '' })));
      const k = row.answer_key;
      setShortAnswers(Array.isArray(k) ? k.join(' | ') : '');
      setPairs(Array.isArray(k) && row.type === 'MATCH' ? (k as { left: string; right: string }[]) : []);
    } else {
      setF({ type: 'MC', text: '', subject_id: defaultSubject ?? '', concept_id: '', difficulty: 'SEDANG', points: 1, explanation: '', grade_level: '', answer_key: true });
      setOpts([{ key: 'A', text: '', is_correct: true, misconception: '' }, { key: 'B', text: '', is_correct: false, misconception: '' }, { key: 'C', text: '', is_correct: false, misconception: '' }, { key: 'D', text: '', is_correct: false, misconception: '' }]);
      setShortAnswers(''); setPairs([{ left: '', right: '' }, { left: '', right: '' }]);
    }
  }, [open, row, defaultSubject]);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const type = String(f.type ?? 'MC');
  const save = async () => {
    setBusy(true);
    try {
      const body: Dict = { type, text: f.text, subject_id: f.subject_id || null, concept_id: f.concept_id || null, difficulty: f.difficulty, points: Number(f.points) || 1, explanation: f.explanation || null, grade_level: f.grade_level ? Number(f.grade_level) : null };
      if (type === 'MC' || type === 'MCX') body.options = opts.filter((o) => o.text.trim()).map((o) => ({ key: o.key, text: o.text, is_correct: o.is_correct, misconception: o.misconception || null }));
      else if (type === 'TF') body.answer_key = f.answer_key === true || f.answer_key === 'true';
      else if (type === 'SHORT') body.answer_key = shortAnswers.split('|').map((s) => s.trim()).filter(Boolean);
      else if (type === 'MATCH') body.answer_key = pairs.filter((p) => p.left && p.right);
      else body.answer_key = f.answer_key ? String(f.answer_key) : null;
      const saved = row ? await put<Dict>(`/questions/${row.id}`, body) : await post<Dict>('/questions', body);
      toast.success('Soal disimpan'); onSaved(saved);
    } catch (e) { toast.error('Gagal menyimpan', toApiError(e).message); } finally { setBusy(false); }
  };
  const setOpt = (i: number, patch: Partial<Opt>) => setOpts((s) => s.map((o, j) => (j === i ? { ...o, ...patch } : type === 'MC' && patch.is_correct ? { ...o, is_correct: false } : o)));
  return (
    <Modal open={open} onClose={onClose} size="xl" title={row ? (readOnly ? 'Detail soal' : 'Ubah soal') : 'Soal baru'} footer={<><Button variant="outline" onClick={onClose}>Tutup</Button>{!readOnly && <Button loading={busy} onClick={save}>Simpan</Button>}</>}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Tipe"><Select disabled={readOnly || !!row} value={type} onChange={(e) => set('type', e.target.value)} options={Object.entries(QUESTION_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} /></Field>
        <Field label="Mapel"><Select disabled={readOnly} value={String(f.subject_id ?? '')} onChange={(e) => { set('subject_id', e.target.value); set('concept_id', ''); }} placeholder="—" options={subjects} /></Field>
        <Field label="Konsep"><Select disabled={readOnly} value={String(f.concept_id ?? '')} onChange={(e) => set('concept_id', e.target.value)} placeholder="—" options={concepts} /></Field>
        <div className="grid grid-cols-3 gap-2"><Field label="Tingkat"><Select disabled={readOnly} value={String(f.difficulty)} onChange={(e) => set('difficulty', e.target.value)} options={['MUDAH', 'SEDANG', 'SULIT'].map((x) => ({ value: x, label: x }))} /></Field><Field label="Poin"><Input disabled={readOnly} type="number" step="0.5" min={0.5} value={String(f.points ?? 1)} onChange={(e) => set('points', e.target.value)} /></Field><Field label="Kelas"><Select disabled={readOnly} value={String(f.grade_level ?? '')} onChange={(e) => set('grade_level', e.target.value)} placeholder="—" options={[10, 11, 12].map((g) => ({ value: g, label: String(g) }))} /></Field></div>
        <Field label="Pertanyaan" required className="sm:col-span-4"><Textarea disabled={readOnly} rows={3} value={String(f.text ?? '')} onChange={(e) => set('text', e.target.value)} /></Field>
        {(type === 'MC' || type === 'MCX') && (
          <div className="sm:col-span-4 space-y-2">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-ink-2">Opsi jawaban {type === 'MC' ? '(tandai 1 benar)' : '(boleh >1 benar)'}</span>{!readOnly && opts.length < 5 && <Button size="sm" variant="ghost" onClick={() => setOpts((s) => [...s, { key: 'ABCDE'[s.length], text: '', is_correct: false, misconception: '' }])}>+ Opsi</Button>}</div>
            {opts.map((o, i) => (
              <div key={o.key} className={cx('grid gap-2 rounded-xl border p-2 sm:grid-cols-[auto_1fr_1fr_auto]', o.is_correct ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-line')}>
                <div className="flex items-center gap-2"><Checkbox checked={o.is_correct} onChange={(v) => !readOnly && setOpt(i, { is_correct: v })} /><span className="w-5 font-bold">{o.key}</span></div>
                <Input disabled={readOnly} placeholder="Teks opsi" value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} />
                <Input disabled={readOnly || o.is_correct} placeholder="Label miskonsepsi (opsional)" value={o.misconception} onChange={(e) => setOpt(i, { misconception: e.target.value })} />
                {!readOnly && opts.length > 2 ? <Button size="icon" variant="ghost" onClick={() => setOpts((s) => s.filter((_, j) => j !== i).map((x, j) => ({ ...x, key: 'ABCDE'[j] })))} icon={<Trash2 className="h-4 w-4 text-red-500" />} /> : <span />}
              </div>
            ))}
          </div>
        )}
        {type === 'TF' && <Field label="Kunci jawaban" className="sm:col-span-2"><Select disabled={readOnly} value={String(f.answer_key)} onChange={(e) => set('answer_key', e.target.value === 'true')} options={[{ value: 'true', label: 'Benar' }, { value: 'false', label: 'Salah' }]} /></Field>}
        {type === 'SHORT' && <Field label="Jawaban yang diterima" hint="Pisahkan alternatif dengan | (tidak peka huruf besar/kecil)" className="sm:col-span-4"><Input disabled={readOnly} value={shortAnswers} onChange={(e) => setShortAnswers(e.target.value)} placeholder="192.168.10.255 | 192.168.10.255/24" /></Field>}
        {type === 'MATCH' && <div className="sm:col-span-4 space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium text-ink-2">Pasangan</span>{!readOnly && <Button size="sm" variant="ghost" onClick={() => setPairs((s) => [...s, { left: '', right: '' }])}>+ Pasangan</Button>}</div>{pairs.map((p, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input disabled={readOnly} placeholder="Kiri" value={p.left} onChange={(e) => setPairs((s) => s.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)))} /><Input disabled={readOnly} placeholder="Kanan" value={p.right} onChange={(e) => setPairs((s) => s.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)))} />{!readOnly && <Button size="icon" variant="ghost" onClick={() => setPairs((s) => s.filter((_, j) => j !== i))} icon={<Trash2 className="h-4 w-4 text-red-500" />} />}</div>)}</div>}
        {type === 'ESSAY' && <Field label="Rubrik / jawaban model (untuk guru)" className="sm:col-span-4"><Textarea disabled={readOnly} rows={3} value={String(f.answer_key ?? '')} onChange={(e) => set('answer_key', e.target.value)} /></Field>}
        <Field label="Pembahasan (ditampilkan setelah kuis)" className="sm:col-span-4"><Textarea disabled={readOnly} rows={2} value={String(f.explanation ?? '')} onChange={(e) => set('explanation', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Dict | null>(null);
  const run = async () => { if (!file) return; setBusy(true); try { const fd = new FormData(); fd.append('file', file); const r = await api.post('/questions/import', fd); setResult(r.data.data); toast.success(`${r.data.data.success} soal diimpor`); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const template = () => { const csv = 'type,text,option_a,option_b,option_c,option_d,option_e,correct,explanation,difficulty,points,concept_code,subject_code\nMC,Ibu kota Indonesia adalah…,Jakarta,Bandung,Surabaya,Medan,,A,Jakarta adalah ibu kota,MUDAH,1,,\nTF,Bumi mengelilingi matahari,,,,,,true,,MUDAH,1,,\nSHORT,Sebutkan simbol kimia air,,,,,,H2O|h2o,,SEDANG,1,,\n'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'template-soal.csv'; a.click(); };
  return (
    <Modal open={open} onClose={() => { setResult(null); onClose(); }} title="Impor soal (CSV / XLSX)" footer={<><Button variant="outline" onClick={template} icon={<Download className="h-4 w-4" />}>Template</Button><Button loading={busy} disabled={!file} onClick={run}>Impor</Button>{result && <Button onClick={onDone}>Selesai</Button>}</>}>
      <p className="text-sm text-ink-2">Kolom: <code>type</code> (MC/MCX/TF/SHORT/ESSAY), <code>text</code>, <code>option_a..e</code>, <code>correct</code> (A / A,C / true / jawaban|alternatif), <code>explanation</code>, <code>difficulty</code>, <code>points</code>, <code>concept_code</code>, <code>subject_code</code>.</p>
      <input type="file" accept=".csv,.xlsx" className="mt-4 text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {result && <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">Berhasil {result.success as number} dari {result.total as number}.{(result.errors as Dict[]).length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-red-600">{(result.errors as Dict[]).map((e, i) => <li key={i}>Baris {e.row_no as number}: {e.message as string}</li>)}</ul>}</div>}
    </Modal>
  );
}
export const _g = get;
