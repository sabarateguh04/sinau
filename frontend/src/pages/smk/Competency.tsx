import { useCallback, useEffect, useState } from 'react';
import { Award, ClipboardCheck, FileDown } from 'lucide-react';
import { get, post, toApiError, downloadFile } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button, Card, EmptyState, Input, Loading, Modal, PageHeader, Table, Tabs, Textarea } from '@/components/ui';
import { fmtDate, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Competency() {
  const { has } = useAuth();
  const canWrite = has('competency:write');
  const [tab, setTab] = useState<'uji' | 'skema' | 'rubrik'>('uji');
  const [sel, setSel] = useState<Dict | null>(null);
  return (
    <div>
      <PageHeader title="Uji Kompetensi" subtitle="Skema & rubrik penilaian, jadwal uji dengan penguji eksternal, hasil & sertifikat." />
      {canWrite && <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'uji', label: 'Jadwal uji' }, { value: 'skema', label: 'Skema' }, { value: 'rubrik', label: 'Rubrik' }]} />}
      {tab === 'uji' && <CrudPage<Dict> noHeader title="Uji" endpoint="/smk/tests" entityLabel="uji kompetensi" modalSize="lg" perm={{ write: 'competency:write' }}
        columns={[{ key: 'test_date', header: 'Tanggal', render: (r) => fmtDate(r.test_date as string) }, { key: 'title', header: 'Uji', render: (r) => <div><div className="font-medium">{r.title as string}</div><div className="text-xs text-ink-3">{r.scheme_code as string} · {r.scheme_name as string}</div></div> }, { key: 'external_examiner_name', header: 'Penguji', render: (r) => <span className="text-xs">{(r.external_examiner_name as string) ?? '-'}<br /><span className="text-ink-3">{r.internal_examiner_name as string}</span></span> }, { key: 'participant_count', header: 'Peserta', render: (r) => `${r.competent_count}/${r.participant_count} kompeten` }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }]}
        rowActions={(r) => <Button size="sm" variant="outline" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => setSel(r)}>Hasil</Button>}
        fields={[{ name: 'title', label: 'Judul', required: true, span: 2 }, { name: 'scheme_id', label: 'Skema', type: 'async-select', required: true, source: { url: '/smk/schemes', label: (r) => `${r.code} — ${r.name}` } }, { name: 'test_date', label: 'Tanggal', type: 'date', required: true }, { name: 'external_examiner_id', label: 'Penguji eksternal', type: 'async-select', source: { url: '/users', params: { role: 'PENGUJI_EKSTERNAL', limit: 100 }, label: 'full_name' } }, { name: 'internal_examiner_id', label: 'Penguji internal', type: 'async-select', source: { url: '/users', params: { role: 'GURU', limit: 300 }, label: 'full_name' } }, { name: 'location', label: 'Lokasi' }, { name: 'status', label: 'Status', type: 'select', defaultValue: 'SCHEDULED', options: ['SCHEDULED', 'ONGOING', 'DONE', 'CANCELLED'].map((x) => ({ value: x, label: label(x) })) }, { name: 'student_ids', label: 'Peserta (pilih kelas lalu centang)', type: 'custom', span: 2, defaultValue: [], render: ({ value, onChange }) => <StudentPicker value={(value as string[]) ?? []} onChange={onChange} /> }]} />}
      {tab === 'skema' && <CrudPage<Dict> noHeader title="Skema" endpoint="/smk/schemes" entityLabel="skema" modalSize="lg" perm={{ write: 'competency:write' }} columns={[{ key: 'code', header: 'Kode' }, { key: 'name', header: 'Skema' }, { key: 'major_name', header: 'Jurusan' }, { key: 'rubric_count', header: 'Rubrik', className: 'text-center' }, { key: 'is_active', header: 'Aktif', render: (r) => (r.is_active ? 'Ya' : '-') }]} fields={[{ name: 'code', label: 'Kode', required: true }, { name: 'name', label: 'Nama skema', required: true }, { name: 'major_id', label: 'Jurusan', type: 'async-select', source: { url: '/academic/majors', label: 'name' } }, { name: 'units', label: 'Unit kompetensi (JSON array)', type: 'json', defaultValue: [], span: 2 }, { name: 'description', label: 'Deskripsi', type: 'textarea', span: 2 }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />}
      {tab === 'rubrik' && <CrudPage<Dict> noHeader title="Rubrik" endpoint="/smk/rubrics" entityLabel="rubrik" perm={{ write: 'competency:write' }} columns={[{ key: 'code', header: 'Kode' }, { key: 'criteria', header: 'Kriteria' }, { key: 'max_score', header: 'Skor maks', className: 'text-center' }, { key: 'weight', header: 'Bobot', className: 'text-center' }]} filters={[{ name: 'scheme_id', label: 'Skema', type: 'async-select', source: { url: '/smk/schemes', label: 'code' } }]} fields={[{ name: 'scheme_id', label: 'Skema', type: 'async-select', required: true, source: { url: '/smk/schemes', label: (r) => `${r.code} — ${r.name}` }, span: 2 }, { name: 'code', label: 'Kode', required: true }, { name: 'criteria', label: 'Kriteria', required: true }, { name: 'max_score', label: 'Skor maks', type: 'number', defaultValue: 100 }, { name: 'weight', label: 'Bobot', type: 'number', defaultValue: 1 }, { name: 'order_no', label: 'Urutan', type: 'number', defaultValue: 0 }]} />}
      <ResultsModal test={sel} onClose={() => setSel(null)} />
    </div>
  );
}
function StudentPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [classes, setClasses] = useState<Dict[]>([]); const [cls, setCls] = useState(''); const [students, setStudents] = useState<Dict[]>([]);
  useEffect(() => { get<unknown>('/academic/classes', { active_year: 1, limit: 200 }).then((d) => setClasses((d as { data?: Dict[] }).data ?? [])); }, []);
  useEffect(() => { if (cls) get<Dict[]>(`/academic/classes/${cls}/students`).then(setStudents); }, [cls]);
  return <div className="rounded-xl border border-line p-3"><select className="input mb-2" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">— pilih kelas —</option>{classes.map((c) => <option key={c.id as string} value={c.id as string}>{c.name as string}</option>)}</select><div className="mb-2 flex gap-2 text-xs"><button type="button" className="link" onClick={() => onChange([...new Set([...value, ...students.map((s) => s.id as string)])])}>Pilih semua</button><span className="text-ink-3">{value.length} dipilih</span></div><div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto text-sm">{students.map((s) => <label key={s.id as string} className="flex items-center gap-2"><input type="checkbox" checked={value.includes(s.id as string)} onChange={(e) => onChange(e.target.checked ? [...value, s.id as string] : value.filter((x) => x !== s.id))} />{s.full_name as string}</label>)}</div></div>;
}
function ResultsModal({ test, onClose }: { test: Dict | null; onClose: () => void }) {
  const { has } = useAuth();
  const [d, setD] = useState<Dict | null>(null);
  const [grading, setGrading] = useState<Dict | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const load = useCallback(() => { if (test) get<Dict>(`/smk/tests/${test.id}/results`).then(setD); else setD(null); }, [test]);
  useEffect(() => { load(); }, [load]);
  const submit = async () => { try { const r = await post<Dict>(`/smk/tests/${test!.id}/assess`, { student_id: grading!.student_id, scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Number(v)])), note: note || null }); toast.success(`${r.verdict === 'COMPETENT' ? 'KOMPETEN' : 'BELUM KOMPETEN'} · skor ${r.total}`); setGrading(null); load(); } catch (e) { toast.error(toApiError(e).message); } };
  return (
    <Modal open={!!test} onClose={onClose} size="xl" title={test?.title as string}>
      {!d ? <Loading /> : <div className="space-y-3">
        <div className="text-sm text-ink-2">{(d.test as Dict).scheme_code as string} · {(d.test as Dict).scheme_name as string} · {fmtDate((d.test as Dict).test_date as string)} · {(d.rubrics as Dict[]).length} rubrik</div>
        <Table<Dict> dense rows={d.results as Dict[]} rowKey={(r) => r.student_id as string} columns={[{ key: 'full_name', header: 'Peserta', render: (r) => <div>{r.full_name as string}<div className="text-xs text-ink-3">{r.class_name as string}</div></div> }, { key: 'total_score', header: 'Skor', className: 'text-center', render: (r) => String(r.total_score ?? '-') }, { key: 'verdict', header: 'Hasil', render: (r) => <Badge tone={tone(r.verdict as string)}>{label(r.verdict as string)}</Badge> }, { key: 'examiner_note', header: 'Catatan', render: (r) => <span className="text-xs">{r.examiner_note as string}</span> }, { key: 'x', header: '', render: (r) => <div className="flex gap-1">{has('competency:assess') && <Button size="sm" variant="outline" onClick={() => { setGrading(r); const s: Record<string, string> = {}; for (const rb of d.rubrics as Dict[]) s[rb.id as string] = String((r.scores as Dict | null)?.[rb.id as string] ?? ''); setScores(s); setNote(String(r.examiner_note ?? '')); }}>Nilai</Button>}{r.verdict === 'COMPETENT' && <Button size="sm" variant="ghost" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/smk/tests/${test!.id}/certificate/${r.student_id}`, `sertifikat-${r.full_name}.pdf`)} />}</div> }]} empty="Belum ada peserta" />
        <Modal open={!!grading} onClose={() => setGrading(null)} size="sm" title={`Penilaian — ${grading?.full_name ?? ''}`} footer={<Button onClick={submit}>Simpan penilaian</Button>}>
          <div className="space-y-2">{(d.rubrics as Dict[]).map((rb) => <div key={rb.id as string} className="flex items-center gap-2 text-sm"><span className="flex-1">{rb.criteria as string}<span className="block text-xs text-ink-3">maks {rb.max_score as number} · bobot {rb.weight as number}</span></span><Input type="number" min={0} max={Number(rb.max_score)} className="h-9 w-24" value={scores[rb.id as string] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [rb.id as string]: e.target.value }))} /></div>)}<Textarea rows={2} placeholder="Catatan penguji" value={note} onChange={(e) => setNote(e.target.value)} /><p className="text-xs text-ink-3">Kompeten jika skor tertimbang ≥ 70.</p></div>
        </Modal>
      </div>}
    </Modal>
  );
}
export function StudentCompetency() {
  const [rows, setRows] = useState<Dict[] | null>(null);
  useEffect(() => { get<unknown>('/smk/tests').then((d) => setRows((d as { data?: Dict[] }).data ?? [])); }, []);
  if (!rows) return <Loading />;
  return <div><PageHeader title="Uji Kompetensi" />{rows.length === 0 ? <EmptyState title="Belum ada jadwal uji kompetensi" icon={<Award className="h-6 w-6" />} /> : <div className="grid gap-3 sm:grid-cols-2">{rows.map((t) => <TestCard key={t.id as string} t={t} />)}</div>}</div>;
}
function TestCard({ t }: { t: Dict }) {
  const { user } = useAuth();
  const [r, setR] = useState<Dict | null>(null);
  useEffect(() => { get<Dict>(`/smk/tests/${t.id}/results`).then((d) => setR((d.results as Dict[])[0] ?? null)); }, [t.id]);
  return <Card><div className="flex items-start justify-between"><div><div className="font-semibold">{t.title as string}</div><div className="text-xs text-ink-3">{t.scheme_code as string} · {fmtDate(t.test_date as string)} · {t.location as string}</div></div><Badge tone={tone(t.status as string)}>{label(t.status as string)}</Badge></div>{r && <div className="mt-3 flex items-center justify-between"><div><Badge tone={tone(r.verdict as string)}>{label(r.verdict as string)}</Badge>{r.total_score !== null && r.total_score !== undefined ? <span className="ml-2 text-sm">Skor {String(r.total_score)}</span> : null}</div>{r.verdict === 'COMPETENT' && <Button size="sm" variant="outline" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/smk/tests/${t.id}/certificate/${user?.id}`, 'sertifikat.pdf')}>Sertifikat</Button>}</div>}</Card>;
}
