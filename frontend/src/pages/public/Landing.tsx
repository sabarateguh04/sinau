import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
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
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-brand-50 via-surface-2 to-amber-50 dark:from-brand-900/30 dark:via-surface-2 dark:to-surface-2">
          <div className="hero-grid" />
          <div className="blob -left-24 -top-24 h-[28rem] w-[28rem] bg-brand-400/60 dark:bg-brand-500/30" />
          <div className="blob blob-2 -right-32 top-10 h-[30rem] w-[30rem] bg-accent-400/50 dark:bg-accent-500/25" />
          <div className="blob blob-3 bottom-[-10rem] left-1/3 h-[24rem] w-[24rem] bg-brand-600/40 dark:bg-brand-400/20" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <span className="chip bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200"><Sparkles className="mr-1 inline h-3.5 w-3.5" />Learn. Teach. Improve. Grow.</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">Satu platform.<br />Satu data belajar.<br /><span className="bg-gradient-to-r from-brand-700 to-accent-600 bg-clip-text text-transparent">Satu lapisan intelijen.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">Kebanyakan LMS berhenti pada menyimpan dan melaporkan. SINAU melanjutkan: <b className="text-ink">Alesha AI</b> membaca seluruh aktivitas belajar lalu menjawab apa yang belum dipahami, mengapa, dan apa yang sebaiknya dilakukan besok.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Link to="/login"><Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>Masuk</Button></Link><Link to="/portal"><Button size="lg" variant="outline" icon={<BookOpen className="h-4 w-4" />}>Jelajahi materi publik</Button></Link></div>
            {stats && <div className="mt-8 flex gap-8 text-sm text-ink-2"><span><b className="text-xl text-ink">{stats.tenants}</b> lembaga</span><span><b className="text-xl text-ink">{Number(stats.students).toLocaleString('id-ID')}</b> siswa</span><span><b className="text-xl text-ink">{Number(stats.materials).toLocaleString('id-ID')}</b> materi</span></div>}
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} className="relative isolate"><div className="orbit -z-10" /><CampusScene /></motion.div>
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

/**
 * Hero visual: a round campus illustration — deliberately unlike the Alesha chat panel.
 * The open panel covers roughly x>200 / y>215 of this viewBox, so the annex, pupils,
 * birds and hedgerow all sit left-of-centre or high in the sky and stay readable
 * while someone is chatting.
 */
const HALO = [
  { icon: BookOpen, t: 'Materi & tugas', pos: 'left-0 top-[14%]', d: 0 },
  { icon: GraduationCap, t: 'Kelas & rapor', pos: 'right-0 top-[3%]', d: 0.9 },
  { icon: CalendarCheck, t: 'Presensi harian', pos: 'bottom-[16%] left-[1%]', d: 1.8 },
];
const PUPILS = [
  { x: 146, y: 338, body: 'fill-accent-500', hop: 0 },
  { x: 172, y: 346, body: 'fill-brand-600 dark:fill-brand-400', hop: 0.7 },
  { x: 196, y: 336, body: 'fill-brand-500', hop: 1.4 },
];
const RAYS = [0, 60, 120, 180, 240, 300];

function CampusScene() {
  const reduce = useReducedMotion();
  const ease = 'easeInOut' as const;
  const float = (delay: number) => (reduce ? {} : { animate: { y: [0, -7, 0] }, transition: { duration: 5.5, repeat: Infinity, ease, delay } });
  const loop = (animate: Record<string, number[]>, duration: number, delay = 0) =>
    reduce ? {} : { animate, transition: { duration, repeat: Infinity, ease, delay } };

  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="aspect-square overflow-hidden rounded-full bg-gradient-to-b from-brand-100 via-surface to-amber-50 shadow-[0_28px_70px_-28px_rgb(15_23_42/0.45)] ring-1 ring-brand-200/70 dark:from-brand-800/55 dark:via-brand-900/45 dark:to-surface-3 dark:ring-2 dark:ring-brand-600/50">
        <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="Ilustrasi kampus sekolah: gedung utama bermenara jam, gedung annex, halaman dengan pepohonan dan siswa">
          {/* Sun */}
          <circle cx="312" cy="84" r="34" fill="var(--accent-400)" opacity="0.28" />
          {RAYS.map((a) => (
            <line
              key={a} x1="312" y1="84"
              x2={(312 + 44 * Math.cos((a * Math.PI) / 180)).toFixed(1)}
              y2={(84 + 44 * Math.sin((a * Math.PI) / 180)).toFixed(1)}
              stroke="var(--accent-400)" strokeWidth="3" strokeLinecap="round" opacity="0.45"
            />
          ))}
          <circle cx="312" cy="84" r="19" fill="var(--accent-400)" opacity="0.9" />

          {/* Clouds */}
          <motion.g className="fill-white/80 dark:fill-brand-200/10" {...loop({ x: [0, 14, 0] }, 16)}>
            <ellipse cx="94" cy="104" rx="35" ry="15" />
            <ellipse cx="118" cy="95" rx="23" ry="14" />
          </motion.g>
          <motion.g className="fill-white/75 dark:fill-brand-200/10" {...loop({ x: [0, -11, 0] }, 21, 1.5)}>
            <ellipse cx="286" cy="158" rx="27" ry="11" />
          </motion.g>

          {/* Birds */}
          <motion.g stroke="var(--ink-3)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" {...loop({ x: [0, 18, 0], y: [0, -7, 0] }, 11)}>
            <path d="M58 78 q6 -6 12 0 q6 -6 12 0" />
            <path d="M94 56 q5 -5 10 0 q5 -5 10 0" />
            <path d="M124 88 q4 -4 8 0 q4 -4 8 0" />
          </motion.g>

          {/* Ground + walkway */}
          <path d="M-10 296 Q200 276 410 296 L410 410 L-10 410 Z" className="fill-brand-600/20 dark:fill-brand-400/25" />
          <path d="M-10 318 Q200 300 410 318 L410 410 L-10 410 Z" className="fill-brand-700/28 dark:fill-brand-500/30" />

          {/* Trees */}
          <g opacity="0.9">
            <rect x="28" y="266" width="8" height="28" rx="4" fill="var(--brand-800)" opacity="0.75" />
            <circle cx="24" cy="262" r="11" fill="var(--brand-600)" />
            <circle cx="42" cy="262" r="11" fill="var(--brand-400)" />
            <circle cx="32" cy="252" r="15" fill="var(--brand-500)" />
            <rect x="324" y="272" width="9" height="26" rx="4" fill="var(--brand-800)" opacity="0.75" />
            <circle cx="312" cy="268" r="14" fill="var(--brand-600)" />
            <circle cx="342" cy="268" r="14" fill="var(--brand-400)" />
            <circle cx="328" cy="257" r="20" fill="var(--brand-500)" />
          </g>

          {/* Annex — a low left wing, so the campus is not one lonely block */}
          <rect x="44" y="248" width="68" height="44" className="fill-surface dark:fill-surface-3" stroke="var(--brand-300)" strokeWidth="2" />
          <rect x="38" y="240" width="80" height="9" rx="4" className="fill-brand-800 dark:fill-brand-600" />
          {[52, 74, 96].map((x) => (
            <rect key={x} x={x} y="260" width="14" height="16" rx="2" fill="var(--accent-400)" stroke="var(--brand-800)" strokeWidth="1.2" strokeOpacity="0.25" opacity="0.9" />
          ))}

          {/* Main block + clock tower */}
          <rect x="112" y="214" width="176" height="78" className="fill-surface dark:fill-surface-3" stroke="var(--brand-300)" strokeWidth="2" />
          <polygon points="102,216 200,168 298,216" fill="var(--brand-700)" />
          <rect x="98" y="212" width="204" height="9" rx="4" className="fill-brand-800 dark:fill-brand-600" />
          <rect x="174" y="150" width="52" height="64" className="fill-surface dark:fill-surface-3" stroke="var(--brand-300)" strokeWidth="2" />
          <polygon points="166,152 200,120 234,152" className="fill-brand-800 dark:fill-brand-600" />
          <path d="M200 120 V86" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" />
          <motion.path d="M201 90 L229 98 L201 108 Z" fill="var(--accent-500)" style={{ transformOrigin: '201px 99px' }} {...loop({ rotate: [0, -4, 0, 4, 0] }, 6)} />
          <circle cx="200" cy="181" r="13" fill="var(--accent-400)" />
          <path d="M200 174 V181 L205 185" stroke="var(--brand-900)" strokeWidth="2.5" strokeLinecap="round" fill="none" />

          {/* Windows — two breathe so the scene is not dead still */}
          {[[118, 226], [146, 226], [232, 226], [260, 226], [118, 256], [146, 256], [232, 256], [260, 256]].map(([x, y], i) => (
            <motion.rect
              key={`${x}-${y}`} x={x} y={y} width="22" height="22" rx="3"
              fill="var(--accent-400)" stroke="var(--brand-800)" strokeWidth="1.5" strokeOpacity="0.25"
              {...(reduce || (i !== 0 && i !== 5) ? { opacity: 0.92 } : { animate: { opacity: [0.92, 0.55, 0.92] }, transition: { duration: 4, repeat: Infinity, delay: i * 1.3 } })}
            />
          ))}

          {/* Entrance */}
          <path d="M186 292 v-22 a14 14 0 0 1 28 0 v22 z" className="fill-brand-600 dark:fill-brand-400" />
          <rect x="166" y="292" width="68" height="6" rx="3" className="fill-brand-700/55 dark:fill-brand-400/60" />
          <rect x="156" y="298" width="88" height="6" rx="3" className="fill-brand-700/40 dark:fill-brand-400/45" />

          {/* Hedgerow and a few flowers on the near lawn */}
          <g className="fill-brand-500/55 dark:fill-brand-500/45">
            {[46, 66, 86, 106, 126, 292, 314].map((x) => <circle key={x} cx={x} cy="297" r="9" />)}
          </g>
          {[[52, 320], [88, 328], [222, 320], [64, 340], [116, 346]].map(([x, y], i) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill={i % 2 ? 'var(--accent-400)' : 'var(--brand-300)'} opacity="0.85" />
          ))}

          {/* Pupils in the yard */}
          {PUPILS.map((p) => (
            <motion.g key={p.x} {...loop({ y: [0, -3, 0] }, 3.4, p.hop)}>
              <circle cx={p.x} cy={p.y - 28} r="7.5" className="fill-brand-900 dark:fill-brand-100" />
              <path d={`M${p.x - 8} ${p.y - 2} v-15 a8 8 0 0 1 16 0 v15 z`} className={p.body} />
              <path d={`M${p.x - 3.5} ${p.y - 2} v7 M${p.x + 3.5} ${p.y - 2} v7`} className="stroke-brand-900 dark:stroke-brand-100" strokeWidth="2.5" strokeLinecap="round" />
            </motion.g>
          ))}
          <circle cx="120" cy="330" r="5.5" fill="var(--accent-500)" opacity="0.9" />
        </svg>
      </div>

      {HALO.map((h) => (
        <motion.span
          key={h.t}
          className={`absolute ${h.pos} flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1.5 text-[11px] font-semibold shadow-soft backdrop-blur`}
          {...float(h.d)}
        >
          <h.icon className="h-3.5 w-3.5 text-brand-700 dark:text-brand-300" />{h.t}
        </motion.span>
      ))}
    </div>
  );
}
