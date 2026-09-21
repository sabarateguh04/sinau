import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, ShieldCheck, Sparkles, Building2, ArrowRight, Bot, Map, PenTool, BrainCircuit, GraduationCap, ClipboardCheck, Wallet, UserPlus, Boxes, BadgeCheck, Lock, CalendarCheck, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';

interface TenantLite { id: string; slug: string; name: string; type: string; display_name: string | null; logo_url: string | null; primary_color: string }
const CYCLE = ['Materi', 'Pembelajaran', 'Aktivitas', 'Evaluasi', 'Analisis AI', 'Rekomendasi'];
const ROLES = [
  { icon: GraduationCap, title: 'Pembelajar', q: '"Apa yang harus saya pelajari berikutnya?"', items: ['Tutor Alesha 24 jam — Explain, Simplify, Quiz Me, Socratic', 'Konsep yang masih lemah + langkah berikutnya', 'Pengingat tugas, jadwal, tagihan dalam satu obrolan'] },
  { icon: PenTool, title: 'Pendidik', q: '"Bagian mana yang belum dipahami kelas saya?"', items: ['Teaching Insight: konsep belum terserap & miskonsepsi kelas', 'Draf rancangan pembelajaran & soal berlabel miskonsepsi', 'AI mengusulkan, guru memutuskan — draf selalu bisa disunting'] },
  { icon: Building2, title: 'Institusi', q: '"Apakah program kami berhasil, dan di mana lemahnya?"', items: ['Dashboard KPI, laporan sekolah, inbox persetujuan', 'Kompetensi terverifikasi, bukan sekadar nilai', 'Multi-lembaga: data terisolasi, branding sendiri'] },
];
const MODULES = [
  { icon: BookOpen, t: 'LMS', d: 'materi, tugas, kuis, bank soal' }, { icon: ClipboardCheck, t: 'Ujian online', d: 'sesi bertoken, pengawasan' }, { icon: BadgeCheck, t: 'Nilai & e-Rapor', d: 'rekap, P5, PDF' }, { icon: CalendarCheck, t: 'Presensi', d: 'QR, geofence, izin' },
  { icon: Wallet, t: 'Keuangan & Payroll', d: 'tagihan, kuitansi, PPh21' }, { icon: UserPlus, t: 'PPDB online', d: 'daftar, seleksi, daftar ulang' }, { icon: Boxes, t: 'Sarana & Perpus', d: 'aset, peminjaman, opname' }, { icon: Lock, t: 'PDP & Dapodik', d: 'consent, retensi, ekspor' },
];
const PRINCIPLES = [
  { icon: BrainCircuit, t: 'Analisis berakhir pada tindakan', d: 'Setiap wawasan menyebut jumlah bukti dan satu langkah konkret untuk pertemuan berikutnya. Grafik yang tidak mengubah apa pun tidak layak tampil.' },
  { icon: PenTool, t: 'AI mengusulkan, manusia memutuskan', d: 'Kelulusan, penjurusan, dan nilai akhir tidak pernah ditetapkan mesin. Semua keluaran AI bisa disunting atau ditolak.' },
  { icon: ShieldCheck, t: 'Privasi anak sebagai bawaan', d: 'Minimisasi data, retensi terbatas, persetujuan wali, dan ekspor/hapus data sesuai UU PDP — sejak versi pertama.' },
];

export default function Landing() {
  const [tenants, setTenants] = useState<TenantLite[]>([]);
  const [stats, setStats] = useState<{ tenants: number; students: number; materials: number } | null>(null);
  useEffect(() => {
    api.get('/auth/tenants').then((r) => setTenants(r.data.data)).catch(() => undefined);
    api.get('/public/platform').then((r) => setStats(r.data.data.stats)).catch(() => undefined);
  }, []);
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-surface-2 to-amber-50 dark:from-brand-900/30 dark:via-surface-2 dark:to-surface-2" />
        <div className="absolute -right-32 top-10 -z-10 h-96 w-96 rounded-full bg-accent-400/20 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <span className="chip bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200"><Sparkles className="mr-1 inline h-3.5 w-3.5" />Learn. Teach. Improve. Grow.</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">Satu platform.<br />Satu data belajar.<br /><span className="bg-gradient-to-r from-brand-700 to-accent-600 bg-clip-text text-transparent">Satu lapisan intelijen.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">Kebanyakan LMS berhenti pada menyimpan dan melaporkan. SINAU melanjutkan: <b className="text-ink">Alesha AI</b> membaca seluruh aktivitas belajar lalu menjawab apa yang belum dipahami, mengapa, dan apa yang sebaiknya dilakukan besok.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Link to="/login"><Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>Masuk</Button></Link><Link to="/portal"><Button size="lg" variant="outline" icon={<BookOpen className="h-4 w-4" />}>Jelajahi materi publik</Button></Link></div>
            {stats && <div className="mt-8 flex gap-8 text-sm text-ink-2"><span><b className="text-xl text-ink">{stats.tenants}</b> lembaga</span><span><b className="text-xl text-ink">{Number(stats.students).toLocaleString('id-ID')}</b> siswa</span><span><b className="text-xl text-ink">{Number(stats.materials).toLocaleString('id-ID')}</b> materi</span></div>}
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}><AleshaShowcase /></motion.div>
        </div>
      </section>

      {/* Cycle */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-2 px-4 py-5 text-sm font-semibold sm:px-6">
          {CYCLE.map((c, i) => <span key={c} className="flex items-center gap-2"><span className={i >= 4 ? 'rounded-full bg-brand-700 px-3 py-1 text-white' : 'rounded-full bg-surface-2 px-3 py-1 text-ink-2'}>{c}</span>{i < CYCLE.length - 1 && <ChevronRight className="h-4 w-4 text-ink-3" />}</span>)}
        </div>
      </section>

      {/* Roles */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Alesha menjawab pertanyaan yang sebenarnya dicari</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-2">Bukan chatbot yang menempel di samping. Satu lapisan intelijen yang membaca data lintas modul dan menulis balik berupa rekomendasi ke mana pun ia dibutuhkan.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {ROLES.map((r) => <div key={r.title} className="card p-6"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200"><r.icon className="h-5 w-5" /></div><h3 className="mt-4 text-lg font-bold">{r.title}</h3><p className="mt-1 text-sm italic text-ink-3">{r.q}</p><ul className="mt-4 space-y-2 text-sm text-ink-2">{r.items.map((it) => <li key={it} className="flex gap-2"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" />{it}</li>)}</ul></div>)}
        </div>
      </section>

      {/* Heatmap feature */}
      <section className="bg-brand-800 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <span className="chip bg-white/10 text-white"><Map className="mr-1 inline h-3.5 w-3.5" />Fitur penanda</span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight">Absorption Heatmap</h2>
            <p className="mt-3 text-white/80">Angka 78 di rapor tidak memberi tahu siapa pun apa yang harus dilakukan. Peta penyerapan per sub-konsep memberi tahu: konsep dasar dikuasai, tetapi soal cerita tertinggal — dan tindak lanjutnya berbeda sama sekali dari "ulangi latihan".</p>
            <ul className="mt-5 space-y-2 text-sm text-white/85"><li className="flex gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />Setiap soal berlabel konsep; setiap pengecoh berlabel miskonsepsi.</li><li className="flex gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />Peringatan dini saat kesalahan menumpuk pada pola jawaban yang sama.</li><li className="flex gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />Jumlah bukti ditampilkan di setiap angka — 80% dari 4 soal bukan 80% dari 40 soal.</li></ul>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 font-mono text-sm backdrop-blur">
            <div className="mb-3 text-xs uppercase tracking-wider text-white/60">Matematika · X RPL 1 · 32 siswa</div>
            {[['Pecahan · konsep dasar', 91], ['Pecahan · senilai', 87], ['Pecahan · penjumlahan', 73], ['Pecahan · soal cerita', 48], ['Desimal · konversi', 88], ['Desimal · aplikasi', 52]].map(([l, v], i) => { const n = Number(v); return <div key={String(l)} className="flex items-center gap-3 py-1"><span className="w-44 shrink-0 truncate text-white/80">{l}</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><motion.span initial={{ width: 0 }} whileInView={{ width: `${n}%` }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.6 }} className={`block h-full rounded-full ${n < 60 ? 'bg-red-400' : n < 80 ? 'bg-amber-300' : 'bg-emerald-400'}`} /></span><span className="w-10 text-right font-semibold">{n}%</span><span className="hidden w-24 text-xs text-white/60 sm:block">{n < 60 ? 'kritis' : n < 80 ? 'perlu penguatan' : 'baik'}</span></div>; })}
            <div className="mt-3 rounded-xl bg-amber-400/15 p-3 text-xs text-amber-100">⚠ 68% pembelajar memilih pengecoh yang sama pada pecahan senilai — <b>Saran Alesha:</b> ulangi dengan model batang sebelum lanjut ke operasi pecahan.</div>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-3xl font-extrabold tracking-tight">Sistem sekolah lengkap di bawahnya</h2><p className="mt-2 max-w-2xl text-ink-2">Intelijen tidak berguna tanpa data bersih. Semua modul menulis ke satu data yang sama — tidak ada integrasi tambahan.</p></div><span className="text-sm text-ink-3">15 peran · izin per modul</span></div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => <div key={m.t} className="card flex items-center gap-3 p-4"><m.icon className="h-5 w-5 shrink-0 text-brand-700" /><div><div className="font-semibold">{m.t}</div><div className="text-xs text-ink-3">{m.d}</div></div></div>)}
        </div>
      </section>

      {/* Principles */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-3">
          {PRINCIPLES.map((p) => <div key={p.t}><p.icon className="h-6 w-6 text-accent-500" /><h3 className="mt-3 font-bold">{p.t}</h3><p className="mt-1.5 text-sm text-ink-2">{p.d}</p></div>)}
        </div>
      </section>

      {/* Tenants */}
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

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-r from-brand-800 via-brand-700 to-accent-600 p-8 text-white sm:p-12">
          <div className="flex flex-wrap items-center justify-between gap-6"><div><h2 className="text-2xl font-extrabold sm:text-3xl">Coba tanya Alesha sekarang.</h2><p className="mt-2 max-w-xl text-white/85">Ikon ✨ di pojok kanan bawah aktif di halaman ini — tanyakan tentang SINAU, PPDB, atau berita lembaga. Setelah masuk, Alesha mengenal peran dan data Anda.</p></div><Link to="/login"><Button size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">Masuk ke SINAU</Button></Link></div>
        </div>
      </section>
    </div>
  );
}

/** Illustrative Alesha conversation (student persona) for the hero. */
function AleshaShowcase() {
  return (
    <div className="card overflow-hidden shadow-xl">
      <div className="flex items-center gap-3 bg-gradient-to-r from-brand-800 via-brand-700 to-accent-600 px-4 py-3 text-white"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><Sparkles className="h-4 w-4" /></span><div><div className="text-sm font-bold">Alesha</div><div className="text-[11px] text-white/80">Tutor · asisten mengajar · analis belajar</div></div></div>
      <div className="space-y-3 p-4 text-sm">
        <Bubble me>Konsep mana yang masih lemah?</Bubble>
        <Bubble delay={0.5}>Dari 24 soal kuis terakhir: <b>Model OSI 7 layer</b> 25% dan <b>Subnetting IPv4</b> 25%. Pola kesalahanmu: mengira pengalamatan ada di lapisan fisik.<br /><span className="text-ink-3">Langkah berikutnya: ulang OSI dari dasar, lalu 3 soal kontras.</span></Bubble>
        <Bubble me delay={1.1}>Quiz me!</Bubble>
        <Bubble delay={1.6}><b>Jaringan · Model OSI</b><br />Lapisan mana yang menangani pengalamatan logis?<br /><span className="mt-1 flex flex-wrap gap-1.5">{['A. Fisik', 'B. Data link', 'C. Network', 'D. Transport'].map((o) => <span key={o} className="rounded-full border border-brand-200 px-2 py-0.5 text-xs text-brand-700 dark:border-brand-800">{o}</span>)}</span></Bubble>
        <p className="pt-1 text-[11px] text-ink-3">Sumber: bank soal & hasil kuis lembaga · Socratic otomatis saat ujian berlangsung</p>
      </div>
    </div>
  );
}
function Bubble({ children, me, delay = 0 }: { children: React.ReactNode; me?: boolean; delay?: number }) {
  return <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className={me ? 'ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-700 px-3.5 py-2 text-white' : 'max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2 leading-relaxed'}>{children}</motion.div>;
}
