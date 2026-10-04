import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen, ShieldCheck, Sparkles, Building2, ArrowRight, Bot, Map, PenTool, BrainCircuit, GraduationCap, ClipboardCheck, Wallet, UserPlus, Boxes, BadgeCheck, Lock, CalendarCheck, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, cx } from '@/components/ui';
import gambar5 from '@/img/gambar5.jpg';

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
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-brand-50 via-surface-2 to-amber-50 dark:from-brand-900/30 dark:via-surface-2 dark:to-surface-2">
          <div className="hero-grid" />
          <div className="blob -left-24 -top-24 h-[28rem] w-[28rem] bg-brand-400/60 dark:bg-brand-500/30" />
          <div className="blob blob-2 -right-32 top-10 h-[30rem] w-[30rem] bg-accent-400/50 dark:bg-accent-500/25" />
          <div className="blob blob-3 bottom-[-10rem] left-1/3 h-[24rem] w-[24rem] bg-brand-600/40 dark:bg-brand-400/20" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {/* Tagline Top Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-50/90 px-3.5 py-1 text-xs font-bold text-brand-800 shadow-xs backdrop-blur-md dark:border-brand-500/30 dark:bg-brand-950/50 dark:text-brand-300">
              <Sparkles className="h-3.5 w-3.5 text-accent-500 animate-pulse" />
              <span>Learn. Teach. Improve. Grow.</span>
            </div>

            {/* Headline */}
            <h1 className="mt-2.5 text-3xl font-black leading-[1.12] tracking-tight sm:text-4xl lg:text-[2.65rem]">
              Satu platform.<br />Satu data belajar.<br />
              <span className="bg-gradient-to-r from-brand-700 via-teal-600 to-accent-600 bg-clip-text text-transparent dark:from-brand-400 dark:via-teal-300 dark:to-accent-400">
                Satu lapisan intelijen.
              </span>
            </h1>

            {/* Body text */}
            <p className="mt-3 max-w-lg text-sm sm:text-base leading-relaxed text-ink-2 font-normal">
              Kebanyakan LMS berhenti pada menyimpan dan melaporkan. SINAU melanjutkan: <b className="text-ink font-semibold">Alesha AI</b> membaca seluruh aktivitas belajar lalu menjawab apa yang belum dipahami, mengapa, dan apa yang sebaiknya dilakukan besok.
            </p>

            {/* CTA Buttons */}
            <div className="mt-4 sm:mt-5 flex flex-wrap gap-2.5">
              <Link to="/login">
                <Button size="lg" className="shadow-lg shadow-brand-700/20 hover:shadow-brand-700/35 hover:-translate-y-0.5 transition-all" icon={<ArrowRight className="h-4 w-4" />}>
                  Masuk
                </Button>
              </Link>
              <Link to="/portal">
                <Button size="lg" variant="outline" className="border-line/80 bg-surface/70 hover:bg-surface hover:border-brand-500/40 backdrop-blur-md transition-all shadow-xs" icon={<BookOpen className="h-4 w-4" />}>
                  Jelajahi materi publik
                </Button>
              </Link>
            </div>

            {/* Redesigned Mini Stats Card with Dividers & Icons */}
            {stats && (
              <div className="mt-5 pt-3.5 border-t border-line/60">
                <div className="grid grid-cols-3 gap-2 sm:gap-3 rounded-2xl bg-surface/70 dark:bg-surface-2/70 border border-line/50 p-2 sm:p-2.5 backdrop-blur-md shadow-xs">
                  {/* Stat 1: Lembaga */}
                  <div className="flex items-center gap-2 px-1.5 sm:px-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm sm:text-base font-black tracking-tight text-ink leading-none">
                        {stats.tenants}
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-medium text-ink-3 truncate mt-0.5">
                        Lembaga
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-2 border-l border-line/70 px-1.5 sm:px-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                      <GraduationCap className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm sm:text-base font-black tracking-tight text-ink leading-none">
                        {Number(stats.students).toLocaleString('id-ID')}
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-medium text-ink-3 truncate mt-0.5">
                        Siswa Aktif
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-2 border-l border-line/70 px-1.5 sm:px-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm sm:text-base font-black tracking-tight text-ink leading-none">
                        {Number(stats.materials).toLocaleString('id-ID')}
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-medium text-ink-3 truncate mt-0.5">
                        Materi
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} className="relative isolate lg:-mt-3">
            <HeroPhotoVisual />
          </motion.div>
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
            {[['Pecahan · konsep dasar', 91], ['Pecahan · senilai', 87], ['Pecahan · penjumlahan', 73], ['Pecahan · soal cerita', 48], ['Desimal · konversi', 88], ['Desimal · aplikasi', 52]].map(([l, v], i) => { const n = Number(v); return <div key={String(l)} className="flex items-center gap-3 py-1"><span className="w-32 sm:w-44 shrink-0 truncate text-white/80">{l}</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><motion.span initial={{ width: 0 }} whileInView={{ width: `${n}%` }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.6 }} className={`block h-full rounded-full ${n < 60 ? 'bg-red-400' : n < 80 ? 'bg-amber-300' : 'bg-emerald-400'}`} /></span><span className="w-10 text-right font-semibold">{n}%</span><span className="hidden w-24 text-xs text-white/60 sm:block">{n < 60 ? 'kritis' : n < 80 ? 'perlu penguatan' : 'baik'}</span></div>; })}
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

/**
 * Modern HD Photography Carousel + AI Glassmorphism Hero Visual
 * Features 3-image auto-rotating slideshow (3000ms interval) with smooth Ken-Burns crossfade,
 * interactive dot navigation, and AI glassmorphic floating badges.
 */
const HERO_SLIDES = [
  {
    url: 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=1200&q=80',
    title: 'Belajar & Diskusi Digital',
    caption: '1. Akses Materi & Diskusi Interaktif',
  },
  {
    url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
    title: 'E-Learning via Laptop/Gadget',
    caption: '2. Pembelajaran Mandiri Fleksibel',
  },
  {
    url: 'https://images.unsplash.com/photo-1531545514256-b1400bc00f31?auto=format&fit=crop&w=1200&q=80',
    title: 'Kolaborasi & Mentoring Siswa',
    caption: '3. Kolaborasi Kelas Terpadu',
  },
  {
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
    title: 'Analisis & Evaluasi Otomatis AI',
    caption: '4. Pemantauan Progres Real-Time',
  },
  {
    url: gambar5,
    title: 'Capaian & Hasil Belajar Siswa',
    caption: '5. Rekomendasi Adaptif & Panduan Belajar Alesha AI',
  },
];

function HeroPhotoVisual() {
  const reduce = useReducedMotion();
  const ease = 'easeInOut' as const;
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[490px] lg:max-w-none pt-1 pb-6 sm:pb-8 lg:-translate-y-2 mb-4 sm:mb-6">
      {/* Ambient Glowing Radial Gradient Aura */}
      <div className="absolute -inset-4 sm:-inset-6 rounded-[2.5rem] bg-gradient-to-tr from-brand-500/25 via-teal-400/20 to-accent-500/20 blur-3xl -z-10 animate-pulse [animation-duration:6s] pointer-events-none" />

      {/* Floating Badge 1 (Kiri Atas): AI-Powered Learning System */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: [0, -6, 0] }}
        transition={reduce ? { duration: 0.3 } : { duration: 6, repeat: Infinity, ease }}
        className="absolute -top-2.5 -left-2 sm:-top-3 sm:-left-3 z-20 flex items-center gap-2 rounded-full border border-white/40 dark:border-white/15 bg-white/85 dark:bg-slate-900/85 px-3 py-1.5 sm:px-3.5 sm:py-2 shadow-xl shadow-brand-950/10 backdrop-blur-md"
      >
        <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 via-teal-500 to-accent-500 text-white shadow-xs">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-ink dark:text-white whitespace-nowrap">
            AI-Powered Learning System
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
        </div>
      </motion.div>

      {/* Floating Main Image Container with Smooth Float & Hover Scale */}
      <motion.div
        animate={reduce ? {} : { y: [0, -8, 0] }}
        transition={reduce ? {} : { duration: 7, repeat: Infinity, ease }}
        className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/60 dark:border-white/10 bg-slate-950 shadow-2xl shadow-emerald-500/10 dark:shadow-brand-950/30 ring-1 ring-black/5"
      >
        {/* Aspect ratio container - keeps height compact and aligned with stats fold */}
        <div className="relative aspect-[16/11] sm:aspect-[16/11] w-full overflow-hidden bg-slate-900">
          {HERO_SLIDES.map((slide, i) => (
            <div
              key={slide.url}
              className={cx(
                'absolute inset-0 transition-all duration-700 ease-in-out',
                currentSlide === i ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
              )}
            >
              <img
                src={slide.url}
                alt={slide.caption}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="h-full w-full object-cover"
              />
            </div>
          ))}

          {/* Subtle glassmorphic & ambient emerald/dark gradient overlays for crisp readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/45 via-35% to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-tr from-brand-900/25 via-transparent to-accent-500/15 pointer-events-none" />

          {/* Bottom Photo Integrated Glass Caption Bar & Indicators */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 rounded-xl border border-white/20 bg-slate-950/75 px-3 py-2 text-xs text-white backdrop-blur-md shadow-lg">
            {/* Badge caption dinamis di kiri bawah kartu */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
              <span className="font-semibold text-[11px] sm:text-xs text-white/95 truncate">
                {HERO_SLIDES[currentSlide].caption}
              </span>
            </div>

            {/* 5 dot indicator horizontal kecil di kanan bawah gambar */}
            <div className="flex items-center gap-1.5 shrink-0" role="tablist" aria-label="Slideshow indicator">
              {HERO_SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentSlide(i)}
                  aria-label={`Lihat slide ${i + 1}`}
                  className={cx(
                    'h-1.5 rounded-full transition-all duration-300 cursor-pointer',
                    currentSlide === i ? 'w-5 bg-emerald-400 shadow-xs' : 'w-1.5 bg-white/40 hover:bg-white/75'
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
