import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileDown, RefreshCw, Send, Check, X, Pencil, Settings2, Save, Trash2 } from 'lucide-react';
import { get, post, put, toApiError, downloadFile } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Table, Tabs, Textarea } from '@/components/ui';
import { fmtDateTime, fmtScore, label, tone } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function Rapor() {
  const { has, hasRole, user } = useAuth();
  const [sp] = useSearchParams();
  const canWrite = has('rapor:write');
  if (hasRole('SISWA') && !canWrite) return <MyRapor studentId="me" title="e-Rapor Saya" />;
  if (hasRole('WALI_MURID') && !canWrite) return <GuardianRapor initial={sp.get('student')} kids={user?.children ?? []} />;
  return <TeacherRapor />;
}

function TeacherRapor() {
  const { has, hasRole, user } = useAuth();
  const admin = hasRole('ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'AUDITOR');
  const [tab, setTab] = useState<'kelas' | 'pengesahan' | 'pengaturan'>(has('rapor:approve') && !has('rapor:write') ? 'pengesahan' : 'kelas');
  const [classes, setClasses] = useState<Dict[]>([]);
  const [classId, setClassId] = useState(user?.homeroom?.[0]?.id ?? '');
  const [semester, setSemester] = useState('1');
  useEffect(() => { get<unknown>('/academic/classes', { active_year: 1, limit: 200 }).then((d) => { const arr = ((d as { data?: Dict[] }).data ?? []).filter((c) => admin || user?.homeroom?.some((h) => h.id === c.id)); setClasses(arr); if (!classId && arr[0]) setClassId(String(arr[0].id)); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <div>
      <PageHeader title="e-Rapor" subtitle="Konsolidasi nilai → rapor per siswa → pengesahan kepala sekolah → PDF." />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'kelas', label: 'Rapor kelas' }, ...(has('rapor:approve') ? [{ value: 'pengesahan' as const, label: 'Pengesahan' }] : []), ...(has('rapor:write') && admin ? [{ value: 'pengaturan' as const, label: 'Pengaturan' }] : [])]} />
      {tab === 'kelas' && <><div className="mb-4 flex flex-wrap gap-2"><Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-56" placeholder="Pilih kelas" options={classes.map((c) => ({ value: String(c.id), label: String(c.name) }))} /><Select value={semester} onChange={(e) => setSemester(e.target.value)} className="w-40" options={[{ value: '1', label: 'Semester Ganjil' }, { value: '2', label: 'Semester Genap' }]} /></div>{classId ? <ClassRapor classId={classId} semester={Number(semester)} /> : <EmptyState title="Pilih kelas" />}</>}
      {tab === 'pengesahan' && <Approvals />}
      {tab === 'pengaturan' && <RaporSettings />}
    </div>
  );
}

function ClassRapor({ classId, semester }: { classId: string; semester: number }) {
  const { has } = useAuth();
  const [d, setD] = useState<{ class: Dict; cards: Dict[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Dict | null>(null);
  const load = useCallback(() => get<{ class: Dict; cards: Dict[] }>(`/rapor/class/${classId}`, { semester }).then(setD).catch((e) => toast.error(toApiError(e).message)), [classId, semester]);
  useEffect(() => { setD(null); load(); }, [load]);
  if (!d) return <Loading />;
  const gen = async () => { setBusy(true); try { const r = await post<Dict>('/rapor/generate', { class_id: classId, semester }); toast.success(`${r.generated} rapor dibuat/diperbarui`); load(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const submit = async () => { if (!confirm('Kirim seluruh rapor kelas ini ke kepala sekolah untuk disahkan?')) return; try { const r = await post<Dict>(`/rapor/class/${classId}/submit`, { semester }); toast.success(`${r.submitted} rapor dikirim`); load(); } catch (e) { toast.error(toApiError(e).message); } };
  const counts = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0 } as Record<string, number>;
  for (const c of d.cards) counts[c.status as string] = (counts[c.status as string] ?? 0) + 1;
  return (
    <Card padded={false} title={<span>{d.class.name as string} · Semester {semester} <span className="ml-2 text-xs font-normal text-ink-3">Draf {counts.DRAFT ?? 0} · Diajukan {counts.SUBMITTED ?? 0} · Sah {counts.APPROVED ?? 0}</span></span>} action={has('rapor:write') && <div className="flex gap-2"><Button size="sm" variant="outline" loading={busy} icon={<RefreshCw className="h-4 w-4" />} onClick={gen}>{d.cards.length ? 'Perbarui nilai' : 'Buat rapor'}</Button>{counts.DRAFT > 0 && <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={submit}>Ajukan pengesahan</Button>}</div>}>
      <Table<Dict> rows={d.cards} columns={[
        { key: 'full_name', header: 'Siswa', render: (r) => <div><div className="font-medium">{r.full_name as string}</div><div className="text-xs text-ink-3">{r.nis as string}</div></div> },
        { key: 'average', header: 'Rata-rata', render: (r) => <b>{fmtScore(r.average as number)}</b> }, { key: 'rank_in_class', header: 'Peringkat', className: 'text-center' },
        { key: 'attendance', header: 'S / I / A', render: (r) => `${r.attendance_sick} / ${r.attendance_permit} / ${r.attendance_absent}` },
        { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> },
        { key: 'x', header: '', render: (r) => <div className="flex gap-1"><Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(r)}>{r.status === 'APPROVED' ? 'Lihat' : 'Isi'}</Button><Button size="sm" variant="ghost" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/rapor/${r.id}/pdf?download=1`, `rapor-${r.full_name}.pdf`)} /></div> },
      ]} empty="Belum ada rapor — klik 'Buat rapor' untuk mengonsolidasi nilai." />
      <CardEditor card={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </Card>
  );
}

function CardEditor({ card, onClose, onSaved }: { card: Dict | null; onClose: () => void; onSaved: () => void }) {
  const { has } = useAuth();
  const [d, setD] = useState<Dict | null>(null);
  const [note, setNote] = useState('');
  const [promoted, setPromoted] = useState<string>('');
  const [subjects, setSubjects] = useState<Dict[]>([]);
  const [p5, setP5] = useState<Dict[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!card) { setD(null); return; } get<Dict>(`/rapor/${card.id}`).then((x) => { setD(x); setNote(String(x.homeroom_note ?? '')); setPromoted(x.promoted === null || x.promoted === undefined ? '' : x.promoted ? '1' : '0'); setSubjects((x.subjects as Dict[]).map((s) => ({ ...s }))); setP5((x.p5 as Dict[]).map((p) => ({ ...p }))); }); }, [card]);
  const readOnly = !has('rapor:write') || d?.status === 'APPROVED';
  const save = async () => { if (!d) return; setBusy(true); try { await put(`/rapor/${d.id}`, { homeroom_note: note || null, promoted: promoted === '' ? null : promoted === '1', subjects: subjects.map((s) => ({ id: s.id, description: s.description, final_score: Number(s.final_score) })), p5: p5.map((p) => ({ project_title: p.project_title, theme: p.theme || null, dimensions: p.dimensions ?? [], note: p.note || null })) }); toast.success('Rapor disimpan'); onSaved(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={!!card} onClose={onClose} size="xl" title={d ? `Rapor ${d.full_name} — ${d.class_name} S${d.semester}` : 'Rapor'} footer={<><Button variant="outline" icon={<FileDown className="h-4 w-4" />} onClick={() => d && downloadFile(`/rapor/${d.id}/pdf?download=1`, `rapor-${d.full_name}.pdf`)}>PDF</Button>{!readOnly && <Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button>}</>}>
      {!d ? <Loading /> : <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-ink-3">Rata-rata</div><b>{fmtScore(d.average as number)}</b></div><div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-ink-3">Peringkat</div><b>{String(d.rank_in_class ?? '-')}</b></div><div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-ink-3">S / I / A</div><b>{d.attendance_sick as number} / {d.attendance_permit as number} / {d.attendance_absent as number}</b></div><div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-ink-3">Status</div><Badge tone={tone(d.status as string)}>{label(d.status as string)}</Badge></div></div>
        <div><div className="mb-1 text-xs font-semibold uppercase text-ink-3">Nilai mata pelajaran</div><div className="overflow-x-auto rounded-xl border border-line"><table className="w-full text-sm"><thead><tr className="bg-surface-2 text-left text-xs uppercase text-ink-3"><th className="px-3 py-2">Mapel</th><th className="px-3 py-2 text-center">Nilai</th><th className="px-3 py-2 text-center">Pred.</th><th className="px-3 py-2">Deskripsi</th></tr></thead><tbody>{subjects.map((s, i) => <tr key={s.id as string} className="border-t border-line"><td className="px-3 py-2">{s.subject_name as string}<div className="text-[10px] text-ink-3">{s.category as string}</div></td><td className="px-3 py-2 text-center"><Input type="number" disabled={readOnly} className="h-8 w-20 text-center" value={String(s.final_score)} onChange={(e) => setSubjects((arr) => arr.map((x, j) => (j === i ? { ...x, final_score: e.target.value } : x)))} /></td><td className="px-3 py-2 text-center"><Badge tone="brand">{s.predicate as string}</Badge></td><td className="px-3 py-2"><Input disabled={readOnly} className="h-8" value={String(s.description ?? '')} onChange={(e) => setSubjects((arr) => arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></td></tr>)}</tbody></table></div></div>
        <div><div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold uppercase text-ink-3">Projek P5</span>{!readOnly && <Button size="sm" variant="ghost" onClick={() => setP5((a) => [...a, { project_title: '', theme: '', dimensions: [{ name: 'Beriman & bertakwa', level: 'Berkembang' }, { name: 'Bergotong royong', level: 'Berkembang' }, { name: 'Bernalar kritis', level: 'Berkembang' }], note: '' }])}>+ Projek</Button>}</div>
          {p5.length === 0 ? <div className="text-xs text-ink-3">Belum ada projek P5.</div> : p5.map((p, i) => <div key={i} className="mb-2 rounded-xl border border-line p-3"><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input disabled={readOnly} placeholder="Judul projek" value={String(p.project_title ?? '')} onChange={(e) => setP5((a) => a.map((x, j) => (j === i ? { ...x, project_title: e.target.value } : x)))} /><Input disabled={readOnly} placeholder="Tema" value={String(p.theme ?? '')} onChange={(e) => setP5((a) => a.map((x, j) => (j === i ? { ...x, theme: e.target.value } : x)))} />{!readOnly && <Button size="icon" variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-500" />} onClick={() => setP5((a) => a.filter((_, j) => j !== i))} />}</div><div className="mt-2 grid gap-2 sm:grid-cols-3">{((p.dimensions as Dict[]) ?? []).map((dm, k) => <div key={k} className="flex items-center gap-2 text-xs"><span className="flex-1 truncate">{dm.name as string}</span><Select disabled={readOnly} className="w-40" value={String(dm.level)} onChange={(e) => setP5((a) => a.map((x, j) => (j === i ? { ...x, dimensions: (x.dimensions as Dict[]).map((y, l) => (l === k ? { ...y, level: e.target.value } : y)) } : x)))} options={['Mulai Berkembang', 'Berkembang', 'Berkembang Sesuai Harapan', 'Sangat Berkembang'].map((v) => ({ value: v, label: v }))} /></div>)}</div><Input disabled={readOnly} className="mt-2 h-8" placeholder="Catatan projek" value={String(p.note ?? '')} onChange={(e) => setP5((a) => a.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} /></div>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]"><Field label="Catatan wali kelas"><Textarea disabled={readOnly} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>{d.semester === 2 && <Field label="Keputusan kenaikan"><Select disabled={readOnly} value={promoted} onChange={(e) => setPromoted(e.target.value)} placeholder="—" options={[{ value: '1', label: 'Naik kelas' }, { value: '0', label: 'Tidak naik' }]} /></Field>}</div>
      </div>}
    </Modal>
  );
}
function Approvals() {
  const [rows, setRows] = useState<Dict[] | null>(null);
  const load = useCallback(() => get<Dict[]>('/rapor/pending').then(setRows), []);
  useEffect(() => { load(); }, [load]);
  const act = async (r: Dict, approve: boolean) => { try { const x = await post<Dict>(`/rapor/class/${r.class_id}/approve`, { semester: r.semester, approve }); toast.success(`${x.updated} rapor ${approve ? 'disahkan' : 'dikembalikan'}`); load(); } catch (e) { toast.error(toApiError(e).message); } };
  if (!rows) return <Loading />;
  return <Card padded={false} title="Menunggu pengesahan"><Table<Dict> rows={rows} rowKey={(r) => `${r.class_id}-${r.semester}`} columns={[{ key: 'class_name', header: 'Kelas' }, { key: 'semester', header: 'Semester', className: 'text-center' }, { key: 'academic_year', header: 'TA' }, { key: 'homeroom_name', header: 'Wali kelas' }, { key: 'count', header: 'Rapor', className: 'text-center' }, { key: 'x', header: '', render: (r) => <div className="flex gap-1"><Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => act(r, false)}>Kembalikan</Button><Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => act(r, true)}>Sahkan</Button></div> }]} empty="Tidak ada rapor yang menunggu pengesahan" /></Card>;
}
function RaporSettings() {
  const [s, setS] = useState<Dict | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<Dict>('/rapor/settings').then(setS); }, []);
  if (!s) return <Loading />;
  const scale = (s.predicate_scale as Dict[]) ?? [];
  const save = async () => { setBusy(true); try { await put('/rapor/settings', { kkm: Number(s.kkm), predicate_scale: scale.map((x) => ({ min: Number(x.min), predicate: String(x.predicate), description: String(x.description) })), signature_principal: s.signature_principal || null, signature_city: s.signature_city || null }); toast.success('Pengaturan disimpan'); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Card title={<span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Pengaturan rapor</span>} action={<Button size="sm" loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button>}>
      <div className="grid gap-4 sm:grid-cols-3"><Field label="KKM"><Input type="number" value={String(s.kkm ?? 75)} onChange={(e) => setS({ ...s, kkm: e.target.value })} /></Field><Field label="Nama kepala sekolah (tanda tangan)"><Input value={String(s.signature_principal ?? '')} onChange={(e) => setS({ ...s, signature_principal: e.target.value })} /></Field><Field label="Kota (tanda tangan)"><Input value={String(s.signature_city ?? '')} onChange={(e) => setS({ ...s, signature_city: e.target.value })} /></Field></div>
      <div className="mt-4"><div className="mb-1 text-xs font-semibold uppercase text-ink-3">Skala predikat</div>{scale.map((x, i) => <div key={i} className="mb-2 grid grid-cols-[80px_80px_1fr_auto] gap-2"><Input type="number" value={String(x.min)} onChange={(e) => setS({ ...s, predicate_scale: scale.map((y, j) => (j === i ? { ...y, min: e.target.value } : y)) })} /><Input value={String(x.predicate)} onChange={(e) => setS({ ...s, predicate_scale: scale.map((y, j) => (j === i ? { ...y, predicate: e.target.value } : y)) })} /><Input value={String(x.description)} onChange={(e) => setS({ ...s, predicate_scale: scale.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)) })} /><Button size="icon" variant="ghost" icon={<Trash2 className="h-4 w-4 text-red-500" />} onClick={() => setS({ ...s, predicate_scale: scale.filter((_, j) => j !== i) })} /></div>)}<Button size="sm" variant="outline" onClick={() => setS({ ...s, predicate_scale: [...scale, { min: 0, predicate: 'E', description: '' }] })}>+ Baris</Button></div>
    </Card>
  );
}
export function MyRapor({ studentId, title }: { studentId: string; title?: string }) {
  const [rows, setRows] = useState<Dict[] | null>(null);
  const [view, setView] = useState<Dict | null>(null);
  useEffect(() => { setRows(null); get<Dict[]>(`/rapor/student/${studentId}`).then(setRows); }, [studentId]);
  if (!rows) return <Loading />;
  return (
    <div>{title && <PageHeader title={title} />}
      {rows.length === 0 ? <EmptyState title="Belum ada rapor yang terbit" /> : <div className="grid gap-3 sm:grid-cols-2">{rows.map((r) => <Card key={r.id as string}><div className="flex items-center justify-between"><div><div className="font-semibold">{r.academic_year as string} · Semester {r.semester as number}</div><div className="text-xs text-ink-3">{r.class_name as string} · Wali {r.homeroom_name as string}</div></div><Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge></div><div className="mt-3 flex items-end justify-between"><div><div className="text-xs text-ink-3">Rata-rata</div><div className="text-3xl font-extrabold text-brand-700">{fmtScore(r.average as number)}</div><div className="text-xs text-ink-2">Peringkat {String(r.rank_in_class ?? '-')}{r.approved_at ? ` · disahkan ${fmtDateTime(r.approved_at as string)}` : ''}</div></div><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setView(r)}>Detail</Button><Button size="sm" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/rapor/${r.id}/pdf?download=1`, `rapor-S${r.semester}.pdf`)}>PDF</Button></div></div></Card>)}</div>}
      <CardEditor card={view} onClose={() => setView(null)} onSaved={() => setView(null)} />
    </div>
  );
}
function GuardianRapor({ initial, kids }: { initial: string | null; kids: { id: string; full_name: string }[] }) {
  const [sid, setSid] = useState(initial ?? kids[0]?.id ?? '');
  if (!kids.length) return <EmptyState title="Belum ada anak yang ditautkan" />;
  return <div><PageHeader title="e-Rapor anak" actions={<Select value={sid} onChange={(e) => setSid(e.target.value)} options={kids.map((k) => ({ value: k.id, label: k.full_name }))} />} />{sid && <MyRapor studentId={sid} />}</div>;
}
