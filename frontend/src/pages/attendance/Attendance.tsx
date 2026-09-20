import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save, QrCode, Plus, ScanLine, CheckCircle2 } from 'lucide-react';
import { get, post, put, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Tabs, Avatar, Table, cx, Progress } from '@/components/ui';
import { ATT_LABEL, ATT_TONE, fmtDate, fmtDateTime, monthNow, todayStr, DAYS } from '@/lib/format';
import { Dict } from '@/lib/types';

const STATUSES = ['H', 'S', 'I', 'A', 'T'];

export default function Attendance() {
  const { has, hasRole, user } = useAuth();
  const [sp] = useSearchParams();
  const canWrite = has('attendance:write');
  if (hasRole('SISWA') && !canWrite) return <StudentView studentId="me" title="Absensi Saya" allowScan />;
  if (hasRole('WALI_MURID') && !canWrite) return <GuardianView initial={sp.get('student')} />;
  return <TeacherView initialClass={sp.get('class_id')} canWrite={canWrite} homeroom={user?.homeroom ?? []} teaching={user?.teaching ?? []} />;
}

function TeacherView({ initialClass, canWrite, homeroom, teaching }: { initialClass: string | null; canWrite: boolean; homeroom: { id: string; name: string }[]; teaching: { class_subject_id: string; class_name: string; subject_name: string; class_id: string }[] }) {
  const { hasRole } = useAuth();
  const admin = hasRole('ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'AUDITOR', 'BK');
  const [tab, setTab] = useState<'harian' | 'sesi' | 'rekap' | 'sekolah'>('harian');
  const [classes, setClasses] = useState<Dict[]>([]);
  const [classId, setClassId] = useState(initialClass ?? homeroom[0]?.id ?? teaching[0]?.class_id ?? '');
  useEffect(() => { get<unknown>('/academic/classes', { active_year: 1, limit: 200 }).then((d) => { const arr = (d as { data?: Dict[] }).data ?? []; setClasses(arr); if (!classId && arr[0]) setClassId(String(arr[0].id)); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const classOpts = (admin ? classes : classes.filter((c) => homeroom.some((h) => h.id === c.id) || teaching.some((t) => t.class_id === c.id))).map((c) => ({ value: String(c.id), label: String(c.name) }));
  return (
    <div>
      <PageHeader title="Absensi" subtitle="Absensi harian oleh wali kelas, absensi per pertemuan oleh guru mapel (manual atau QR)." />
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'harian', label: 'Harian (wali kelas)' }, { value: 'sesi', label: 'Per pertemuan' }, { value: 'rekap', label: 'Rekap kelas' }, ...(admin ? [{ value: 'sekolah' as const, label: 'Dashboard sekolah' }] : [])]} />
      {tab !== 'sesi' && tab !== 'sekolah' && <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="mb-4 w-full max-w-sm" placeholder="Pilih kelas" options={classOpts} />}
      {tab === 'harian' && classId && <DailySheet classId={classId} canWrite={canWrite && (admin || homeroom.some((h) => h.id === classId))} />}
      {tab === 'sesi' && <Sessions teaching={teaching} canWrite={canWrite} />}
      {tab === 'rekap' && classId && <ClassRecap classId={classId} />}
      {tab === 'sekolah' && <SchoolRecap />}
    </div>
  );
}

function DailySheet({ classId, canWrite }: { classId: string; canWrite: boolean }) {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<Dict[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setRows(null); get<{ students: Dict[] }>('/attendance/daily', { class_id: classId, date }).then((d) => setRows(d.students.map((s) => ({ ...s, status: s.status ?? 'H' })))).catch((e) => toast.error(toApiError(e).message)); }, [classId, date]);
  useEffect(() => { load(); }, [load]);
  const save = async () => { if (!rows) return; setBusy(true); try { await post('/attendance/daily', { class_id: classId, date, records: rows.map((r) => ({ student_id: r.student_id, status: r.status, note: r.note || null })) }); toast.success('Absensi disimpan'); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const setAll = (s: string) => setRows((r) => r?.map((x) => ({ ...x, status: s })) ?? null);
  if (!rows) return <Loading />;
  const counts = STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length] as const);
  return (
    <Card padded={false} title={<div className="flex items-center gap-3"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /><span className="text-xs text-ink-3">{fmtDate(date, 'EEEE, d MMM yyyy')}</span></div>} action={canWrite && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setAll('H')}>Semua hadir</Button><Button size="sm" loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button></div>}>
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2 text-xs">{counts.map(([s, n]) => <Badge key={s} tone={ATT_TONE[s]}>{ATT_LABEL[s]}: {n}</Badge>)}</div>
      <ul className="divide-y divide-line">{rows.map((r, i) => (
        <li key={r.student_id as string} className="flex flex-wrap items-center gap-3 px-4 py-2">
          <span className="w-6 text-xs text-ink-3">{i + 1}</span><Avatar name={r.full_name as string} src={r.avatar_url as string} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{r.full_name as string}</div><div className="text-[11px] text-ink-3">{r.nis as string}</div></div>
          <div className="flex gap-1">{STATUSES.map((s) => <button key={s} disabled={!canWrite} onClick={() => setRows((arr) => arr!.map((x) => (x.student_id === r.student_id ? { ...x, status: s } : x)))} className={cx('h-8 w-9 rounded-lg text-xs font-bold transition', r.status === s ? { H: 'bg-emerald-500 text-white', S: 'bg-amber-500 text-white', I: 'bg-sky-500 text-white', A: 'bg-red-500 text-white', T: 'bg-violet-500 text-white' }[s] : 'bg-surface-3 text-ink-2')}>{s}</button>)}</div>
          {r.status !== 'H' && <Input placeholder="Catatan" disabled={!canWrite} className="h-8 w-40 text-xs" value={String(r.note ?? '')} onChange={(e) => setRows((arr) => arr!.map((x) => (x.student_id === r.student_id ? { ...x, note: e.target.value } : x)))} />}
        </li>
      ))}</ul>
    </Card>
  );
}

function Sessions({ teaching, canWrite }: { teaching: { class_subject_id: string; class_name: string; subject_name: string }[]; canWrite: boolean }) {
  const [cs, setCs] = useState(teaching[0]?.class_subject_id ?? '');
  const [rows, setRows] = useState<Dict[]>([]);
  const [open, setOpen] = useState<Dict | null | 'new'>(null);
  const [allCs, setAllCs] = useState<Dict[]>([]);
  const { hasRole } = useAuth();
  const admin = hasRole('ADMIN_SEKOLAH', 'KEPSEK', 'WAKEPSEK', 'AUDITOR', 'BK');
  useEffect(() => { if (admin) get<Dict[]>('/academic/class-subjects').then((d) => { setAllCs(d); if (!cs && d[0]) setCs(String(d[0].id)); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [admin]);
  const load = useCallback(() => get<unknown>('/attendance/sessions', { class_subject_id: cs || undefined, limit: 50 }).then((d) => setRows((d as { data?: Dict[] }).data ?? [])), [cs]);
  useEffect(() => { load(); }, [load]);
  const opts = admin ? allCs.map((x) => ({ value: String(x.id), label: `${x.class_name} · ${x.subject_name}` })) : teaching.map((t) => ({ value: t.class_subject_id, label: `${t.class_name} · ${t.subject_name}` }));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2"><Select value={cs} onChange={(e) => setCs(e.target.value)} className="w-full max-w-sm" placeholder="Pilih kelas & mapel" options={opts} />{canWrite && cs && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen('new')}>Sesi baru</Button>}</div>
      <Card padded={false}><Table<Dict> rows={rows} onRowClick={(r) => setOpen(r)} columns={[{ key: 'date', header: 'Tanggal', render: (r) => fmtDate(r.date as string) }, { key: 'meeting_no', header: 'Pertemuan', className: 'text-center' }, { key: 'topic', header: 'Topik' }, { key: 'method', header: 'Metode', render: (r) => <Badge tone={r.method === 'QR' ? 'blue' : 'gray'}>{r.method as string}</Badge> }, { key: 'present_count', header: 'Hadir', render: (r) => <div className="flex items-center gap-2"><Progress value={(Number(r.present_count) / Math.max(1, Number(r.student_count))) * 100} className="w-20" tone="green" /><span className="text-xs">{r.present_count as number}/{r.student_count as number}</span></div> }, { key: 'closed_at', header: 'Status', render: (r) => <Badge tone={r.closed_at ? 'gray' : 'green'}>{r.closed_at ? 'Ditutup' : 'Terbuka'}</Badge> }]} empty="Belum ada sesi" /></Card>
      <SessionModal open={open !== null} session={open === 'new' ? null : open} csId={cs} onClose={() => setOpen(null)} onChange={load} canWrite={canWrite} />
    </div>
  );
}
function SessionModal({ open, session, csId, onClose, onChange, canWrite }: { open: boolean; session: Dict | null; csId: string; onClose: () => void; onChange: () => void; canWrite: boolean }) {
  const [view, setView] = useState<Dict | null>(null);
  const [f, setF] = useState({ date: todayStr(), topic: '', method: 'MANUAL', geo: false, lat: '', lng: '', radius: '100' });
  const [qr, setQr] = useState<{ qr: string; expires_in: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (session) get<Dict>(`/attendance/sessions/${session.id}`).then(setView); }, [session]);
  useEffect(() => { if (open) { setQr(null); setView(null); if (session) load(); else setF({ date: todayStr(), topic: '', method: 'MANUAL', geo: false, lat: '', lng: '', radius: '100' }); } }, [open, session, load]);
  useEffect(() => { if (!qr || !view || view.closed_at) return; const t = setInterval(() => refreshQr(), 30_000); return () => clearInterval(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [qr, view]);
  const refreshQr = async () => { if (!view) return; try { setQr(await get(`/attendance/sessions/${view.id}/qr`)); load(); } catch (e) { toast.error(toApiError(e).message); } };
  const create = async () => { setBusy(true); try { await post('/attendance/sessions', { class_subject_id: csId, date: f.date, topic: f.topic || null, method: f.method, geo_lat: f.geo && f.lat ? Number(f.lat) : null, geo_lng: f.geo && f.lng ? Number(f.lng) : null, geo_radius_m: f.geo ? Number(f.radius) : null }); toast.success('Sesi dibuat'); onChange(); onClose(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const setStatus = (sid: string, s: string) => setView((v) => v ? { ...v, students: (v.students as Dict[]).map((x) => (x.student_id === sid ? { ...x, status: s } : x)) } : v);
  const save = async (close = false) => { if (!view) return; setBusy(true); try { await put(`/attendance/sessions/${view.id}`, { records: (view.students as Dict[]).map((s) => ({ student_id: s.student_id, status: s.status ?? 'A' })), close }); toast.success('Tersimpan'); onChange(); if (close) onClose(); else load(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const useMyLocation = () => navigator.geolocation?.getCurrentPosition((p) => setF((s) => ({ ...s, lat: String(p.coords.latitude), lng: String(p.coords.longitude) })), () => toast.error('Lokasi tidak tersedia'));
  return (
    <Modal open={open} onClose={onClose} size={session ? 'xl' : 'md'} title={session ? `Pertemuan ${view?.meeting_no ?? ''} · ${fmtDate(String(session.date))}` : 'Sesi pertemuan baru'} footer={session ? (canWrite && view && !view.closed_at ? <><Button variant="outline" loading={busy} onClick={() => save(false)}>Simpan</Button><Button loading={busy} onClick={() => save(true)}>Simpan & tutup sesi</Button></> : <Button variant="outline" onClick={onClose}>Tutup</Button>) : <><Button variant="outline" onClick={onClose}>Batal</Button><Button loading={busy} onClick={create}>Buat sesi</Button></>}>
      {!session ? (
        <div className="space-y-3"><Field label="Tanggal"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Topik / materi"><Input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></Field><Field label="Metode"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={[{ value: 'MANUAL', label: 'Manual (guru mencentang)' }, { value: 'QR', label: 'QR (siswa memindai)' }]} /></Field>
          {f.method === 'QR' && <div className="rounded-xl border border-line p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.geo} onChange={(e) => setF({ ...f, geo: e.target.checked })} /> Batasi lokasi (geofence)</label>{f.geo && <div className="mt-2 grid grid-cols-3 gap-2"><Input placeholder="Lat" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /><Input placeholder="Lng" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} /><Input placeholder="Radius (m)" value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} /><Button size="sm" variant="outline" className="col-span-3" onClick={useMyLocation}>Pakai lokasi saya</Button></div>}</div>}
        </div>
      ) : !view ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div><div className="mb-2 text-sm text-ink-2">{view.class_name as string} · {view.subject_name as string}{view.topic ? ` · ${view.topic}` : ''}</div>
            <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">{(view.students as Dict[]).map((s) => <li key={s.student_id as string} className="flex items-center gap-3 px-3 py-2"><Avatar name={s.full_name as string} src={s.avatar_url as string} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm">{s.full_name as string}</div>{s.checked_at ? <div className="text-[10px] text-ink-3">{s.method as string} · {fmtDateTime(s.checked_at as string)}</div> : null}</div><div className="flex gap-1">{STATUSES.map((st) => <button key={st} disabled={!canWrite || !!view.closed_at} onClick={() => setStatus(s.student_id as string, st)} className={cx('h-7 w-8 rounded-md text-[11px] font-bold', (s.status ?? 'A') === st ? { H: 'bg-emerald-500 text-white', S: 'bg-amber-500 text-white', I: 'bg-sky-500 text-white', A: 'bg-red-500 text-white', T: 'bg-violet-500 text-white' }[st] : 'bg-surface-3 text-ink-2')}>{st}</button>)}</div></li>)}</ul>
          </div>
          {view.method === 'QR' && canWrite && !view.closed_at && <div className="text-center"><div className="mb-2 text-xs font-semibold uppercase text-ink-3">QR absensi</div>{qr ? <img src={qr.qr} alt="QR" className="mx-auto w-56 rounded-xl border border-line" /> : <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-line"><Button variant="outline" icon={<QrCode className="h-4 w-4" />} onClick={refreshQr}>Tampilkan QR</Button></div>}<p className="mt-2 text-[11px] text-ink-3">Token berganti tiap 30 detik. Siswa memindai lewat menu Absensi.</p>{qr && <Button size="sm" variant="ghost" onClick={refreshQr}>Perbarui</Button>}</div>}
        </div>
      )}
    </Modal>
  );
}

function ClassRecap({ classId }: { classId: string }) {
  const [month, setMonth] = useState(monthNow());
  const [d, setD] = useState<Dict | null>(null);
  useEffect(() => { setD(null); get<Dict>(`/attendance/recap/class/${classId}`, { month }).then(setD).catch((e) => toast.error(toApiError(e).message)); }, [classId, month]);
  if (!d) return <Loading />;
  const days = (d.days as string[]).map((x) => String(x).slice(0, 10));
  const matrix = new Map<string, string>();
  for (const m of d.matrix as Dict[]) matrix.set(`${m.student_id}|${String(m.date).slice(0, 10)}`, String(m.status));
  return (
    <Card padded={false} title={<div className="flex items-center gap-3"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" /><span>{(d.class as Dict).name as string}</span></div>}>
      <div className="overflow-x-auto"><table className="text-xs"><thead><tr className="border-b border-line bg-surface-2"><th className="sticky left-0 bg-surface-2 px-3 py-2 text-left">Siswa</th>{days.map((day) => <th key={day} className="px-1 py-2 font-normal text-ink-3">{day.slice(8)}</th>)}<th className="px-2 py-2">H</th><th className="px-2 py-2">S</th><th className="px-2 py-2">I</th><th className="px-2 py-2">A</th><th className="px-2 py-2">%</th></tr></thead>
        <tbody>{(d.students as Dict[]).map((s) => <tr key={s.student_id as string} className="border-b border-line last:border-0"><td className="sticky left-0 bg-surface px-3 py-1.5 font-medium whitespace-nowrap">{s.full_name as string}</td>{days.map((day) => { const st = matrix.get(`${s.student_id}|${day}`); return <td key={day} className="px-1 py-1.5 text-center"><span className={cx('inline-block h-5 w-5 rounded text-[10px] font-bold leading-5', st ? { H: 'bg-emerald-100 text-emerald-800', S: 'bg-amber-100 text-amber-800', I: 'bg-sky-100 text-sky-800', A: 'bg-red-100 text-red-800', T: 'bg-violet-100 text-violet-800' }[st] : 'bg-surface-3 text-ink-3')}>{st ?? '·'}</span></td>; })}<td className="px-2 text-center">{s.H as number}</td><td className="px-2 text-center">{s.S as number}</td><td className="px-2 text-center">{s.I as number}</td><td className="px-2 text-center text-red-600">{s.A as number}</td><td className="px-2 text-center font-semibold">{Number(s.total) ? Math.round((Number(s.H) / Number(s.total)) * 100) : '-'}</td></tr>)}</tbody></table></div>
    </Card>
  );
}
function SchoolRecap() {
  const [month, setMonth] = useState(monthNow());
  const [d, setD] = useState<Dict | null>(null);
  useEffect(() => { get<Dict>('/attendance/recap/school', { month }).then(setD); }, [month]);
  if (!d) return <Loading />;
  return <Card padded={false} title={<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />}><Table<Dict> rows={d.classes as Dict[]} columns={[{ key: 'name', header: 'Kelas' }, { key: 'total', header: 'Catatan', className: 'text-center' }, { key: 'H', header: 'Hadir', className: 'text-center' }, { key: 'S', header: 'Sakit', className: 'text-center' }, { key: 'I', header: 'Izin', className: 'text-center' }, { key: 'A', header: 'Alpa', className: 'text-center' }, { key: 'present_rate', header: 'Kehadiran', render: (r) => r.present_rate === null ? '-' : <div className="flex items-center gap-2"><Progress value={Number(r.present_rate)} className="w-24" tone={Number(r.present_rate) >= 90 ? 'green' : 'amber'} /><span>{r.present_rate as number}%</span></div> }]} /></Card>;
}

export function StudentView({ studentId, title, allowScan }: { studentId: string; title?: string; allowScan?: boolean }) {
  const [month, setMonth] = useState(monthNow());
  const [d, setD] = useState<Dict | null>(null);
  const [scan, setScan] = useState(false);
  useEffect(() => { setD(null); get<Dict>(`/attendance/recap/student/${studentId}`, { month }).then(setD).catch((e) => toast.error(toApiError(e).message)); }, [studentId, month]);
  const s = (d?.summary as Dict) ?? {};
  return (
    <div>
      {title && <PageHeader title={title} actions={<div className="flex gap-2"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />{allowScan && <Button icon={<ScanLine className="h-4 w-4" />} onClick={() => setScan(true)}>Pindai QR</Button>}</div>} />}
      {!d ? <Loading /> : <>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{STATUSES.map((k) => <div key={k} className="card p-3"><div className="text-xs text-ink-3">{ATT_LABEL[k]}</div><div className="text-2xl font-bold">{String(s[k] ?? 0)}</div></div>)}</div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card padded={false} title="Absensi harian">{(d.daily as Dict[]).length === 0 ? <div className="p-6"><EmptyState title="Belum ada data" /></div> : <ul className="divide-y divide-line">{(d.daily as Dict[]).map((x, i) => <li key={i} className="flex items-center justify-between px-4 py-2 text-sm"><span>{fmtDate(x.date as string, 'EEE, d MMM')}</span><span className="flex items-center gap-2">{x.note ? <span className="text-xs text-ink-3">{x.note as string}</span> : null}<Badge tone={ATT_TONE[x.status as string]}>{ATT_LABEL[x.status as string]}</Badge></span></li>)}</ul>}</Card>
          <Card padded={false} title="Absensi per pertemuan">{(d.sessions as Dict[]).length === 0 ? <div className="p-6"><EmptyState title="Belum ada data" /></div> : <ul className="divide-y divide-line">{(d.sessions as Dict[]).map((x, i) => <li key={i} className="flex items-center justify-between px-4 py-2 text-sm"><span><span className="font-medium">{x.subject_name as string}</span><span className="block text-xs text-ink-3">{fmtDate(x.date as string)}{x.topic ? ` · ${x.topic}` : ''}</span></span><Badge tone={ATT_TONE[x.status as string]}>{ATT_LABEL[x.status as string]}</Badge></li>)}</ul>}</Card>
        </div>
      </>}
      <ScanModal open={scan} onClose={() => setScan(false)} />
    </div>
  );
}
function ScanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<Dict | null>(null);
  const submit = async () => {
    setBusy(true);
    try {
      const payload = JSON.parse(code) as { s: string; t: string };
      const loc = await new Promise<{ lat?: number; lng?: number }>((res) => { if (!navigator.geolocation) return res({}); navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 4000 }); });
      const r = await post<Dict>('/attendance/checkin', { ...payload, ...loc }); setOk(r); toast.success('Kehadiran tercatat');
    } catch (e) { toast.error((e as Error).name === 'SyntaxError' ? 'Kode QR tidak valid' : toApiError(e).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={() => { setOk(null); setCode(''); onClose(); }} title="Absensi via QR" size="sm">
      {ok ? <div className="py-4 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" /><div className="mt-2 font-semibold">Hadir tercatat</div><div className="text-sm text-ink-2">{(ok.session as Dict).topic as string}</div></div> : <div className="space-y-3"><p className="text-sm text-ink-2">Pindai QR yang ditampilkan guru dengan kamera HP, lalu tempel isinya di sini (atau buka tautan hasil pindai).</p><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder='{"s":"...","t":"..."}' /><Button className="w-full" loading={busy} onClick={submit} icon={<ScanLine className="h-4 w-4" />}>Kirim kehadiran</Button></div>}
    </Modal>
  );
}
function GuardianView({ initial }: { initial: string | null }) {
  const { user } = useAuth();
  const kids = user?.children ?? [];
  const [sid, setSid] = useState(initial ?? kids[0]?.id ?? '');
  if (!kids.length) return <EmptyState title="Belum ada anak yang ditautkan" />;
  return <div><PageHeader title="Absensi anak" actions={<Select value={sid} onChange={(e) => setSid(e.target.value)} options={kids.map((k) => ({ value: k.id, label: k.full_name }))} />} />{sid && <StudentView studentId={sid} />}</div>;
}
export const _d = DAYS;
