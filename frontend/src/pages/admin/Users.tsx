import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, KeyRound, Download, Mail } from 'lucide-react';
import { api, post, toApiError, downloadFile } from '@/lib/api';
import { useAuth, rolePrefix } from '@/store/auth';
import { toast } from '@/store/ui';
import { CrudPage, FormField } from '@/features/crud/CrudPage';
import { Avatar, Badge, Button, Field, Input, Modal, Select, Tabs } from '@/components/ui';
import { fmtAgo } from '@/lib/format';
import { Dict, ROLE_LABELS, Role } from '@/lib/types';

const ROLE_OPTS = (Object.keys(ROLE_LABELS) as Role[]).filter((r) => r !== 'SUPER_ADMIN').map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default function Users() {
  const nav = useNavigate();
  const { has, activeRole, user } = useAuth();
  const p = rolePrefix(activeRole);
  const [importOpen, setImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tmp, setTmp] = useState<{ username: string; password: string } | null>(null);
  const [key, setKey] = useState(0);
  const canWrite = has('user:write');
  const fields: FormField[] = [
    { name: 'full_name', label: 'Nama lengkap', required: true, span: 2 },
    { name: 'username', label: 'Nama pengguna', required: true, hint: 'unik di seluruh platform; huruf kecil, angka, . _ -' },
    { name: 'password', label: 'Kata sandi awal', type: 'password', hint: 'kosongkan = dibuat otomatis', createOnly: true },
    { name: 'email', label: 'E-mail', type: 'email' }, { name: 'phone', label: 'No. HP' },
    { name: 'gender', label: 'Jenis kelamin', type: 'select', options: [{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }] },
    { name: 'roles', label: 'Peran', type: 'custom', required: true, defaultValue: ['SISWA'], render: ({ value, onChange }) => <RolePicker value={(value as string[]) ?? []} onChange={onChange} /> },
    { name: 'class_id', label: 'Kelas (untuk siswa)', type: 'async-select', source: { url: '/academic/classes', params: { active_year: 1, limit: 200 }, label: 'name' }, showIf: (v) => ((v.roles as string[]) ?? []).includes('SISWA') },
    { name: 'is_active', label: 'Akun aktif', type: 'switch', defaultValue: true },
  ];
  return (
    <div>
      <CrudPage<Dict> key={key} title={user?.is_super_admin && !user.tenant ? 'Pengguna Platform' : 'Pengguna'} subtitle="Akun guru, siswa, staf, wali murid, dan peran lain. Klik baris untuk detail lengkap." endpoint="/users" entityLabel="pengguna" modalSize="lg" perm={{ write: 'user:write' }} canDelete={canWrite} limit={25}
        headerActions={canWrite && <><Button variant="outline" icon={<Mail className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>Undang</Button><Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Impor Excel</Button></>}
        onRowClick={(r) => nav(`/${p}/pengguna/${r.id}`)}
        columns={[
          { key: 'full_name', header: 'Nama', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.full_name as string} src={r.avatar_url as string} size="sm" /><div><div className="font-medium">{r.full_name as string}</div><div className="text-xs text-ink-3">@{r.username as string}{r.email ? ` · ${r.email}` : ''}</div></div></div> },
          { key: 'roles', header: 'Peran', render: (r) => <div className="flex flex-wrap gap-1">{(r.roles as string[]).map((x) => <Badge key={x} tone="brand">{ROLE_LABELS[x as Role] ?? x}</Badge>)}</div> },
          { key: 'class_name', header: 'Kelas / NIS', render: (r) => (r.class_name as string) ? <span>{r.class_name as string}<span className="block text-xs text-ink-3">{r.nis as string}</span></span> : (r.nip as string) ? <span className="text-xs text-ink-3">NIP {r.nip as string}</span> : '' },
          { key: 'is_active', header: 'Status', render: (r) => <div className="flex flex-col gap-0.5"><Badge tone={r.is_active ? 'green' : 'red'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge>{r.must_change_password ? <span className="text-[10px] text-amber-600">sandi sementara</span> : null}</div> },
          { key: 'last_login_at', header: 'Login terakhir', render: (r) => r.last_login_at ? fmtAgo(r.last_login_at as string) : <span className="text-ink-3">belum pernah</span> },
        ]}
        filters={[{ name: 'role', label: 'Peran', options: ROLE_OPTS }, { name: 'is_active', label: 'Status', type: 'bool' }, { name: 'class_id', label: 'Kelas', type: 'async-select', source: { url: '/academic/classes', params: { active_year: 1, limit: 200 }, label: 'name' } }]}
        fields={fields}
        rowActions={(r, reload) => canWrite && <Button size="icon" variant="ghost" title="Reset kata sandi" icon={<KeyRound className="h-4 w-4" />} onClick={async () => { if (!confirm(`Reset kata sandi ${r.full_name}?`)) return; try { const d = await post<{ temporary_password: string }>(`/users/${r.id}/reset-password`); setTmp({ username: r.username as string, password: d.temporary_password }); reload(); } catch (e) { toast.error(toApiError(e).message); } }} />}
        afterSave={(row, isCreate) => { if (isCreate && row.temporary_password) setTmp({ username: row.username as string, password: row.temporary_password as string }); }}
      />
      <Modal open={!!tmp} onClose={() => setTmp(null)} title="Kata sandi sementara" size="sm" footer={<Button onClick={() => setTmp(null)}>Tutup</Button>}>
        <p className="text-sm text-ink-2">Sampaikan ke pengguna. Hanya ditampilkan sekali; pengguna wajib menggantinya saat masuk.</p>
        <div className="mt-3 rounded-xl bg-surface-2 p-4 font-mono text-sm"><div>Nama pengguna: <b>{tmp?.username}</b></div><div>Kata sandi: <b>{tmp?.password}</b></div></div>
      </Modal>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); setKey((k) => k + 1); }} />
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
export function RolePicker({ value, onChange, options = ROLE_OPTS }: { value: string[]; onChange: (v: string[]) => void; options?: { value: string; label: string }[] }) {
  return <div className="flex flex-wrap gap-1.5">{options.map((o) => { const on = value.includes(o.value); return <button type="button" key={o.value} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line text-ink-2 hover:bg-surface-3'}`}>{o.label}</button>; })}</div>;
}
function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<'siswa' | 'guru'>('siswa');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Dict | null>(null);
  const run = async () => { if (!file) return; setBusy(true); try { const fd = new FormData(); fd.append('file', file); const r = await api.post(`/users/import/${type}`, fd); setResult(r.data.data); toast.success(`${r.data.data.success} akun dibuat`); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={() => { setResult(null); onClose(); }} title="Impor pengguna dari Excel" size="lg" footer={<><Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`/users/import/template/${type}`, `template-${type}.xlsx`)}>Unduh template</Button><Button loading={busy} disabled={!file} onClick={run}>Impor</Button>{result && <Button onClick={onDone}>Selesai</Button>}</>}>
      <Tabs className="mb-3 w-fit" value={type} onChange={setType} tabs={[{ value: 'siswa', label: 'Siswa' }, { value: 'guru', label: 'Guru / staf' }]} />
      <p className="text-sm text-ink-2">Unduh template, isi, lalu unggah (.xlsx / .csv). Nama pengguna harus unik. Kolom <code>class_name</code> harus sama persis dengan nama kelas di tahun ajaran aktif.</p>
      <input type="file" accept=".xlsx,.csv" className="mt-3 text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {result && <div className="mt-4 space-y-2 text-sm"><div className="rounded-xl bg-surface-2 p-3">Total {result.total as number} · berhasil <b className="text-emerald-600">{result.success as number}</b> · gagal <b className="text-red-600">{result.failed as number}</b></div>{(result.errors as Dict[]).length > 0 && <div className="max-h-40 overflow-y-auto rounded-xl border border-red-200 p-3 text-xs text-red-700"><ul className="list-disc pl-4">{(result.errors as Dict[]).map((e, i) => <li key={i}>Baris {e.row_no as number}: {e.message as string}</li>)}</ul></div>}{(result.created as Dict[]).length > 0 && <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-xs font-semibold">Kata sandi sementara ({(result.created as Dict[]).length}) — simpan sekarang</summary><pre className="mt-2 max-h-48 overflow-auto text-xs">{(result.created as Dict[]).map((c) => `${c.username}\t${c.temporary_password}`).join('\n')}</pre></details>}</div>}
    </Modal>
  );
}
function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ email: '', full_name: '', role: 'GURU' });
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); try { const r = await post<{ link: string }>('/users/invitations', { ...f, full_name: f.full_name || undefined }); setLink(r.link); toast.success('Undangan dibuat & dikirim ke outbox e-mail'); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={() => { setLink(''); onClose(); }} title="Undang pengguna" size="sm" footer={<Button loading={busy} onClick={send}>Kirim undangan</Button>}>
      <div className="space-y-3"><Field label="E-mail" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label="Nama"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field><Field label="Peran"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={ROLE_OPTS} /></Field>{link && <div className="rounded-xl bg-surface-2 p-3 text-xs break-all">Tautan undangan (berlaku 14 hari):<br /><b>{link}</b></div>}</div>
    </Modal>
  );
}
