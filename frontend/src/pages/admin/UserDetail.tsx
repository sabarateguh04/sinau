import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Power, Save, Link2, Trash2 } from 'lucide-react';
import { get, put, post, del, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Avatar, Badge, Button, Card, Field, Input, Loading, Modal, Select, Tabs, Table, useDebounce } from '@/components/ui';
import { fmtDateTime, label, tone } from '@/lib/format';
import { Dict, ROLE_LABELS, Role } from '@/lib/types';
import { RolePicker } from './Users';

const STUDENT_FIELDS: [string, string, string?][] = [['nis', 'NIS'], ['nisn', 'NISN'], ['nik', 'NIK'], ['birth_place', 'Tempat lahir'], ['birth_date', 'Tanggal lahir', 'date'], ['religion', 'Agama'], ['entry_year', 'Tahun masuk', 'number'], ['status', 'Status', 'select'], ['parent_name', 'Nama orang tua'], ['parent_phone', 'HP orang tua'], ['blood_type', 'Gol. darah'], ['address', 'Alamat', 'textarea']];
const STAFF_FIELDS: [string, string, string?][] = [['nip', 'NIP'], ['nuptk', 'NUPTK'], ['nik', 'NIK'], ['employment_status', 'Status kepegawaian', 'select'], ['join_date', 'Tanggal masuk', 'date'], ['birth_date', 'Tanggal lahir', 'date'], ['birth_place', 'Tempat lahir'], ['education', 'Pendidikan terakhir'], ['npwp', 'NPWP'], ['ptkp_status', 'Status PTKP'], ['bank_name', 'Bank'], ['bank_account', 'No. rekening'], ['address', 'Alamat', 'textarea']];

export default function UserDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const [u, setU] = useState<Dict | null>(null);
  const [tab, setTab] = useState<'akun' | 'profil' | 'akses' | 'relasi'>('akun');
  const [f, setF] = useState<Dict>({});
  const [sp, setSp] = useState<Dict>({});
  const [st, setSt] = useState<Dict>({});
  const [busy, setBusy] = useState(false);
  const [tmp, setTmp] = useState<string | null>(null);
  const canWrite = has('user:write');
  const load = useCallback(() => get<Dict>(`/users/${id}`).then((d) => { setU(d); setF({ full_name: d.full_name, username: d.username, email: d.email ?? '', phone: d.phone ?? '', gender: d.gender ?? '', roles: d.roles, is_active: !!d.is_active }); setSp({ ...((d.student as Dict) ?? {}) }); setSt({ ...((d.staff as Dict) ?? {}) }); }).catch((e) => { toast.error(toApiError(e).message); nav(-1); }), [id, nav]);
  useEffect(() => { load(); }, [load]);
  if (!u) return <Loading />;
  const roles = u.roles as string[];
  const save = async () => {
    setBusy(true);
    try {
      const body: Dict = { full_name: f.full_name, username: f.username, email: f.email || null, phone: f.phone || null, gender: f.gender || null, roles: f.roles, is_active: f.is_active };
      if (roles.includes('SISWA')) body.student = clean(sp, STUDENT_FIELDS);
      if (u.staff) body.staff = clean(st, STAFF_FIELDS);
      await put(`/users/${id}`, body); toast.success('Tersimpan'); load();
    } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav(-1)}>Kembali</Button>
      <Card className="my-4"><div className="flex flex-wrap items-center gap-4"><Avatar name={u.full_name as string} src={u.avatar_url as string} size="xl" /><div className="min-w-0 flex-1"><div className="text-xl font-bold">{u.full_name as string}</div><div className="text-sm text-ink-2">@{u.username as string}{u.email ? ` · ${u.email}` : ''}</div><div className="mt-1 flex flex-wrap gap-1">{roles.map((r) => <Badge key={r} tone="brand">{ROLE_LABELS[r as Role]}</Badge>)}<Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Aktif' : 'Nonaktif'}</Badge></div><div className="mt-1 text-xs text-ink-3">Login terakhir: {u.last_login_at ? fmtDateTime(u.last_login_at as string) : 'belum pernah'} · Dibuat {fmtDateTime(u.created_at as string)}</div></div>
        {canWrite && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" icon={<KeyRound className="h-4 w-4" />} onClick={async () => { const d = await post<{ temporary_password: string }>(`/users/${id}/reset-password`); setTmp(d.temporary_password); }}>Reset sandi</Button><Button variant="outline" size="sm" icon={<Power className="h-4 w-4" />} onClick={async () => { await post(`/users/${id}/toggle-active`); load(); }}>{u.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button><Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { if (!confirm('Hapus akun ini?')) return; await del(`/users/${id}`); toast.success('Akun dihapus'); nav(-1); }} /></div>}
      </div></Card>
      <Tabs className="mb-4 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'akun', label: 'Akun & peran' }, { value: 'profil', label: 'Data induk' }, { value: 'relasi', label: 'Kelas & relasi' }, ...(has('rbac:write') ? [{ value: 'akses' as const, label: 'Izin khusus' }] : [])]} />
      {tab === 'akun' && <Card><div className="grid gap-4 sm:grid-cols-2"><Field label="Nama lengkap"><Input disabled={!canWrite} value={String(f.full_name ?? '')} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field><Field label="Nama pengguna"><Input disabled={!canWrite} value={String(f.username ?? '')} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field><Field label="E-mail"><Input disabled={!canWrite} value={String(f.email ?? '')} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label="No. HP"><Input disabled={!canWrite} value={String(f.phone ?? '')} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field label="Jenis kelamin"><Select disabled={!canWrite} value={String(f.gender ?? '')} onChange={(e) => setF({ ...f, gender: e.target.value })} placeholder="—" options={[{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} /></Field><Field label="Peran" className="sm:col-span-2">{canWrite ? <RolePicker value={(f.roles as string[]) ?? []} onChange={(v) => setF({ ...f, roles: v })} /> : <div className="flex gap-1">{roles.map((r) => <Badge key={r}>{r}</Badge>)}</div>}</Field>{canWrite && <div className="sm:col-span-2"><Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button></div>}</div></Card>}
      {tab === 'profil' && <Card>{!u.student && !u.staff ? <p className="text-sm text-ink-3">Peran ini tidak punya data induk.</p> : <ProfileForm fields={u.student ? STUDENT_FIELDS : STAFF_FIELDS} data={u.student ? sp : st} onChange={u.student ? setSp : setSt} canWrite={canWrite} busy={busy} onSave={save} />}</Card>}
      {tab === 'relasi' && <div className="space-y-4">
        {roles.includes('SISWA') && <><Card padded={false} title="Riwayat kelas"><Table<Dict> dense rows={u.classes as Dict[]} rowKey={(r, i) => `${r.id}-${i}`} columns={[{ key: 'name', header: 'Kelas' }, { key: 'academic_year', header: 'Tahun' }, { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status as string)}>{label(r.status as string)}</Badge> }]} empty="Belum masuk kelas" /></Card><GuardiansCard u={u} canWrite={canWrite} reload={load} /></>}
        {(u.teaching as Dict[]).length > 0 && <Card padded={false} title="Mengampu"><Table<Dict> dense rows={u.teaching as Dict[]} columns={[{ key: 'class_name', header: 'Kelas' }, { key: 'subject_name', header: 'Mapel' }]} /></Card>}
        {(u.children as Dict[]).length > 0 && <Card padded={false} title="Anak (wali murid)"><Table<Dict> dense rows={u.children as Dict[]} columns={[{ key: 'full_name', header: 'Nama' }, { key: 'relation', header: 'Hubungan' }]} /></Card>}
      </div>}
      {tab === 'akses' && <Overrides userId={id!} initial={u.overrides as Dict[]} />}
      <Modal open={!!tmp} onClose={() => setTmp(null)} title="Kata sandi sementara" size="sm" footer={<Button onClick={() => setTmp(null)}>Tutup</Button>}><div className="rounded-xl bg-surface-2 p-4 font-mono text-lg">{tmp}</div><p className="mt-2 text-xs text-ink-3">Hanya ditampilkan sekali.</p></Modal>
    </div>
  );
}
const clean = (o: Dict, fields: [string, string, string?][]) => { const out: Dict = {}; for (const [k, , t] of fields) { let v = o[k]; if (v === '' || v === undefined) v = null; if (t === 'number' && v !== null) v = Number(v); if (t === 'date' && v) v = String(v).slice(0, 10); out[k] = v; } return out; };
function GuardiansCard({ u, canWrite, reload }: { u: Dict; canWrite: boolean; reload: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [opts, setOpts] = useState<Dict[]>([]);
  const [pick, setPick] = useState('');
  const [rel, setRel] = useState('ORANG_TUA');
  useEffect(() => { if (dq.length >= 2) get<unknown>('/users', { q: dq, limit: 20 }).then((d) => setOpts((d as { data?: Dict[] }).data ?? [])); }, [dq]);
  return (
    <Card padded={false} title="Wali murid">
      <Table<Dict> dense rows={u.guardians as Dict[]} columns={[{ key: 'full_name', header: 'Nama' }, { key: 'relation', header: 'Hubungan' }, { key: 'phone', header: 'HP' }, { key: 'x', header: '', render: (r) => canWrite ? <Button size="icon" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { await del(`/users/${u.id}/guardians/${r.id}`); reload(); }} /> : null }]} empty="Belum ada wali yang ditautkan" />
      {canWrite && <div className="flex flex-wrap items-end gap-2 border-t border-line p-3"><Field label="Cari akun wali (nama/username)" className="flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} /></Field><Field label="Pilih"><Select value={pick} onChange={(e) => setPick(e.target.value)} placeholder="—" className="w-48" options={opts.map((o) => ({ value: o.id as string, label: `${o.full_name} (@${o.username})` }))} /></Field><Field label="Hubungan"><Select value={rel} onChange={(e) => setRel(e.target.value)} className="w-36" options={['AYAH', 'IBU', 'WALI', 'ORANG_TUA'].map((x) => ({ value: x, label: x }))} /></Field><Button disabled={!pick} icon={<Link2 className="h-4 w-4" />} onClick={async () => { await post(`/users/${u.id}/guardians`, { guardian_user_id: pick, relation: rel }); toast.success('Wali ditautkan (peran WALI_MURID ditambahkan)'); setPick(''); reload(); }}>Tautkan</Button></div>}
    </Card>
  );
}
function Overrides({ userId, initial }: { userId: string; initial: Dict[] }) {
  const [perms, setPerms] = useState<Dict[]>([]);
  const [rows, setRows] = useState<{ permission_code: string; effect: string }[]>(initial.map((x) => ({ permission_code: x.permission_code as string, effect: x.effect as string })));
  useEffect(() => { get<Dict[]>('/rbac/permissions').then(setPerms); }, []);
  const save = async () => { await put(`/users/${userId}/overrides`, { overrides: rows }); toast.success('Izin khusus disimpan'); };
  return (
    <Card title="Izin khusus (override)" action={<Button size="sm" onClick={save}>Simpan</Button>}>
      <p className="mb-3 text-sm text-ink-2">ALLOW menambah izin di luar peran; DENY mencabut izin yang datang dari peran.</p>
      <div className="space-y-2">{rows.map((r, i) => <div key={i} className="flex gap-2"><Select value={r.permission_code} onChange={(e) => setRows((s) => s.map((x, j) => (j === i ? { ...x, permission_code: e.target.value } : x)))} className="flex-1" options={perms.map((p) => ({ value: p.code as string, label: `${p.code} — ${p.description ?? ''}` }))} /><Select value={r.effect} onChange={(e) => setRows((s) => s.map((x, j) => (j === i ? { ...x, effect: e.target.value } : x)))} className="w-28" options={[{ value: 'ALLOW', label: 'ALLOW' }, { value: 'DENY', label: 'DENY' }]} /><Button size="icon" variant="ghost" onClick={() => setRows((s) => s.filter((_, j) => j !== i))} icon={<Trash2 className="h-4 w-4 text-red-500" />} /></div>)}</div>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => setRows((s) => [...s, { permission_code: perms[0]?.code as string ?? '', effect: 'ALLOW' }])}>+ Tambah</Button>
    </Card>
  );
}

function ProfileForm({ fields, data, onChange, canWrite, busy, onSave }: { fields: [string, string, string?][]; data: Dict; onChange: (d: Dict) => void; canWrite: boolean; busy: boolean; onSave: () => void }) {
  const set = (k: string, v: string) => onChange({ ...data, [k]: v });
  const opts = (k: string) => (k === 'status' ? ['AKTIF', 'PINDAH', 'LULUS', 'KELUAR', 'CUTI'] : ['PNS', 'PPPK', 'GTY', 'GTT', 'HONORER', 'KONTRAK', 'TETAP']).map((x) => ({ value: x, label: x }));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(([k, l, t]) => (
        <Field key={k} label={l} className={t === 'textarea' ? 'sm:col-span-2' : ''}>
          {t === 'select' ? <Select disabled={!canWrite} value={String(data[k] ?? '')} onChange={(e) => set(k, e.target.value)} placeholder="—" options={opts(k)} />
            : t === 'textarea' ? <textarea disabled={!canWrite} className="input" rows={2} value={String(data[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
            : <Input disabled={!canWrite} type={t === 'date' ? 'date' : t === 'number' ? 'number' : 'text'} value={t === 'date' ? String(data[k] ?? '').slice(0, 10) : String(data[k] ?? '')} onChange={(e) => set(k, e.target.value)} />}
        </Field>
      ))}
      {canWrite && <div className="sm:col-span-2"><Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={onSave}>Simpan</Button></div>}
    </div>
  );
}
