import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { get, put, toApiError, tokens } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Card, Field, Input, Loading, PageHeader, Select, Switch, Textarea } from '@/components/ui';
import { Dict } from '@/lib/types';
import TenantList from '@/pages/superadmin/TenantList';

export default function TenantSettings() {
  const { user, has, refreshMe } = useAuth();
  if (user?.is_super_admin && !tokens.tenant) return <TenantList />;
  return <OwnTenant canWrite={has('tenant:settings')} refreshMe={refreshMe} />;
}

function OwnTenant({ canWrite, refreshMe }: { canWrite: boolean; refreshMe: () => Promise<unknown> }) {
  const [t, setT] = useState<Dict | null>(null);
  const [prov, setProv] = useState<Dict[]>([]);
  const [kota, setKota] = useState<Dict[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<Dict>('/tenants/me/profile').then(setT); get<Dict[]>('/regions/provinsi').then(setProv); }, []);
  useEffect(() => { if (t?.provinsi_id) get<Dict[]>('/regions/kota', { provinsi_id: t.provinsi_id }).then(setKota); }, [t?.provinsi_id]);
  if (!t) return <Loading />;
  const set = (k: string, v: unknown) => setT((s) => ({ ...s!, [k]: v }));
  const saveProfile = async () => { setBusy(true); try { await put('/tenants/me/profile', { name: t.name, type: t.type, category: t.category || null, npsn: t.npsn || null, provinsi_id: t.provinsi_id ? Number(t.provinsi_id) : null, kota_id: t.kota_id ? Number(t.kota_id) : null, address: t.address || null, phone: t.phone || null, email: t.email || null, website: t.website || null, principal_name: t.principal_name || null }); toast.success('Profil lembaga disimpan'); refreshMe(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const saveSettings = async () => { setBusy(true); try { await put('/tenants/me/settings', { self_registration: !!t.self_registration, portal_share: t.portal_share, approval_flow: t.approval_flow, timezone: t.timezone, maintenance: !!t.maintenance, maintenance_message: t.maintenance_message || null, data_saver_default: !!t.data_saver_default }); toast.success('Pengaturan disimpan'); refreshMe(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Profil Lembaga" subtitle={`${t.user_count} pengguna terdaftar`} />
      <Card title="Identitas" action={canWrite && <Button size="sm" loading={busy} icon={<Save className="h-4 w-4" />} onClick={saveProfile}>Simpan</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama resmi" className="sm:col-span-2"><Input disabled={!canWrite} value={String(t.name ?? '')} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Jenis"><Select disabled={!canWrite} value={String(t.type)} onChange={(e) => set('type', e.target.value)} options={['SD', 'SMP', 'SMA', 'SMK', 'MA', 'KAMPUS', 'BIMBEL', 'UMUM'].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Kategori"><Select disabled={!canWrite} value={String(t.category ?? '')} onChange={(e) => set('category', e.target.value)} placeholder="—" options={[{ value: 'NEGERI', label: 'Negeri' }, { value: 'SWASTA', label: 'Swasta' }]} /></Field>
          <Field label="NPSN"><Input disabled={!canWrite} value={String(t.npsn ?? '')} onChange={(e) => set('npsn', e.target.value)} /></Field>
          <Field label="Kepala sekolah"><Input disabled={!canWrite} value={String(t.principal_name ?? '')} onChange={(e) => set('principal_name', e.target.value)} /></Field>
          <Field label="Provinsi"><Select disabled={!canWrite} value={String(t.provinsi_id ?? '')} onChange={(e) => { set('provinsi_id', e.target.value); set('kota_id', ''); }} placeholder="—" options={prov.map((p) => ({ value: p.id as number, label: p.nama as string }))} /></Field>
          <Field label="Kabupaten/Kota"><Select disabled={!canWrite} value={String(t.kota_id ?? '')} onChange={(e) => set('kota_id', e.target.value)} placeholder="—" options={kota.map((k) => ({ value: k.id as number, label: k.nama as string }))} /></Field>
          <Field label="Alamat" className="sm:col-span-2"><Textarea disabled={!canWrite} rows={2} value={String(t.address ?? '')} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Telepon"><Input disabled={!canWrite} value={String(t.phone ?? '')} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="E-mail"><Input disabled={!canWrite} value={String(t.email ?? '')} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Website" className="sm:col-span-2"><Input disabled={!canWrite} value={String(t.website ?? '')} onChange={(e) => set('website', e.target.value)} /></Field>
        </div>
      </Card>
      <Card title="Kebijakan & sistem" action={canWrite && <Button size="sm" loading={busy} icon={<Save className="h-4 w-4" />} onClick={saveSettings}>Simpan</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pendaftaran mandiri siswa" hint="Jika aktif, siapa pun bisa membuat akun SISWA lewat halaman daftar"><div className="pt-1"><Switch disabled={!canWrite} checked={!!t.self_registration} onChange={(v) => set('self_registration', v)} label={t.self_registration ? 'Dibuka' : 'Ditutup'} /></div></Field>
          <Field label="Berbagi materi ke portal publik"><Select disabled={!canWrite} value={String(t.portal_share)} onChange={(e) => set('portal_share', e.target.value)} options={[{ value: 'MANUAL', label: 'Manual — dipilih admin/super admin' }, { value: 'AUTO', label: 'Otomatis — materi bertanda publik' }]} /></Field>
          <Field label="Alur persetujuan"><Select disabled={!canWrite} value={String(t.approval_flow)} onChange={(e) => set('approval_flow', e.target.value)} options={[{ value: 'UNIT_HEAD', label: 'Kepala sekolah' }, { value: 'TERRITORY', label: 'Wilayah' }]} /></Field>
          <Field label="Zona waktu"><Select disabled={!canWrite} value={String(t.timezone)} onChange={(e) => set('timezone', e.target.value)} options={['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'].map((x) => ({ value: x, label: x }))} /></Field>
          <Field label="Mode hemat data bawaan"><div className="pt-1"><Switch disabled={!canWrite} checked={!!t.data_saver_default} onChange={(v) => set('data_saver_default', v)} /></div></Field>
          <Field label="Mode pemeliharaan" hint="Semua pengguna lembaga (kecuali Super Admin) diblokir sementara"><div className="pt-1"><Switch disabled={!canWrite} checked={!!t.maintenance} onChange={(v) => set('maintenance', v)} label={t.maintenance ? 'AKTIF' : 'Nonaktif'} /></div></Field>
          {t.maintenance ? <Field label="Pesan pemeliharaan" className="sm:col-span-2"><Input disabled={!canWrite} value={String(t.maintenance_message ?? '')} onChange={(e) => set('maintenance_message', e.target.value)} /></Field> : null}
        </div>
      </Card>
    </div>
  );
}
