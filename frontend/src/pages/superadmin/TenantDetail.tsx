import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LogIn, Save, UserPlus, Power, Trash2 } from 'lucide-react';
import { get, put, post, del, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Select, Table, Textarea } from '@/components/ui';
import { fmtDateTime, fmtAgo } from '@/lib/format';
import { Dict, ROLE_LABELS, Role } from '@/lib/types';

export default function TenantDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { switchTenant } = useAuth();
  const [t, setT] = useState<Dict | null>(null);
  const [prov, setProv] = useState<Dict[]>([]);
  const [kota, setKota] = useState<Dict[]>([]);
  const [busy, setBusy] = useState(false);
  const [addAdmin, setAddAdmin] = useState(false);
  const load = useCallback(() => get<Dict>(`/tenants/${id}`).then(setT).catch((e) => { toast.error(toApiError(e).message); nav('/superadmin/lembaga'); }), [id, nav]);
  useEffect(() => { load(); get<Dict[]>('/regions/provinsi').then(setProv); }, [load]);
  useEffect(() => { if (t?.provinsi_id) get<Dict[]>('/regions/kota', { provinsi_id: t.provinsi_id }).then(setKota); }, [t?.provinsi_id]);
  if (!t) return <Loading />;
  const set = (k: string, v: unknown) => setT((s) => ({ ...s!, [k]: v }));
  const save = async () => { setBusy(true); try { await put(`/tenants/${id}`, { name: t.name, slug: t.slug, type: t.type, category: t.category || null, npsn: t.npsn || null, provinsi_id: t.provinsi_id ? Number(t.provinsi_id) : null, kota_id: t.kota_id ? Number(t.kota_id) : null, address: t.address || null, phone: t.phone || null, email: t.email || null, website: t.website || null, principal_name: t.principal_name || null, is_active: !!t.is_active }); toast.success('Tersimpan'); load(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <div className="mx-auto max-w-5xl">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav('/superadmin/lembaga')}>Semua lembaga</Button>
      <PageHeader title={t.name as string} subtitle={<span>/{t.slug as string} · {t.user_count as number} pengguna · dibuat {fmtDateTime(t.created_at as string)}</span>} actions={<><Button variant="outline" icon={<LogIn className="h-4 w-4" />} onClick={async () => { await switchTenant(id!); nav('/superadmin/dashboard'); }}>Masuk sebagai lembaga</Button><Button variant="outline" icon={<Power className="h-4 w-4" />} onClick={async () => { await put(`/tenants/${id}`, { is_active: !t.is_active }); load(); }}>{t.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button><Button variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { if (!confirm('Hapus lembaga ini? (soft delete)')) return; await del(`/tenants/${id}`); nav('/superadmin/lembaga'); }} /></>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Profil" action={<Button size="sm" loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama" className="sm:col-span-2"><Input value={String(t.name)} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Slug"><Input value={String(t.slug)} onChange={(e) => set('slug', e.target.value)} /></Field>
            <Field label="Jenis"><Select value={String(t.type)} onChange={(e) => set('type', e.target.value)} options={['SD', 'SMP', 'SMA', 'SMK', 'MA', 'KAMPUS', 'BIMBEL', 'UMUM'].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Kategori"><Select value={String(t.category ?? '')} onChange={(e) => set('category', e.target.value)} placeholder="—" options={[{ value: 'NEGERI', label: 'Negeri' }, { value: 'SWASTA', label: 'Swasta' }]} /></Field>
            <Field label="NPSN"><Input value={String(t.npsn ?? '')} onChange={(e) => set('npsn', e.target.value)} /></Field>
            <Field label="Provinsi"><Select value={String(t.provinsi_id ?? '')} onChange={(e) => { set('provinsi_id', e.target.value); set('kota_id', ''); }} placeholder="—" options={prov.map((p) => ({ value: p.id as number, label: p.nama as string }))} /></Field>
            <Field label="Kabupaten/Kota"><Select value={String(t.kota_id ?? '')} onChange={(e) => set('kota_id', e.target.value)} placeholder="—" options={kota.map((k) => ({ value: k.id as number, label: k.nama as string }))} /></Field>
            <Field label="Kepala sekolah"><Input value={String(t.principal_name ?? '')} onChange={(e) => set('principal_name', e.target.value)} /></Field>
            <Field label="Telepon"><Input value={String(t.phone ?? '')} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="E-mail"><Input value={String(t.email ?? '')} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Website"><Input value={String(t.website ?? '')} onChange={(e) => set('website', e.target.value)} /></Field>
            <Field label="Alamat" className="sm:col-span-2"><Textarea rows={2} value={String(t.address ?? '')} onChange={(e) => set('address', e.target.value)} /></Field>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Komposisi pengguna"><ul className="space-y-1 text-sm">{(t.role_counts as Dict[]).map((r) => <li key={r.role as string} className="flex justify-between"><span>{ROLE_LABELS[r.role as Role] ?? (r.role as string)}</span><b>{r.c as number}</b></li>)}{(t.role_counts as Dict[]).length === 0 && <li className="text-ink-3">Belum ada pengguna</li>}</ul></Card>
          <Card title="Pengaturan"><ul className="space-y-1 text-sm"><li className="flex justify-between"><span>Registrasi mandiri</span><Badge tone={t.self_registration ? 'green' : 'gray'}>{t.self_registration ? 'Buka' : 'Tutup'}</Badge></li><li className="flex justify-between"><span>Portal share</span><span>{t.portal_share as string}</span></li><li className="flex justify-between"><span>Pemeliharaan</span><Badge tone={t.maintenance ? 'red' : 'green'}>{t.maintenance ? 'AKTIF' : 'Normal'}</Badge></li></ul></Card>
        </div>
      </div>
      <Card className="mt-4" padded={false} title="Admin sekolah" action={<Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAddAdmin(true)}>Tambah admin</Button>}>
        <Table<Dict> dense rows={t.admins as Dict[]} columns={[{ key: 'full_name', header: 'Nama' }, { key: 'username', header: 'Username' }, { key: 'email', header: 'E-mail' }, { key: 'is_active', header: 'Status', render: (r) => <Badge tone={r.is_active ? 'green' : 'red'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge> }, { key: 'last_login_at', header: 'Login terakhir', render: (r) => r.last_login_at ? fmtAgo(r.last_login_at as string) : '-' }]} empty="Belum ada admin — tambahkan agar lembaga bisa mulai." />
      </Card>
      <AddAdminModal open={addAdmin} tenantId={id!} onClose={() => setAddAdmin(false)} onDone={() => { setAddAdmin(false); load(); }} />
    </div>
  );
}
function AddAdminModal({ open, tenantId, onClose, onDone }: { open: boolean; tenantId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ username: '', full_name: '', email: '' });
  const [tmp, setTmp] = useState<Dict | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { const r = await post<Dict>(`/tenants/${tenantId}/admins`, { ...f, email: f.email || null }); setTmp(r); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={() => { setTmp(null); if (tmp) onDone(); else onClose(); }} title="Tambah admin sekolah" size="sm" footer={tmp ? <Button onClick={() => { setTmp(null); onDone(); }}>Selesai</Button> : <Button loading={busy} onClick={submit}>Buat akun</Button>}>
      {tmp ? <div className="rounded-xl bg-surface-2 p-4 font-mono text-sm"><div>Username: <b>{tmp.username as string}</b></div><div>Kata sandi: <b>{tmp.temporary_password as string}</b></div><p className="mt-2 font-sans text-xs text-ink-3">Hanya ditampilkan sekali.</p></div> : <div className="space-y-3"><Field label="Nama pengguna" required><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field><Field label="Nama lengkap" required><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field><Field label="E-mail"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>}
    </Modal>
  );
}
