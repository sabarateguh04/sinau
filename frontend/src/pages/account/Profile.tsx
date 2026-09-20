import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, LogOut, ShieldCheck } from 'lucide-react';
import { api, get, post, put, toApiError, tokens } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Avatar, Button, Card, Field, Input, PageHeader, Select, Switch, Tabs, Badge } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { Dict, ROLE_LABELS } from '@/lib/types';

export default function Profile() {
  const { user, refreshMe } = useAuth();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<'profil' | 'sandi' | 'sesi'>((sp.get('tab') as 'sandi') || 'profil');
  const [f, setF] = useState({ full_name: '', phone: '', email: '', gender: '', data_saver: false });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Dict[]>([]);
  useEffect(() => { if (user) setF({ full_name: user.full_name, phone: user.phone ?? '', email: user.email ?? '', gender: user.gender ?? '', data_saver: user.data_saver }); }, [user]);
  useEffect(() => { if (tab === 'sesi') get<Dict[]>('/auth/sessions').then(setSessions).catch(() => undefined); }, [tab]);
  if (!user) return null;
  const save = async () => { setBusy(true); try { await put('/auth/me', { full_name: f.full_name, phone: f.phone || null, email: f.email || null, gender: f.gender || null, data_saver: f.data_saver }); await refreshMe(); toast.success('Profil disimpan'); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const changePw = async () => {
    if (pw.new_password !== pw.confirm) return toast.error('Konfirmasi kata sandi tidak sama');
    setBusy(true);
    try { const t = await post<{ accessToken: string; refreshToken: string }>('/auth/change-password', { current_password: pw.current_password, new_password: pw.new_password }); tokens.set(t.accessToken, t.refreshToken); await refreshMe(); toast.success('Kata sandi diperbarui'); setPw({ current_password: '', new_password: '', confirm: '' }); setTab('profil'); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); }
  };
  const avatar = async (file: File) => { const fd = new FormData(); fd.append('file', file); try { await api.post('/auth/me/avatar', fd); await refreshMe(); toast.success('Foto profil diperbarui'); } catch (e) { toast.error(toApiError(e).message); } };
  const profile = (user.profile ?? {}) as Dict;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profil & Keamanan" subtitle="Kelola identitas, kata sandi, dan sesi masuk Anda." />
      <Card className="mb-4"><div className="flex items-center gap-4">
        <div className="relative"><Avatar src={user.avatar_url} name={user.full_name} size="xl" /><label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-brand-700 p-1.5 text-white shadow"><Camera className="h-3.5 w-3.5" /><input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && avatar(e.target.files[0])} /></label></div>
        <div className="min-w-0"><div className="text-lg font-bold">{user.full_name}</div><div className="text-sm text-ink-2">@{user.username} · {user.tenant?.name}</div><div className="mt-1 flex flex-wrap gap-1">{user.roles.map((r) => <Badge key={r} tone="brand">{ROLE_LABELS[r]}</Badge>)}</div></div>
      </div></Card>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'profil', label: 'Data diri' }, { value: 'sandi', label: 'Kata sandi' }, { value: 'sesi', label: 'Sesi aktif' }]} />
      {tab === 'profil' && <Card><div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama lengkap" required className="sm:col-span-2"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="E-mail"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="No. HP"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Jenis kelamin"><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} placeholder="—" options={[{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} /></Field>
        <Field label="Mode hemat data" hint="Sembunyikan gambar besar & autoplay video"><div className="pt-2"><Switch checked={f.data_saver} onChange={(v) => setF({ ...f, data_saver: v })} label={f.data_saver ? 'Aktif' : 'Nonaktif'} /></div></Field>
        {(profile.nis || profile.nip) ? <div className="sm:col-span-2 rounded-xl bg-surface-2 p-3 text-sm"><div className="text-xs font-semibold uppercase text-ink-3">Data induk (hanya admin yang dapat mengubah)</div><div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">{['nis', 'nisn', 'nip', 'nuptk', 'nik', 'employment_status', 'entry_year', 'birth_date'].filter((k) => profile[k]).map((k) => <div key={k}><div className="text-[11px] uppercase text-ink-3">{k}</div><div>{String(profile[k])}</div></div>)}</div></div> : null}
        <div className="sm:col-span-2"><Button loading={busy} onClick={save}>Simpan</Button></div>
      </div></Card>}
      {tab === 'sandi' && <Card><div className="max-w-md space-y-4">
        {user.must_change_password && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">Anda wajib mengganti kata sandi sementara.</div>}
        <Field label="Kata sandi saat ini" required><Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
        <Field label="Kata sandi baru" required hint="Minimal 8 karakter"><Input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
        <Field label="Ulangi kata sandi baru" required><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        <Button loading={busy} onClick={changePw} icon={<ShieldCheck className="h-4 w-4" />}>Ganti kata sandi</Button>
      </div></Card>}
      {tab === 'sesi' && <Card title="Perangkat yang masuk" action={<Button size="sm" variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={async () => { await post('/auth/logout-all'); window.dispatchEvent(new CustomEvent('sinau:logout')); }}>Keluar dari semua</Button>}>
        <ul className="divide-y divide-line text-sm">{sessions.map((s) => <li key={s.id as string} className="py-2"><div className="truncate font-medium">{(s.user_agent as string) || 'Perangkat'}</div><div className="text-xs text-ink-3">{s.ip as string} · masuk {fmtDateTime(s.created_at as string)} · kedaluwarsa {fmtDateTime(s.expires_at as string)}</div></li>)}</ul>
      </Card>}
    </div>
  );
}
