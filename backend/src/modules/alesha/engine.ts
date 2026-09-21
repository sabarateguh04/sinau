/**
 * Alesha AI — lapisan intelijen SINAU (engine DUMMY / demo).
 *
 * Satu titik sambung untuk engine nyata: semua yang dibutuhkan UI lewat `chat()` — pesan, riwayat,
 * konteks halaman, mode tutor, dan pengguna yang sedang login. Engine dummy tidak mengarang: setiap
 * jawaban dibaca dari data tenant yang sebenarnya (materi, tugas, peta konsep, jadwal, tagihan) dan
 * selalu menyebut sumbernya, sesuai kontrak kepercayaan di dokumen konsep.
 *
 *   TODO(engine): bila ALESHA_API_URL terisi, `forwardToAlesha()` mem-proxy ke engine nyata
 *   (POST {ALESHA_API_URL}/api/chat/learning) dan jatuh kembali ke dummy bila gagal. Untuk LLM
 *   langsung: susun system prompt dari `buildFacts()` di bawah (fakta terstruktur per peran).
 */
import { T } from '../../config';
import { query, queryOne, Row } from '../../database/db';
import { AuthUser, hasRole } from '../../core/auth';
import { classSubjectScope, childrenOf } from '../../core/scope';

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export type TutorMode = 'explain' | 'simplify' | 'example' | 'why' | 'practice' | 'quiz' | 'challenge' | 'review' | 'exam' | 'socratic';
export interface ChatContext { page?: string; tenant_slug?: string; mode?: TutorMode; material_title?: string | null; state?: Record<string, unknown> | null }
export interface ChatReply { reply: string; suggestions: string[]; sources: string[]; mode: TutorMode | null; engine: 'dummy' | 'alesha'; latency_ms: number; state?: Record<string, unknown> | null }

export const ALESHA = { name: 'Alesha', engine: process.env.ALESHA_API_URL ? 'alesha' : 'dummy', voice: 'browser' } as const;
export const TUTOR_MODES: { key: TutorMode; label: string; desc: string }[] = [
  { key: 'explain', label: 'Explain', desc: 'Menjelaskan dari dasar dengan satu contoh utama' },
  { key: 'simplify', label: 'Simplify', desc: 'Bahasa lebih sederhana, tanpa istilah teknis' },
  { key: 'example', label: 'Give Example', desc: 'Contoh dalam konteks pilihanmu' },
  { key: 'why', label: 'Why', desc: 'Alasan di balik aturan atau langkah' },
  { key: 'practice', label: 'Practice', desc: 'Latihan bertingkat dengan umpan balik' },
  { key: 'quiz', label: 'Quiz Me', desc: 'Uji singkat dari bank soal, catat pola kesalahan' },
  { key: 'challenge', label: 'Challenge Me', desc: 'Naikkan tingkat kesulitan bertahap' },
  { key: 'review', label: 'Review', desc: 'Ulang materi lama pada jarak waktu optimal' },
  { key: 'exam', label: 'Exam Mode', desc: 'Simulasi ujian berwaktu tanpa bantuan' },
  { key: 'socratic', label: 'Socratic', desc: 'Hanya bertanya balik — aktif otomatis saat tugas/ujian berjalan' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// word-start match so "nilai" does not fire on "senilai" but still matches "nilaiku"
const has = (s: string, ...words: string[]) => words.some((w) => new RegExp('\\b' + w.trim()).test(s));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const first = (name?: string | null) => (name ? name.split(' ')[0].replace(/[,.]/g, '') : '');
const money = (n: unknown) => 'Rp ' + Math.round(Number(n ?? 0)).toLocaleString('id-ID');
const dmy = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }) : '-');
const hm = (t: unknown) => String(t ?? '').slice(0, 5);
const json = <T,>(v: unknown, fb: T): T => { try { return (typeof v === 'string' ? JSON.parse(v) : v) ?? fb; } catch { return fb; } };
const topicOf = (m: string) => { const x = m.match(/(?:tentang|materi|topik|bab|untuk)\s+(.+)$/); return x ? x[1].replace(/\b(kelas|untuk|selama)\b.*$/, '').trim() : ''; };

type R = { reply: string; suggestions?: string[]; sources?: string[]; state?: Record<string, unknown> | null };
const S = {
  siswa: ['Tugas apa yang mendekati tenggat?', 'Konsep mana yang masih lemah?', 'Jadwal hari ini', 'Quiz me!'],
  guru: ['Insight kelas saya', 'Rancang pembelajaran tentang persamaan linear', 'Tugas yang belum dinilai', 'Buat soal tentang pecahan'],
  admin: ['Ringkasan sekolah hari ini', 'Berapa tunggakan tagihan?', 'Apa itu SINAU?'],
  wali: ['Bagaimana perkembangan anak saya?', 'Tagihan anak saya', 'Kehadiran anak saya'],
  publik: ['Apa itu SINAU?', 'PPDB sedang dibuka?', 'Berita terbaru', 'Cara masuk ke SINAU'],
};

/* ───────────── data helpers (read-only, tenant-scoped) ───────────── */
async function studentInfo(u: AuthUser, sid: string) {
  const cls = await queryOne(`SELECT c.id, c.name FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE e.student_id = ? AND e.status = 'AKTIF' AND ay.is_active = 1 LIMIT 1`, [sid]);
  return cls;
}
async function upcomingAssignments(u: AuthUser, sid: string) {
  return query(`SELECT a.title, a.due_at, s.name AS subject, sub.status AS sub_status FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id
    JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF' LEFT JOIN \`${T('submissions')}\` sub ON sub.assignment_id = a.id AND sub.student_id = e.student_id
    WHERE a.tenant_id = ? AND a.status = 'PUBLISHED' AND (sub.id IS NULL OR sub.status = 'DRAFT') ORDER BY a.due_at IS NULL, a.due_at LIMIT 5`, [sid, u.tenantId]);
}
async function weakConcepts(u: AuthUser, sid: string) {
  return query(`SELECT cp.name, s.name AS subject, COUNT(*) AS answered, SUM(qa.is_correct = 1) AS correct FROM \`${T('quiz_answers')}\` qa JOIN \`${T('quiz_attempts')}\` at ON at.id = qa.attempt_id JOIN \`${T('questions')}\` q ON q.id = qa.question_id JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id LEFT JOIN \`${T('subjects')}\` s ON s.id = cp.subject_id
    WHERE at.student_id = ? AND at.tenant_id = ? AND at.status <> 'IN_PROGRESS' AND qa.is_correct IS NOT NULL GROUP BY cp.id, cp.name, s.name HAVING COUNT(*) >= 2 ORDER BY (SUM(qa.is_correct = 1) / COUNT(*)) ASC LIMIT 3`, [sid, u.tenantId]);
}
async function classInsight(u: AuthUser) {
  const sc = classSubjectScope(u);
  const rows = await query(`SELECT cp.name AS concept, s.name AS subject, c.name AS class_name, COUNT(*) AS answered, SUM(qa.is_correct = 1) AS correct, COUNT(DISTINCT at.student_id) AS students
    FROM \`${T('quiz_answers')}\` qa JOIN \`${T('quiz_attempts')}\` at ON at.id = qa.attempt_id JOIN \`${T('quizzes')}\` qz ON qz.id = at.quiz_id JOIN \`${T('class_subjects')}\` cs ON cs.id = qz.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id
    JOIN \`${T('questions')}\` q ON q.id = qa.question_id JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id LEFT JOIN \`${T('subjects')}\` s ON s.id = cp.subject_id
    WHERE at.tenant_id = ? AND at.status <> 'IN_PROGRESS' AND qa.is_correct IS NOT NULL AND ${sc.sql} GROUP BY cp.id, cp.name, s.name, c.name HAVING COUNT(*) >= 3 ORDER BY (SUM(qa.is_correct = 1) / COUNT(*)) ASC LIMIT 3`, [u.tenantId, ...sc.params]);
  const mis = await query(`SELECT q.options, qa.answer, cp.name AS concept FROM \`${T('quiz_answers')}\` qa JOIN \`${T('quiz_attempts')}\` at ON at.id = qa.attempt_id JOIN \`${T('quizzes')}\` qz ON qz.id = at.quiz_id JOIN \`${T('class_subjects')}\` cs ON cs.id = qz.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id
    JOIN \`${T('questions')}\` q ON q.id = qa.question_id JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id WHERE at.tenant_id = ? AND qa.is_correct = 0 AND q.type = 'MC' AND ${sc.sql} LIMIT 500`, [u.tenantId, ...sc.params]);
  const count = new Map<string, number>();
  for (const w of mis) { const opts = json<{ key: string; misconception?: string | null }[]>(w.options, []); const ans = json<unknown>(w.answer, null); const o = opts.find((x) => x.key === ans); if (o?.misconception) count.set(`${w.concept}|${o.misconception}`, (count.get(`${w.concept}|${o.misconception}`) ?? 0) + 1); }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return { rows, misconception: top ? { concept: top[0].split('|')[0], label: top[0].split('|')[1], n: top[1], total: mis.length } : null };
}
async function pickQuestion(u: AuthUser, sid: string, exclude: string[] = []) {
  const notIn = exclude.length ? ` AND q.id NOT IN (${exclude.map(() => '?').join(',')})` : '';
  return queryOne(`SELECT q.id, q.text, q.options, q.answer_key, q.explanation, s.name AS subject, cp.name AS concept FROM \`${T('questions')}\` q LEFT JOIN \`${T('subjects')}\` s ON s.id = q.subject_id LEFT JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id
    WHERE q.tenant_id = ? AND q.is_active = 1 AND q.type = 'MC' AND q.subject_id IN (SELECT cs.subject_id FROM \`${T('class_subjects')}\` cs JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id WHERE e.student_id = ? AND e.status = 'AKTIF')${notIn} ORDER BY RAND() LIMIT 1`, [u.tenantId, sid, ...exclude]);
}
async function activeAttempt(u: AuthUser) {
  const q = await queryOne(`SELECT id FROM \`${T('quiz_attempts')}\` WHERE student_id = ? AND status = 'IN_PROGRESS' AND (deadline_at IS NULL OR deadline_at > NOW()) LIMIT 1`, [u.id]);
  if (q) return 'kuis';
  const e = await queryOne(`SELECT id FROM \`${T('exam_attempts')}\` WHERE student_id = ? AND status = 'IN_PROGRESS' AND (deadline_at IS NULL OR deadline_at > NOW()) LIMIT 1`, [u.id]);
  return e ? 'ujian' : null;
}

/* ───────────── the dummy brain ───────────── */
async function dummyReply(message: string, ctx: ChatContext, u: AuthUser | null): Promise<R> {
  const m = norm(message);
  const nama = first(u?.name);
  const sapa = nama ? `, ${nama}` : '';
  const role = !u ? 'publik' : hasRole(u, 'SISWA') ? 'siswa' : hasRole(u, 'WALI_MURID') ? 'wali' : hasRole(u, 'GURU', 'KAPRODI', 'WAKEPSEK') ? 'guru' : 'admin';
  const sugg = S[role as keyof typeof S];
  const SRC_DATA = 'Sumber: data lembaga Anda (bukan perkiraan)';
  const SRC_MODEL = 'Sumber: pengetahuan umum model (demo) — perlu verifikasi pendidik';

  if (!m || has(m, 'halo', 'hai', 'hello', 'selamat', 'assalamu', 'pagi', 'siang', 'sore', 'malam')) {
    const intro: Record<string, string> = {
      siswa: 'Saya bisa mengingatkan tugas, menunjukkan konsep yang masih lemah, mengulang materi, atau menguji kamu lewat "Quiz me".',
      guru: 'Saya bisa merangkum insight kelas (konsep yang belum terserap dan miskonsepsi yang menumpuk), menyusun draf rancangan pembelajaran, dan menyiapkan draf soal.',
      admin: 'Saya bisa merangkum kondisi sekolah hari ini: kehadiran, tagihan, hal yang menunggu persetujuan.',
      wali: 'Saya bisa merangkum perkembangan anak Anda: capaian konsep, kehadiran, dan tagihan — bukan jejak aktivitas menit per menit.',
      publik: 'Saya bisa menjelaskan SINAU, PPDB, berita lembaga, dan cara masuk.',
    };
    return { reply: `Halo${sapa}! Saya Alesha, lapisan intelijen SINAU. ${intro[role]} Mau mulai dari mana?`, suggestions: sugg };
  }
  if (has(m, 'terima kasih', 'makasih', 'thanks', 'matur')) return { reply: `Sama-sama${sapa}! Selamat sinau — belajar yang bermuara pada kompetensi, bukan sekadar nilai.`, suggestions: sugg };
  if (has(m, 'apa itu sinau', 'tentang sinau', 'sinau itu', 'apa itu alesha', 'siapa kamu', 'kamu siapa')) {
    return { reply: 'SINAU ("belajar" dalam bahasa Jawa) adalah platform pembelajaran multi-tenant: satu platform, satu data belajar, satu lapisan intelijen. Siklusnya: Materi → Pembelajaran → Aktivitas → Evaluasi → Analisis AI → Rekomendasi.\n\nSaya, Alesha, adalah lapisan intelijennya — tutor untuk pembelajar, asisten mengajar untuk pendidik, dan analis belajar untuk institusi. Prinsipnya: **AI mengusulkan, manusia memutuskan**; setiap analisis diakhiri satu tindakan konkret; dan setiap angka menyebut jumlah buktinya.', suggestions: sugg, sources: ['Dokumen konsep produk SINAU'] };
  }
  if (has(m, 'cara masuk', 'login', 'lupa sandi', 'lupa password', 'kata sandi')) return { reply: 'Masuk lewat halaman **/login** dengan username dari lembaga Anda. Lupa sandi → tautan "Lupa kata sandi" akan mengirim tautan reset ke e-mail terdaftar. Kalau belum punya akun, hubungi Admin Sekolah lembaga Anda (siswa & wali tidak mendaftar sendiri).', suggestions: sugg };

  /* ── publik (tanpa login) ── */
  if (!u) {
    const tenant = ctx.tenant_slug ? await queryOne(`SELECT t.id, t.name, b.display_name, t.phone, t.email, t.address FROM \`${T('tenants')}\` t LEFT JOIN \`${T('tenant_branding')}\` b ON b.tenant_id = t.id WHERE t.slug = ? AND t.deleted_at IS NULL`, [ctx.tenant_slug]) : null;
    if (has(m, 'ppdb', 'daftar', 'pendaftaran', 'penerimaan')) {
      if (!tenant) return { reply: 'Buka situs lembaga (/s/<nama-lembaga>) lalu pilih menu PPDB untuk melihat periode pendaftaran yang sedang dibuka.', suggestions: sugg };
      const p = await queryOne(`SELECT name, open_at, close_at, quota FROM \`${T('ppdb_periods')}\` WHERE tenant_id = ? AND is_active = 1 AND close_at >= NOW() ORDER BY open_at DESC LIMIT 1`, [tenant.id]);
      return p ? { reply: `**${p.name}** sedang dibuka di ${tenant.display_name ?? tenant.name}: ${dmy(p.open_at)} s.d. ${dmy(p.close_at)}${p.quota ? `, kuota ${p.quota} calon siswa` : ''}. Daftar lewat menu **PPDB** di situs lembaga, lalu cek status dengan nomor pendaftaran Anda.`, suggestions: ['Syarat pendaftaran?', 'Berita terbaru', 'Cara masuk ke SINAU'], sources: [SRC_DATA] }
        : { reply: `Saat ini belum ada periode PPDB yang dibuka di ${tenant.display_name ?? tenant.name}. Pantau halaman PPDB atau berita lembaga.`, suggestions: sugg, sources: [SRC_DATA] };
    }
    if (has(m, 'berita', 'kabar', 'pengumuman', 'kegiatan')) {
      if (!tenant) return { reply: 'Berita ada di situs masing-masing lembaga (/s/<nama-lembaga>).', suggestions: sugg };
      const news = await query(`SELECT title, published_at FROM \`${T('news_articles')}\` WHERE tenant_id = ? AND is_published = 1 ORDER BY published_at DESC LIMIT 3`, [tenant.id]);
      return { reply: news.length ? `Berita terbaru ${tenant.display_name ?? tenant.name}:\n${news.map((n, i) => `${i + 1}. ${n.title} (${dmy(n.published_at)})`).join('\n')}` : 'Belum ada berita yang diterbitkan.', suggestions: sugg, sources: [SRC_DATA] };
    }
    if (has(m, 'kontak', 'alamat', 'telepon', 'hubungi', 'email')) return tenant ? { reply: `${tenant.display_name ?? tenant.name}\n${tenant.address ?? '-'}\nTelepon: ${tenant.phone ?? '-'} · E-mail: ${tenant.email ?? '-'}`, suggestions: sugg, sources: [SRC_DATA] } : { reply: 'Kontak ada di halaman situs masing-masing lembaga.', suggestions: sugg };
    return { reply: `Maaf, saya masih dalam mode demo dan belum bisa menjawab itu. Coba tanyakan tentang SINAU, PPDB, berita, atau cara masuk.`, suggestions: sugg };
  }

  /* ── siswa ── */
  if (role === 'siswa') {
    const sid = u.id;
    const busy = await activeAttempt(u);
    const mode: TutorMode | undefined = busy ? 'socratic' : ctx.mode;
    if (mode === 'socratic' && !has(m, 'tugas', 'jadwal', 'tagihan', 'absen')) {
      return { reply: `${busy ? `Kamu sedang mengerjakan ${busy}, jadi saya otomatis masuk **mode Socratic**: saya tidak memberi jawaban, hanya membantu berpikir. ` : ''}Coba jawab dulu: apa yang ditanyakan soal itu dengan kata-katamu sendiri? Informasi apa yang sudah diketahui, dan mana yang belum? Langkah pertama apa yang biasanya dipakai untuk soal sejenis?`, suggestions: ['Saya sudah tahu yang diketahui, lalu apa?', 'Rumus mana yang relevan?'], sources: ['Kebijakan integritas akademik tenant'] };
    }
    const st = ctx.state as { quiz_question_id?: string; asked?: string[] } | null;
    // an explicitly chosen tutor style wins over data intents: the message is the topic
    const styled = mode && ['explain', 'simplify', 'example', 'why', 'review', 'exam'].includes(mode) && !(st?.quiz_question_id && /^[a-e]$/i.test(m));
    // quiz-me: answer check for the previous question
    if (st?.quiz_question_id && /^[a-e]$/i.test(m)) {
      const q = await queryOne(`SELECT answer_key, explanation, options FROM \`${T('questions')}\` WHERE id = ?`, [st.quiz_question_id]);
      const key = json<unknown>(q?.answer_key, null); const keyStr = Array.isArray(key) ? String(key[0]) : String(key ?? '');
      const opts = json<{ key: string; misconception?: string | null }[]>(q?.options, []); const picked = opts.find((o) => o.key.toLowerCase() === m);
      const correct = keyStr.toLowerCase() === m;
      return { reply: correct ? `**Benar!** ${q?.explanation ? q.explanation : 'Kamu menguasai bagian ini.'}\n\nMau lanjut soal berikutnya?` : `Belum tepat — kunci: **${keyStr.toUpperCase()}**.${picked?.misconception ? ` Pilihanmu menunjukkan pola miskonsepsi umum: *${picked.misconception}*.` : ''}${q?.explanation ? `\n${q.explanation}` : ''}\n\nMau coba soal lain pada konsep yang sama?`, suggestions: ['Quiz me!', 'Jelaskan konsep ini dari dasar', 'Konsep mana yang masih lemah?'], sources: ['Bank soal lembaga'], state: { asked: st.asked ?? [] } };
    }
    if (mode === 'quiz' || mode === 'challenge' || mode === 'practice' || has(m, 'quiz me', 'kuis saya', 'uji saya', 'tes saya', 'latihan')) {
      const asked = (st?.asked ?? []) as string[];
      const q = await pickQuestion(u, sid, asked);
      if (!q) return { reply: 'Belum ada soal pilihan ganda aktif untuk mata pelajaranmu di bank soal. Minta gurumu menambahkan soal berlabel konsep dulu.', suggestions: sugg, sources: [SRC_DATA] };
      const opts = json<{ key: string; text: string }[]>(q.options, []);
      return { reply: `**${q.subject ?? 'Latihan'}${q.concept ? ` · ${q.concept}` : ''}**\n${q.text}\n${opts.map((o) => `${o.key}. ${o.text}`).join('\n')}\n\nJawab dengan huruf pilihannya.`, suggestions: opts.map((o) => o.key), sources: ['Bank soal lembaga'], state: { quiz_question_id: q.id, asked: [...asked, q.id].slice(-20) } };
    }
    if (!styled && has(m, 'tugas', 'deadline', 'tenggat', 'pr')) {
      const rows = await upcomingAssignments(u, sid);
      return { reply: rows.length ? `Tugas yang belum kamu kumpulkan:\n${rows.map((r, i) => `${i + 1}. **${r.title}** (${r.subject}) — tenggat ${dmy(r.due_at)}${r.sub_status === 'DRAFT' ? ' · masih draf' : ''}`).join('\n')}\n\nSaran: kerjakan yang tenggatnya paling dekat dulu; buka menu **Tugas** untuk mengunggah.` : 'Tidak ada tugas yang tertunda. Bagus — mau pakai waktunya untuk mengulang konsep yang masih lemah?', suggestions: ['Konsep mana yang masih lemah?', 'Quiz me!', 'Jadwal hari ini'], sources: [SRC_DATA] };
    }
    if (!styled && has(m, 'jadwal', 'pelajaran hari', 'hari ini', 'besok')) {
      const dow = (new Date().getDay() + 6) % 7 + 1; const target = has(m, 'besok') ? (dow % 7) + 1 : dow;
      const rows = await query(`SELECT se.start_time, se.end_time, s.name AS subject, u2.full_name AS teacher, r.name AS room FROM \`${T('schedule_entries')}\` se JOIN \`${T('class_subjects')}\` cs ON cs.id = se.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` u2 ON u2.id = cs.teacher_id LEFT JOIN \`${T('rooms')}\` r ON r.id = se.room_id
        JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF' WHERE se.tenant_id = ? AND se.day_of_week = ? ORDER BY se.start_time`, [sid, u.tenantId, target]);
      return { reply: rows.length ? `Jadwal ${has(m, 'besok') ? 'besok' : 'hari ini'}:\n${rows.map((r) => `• ${hm(r.start_time)}–${hm(r.end_time)} ${r.subject}${r.teacher ? ` — ${r.teacher}` : ''}${r.room ? ` (${r.room})` : ''}`).join('\n')}` : `Tidak ada jadwal ${has(m, 'besok') ? 'besok' : 'hari ini'}.`, suggestions: sugg, sources: [SRC_DATA] };
    }
    if (!styled && has(m, 'tagihan', 'spp', 'bayar', 'tunggakan')) {
      const inv = await query(`SELECT title, period, amount - discount + late_fee - paid AS due, due_date FROM \`${T('invoices')}\` WHERE student_id = ? AND status IN ('UNPAID','PARTIAL','OVERDUE') ORDER BY due_date LIMIT 5`, [sid]);
      const total = inv.reduce((a, r) => a + Number(r.due), 0);
      return { reply: inv.length ? `Tagihan yang belum lunas: **${money(total)}**\n${inv.map((r) => `• ${r.title} ${r.period ?? ''} — ${money(r.due)} (jatuh tempo ${dmy(r.due_date)})`).join('\n')}\nRincian & kuitansi ada di menu **Tagihan**.` : 'Semua tagihanmu lunas. 🎉', suggestions: sugg, sources: [SRC_DATA] };
    }
    if (!styled && has(m, 'absen', 'kehadiran', 'hadir', 'alpa')) {
      const a = await queryOne(`SELECT COUNT(*) AS total, SUM(status = 'H') AS h, SUM(status = 'A') AS a FROM \`${T('attendance_records')}\` WHERE student_id = ? AND tenant_id = ?`, [sid, u.tenantId]);
      return { reply: Number(a?.total) ? `Kehadiranmu: **${Math.round((Number(a!.h) / Number(a!.total)) * 100)}%** dari ${a!.total} pertemuan tercatat (alpa ${a!.a}).` : 'Belum ada presensi tercatat.', suggestions: sugg, sources: [SRC_DATA] };
    }
    if (!styled && has(m, 'lemah', 'konsep', 'nilai', 'kuasai', 'paham', 'belajar apa', 'berikutnya', 'rekomendasi', 'progres')) {
      const rows = await weakConcepts(u, sid);
      if (!rows.length) return { reply: 'Belum cukup bukti untuk memetakan konsepmu (butuh minimal 2 jawaban per konsep dari kuis/ujian). Kerjakan kuis dulu — atau coba "Quiz me!" agar saya mulai mengumpulkan bukti.', suggestions: ['Quiz me!', 'Tugas apa yang mendekati tenggat?'], sources: [SRC_DATA] };
      const list = rows.map((r) => `• **${r.name}** (${r.subject ?? '-'}) — ${Math.round((Number(r.correct) / Number(r.answered)) * 100)}% dari ${r.answered} soal`).join('\n');
      return { reply: `Konsep yang paling perlu penguatan:\n${list}\n\nLangkah berikutnya: ulang materi **${rows[0].name}** dari dasar, lalu kerjakan 3 soal kontras. Angka di atas dihitung dari jumlah soal yang tertulis — 60% dari 5 soal belum sekuat 60% dari 50 soal.`, suggestions: [`Jelaskan ${rows[0].name} dari dasar`, 'Quiz me!', 'Beri contoh sehari-hari'], sources: [SRC_DATA, 'Peta konsep (menu Peta Konsep)'] };
    }
    if (!styled && has(m, 'materi', 'modul', 'bahan')) {
      const rows = await query(`SELECT mt.title, s.name AS subject FROM \`${T('materials')}\` mt JOIN \`${T('class_subjects')}\` cs ON cs.id = mt.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF' WHERE mt.is_published = 1 ORDER BY mt.published_at DESC LIMIT 5`, [sid]);
      return { reply: rows.length ? `Materi terbaru untukmu:\n${rows.map((r, i) => `${i + 1}. ${r.title} (${r.subject})`).join('\n')}\nBuka menu **Materi** untuk membacanya.` : 'Belum ada materi yang diterbitkan untuk kelasmu.', suggestions: sugg, sources: [SRC_DATA] };
    }
    // tutor modes on a free topic
    const topic = topicOf(m) || ctx.material_title || m;
    const styles: Record<string, string> = {
      explain: `**${topic}** — dari dasar:\n1. Definisi singkat dengan bahasa sehari-hari.\n2. Satu contoh utama yang dekat dengan pengalamanmu.\n3. Cek pemahaman: coba ceritakan ulang dengan kata-katamu.`,
      simplify: `Versi paling sederhana dari **${topic}**: bayangkan situasi sehari-hari yang mirip, kita hilangkan dulu istilah teknisnya, lalu kita bangun lagi selangkah demi selangkah.`,
      example: `Contoh **${topic}** dalam konteks pilihanmu — sebutkan konteks favoritmu (olahraga, game, kendaraan, masak) dan saya bangun contohnya dari sana.`,
      why: `Kenapa aturan pada **${topic}** berlaku? Kita telusuri alasannya, bukan menghafal langkahnya: apa yang terjadi kalau aturan itu dilanggar?`,
      review: `Waktunya mengulang **${topic}**. Ulangan berjarak menjaga retensi: jawab 3 pertanyaan singkat dulu, lalu saya tentukan kapan kita ulang lagi.`,
      exam: `**Mode ujian** untuk ${topic}: tanpa bantuan, berwaktu. Ketik "mulai" bila siap — atau kerjakan simulasi dari menu Kuis.`,
    };
    return { reply: `${styles[mode ?? 'explain'] ?? styles.explain}\n\n_Saya masih engine demo: penjelasan penuh akan hadir saat engine Alesha terhubung._`, suggestions: ['Quiz me!', 'Beri contoh sehari-hari', 'Kenapa begitu?'], sources: [SRC_MODEL] };
  }

  /* ── wali murid ── */
  if (role === 'wali') {
    const kids = await childrenOf(u.id);
    if (!kids.length) return { reply: 'Belum ada siswa yang tertaut ke akun Anda. Minta Admin Sekolah menautkan anak Anda.', suggestions: sugg };
    const kid = await queryOne(`SELECT id, full_name FROM \`${T('users')}\` WHERE id = ?`, [kids[0]]);
    if (has(m, 'tagihan', 'spp', 'bayar')) { const inv = await query(`SELECT SUM(amount - discount + late_fee - paid) AS due, COUNT(*) AS n FROM \`${T('invoices')}\` WHERE student_id = ? AND status IN ('UNPAID','PARTIAL','OVERDUE')`, [kid!.id]); return { reply: Number(inv[0]?.n) ? `Tagihan ${kid!.full_name} yang belum lunas: **${money(inv[0].due)}** (${inv[0].n} tagihan). Rincian di menu **Tagihan**.` : `Semua tagihan ${kid!.full_name} lunas.`, suggestions: sugg, sources: [SRC_DATA] }; }
    if (has(m, 'hadir', 'absen', 'alpa')) { const a = await queryOne(`SELECT COUNT(*) AS total, SUM(status = 'H') AS h, SUM(status = 'A') AS a FROM \`${T('attendance_records')}\` WHERE student_id = ?`, [kid!.id]); return { reply: Number(a?.total) ? `Kehadiran ${kid!.full_name}: **${Math.round((Number(a!.h) / Number(a!.total)) * 100)}%** dari ${a!.total} pertemuan (alpa ${a!.a}).` : 'Belum ada presensi tercatat.', suggestions: sugg, sources: [SRC_DATA] }; }
    const rows = await weakConcepts(u, kid!.id);
    return { reply: rows.length ? `Perkembangan ${kid!.full_name}: konsep yang masih perlu pendampingan — ${rows.map((r) => `**${r.name}** (${Math.round((Number(r.correct) / Number(r.answered)) * 100)}% dari ${r.answered} soal)`).join(', ')}.\n\nSaran pendampingan di rumah: tanyakan "coba jelaskan ${rows[0].name} ke Ayah/Ibu" — menjelaskan ulang adalah cara belajar paling kuat. Yang ditampilkan adalah capaian, bukan jejak aktivitas.` : `Belum cukup bukti belajar untuk ${kid!.full_name} (kuis/ujian belum banyak dikerjakan). Lihat menu **Nilai** dan **Rapor** untuk capaian resmi.`, suggestions: sugg, sources: [SRC_DATA] };
  }

  /* ── guru / kaprodi / wakepsek ── */
  if (role === 'guru') {
    if (has(m, 'insight', 'wawasan', 'kelas saya', 'terserap', 'miskonsepsi', 'lemah', 'konsep')) {
      const { rows, misconception } = await classInsight(u);
      if (!rows.length) return { reply: 'Belum cukup bukti (minimal 3 jawaban per konsep dari kuis yang sudah dikumpulkan) di kelas yang Anda ampu. Terbitkan kuis berlabel konsep dulu — setelah itu saya bisa memetakan penyerapan per sub-konsep.', suggestions: sugg, sources: [SRC_DATA] };
      const w = rows[0]; const pct = Math.round((Number(w.correct) / Number(w.answered)) * 100);
      const misTxt = misconception ? `\n\n⚠ **Potensi miskonsepsi**: ${misconception.n} dari ${misconception.total} jawaban salah memilih pengecoh yang sama pada *${misconception.concept}* — pola: ${misconception.label}.` : '';
      return { reply: `**Alesha Teaching Insight**\nKonsep paling belum terserap: **${w.concept}** (${w.subject ?? '-'}, ${w.class_name}) — ${pct}% benar dari ${w.answered} jawaban oleh ${w.students} siswa.${rows.length > 1 ? `\nBerikutnya: ${rows.slice(1).map((r) => `${r.concept} ${Math.round((Number(r.correct) / Number(r.answered)) * 100)}%`).join(', ')}.` : ''}${misTxt}\n\n**Rekomendasi untuk pertemuan berikutnya**: mulai dari contoh konkret, sediakan tiga soal kontras yang menyoroti perbedaan inti, sisipkan asesmen mini 5 menit sebelum lanjut. Ini pola untuk Anda uji, bukan kesimpulan final — keyakinan ${Number(w.answered) >= 30 ? 'sedang' : 'rendah (bukti sedikit)'}.`, suggestions: [`Rancang pembelajaran tentang ${w.concept}`, `Buat soal tentang ${w.concept}`, 'Tugas yang belum dinilai'], sources: [SRC_DATA, 'Peta konsep kelas (menu Peta Konsep)'] };
    }
    if (has(m, 'rancang', 'rencana', 'rpp', 'modul ajar', 'lesson')) {
      const topic = topicOf(m) || 'topik pilihan Anda';
      return { reply: `**Draf rancangan pembelajaran — ${topic}** (3 pertemuan)\n\n**Tujuan**: peserta didik dapat menjelaskan konsep ${topic}, menerapkannya pada soal kontekstual, dan mengidentifikasi kesalahan umum.\n\n**Pertemuan 1 (2×45')** — Apersepsi 10' (contoh sehari-hari) · Eksplorasi 35' (diskusi kelompok) · Latihan bertingkat 30' · Refleksi 15'.\n**Pertemuan 2** — Ulas hasil latihan · Soal kontras (3 soal) · Proyek mini.\n**Pertemuan 3** — Presentasi proyek · Asesmen formatif 10 soal · Remedial/pengayaan.\n\n**Rubrik**: pemahaman konsep (40%), penerapan (40%), komunikasi (20%).\n\nBagian bertanda perlu Anda verifikasi terhadap CP/ATP kurikulum tenant. Draf tidak pernah dikirim ke siswa tanpa persetujuan Anda — salin ke menu **Kurikulum** atau **Materi** untuk disunting.`, suggestions: [`Buat soal tentang ${topic}`, 'Insight kelas saya'], sources: [SRC_MODEL, 'Bagian yang ditandai: wajib diverifikasi pendidik'] };
    }
    if (has(m, 'buat soal', 'soal tentang', 'bank soal', 'susun soal')) {
      const topic = topicOf(m) || 'topik pilihan Anda';
      return { reply: `**Draf 3 soal — ${topic}** (setiap pengecoh diberi label miskonsepsi agar deteksi kelas bekerja)\n\n1. [PG · mudah] Manakah pernyataan yang benar tentang ${topic}? — A (kunci) · B *miskonsepsi: generalisasi berlebihan* · C *miskonsepsi: tertukar dengan konsep prasyarat* · D *miskonsepsi: salah urutan langkah*\n2. [PG · sedang] Soal cerita kontekstual tentang ${topic} … — pengecoh diberi label serupa.\n3. [Uraian · sulit] Jelaskan mengapa … pada ${topic}; rubrik: alasan (2), contoh (1), ketepatan istilah (1).\n\nSunting lalu simpan lewat menu **Bank Soal** — pilih konsep agar masuk peta penyerapan.`, suggestions: ['Insight kelas saya', `Rancang pembelajaran tentang ${topic}`], sources: [SRC_MODEL] };
    }
    if (has(m, 'tugas', 'belum dinilai', 'koreksi', 'pengumpulan')) {
      const sc = classSubjectScope(u);
      const rows = await query(`SELECT a.title, c.name AS class_name, COUNT(sub.id) AS n FROM \`${T('submissions')}\` sub JOIN \`${T('assignments')}\` a ON a.id = sub.assignment_id JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id WHERE sub.tenant_id = ? AND sub.status = 'SUBMITTED' AND ${sc.sql} GROUP BY a.id, a.title, c.name ORDER BY n DESC LIMIT 5`, [u.tenantId, ...sc.params]);
      return { reply: rows.length ? `Pengumpulan yang menunggu penilaian:\n${rows.map((r) => `• **${r.title}** (${r.class_name}) — ${r.n} jawaban`).join('\n')}\nBuka menu **Tugas** → penilaian.` : 'Tidak ada pengumpulan yang menunggu penilaian. 👍', suggestions: sugg, sources: [SRC_DATA] };
    }
    if (has(m, 'jadwal', 'hari ini', 'mengajar')) {
      const dow = (new Date().getDay() + 6) % 7 + 1;
      const rows = await query(`SELECT se.start_time, se.end_time, s.name AS subject, c.name AS class_name FROM \`${T('schedule_entries')}\` se JOIN \`${T('class_subjects')}\` cs ON cs.id = se.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id WHERE se.tenant_id = ? AND se.day_of_week = ? AND cs.teacher_id = ? ORDER BY se.start_time`, [u.tenantId, dow, u.id]);
      return { reply: rows.length ? `Mengajar hari ini:\n${rows.map((r) => `• ${hm(r.start_time)}–${hm(r.end_time)} ${r.subject} — ${r.class_name}`).join('\n')}` : 'Tidak ada jadwal mengajar hari ini.', suggestions: sugg, sources: [SRC_DATA] };
    }
    return { reply: `Maaf${sapa}, saya masih engine demo. Yang sudah bisa: **insight kelas** (konsep belum terserap + miskonsepsi), **draf rancangan pembelajaran**, **draf soal berlabel miskonsepsi**, tugas belum dinilai, dan jadwal mengajar.`, suggestions: sugg };
  }

  /* ── admin / kepsek / keuangan / staf ── */
  if (has(m, 'ringkasan', 'sekolah', 'hari ini', 'kondisi', 'statistik')) {
    const tid = u.tenantId;
    const [siswa, guru, kelas, hadir, tagih] = await Promise.all([
      queryOne(`SELECT COUNT(*) n FROM \`${T('user_roles')}\` r JOIN \`${T('users')}\` x ON x.id = r.user_id WHERE r.tenant_id = ? AND r.role = 'SISWA' AND x.is_active = 1 AND x.deleted_at IS NULL`, [tid]),
      queryOne(`SELECT COUNT(*) n FROM \`${T('user_roles')}\` r JOIN \`${T('users')}\` x ON x.id = r.user_id WHERE r.tenant_id = ? AND r.role = 'GURU' AND x.is_active = 1 AND x.deleted_at IS NULL`, [tid]),
      queryOne(`SELECT COUNT(*) n FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE c.tenant_id = ? AND ay.is_active = 1 AND c.is_active = 1`, [tid]),
      queryOne(`SELECT COUNT(*) total, SUM(r.status = 'H') h FROM \`${T('attendance_records')}\` r JOIN \`${T('attendance_sessions')}\` s ON s.id = r.session_id WHERE r.tenant_id = ? AND s.date = CURDATE()`, [tid]),
      queryOne(`SELECT COUNT(*) n, SUM(amount - discount + late_fee - paid) due FROM \`${T('invoices')}\` WHERE tenant_id = ? AND status IN ('UNPAID','PARTIAL','OVERDUE')`, [tid]),
    ]);
    return { reply: `**Ringkasan lembaga hari ini**\n• Siswa aktif: ${siswa?.n} · Guru: ${guru?.n} · Kelas aktif: ${kelas?.n}\n• Kehadiran hari ini: ${Number(hadir?.total) ? `${Math.round((Number(hadir!.h) / Number(hadir!.total)) * 100)}% dari ${hadir!.total} tercatat` : 'belum ada presensi'}\n• Tagihan belum lunas: ${tagih?.n} tagihan, ${money(tagih?.due)}\n\nTindakan yang disarankan: cek inbox **Persetujuan** (rapor/payroll/surat) dan kelas dengan kehadiran terendah di **Laporan**.`, suggestions: sugg, sources: [SRC_DATA] };
  }
  if (has(m, 'tagihan', 'tunggakan', 'keuangan', 'spp')) {
    const rows = await query(`SELECT x.full_name, SUM(i.amount - i.discount + i.late_fee - i.paid) due FROM \`${T('invoices')}\` i JOIN \`${T('users')}\` x ON x.id = i.student_id WHERE i.tenant_id = ? AND i.status IN ('UNPAID','PARTIAL','OVERDUE') GROUP BY x.id, x.full_name ORDER BY due DESC LIMIT 5`, [u.tenantId]);
    const total = rows.reduce((a, r) => a + Number(r.due), 0);
    return { reply: rows.length ? `Tunggakan terbesar (5 teratas):\n${rows.map((r) => `• ${r.full_name} — ${money(r.due)}`).join('\n')}\nTotal 5 teratas: ${money(total)}. Rincian lengkap di **Keuangan → Tagihan**.` : 'Tidak ada tagihan yang belum lunas.', suggestions: sugg, sources: [SRC_DATA] };
  }
  if (has(m, 'persetujuan', 'menunggu', 'approval', 'sahkan')) return { reply: 'Semua yang menunggu keputusan Anda terkumpul di menu **Persetujuan** (rapor, payroll, surat, refund, pinjam aset, permintaan data pribadi).', suggestions: sugg };
  return { reply: `Maaf${sapa}, saya masih engine demo. Coba: "ringkasan sekolah hari ini", "berapa tunggakan tagihan", atau "apa itu SINAU".`, suggestions: sugg };
}

/** Legacy Alesha engine contract. Returns null when unavailable so the dummy takes over. */
async function forwardToAlesha(message: string, history: ChatTurn[], ctx: ChatContext, u: AuthUser | null): Promise<string | null> {
  const base = process.env.ALESHA_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat/learning`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history, context: { app: 'SINAU', role: u?.roles[0] ?? null, tenant: u?.tenantId ?? null, ...ctx } }), signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { reply?: string; answer?: string };
    return data.reply ?? data.answer ?? null;
  } catch { return null; }
}

export async function chat(message: string, history: ChatTurn[], ctx: ChatContext, u: AuthUser | null): Promise<ChatReply> {
  const started = Date.now();
  const forwarded = await forwardToAlesha(message, history, ctx, u);
  if (forwarded) return { reply: forwarded, suggestions: [], sources: ['Engine Alesha'], mode: ctx.mode ?? null, engine: 'alesha', latency_ms: Date.now() - started };
  await sleep(300 + Math.random() * 400); // pretend to think
  const r = await dummyReply(message, ctx, u);
  return { reply: r.reply, suggestions: r.suggestions ?? [], sources: r.sources ?? [], mode: ctx.mode ?? null, engine: 'dummy', latency_ms: Date.now() - started, state: r.state ?? null };
}
