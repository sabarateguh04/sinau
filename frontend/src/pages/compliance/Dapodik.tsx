import { useEffect, useState } from 'react';
import { Database, Download, AlertTriangle } from 'lucide-react';
import { get, downloadFile } from '@/lib/api';
import { Button, Card, Loading, PageHeader, StatCard } from '@/components/ui';
import { Dict } from '@/lib/types';

const KINDS = [['peserta_didik', 'Peserta Didik', 'NISN, NIK, biodata, orang tua, rombel, jurusan'], ['pendidik', 'Pendidik & Tenaga Kependidikan', 'NUPTK, NIP, biodata, status kepegawaian, jabatan'], ['rombongan_belajar', 'Rombongan Belajar', 'Rombel, tingkat, wali kelas, ruang, pembelajaran per mapel']];
export default function Dapodik() {
  const [p, setP] = useState<Dict | null>(null);
  useEffect(() => { get<Dict>('/dapodik/preview').then(setP); }, []);
  if (!p) return <Loading />;
  return (
    <div>
      <PageHeader title="Ekspor Dapodik" subtitle="CSV berformat UTF-8 BOM (pemisah ;) untuk diunggah/diselaraskan ke aplikasi Dapodik. Lengkapi NISN & NUPTK agar ekspor valid." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Siswa aktif" value={String(p.students)} icon={<Database className="h-5 w-5" />} /><StatCard label="Pendidik" value={String(p.teachers)} tone="blue" /><StatCard label="Rombel" value={String(p.classes)} tone="purple" /><StatCard label="NISN kosong" value={String(p.missing_nisn)} tone={Number(p.missing_nisn) ? 'red' : 'green'} icon={<AlertTriangle className="h-5 w-5" />} /><StatCard label="NUPTK kosong" value={String(p.missing_nuptk)} tone={Number(p.missing_nuptk) ? 'red' : 'green'} icon={<AlertTriangle className="h-5 w-5" />} /></div>
      <div className="grid gap-3 sm:grid-cols-3">{KINDS.map(([k, l, d]) => <Card key={k}><div className="font-semibold">{l}</div><p className="mt-1 text-sm text-ink-2">{d}</p><Button className="mt-4" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile(`/dapodik/export/${k}`, `${k}.csv`)}>Unduh CSV</Button></Card>)}</div>
      <p className="mt-4 text-xs text-ink-3">Ekspor bersifat best-effort: kolom mengikuti struktur umum Dapodik; penyesuaian akhir dilakukan di aplikasi Dapodik resmi.</p>
    </div>
  );
}
