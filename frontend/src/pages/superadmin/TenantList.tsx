import { useNavigate } from 'react-router-dom';
import { Building2, LogIn } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { CrudPage } from '@/features/crud/CrudPage';
import { Badge, Button } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { Dict } from '@/lib/types';

export default function TenantList() {
  const nav = useNavigate();
  const { switchTenant } = useAuth();
  return (
    <CrudPage<Dict> title="Lembaga" subtitle="Semua sekolah/kampus/bimbel yang terdaftar di platform. Buat lembaga baru beserta akun admin pertamanya." endpoint="/tenants" entityLabel="lembaga" modalSize="lg" limit={25}
      onRowClick={(r) => nav(`/superadmin/lembaga/${r.id}`)} canEdit={false}
      columns={[
        { key: 'name', header: 'Lembaga', render: (r) => <div className="flex items-center gap-3">{r.logo_url ? <img src={r.logo_url as string} className="h-9 w-9 rounded-lg object-cover" alt="" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: (r.primary_color as string) || '#0f766e' }}><Building2 className="h-4 w-4" /></div>}<div><div className="font-medium">{r.name as string}</div><div className="text-xs text-ink-3">/{r.slug as string}{r.npsn ? ` · NPSN ${r.npsn}` : ''}</div></div></div> },
        { key: 'type', header: 'Jenis', render: (r) => <Badge tone="brand">{r.type as string}</Badge> },
        { key: 'kota_nama', header: 'Wilayah', render: (r) => <span className="text-xs">{(r.kota_nama as string) ?? '-'}{r.provinsi_nama ? `, ${r.provinsi_nama}` : ''}</span> },
        { key: 'user_count', header: 'Pengguna', render: (r) => <span>{r.user_count as number} <span className="text-xs text-ink-3">({r.student_count as number} siswa)</span></span> },
        { key: 'is_active', header: 'Status', render: (r) => <Badge tone={r.is_active ? 'green' : 'red'}>{r.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
        { key: 'created_at', header: 'Dibuat', render: (r) => fmtDate(r.created_at as string) },
      ]}
      filters={[{ name: 'type', label: 'Jenis', options: ['SD', 'SMP', 'SMA', 'SMK', 'MA', 'KAMPUS', 'BIMBEL', 'UMUM'].map((x) => ({ value: x, label: x })) }, { name: 'is_active', label: 'Status', type: 'bool' }]}
      rowActions={(r) => <Button size="sm" variant="outline" icon={<LogIn className="h-4 w-4" />} onClick={async () => { await switchTenant(r.id as string); nav('/superadmin/dashboard'); }}>Masuk</Button>}
      fields={[
        { name: 'name', label: 'Nama lembaga', required: true, span: 2 },
        { name: 'slug', label: 'Slug URL', hint: 'kosongkan = otomatis dari nama', placeholder: 'smkn1-depok' },
        { name: 'type', label: 'Jenis', type: 'select', defaultValue: 'SMK', options: ['SD', 'SMP', 'SMA', 'SMK', 'MA', 'KAMPUS', 'BIMBEL', 'UMUM'].map((x) => ({ value: x, label: x })) },
        { name: 'category', label: 'Kategori', type: 'select', options: [{ value: 'NEGERI', label: 'Negeri' }, { value: 'SWASTA', label: 'Swasta' }] },
        { name: 'npsn', label: 'NPSN' },
        { name: 'provinsi_id', label: 'Provinsi', type: 'async-select', source: { url: '/regions/provinsi', label: 'nama' }, toValue: (v) => (v ? Number(v) : null) },
        { name: 'kota_id', label: 'Kabupaten/Kota', type: 'async-select', source: { url: '/regions/kota', params: { provinsi_id: 0 }, label: 'nama' }, toValue: (v) => (v ? Number(v) : null), hint: 'Isi setelah menyimpan (di detail lembaga)' },
        { name: 'principal_name', label: 'Kepala sekolah' }, { name: 'phone', label: 'Telepon' }, { name: 'email', label: 'E-mail', type: 'email' }, { name: 'website', label: 'Website' },
        { name: 'address', label: 'Alamat', type: 'textarea', span: 2 },
        { name: 'admin', label: 'Akun Admin Sekolah pertama', type: 'custom', span: 2, createOnly: true, defaultValue: { username: '', full_name: '', email: '' }, render: ({ value, onChange }) => { const v = (value as Record<string, string>) ?? {}; const set = (k: string, x: string) => onChange({ ...v, [k]: x }); return <div className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-3"><input className="input" placeholder="Nama pengguna (mis. admin.smk1)" value={v.username ?? ''} onChange={(e) => set('username', e.target.value)} /><input className="input" placeholder="Nama lengkap" value={v.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} /><input className="input" placeholder="E-mail (opsional)" value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} /><div className="text-xs text-ink-3 sm:col-span-3">Kata sandi sementara dibuat otomatis dan ditampilkan sekali.</div></div>; }, toValue: (v) => { const a = v as Record<string, string> | null; return a?.username && a?.full_name ? { username: a.username, full_name: a.full_name, email: a.email || null } : undefined; } },
      ]}
      afterSave={(row) => { const a = row.admin as Dict | null; if (a?.temporary_password) window.alert(`Admin dibuat.\nNama pengguna: ${a.username}\nKata sandi sementara: ${a.temporary_password}\n\nSimpan sekarang — hanya ditampilkan sekali.`); nav(`/superadmin/lembaga/${row.id}`); }}
    />
  );
}
