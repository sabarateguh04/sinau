import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, ShieldCheck, WifiLow, Sparkles, Building2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';

interface TenantLite { id: string; slug: string; name: string; type: string; display_name: string | null; logo_url: string | null; primary_color: string }

export default function Landing() {
  const [tenants, setTenants] = useState<TenantLite[]>([]);
  const [stats, setStats] = useState<{ tenants: number; students: number; materials: number } | null>(null);
  useEffect(() => {
    api.get('/auth/tenants').then((r) => setTenants(r.data.data)).catch(() => undefined);
    api.get('/public/platform').then((r) => setStats(r.data.data.stats)).catch(() => undefined);
  }, []);
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-surface-2 to-amber-50 dark:from-brand-900/30 dark:via-surface-2 dark:to-surface-2" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <span className="chip bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">LMS + SIS multi-lembaga</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Belajar, mengajar, dan mengelola sekolah dalam satu platform.</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-2">SINAU menghubungkan materi, tugas, kuis, ujian, nilai, rapor, absensi, keuangan, dan PPDB — dengan data yang saling terhubung dan izin per peran.</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link to="/login"><Button size="lg">Masuk</Button></Link><Link to="/portal"><Button size="lg" variant="outline" icon={<BookOpen className="h-4 w-4" />}>Jelajahi materi publik</Button></Link></div>
            {stats && <div className="mt-8 flex gap-8 text-sm text-ink-2"><span><b className="text-xl text-ink">{stats.tenants}</b> lembaga</span><span><b className="text-xl text-ink">{Number(stats.students).toLocaleString('id-ID')}</b> siswa</span><span><b className="text-xl text-ink">{stats.materials}</b> materi</span></div>}
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="grid gap-4 sm:grid-cols-2">
            {[
              { i: BookOpen, t: 'LMS inti', d: 'Materi, tugas, kuis, ujian online, nilai berbobot, e-rapor.' },
              { i: ShieldCheck, t: 'Multi-tenant aman', d: 'Data tiap lembaga terisolasi; 15 peran dengan izin terukur.' },
              { i: WifiLow, t: 'Hemat kuota', d: 'Mode hemat data, autosave ujian, ringan di sinyal lemah.' },
              { i: Sparkles, t: 'Peta konsep', d: 'Setiap soal berlabel konsep — penguasaan terpetakan per siswa.' },
            ].map((f) => (
              <div key={f.t} className="card p-5"><f.i className="h-6 w-6 text-brand-700" /><div className="mt-3 font-semibold">{f.t}</div><div className="mt-1 text-sm text-ink-2">{f.d}</div></div>
            ))}
          </motion.div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-6 flex items-end justify-between"><h2 className="text-2xl font-bold">Lembaga di SINAU</h2><span className="text-sm text-ink-3">{tenants.length} lembaga aktif</span></div>
        {tenants.length === 0 ? <div className="card p-10 text-center text-sm text-ink-2">Belum ada lembaga terdaftar.</div> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tenants.map((t) => (
              <Link key={t.id} to={`/s/${t.slug}`} className="card group flex items-center gap-4 p-4 transition hover:border-brand-400">
                {t.logo_url ? <img src={t.logo_url} className="h-12 w-12 rounded-xl object-cover" alt="" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ background: t.primary_color }}><Building2 className="h-6 w-6" /></div>}
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{t.display_name || t.name}</div><div className="text-xs text-ink-3">{t.type}</div></div>
                <ArrowRight className="h-4 w-4 text-ink-3 transition group-hover:translate-x-1 group-hover:text-brand-700" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
