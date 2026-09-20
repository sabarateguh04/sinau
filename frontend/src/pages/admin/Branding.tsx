import { useEffect, useState } from 'react';
import { Save, Upload } from 'lucide-react';
import { get, put, toApiError, uploadFile } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { applyBrand } from '@/lib/brand';
import { Button, Card, Field, Input, Loading, PageHeader, Select } from '@/components/ui';
import { Dict } from '@/lib/types';

export default function Branding() {
  const { has, refreshMe } = useAuth();
  const canWrite = has('tenant:settings');
  const [t, setT] = useState<Dict | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<Dict>('/tenants/me/profile').then(setT); }, []);
  if (!t) return <Loading />;
  const set = (k: string, v: unknown) => { setT((s) => ({ ...s!, [k]: v })); if (k === 'primary_color' || k === 'accent_color') applyBrand(k === 'primary_color' ? String(v) : String(t.primary_color), k === 'accent_color' ? String(v) : String(t.accent_color)); };
  const save = async () => { setBusy(true); try { await put('/tenants/me/branding', { display_name: t.display_name || null, tagline: t.tagline || null, logo_url: t.logo_url || null, favicon_url: t.favicon_url || null, primary_color: t.primary_color, accent_color: t.accent_color, theme: t.theme }); toast.success('Branding disimpan'); refreshMe(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  const logo = async (file: File) => { const f = await uploadFile('branding', file, true); set('logo_url', f.url); };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Branding" subtitle="Identitas visual lembaga: nama tampilan, logo, warna. Perubahan warna langsung dipratinjau." actions={canWrite && <Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button>} />
      <Card><div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">{t.logo_url ? <img src={t.logo_url as string} alt="logo" className="h-20 w-20 rounded-2xl border border-line object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-700 text-3xl font-black text-white">{String(t.display_name || t.name)[0]}</div>}{canWrite && <label className="cursor-pointer"><input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && logo(e.target.files[0])} /><span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-3"><Upload className="h-4 w-4" /> Unggah logo</span></label>}</div>
        <Field label="Nama tampilan"><Input disabled={!canWrite} value={String(t.display_name ?? '')} onChange={(e) => set('display_name', e.target.value)} placeholder={t.name as string} /></Field>
        <Field label="Tagline"><Input disabled={!canWrite} value={String(t.tagline ?? '')} onChange={(e) => set('tagline', e.target.value)} /></Field>
        <Field label="Warna utama"><div className="flex items-center gap-2"><input type="color" disabled={!canWrite} value={String(t.primary_color)} onChange={(e) => set('primary_color', e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-transparent" /><Input disabled={!canWrite} value={String(t.primary_color)} onChange={(e) => set('primary_color', e.target.value)} /></div></Field>
        <Field label="Warna aksen"><div className="flex items-center gap-2"><input type="color" disabled={!canWrite} value={String(t.accent_color)} onChange={(e) => set('accent_color', e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-transparent" /><Input disabled={!canWrite} value={String(t.accent_color)} onChange={(e) => set('accent_color', e.target.value)} /></div></Field>
        <Field label="Tema bawaan pengguna"><Select disabled={!canWrite} value={String(t.theme)} onChange={(e) => set('theme', e.target.value)} options={[{ value: 'system', label: 'Ikuti sistem' }, { value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }]} /></Field>
        <div className="sm:col-span-2 rounded-2xl border border-line p-4"><div className="mb-2 text-xs font-semibold uppercase text-ink-3">Pratinjau</div><div className="flex flex-wrap items-center gap-2"><Button>Tombol utama</Button><Button variant="accent">Aksen</Button><Button variant="outline">Outline</Button><span className="chip bg-brand-100 text-brand-800">Chip</span><div className="h-8 flex-1 rounded-lg bg-gradient-to-r from-brand-500 to-brand-800" /></div></div>
      </div></Card>
    </div>
  );
}
