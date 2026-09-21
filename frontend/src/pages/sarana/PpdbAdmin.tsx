import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X, UserPlus, Users, Paperclip, ExternalLink, Filter } from 'lucide-react';
import { get, post, put, fileSrc, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage, useResource, useAsyncOptions } from '@/features/crud/CrudPage';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Loading, Modal, PageHeader, Pagination, SearchInput, Select, StatCard, Table, Tabs, useDebounce } from '@/components/ui';
import { fmtDate, fmtDateTime, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function PpdbAdmin() {
  const { has, hasRole, user } = useAuth();
  if (hasRole('CALON_SISWA') && !has('ppdb:read')) return <ApplicantSelf />;
  const [tab, setTab] = useState<'pendaftar' | 'periode'>('pendaftar');
  return (
    <div>
      <PageHeader title="PPDB" subtitle={<span>Pendaftaran publik di <a className="link" href={`/ppdb/${user?.tenant?.slug}`} target="_blank" rel="noreferrer">/ppdb/{user?.tenant?.slug} <ExternalLink className="inline h-3 w-3" /></a>. Verifikasi dokumen → seleksi → daftarkan sebagai siswa.</span>} />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'pendaftar', label: 'Pendaftar' }, { value: 'periode', label: 'Periode' }]} />
      {tab === 'periode' ? <Periods /> : <Applicants />}
    </div>
  );
}
function Periods() {
  const { has } = useAuth();
  return <CrudPage<Dict> noHeader title="Periode PPDB" endpoint="/ppdb/periods" entityLabel="periode" modalSize="lg" perm={{ write: 'ppdb:write' }}
    columns={[{ key: 'name', header: 'Periode', render: (r) => <span className="font-medium">{r.name as string}</span> }, { key: 'open_at', header: 'Jendela', render: (r) => <span className="text-xs">{fmtDateTime(r.open_at as string)}<br />s.d. {fmtDateTime(r.close_at as string)}</span> }, { key: 'quota', header: 'Kuota', className: 'text-center' }, { key: 'applicant_count', header: 'Pendaftar', className: 'text-center' }, { key: 'accepted_count', header: 'Diterima', className: 'text-center' }, { key: 'is_active', header: 'Aktif', render: (r) => <Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge> }]}
    rowActions={(r, reload) => has('ppdb:verify') && <Button size="sm" variant="outline" icon={<Filter className="h-4 w-4" />} onClick={async () => { const q = prompt('Kuota per jurusan (default):', String(r.quota)); if (q === null) return; try { const x = await post<Dict>(`/ppdb/periods/${r.id}/select`, { default_quota: Number(q) }); toast.success(`Seleksi: ${x.accepted} diterima, ${x.waitlist} cadangan`); reload(); } catch (e) { toast.error(toApiError(e).message); } }}>Seleksi otomatis</Button>}
    fields={[{ name: 'name', label: 'Nama', required: true, span: 2 }, { name: 'academic_year_id', label: 'Tahun ajaran tujuan', type: 'async-select', source: { url: '/academic/years', label: 'name' } }, { name: 'quota', label: 'Kuota total', type: 'number', defaultValue: 100 }, { name: 'open_at', label: 'Dibuka', type: 'datetime', required: true }, { name: 'close_at', label: 'Ditutup', type: 'datetime', required: true }, { name: 'requirements', label: 'Dokumen wajib (JSON array)', type: 'json', defaultValue: ['Fotokopi ijazah/SKL', 'Kartu keluarga', 'Akta kelahiran', 'Pas foto 3x4'], span: 2 }, { name: 'paths', label: 'Jalur (JSON array)', type: 'json', defaultValue: ['ZONASI', 'AFIRMASI', 'PRESTASI', 'PERPINDAHAN'], span: 2 }, { name: 'announcement', label: 'Pengumuman', type: 'textarea', span: 2 }, { name: 'is_active', label: 'Aktif', type: 'switch', defaultValue: true }]} />;
}
const STATUSES = ['SUBMITTED', 'VERIFIED', 'ACCEPTED', 'WAITLIST', 'REJECTED', 'ENROLLED', 'WITHDRAWN'];
function Applicants() {
  const { has } = useAuth();
  const periods = useAsyncOptions({ url: '/ppdb/periods', label: 'name' });
  const [q, setQ] = useState(''); const dq = useDebounce(q);
  const [period, setPeriod] = useState(''); const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Dict | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [enroll, setEnroll] = useState(false);
  const [summary, setSummary] = useState<Dict | null>(null);
  const params = useMemo(() => ({ q: dq || undefined, period_id: period || undefined, status: status || undefined, page, limit: 25 }), [dq, period, status, page]);
  const { rows, meta, loading, reload } = useResource<Dict>('/ppdb/applicants', params);
  useEffect(() => { get<Dict>('/ppdb/summary', { period_id: period || undefined }).then(setSummary); }, [period, rows]);
  const byStatus = Object.fromEntries(((summary?.by_status as Dict[]) ?? []).map((x) => [x.status, Number(x.c)]));
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Masuk" value={String(byStatus.SUBMITTED ?? 0)} tone="blue" /><StatCard label="Terverifikasi" value={String(byStatus.VERIFIED ?? 0)} /><StatCard label="Diterima" value={String(byStatus.ACCEPTED ?? 0)} tone="green" /><StatCard label="Cadangan" value={String(byStatus.WAITLIST ?? 0)} tone="accent" /><StatCard label="Terdaftar" value={String(byStatus.ENROLLED ?? 0)} tone="purple" /></div>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3"><SearchInput value={q} onChange={setQ} className="w-64" placeholder="Nama / no. daftar / NISN / asal" /><Select value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }} className="w-48" placeholder="Semua periode" options={periods} /><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40" placeholder="Semua status" options={STATUSES.map((x) => ({ value: x, label: label(x) }))} />{has('ppdb:enroll') && picked.size > 0 && <Button className="ml-auto" icon={<UserPlus className="h-4 w-4" />} onClick={() => setEnroll(true)}>Daftarkan {picked.size} siswa</Button>}</div>
        <Table<Dict> loading={loading} rows={rows} columns={[
          { key: 'pick', header: '', render: (r) => r.status === 'ACCEPTED' ? <Checkbox checked={picked.has(r.id as string)} onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.id as string); else n.delete(r.id as string); return n; })} /> : null },
          { key: 'registration_no', header: 'No.', render: (r) => <code className="text-xs">{r.registration_no as string}</code> },
          { key: 'full_name', header: 'Pendaftar', render: (r) => <div><div className="font-medium">{r.full_name as string}</div><div className="text-xs text-ink-3">{r.origin_school as string} · {r.phone as string}</div></div> },
          { key: 'major1_name', header: 'Pilihan', render: (r) => <span className="text-xs">{r.major1_name as string}{r.major2_name ? ` / ${r.major2_name}` : ''}<br /><span className="text-ink-3">{r.path as string}</span></span> },
          { key: 'score', header: 'Skor', className: 'text-center', render: (r) => String(r.score ?? '-') }, { key: 'document_count', header: 'Dok.', className: 'text-center' },
          { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> },
          { key: 'x', header: '', render: (r) => <Button size="sm" variant="outline" onClick={() => setSel(r)}>Tinjau</Button> },
        ]} empty="Belum ada pendaftar" />
        <div className="border-t border-line px-2"><Pagination page={meta.page} limit={meta.limit} total={meta.total} onPage={setPage} /></div>
      </Card>
      <ReviewModal applicant={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); reload(); }} />
      <EnrollModal open={enroll} ids={[...picked]} onClose={() => setEnroll(false)} onDone={() => { setEnroll(false); setPicked(new Set()); reload(); }} />
    </div>
  );
}
function ReviewModal({ applicant, onClose, onDone }: { applicant: Dict | null; onClose: () => void; onDone: () => void }) {
  const { has } = useAuth();
  const [d, setD] = useState<Dict | null>(null);
  const [note, setNote] = useState(''); const [score, setScore] = useState('');
  const majors = useAsyncOptions({ url: '/academic/majors', label: 'name' });
  const [major, setMajor] = useState('');
  const load = useCallback(() => { if (applicant) get<Dict>(`/ppdb/applicants/${applicant.id}`).then((x) => { setD(x); setScore(String(x.score ?? '')); setMajor(String(x.accepted_major_id ?? x.major_choice_1 ?? '')); }); else setD(null); }, [applicant]);
  useEffect(() => { load(); }, [load]);
  const setStatus = async (status: string) => { try { await post(`/ppdb/applicants/${applicant!.id}/status`, { status, note: note || null, accepted_major_id: major || null, score: score ? Number(score) : null }); toast.success(`Status: ${label(status)}`); onDone(); } catch (e) { toast.error(toApiError(e).message); } };
  const docStatus = async (docId: string, status: string) => { await put(`/ppdb/applicants/${applicant!.id}/documents/${docId}`, { status }); load(); };
  const canVerify = has('ppdb:verify');
  return (
    <Modal open={!!applicant} onClose={onClose} size="lg" title={d ? `${d.registration_no} — ${d.full_name}` : 'Pendaftar'} footer={canVerify && d ? <div className="flex flex-wrap gap-1">{d.status === 'SUBMITTED' && <><Button variant="danger" icon={<X className="h-4 w-4" />} onClick={() => setStatus('REJECTED')}>Tolak</Button><Button icon={<Check className="h-4 w-4" />} onClick={() => setStatus('VERIFIED')}>Verifikasi</Button></>}{['VERIFIED', 'WAITLIST'].includes(d.status as string) && <Button icon={<Check className="h-4 w-4" />} onClick={() => setStatus('ACCEPTED')}>Terima</Button>}{d.status === 'VERIFIED' && <Button variant="outline" onClick={() => setStatus('WAITLIST')}>Cadangan</Button>}{['VERIFIED', 'ACCEPTED', 'WAITLIST'].includes(d.status as string) && <Button variant="ghost" className="text-red-600" onClick={() => setStatus('REJECTED')}>Tolak</Button>}</div> : undefined}>
      {!d ? <Loading /> : <div className="space-y-4">
        <div className="flex items-center gap-2"><Badge tone={tone(d.status as string)}>{label(d.status as string)}</Badge><span className="text-xs text-ink-3">{d.period_name as string} · daftar {fmtDateTime(d.created_at as string)}</span></div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">{[['NISN', d.nisn], ['NIK', d.nik], ['L/P', d.gender], ['TTL', `${d.birth_place ?? ''} ${fmtDate(d.birth_date as string)}`], ['Asal sekolah', d.origin_school], ['Jalur', d.path], ['HP', d.phone], ['E-mail', d.email], ['Orang tua', `${d.parent_name ?? ''} ${d.parent_phone ?? ''}`], ['Pilihan 1', d.major1_name], ['Pilihan 2', d.major2_name], ['Alamat', d.address]].map(([k, v]) => <div key={String(k)}><dt className="text-[11px] uppercase text-ink-3">{String(k)}</dt><dd>{String(v ?? '-')}</dd></div>)}</dl>
        <div><div className="mb-1 text-xs font-semibold uppercase text-ink-3">Dokumen ({(d.documents as Dict[]).length})</div>{(d.documents as Dict[]).length === 0 ? <div className="text-sm text-ink-3">Belum ada dokumen diunggah.</div> : <ul className="divide-y divide-line rounded-xl border border-line">{(d.documents as Dict[]).map((doc) => <li key={doc.id as string} className="flex items-center gap-3 px-3 py-2 text-sm"><Paperclip className="h-4 w-4 text-ink-3" /><div className="min-w-0 flex-1"><div className="font-medium">{doc.doc_type as string}</div><a className="link text-xs" href={fileSrc(doc.url as string)} target="_blank" rel="noreferrer">{doc.original_name as string}</a></div><Badge tone={doc.status === 'VALID' ? 'green' : doc.status === 'INVALID' ? 'red' : 'gray'}>{doc.status as string}</Badge>{canVerify && <><Button size="icon" variant="ghost" icon={<Check className="h-4 w-4 text-emerald-600" />} onClick={() => docStatus(doc.id as string, 'VALID')} /><Button size="icon" variant="ghost" icon={<X className="h-4 w-4 text-red-600" />} onClick={() => docStatus(doc.id as string, 'INVALID')} /></>}</li>)}</ul>}</div>
        {canVerify && <div className="grid gap-3 sm:grid-cols-3"><Field label="Skor seleksi"><Input type="number" value={score} onChange={(e) => setScore(e.target.value)} /></Field><Field label="Jurusan diterima"><Select value={major} onChange={(e) => setMajor(e.target.value)} placeholder="—" options={majors} /></Field><Field label="Catatan"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>}
      </div>}
    </Modal>
  );
}
function EnrollModal({ open, ids, onClose, onDone }: { open: boolean; ids: string[]; onClose: () => void; onDone: () => void }) {
  const classes = useAsyncOptions({ url: '/academic/classes', params: { active_year: 1 }, label: 'name' });
  const [cls, setCls] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState<Dict | null>(null);
  const run = async () => { setBusy(true); try { const r = await post<Dict>('/ppdb/applicants/enroll', { applicant_ids: ids, class_id: cls || null }); setResult(r); toast.success(`${(r.enrolled as Dict[]).length} akun siswa dibuat`); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return <Modal open={open} onClose={() => { setResult(null); if (result) onDone(); else onClose(); }} title={`Daftarkan ${ids.length} calon siswa`} size="sm" footer={result ? <Button onClick={() => { setResult(null); onDone(); }}>Selesai</Button> : <Button loading={busy} onClick={run} icon={<Users className="h-4 w-4" />}>Buat akun siswa</Button>}>
    {result ? <div className="text-sm"><div className="mb-2 font-semibold">Akun dibuat ({(result.enrolled as Dict[]).length}) — simpan kata sandi sementara:</div><pre className="max-h-60 overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{(result.enrolled as Dict[]).map((e) => `${e.username}\t${e.temporary_password}`).join('\n')}</pre>{(result.errors as Dict[]).length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-red-600">{(result.errors as Dict[]).map((e, i) => <li key={i}>{e.message as string}</li>)}</ul>}</div>
      : <div className="space-y-3"><p className="text-sm text-ink-2">Akun SISWA dibuat dengan nama pengguna dari nama, kata sandi sementara, dan data induk dari formulir. Kredensial dikirim ke e-mail pendaftar (outbox).</p><Field label="Masukkan ke kelas (opsional)"><Select value={cls} onChange={(e) => setCls(e.target.value)} placeholder="— nanti —" options={classes} /></Field></div>}
  </Modal>;
}
function ApplicantSelf() {
  const [rows, setRows] = useState<Dict[] | null>(null);
  useEffect(() => { get<unknown>('/ppdb/applicants').then((d) => setRows((d as { data?: Dict[] }).data ?? [])); }, []);
  if (!rows) return <Loading />;
  return <div><PageHeader title="Pendaftaran Saya" />{rows.length === 0 ? <EmptyState title="Tidak ada pendaftaran terhubung ke akun ini" /> : rows.map((r) => <Card key={r.id as string} className="mb-3"><div className="flex items-center justify-between"><div><div className="font-semibold">{r.registration_no as string}</div><div className="text-xs text-ink-3">{r.period_name as string} · {r.major1_name as string}</div></div><Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge></div>{r.verification_note ? <p className="mt-2 text-sm">{r.verification_note as string}</p> : null}</Card>)}</div>;
}
