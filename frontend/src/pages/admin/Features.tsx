import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { get, put, toApiError, tokens } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { Button, Card, Loading, PageHeader, Switch, Badge } from '@/components/ui';
import { Dict } from '@/lib/types';

/** Feature switches. Keys match nav `feature` flags; missing key = enabled. */
const FEATURES: { key: string; label: string; desc: string }[] = [
  { key: 'alesha', label: 'Alesha AI', desc: 'Asisten AI (tutor siswa, insight kelas guru, ringkasan lembaga). Tanpa engine nyata berjalan dalam mode demo.' },
  { key: 'exam', label: 'Ujian online', desc: 'Ujian terjadwal dengan token sesi, autosave, dan auto-submit.' },
  { key: 'rapor', label: 'e-Rapor', desc: 'Konsolidasi nilai, P5, persetujuan kepsek, PDF.' },
  { key: 'finance', label: 'Keuangan', desc: 'Tagihan SPP, pembayaran, denda, rekonsiliasi, arus kas.' },
  { key: 'payroll', label: 'Payroll', desc: 'Penggajian bulanan, PPh 21, BPJS, slip gaji.' },
  { key: 'asset', label: 'Aset', desc: 'Inventaris, peminjaman, penyusutan, opname.' },
  { key: 'library', label: 'Perpustakaan', desc: 'Katalog buku & peminjaman.' },
  { key: 'ppdb', label: 'PPDB', desc: 'Pendaftaran siswa baru publik.' },
  { key: 'smk', label: 'Modul SMK', desc: 'Prakerin & uji kompetensi.' },
  { key: 'bk', label: 'BK & kedisiplinan', desc: 'Konseling, poin pelanggaran, penghargaan.' },
  { key: 'ekskul', label: 'Ekstrakurikuler', desc: 'Pendaftaran & kehadiran ekskul.' },
  { key: 'letter', label: 'Surat resmi', desc: 'Template & penomoran surat.' },
  { key: 'landing', label: 'Landing page', desc: 'Situs publik lembaga & berita.' },
  { key: 'dapodik', label: 'Ekspor Dapodik', desc: 'CSV peserta didik, pendidik, rombel.' },
  { key: 'rollover', label: 'Tutup tahun ajaran', desc: 'Kenaikan kelas & kelulusan massal.' },
];

export default function Features() {
  const { has, refreshMe, user } = useAuth();
  const platform = !!user?.is_super_admin && !tokens.tenant;
  const canWrite = has('feature:write');
  const [rows, setRows] = useState<Dict[] | null>(null);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<Dict[]>('/tenants/me/features').then((r) => { setRows(r); const s: Record<string, boolean> = {}; for (const f of FEATURES) { const own = r.find((x) => x.flag_key === f.key && x.tenant_id === user?.tenant_id); const glob = r.find((x) => x.flag_key === f.key); s[f.key] = own ? !!own.enabled : glob ? !!glob.enabled : true; } setState(s); }); }, [user?.tenant_id]);
  if (!rows) return <Loading />;
  const save = async () => { setBusy(true); try { await put('/tenants/me/features', { flags: FEATURES.map((f) => ({ key: f.key, enabled: state[f.key] })) }); toast.success('Fitur disimpan'); refreshMe(); } catch (e) { toast.error(toApiError(e).message); } finally { setBusy(false); } };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={platform ? 'Fitur Global' : 'Fitur'} subtitle={platform ? 'Saklar bawaan untuk semua lembaga (lembaga bisa menimpa).' : 'Aktifkan modul yang dipakai lembaga. Menu yang dimatikan disembunyikan dari semua pengguna.'} actions={canWrite && <Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Simpan</Button>} />
      <Card padded={false}><ul className="divide-y divide-line">{FEATURES.map((f) => { const own = rows.find((x) => x.flag_key === f.key && x.tenant_id === user?.tenant_id); return <li key={f.key} className="flex items-center justify-between gap-4 px-4 py-3"><div><div className="flex items-center gap-2 font-medium">{f.label}{own && !platform ? <Badge tone="gray">diatur lembaga</Badge> : null}</div><div className="text-xs text-ink-2">{f.desc}</div></div><Switch disabled={!canWrite} checked={state[f.key] ?? true} onChange={(v) => setState((s) => ({ ...s, [f.key]: v }))} /></li>; })}</ul></Card>
    </div>
  );
}
