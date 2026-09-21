/**
 * Demo tenant: SMK Negeri 1 Contoh (slug smkn1-demo) with admin, principal, teachers, students,
 * classes, subjects, materials, question bank, a quiz, assignments, attendance and finance samples.
 * Idempotent: skipped when the tenant already exists. Password for every demo account: demo12345
 *   admin.smk1 / kepsek.smk1 / guru.dimas / guru.rina / guru.andi / bk.sari / keu.wati / siswa.01..siswa.20 / wali.01
 */
import { T } from '../../config';
import { execute, query, queryOne, withTransaction } from '../db';
import { runMigrations } from '../migrate';
import { hashPassword } from '../../core/auth';
import { newId } from '../../core/ids';
import { insertRow } from '../../core/crud';
import { logger } from '../../core/logger';
import { DEFAULT_COMPONENTS } from '../../modules/lms/grades';

const PASSWORD = 'demo12345';

export async function seedDemo(): Promise<{ tenant_id: string; created: boolean }> {
  const existing = await queryOne(`SELECT id FROM \`${T('tenants')}\` WHERE slug = 'smkn1-demo'`);
  if (existing) return { tenant_id: String(existing.id), created: false };
  const hash = await hashPassword(PASSWORD);
  const tid = newId();
  const ids: Record<string, string> = {};
  const mk = (k: string) => (ids[k] = newId());

  await withTransaction(async (conn) => {
    await insertRow('tenants', { id: tid, slug: 'smkn1-demo', name: 'SMK Negeri 1 Contoh', type: 'SMK', category: 'NEGERI', npsn: '20200001', provinsi_id: 32, kota_id: 3276, address: 'Jl. Pendidikan No. 1, Depok', phone: '021-7700001', email: 'info@smkn1contoh.sch.id', principal_name: 'Drs. Bambang Wijaya, M.Pd', is_active: true }, conn);
    await insertRow('tenant_settings', { tenant_id: tid, self_registration: 0, portal_share: 'MANUAL', approval_flow: 'UNIT_HEAD' }, conn);
    await insertRow('tenant_branding', { tenant_id: tid, display_name: 'SMKN 1 Contoh', tagline: 'Unggul, Berkarakter, Siap Kerja', primary_color: '#0f766e', accent_color: '#f59e0b' }, conn);

    const user = async (key: string, username: string, full_name: string, roles: string[], extra: Record<string, unknown> = {}) => {
      const id = mk(key);
      await insertRow('users', { id, tenant_id: tid, username, email: `${username}@smkn1contoh.sch.id`, password_hash: hash, full_name, must_change_password: 0, ...extra }, conn);
      for (const role of roles) await insertRow('user_roles', { id: newId(), tenant_id: tid, user_id: id, role }, conn);
      if (roles.includes('SISWA')) await insertRow('student_profiles', { user_id: id, tenant_id: tid }, conn);
      else if (!roles.includes('WALI_MURID')) await insertRow('staff_profiles', { user_id: id, tenant_id: tid, employment_status: 'PNS' }, conn);
      return id;
    };
    await user('admin', 'admin.smk1', 'Admin Sekolah', ['ADMIN_SEKOLAH'], { gender: 'P' });
    await user('kepsek', 'kepsek.smk1', 'Drs. Bambang Wijaya, M.Pd', ['KEPSEK', 'GURU'], { gender: 'L' });
    await user('wakepsek', 'wakepsek.smk1', 'Dra. Siti Nurhaliza, M.Pd', ['WAKEPSEK', 'GURU'], { gender: 'P' });
    await user('staf', 'staf.budi', 'Budi Santoso', ['STAF'], { gender: 'L' });
    await user('auditor', 'auditor.smk1', 'Ir. Hendra Gunawan, Ak', ['AUDITOR'], { gender: 'L' });
    await user('dimas', 'guru.dimas', 'Dimas Prasetyo, S.Kom', ['GURU'], { gender: 'L' });
    await user('rina', 'guru.rina', 'Rina Wijayanti, S.Pd', ['GURU'], { gender: 'P' });
    await user('andi', 'guru.andi', 'Andi Saputra, S.Pd', ['GURU', 'KAPRODI'], { gender: 'L' });
    await user('bk', 'bk.sari', 'Sari Handayani, S.Psi', ['BK'], { gender: 'P' });
    await user('keu', 'keu.wati', 'Wati Kusuma, S.E', ['KEUANGAN'], { gender: 'P' });
    const studentNames = ['Aditya Pratama', 'Bunga Lestari', 'Cahyo Nugroho', 'Dewi Anggraini', 'Eko Prasetyo', 'Fitri Handayani', 'Galih Permana', 'Hana Safitri', 'Irfan Maulana', 'Jihan Aulia', 'Kurnia Ramadhan', 'Laila Nurhaliza', 'Muhammad Rizki', 'Nadia Putri', 'Oky Setiawan', 'Putri Ayu', 'Qori Amalia', 'Rafi Hidayat', 'Siti Rahmawati', 'Taufik Hidayah'];
    for (let i = 0; i < studentNames.length; i++) {
      const id = await user(`s${i + 1}`, `siswa.${String(i + 1).padStart(2, '0')}`, studentNames[i], ['SISWA'], { gender: i % 2 ? 'P' : 'L' });
      await execute(`UPDATE \`${T('student_profiles')}\` SET nis = ?, nisn = ?, entry_year = 2026, birth_date = ?, parent_name = ?, parent_phone = ? WHERE user_id = ?`, [`2026${String(i + 1).padStart(3, '0')}`, `00${String(71000000 + i)}`, `2010-0${(i % 9) + 1}-1${i % 9}`, `Orang Tua ${studentNames[i].split(' ')[0]}`, `08120000${String(i).padStart(2, '0')}`, id], conn);
    }
    await user('wali', 'wali.01', 'Bapak Pratama', ['WALI_MURID'], { gender: 'L' });
    await insertRow('guardians', { id: newId(), tenant_id: tid, user_id: ids.wali, relation: 'AYAH' }, conn);
    await insertRow('guardian_students', { id: newId(), tenant_id: tid, guardian_user_id: ids.wali, student_id: ids.s1, relation: 'AYAH', is_primary: 1 }, conn);

    // Academic structure
    await insertRow('academic_years', { id: mk('ay'), tenant_id: tid, name: '2026/2027', start_date: '2026-07-13', end_date: '2027-06-26', is_active: 1, active_semester: 1 }, conn);
    await insertRow('majors', { id: mk('tkj'), tenant_id: tid, code: 'TKJ', name: 'Teknik Komputer dan Jaringan', head_user_id: ids.andi }, conn);
    await insertRow('majors', { id: mk('rpl'), tenant_id: tid, code: 'RPL', name: 'Rekayasa Perangkat Lunak' }, conn);
    const subjects: [string, string, string, string][] = [['mtk', 'MTK', 'Matematika', 'UMUM'], ['bind', 'BIND', 'Bahasa Indonesia', 'UMUM'], ['bing', 'BING', 'Bahasa Inggris', 'UMUM'], ['pai', 'PAI', 'Pendidikan Agama', 'UMUM'], ['ppkn', 'PPKN', 'Pendidikan Pancasila', 'UMUM'], ['ddjk', 'DDJK', 'Dasar-Dasar Jaringan Komputer', 'KEJURUAN'], ['ddpl', 'DDPL', 'Dasar Pemrograman', 'KEJURUAN'], ['inf', 'INF', 'Informatika', 'UMUM']];
    for (const [k, code, name, cat] of subjects) await insertRow('subjects', { id: mk(k), tenant_id: tid, code, name, category: cat, is_competency: cat === 'KEJURUAN' ? 1 : 0, hours_per_week: cat === 'KEJURUAN' ? 6 : 3 }, conn);
    await insertRow('rooms', { id: mk('r1'), tenant_id: tid, code: 'R-101', name: 'Ruang 101', capacity: 36 }, conn);
    await insertRow('rooms', { id: mk('lab1'), tenant_id: tid, code: 'LAB-1', name: 'Lab Komputer 1', capacity: 36, type: 'LAB' }, conn);
    await insertRow('classes', { id: mk('x_tkj1'), tenant_id: tid, academic_year_id: ids.ay, name: 'X TKJ 1', grade_level: 10, major_id: ids.tkj, homeroom_teacher_id: ids.dimas, room_id: ids.r1 }, conn);
    await insertRow('classes', { id: mk('x_rpl1'), tenant_id: tid, academic_year_id: ids.ay, name: 'X RPL 1', grade_level: 10, major_id: ids.rpl, homeroom_teacher_id: ids.rina, room_id: ids.lab1 }, conn);
    for (let i = 1; i <= 20; i++) await insertRow('class_students', { id: newId(), tenant_id: tid, class_id: i <= 12 ? ids.x_tkj1 : ids.x_rpl1, student_id: ids[`s${i}`], status: 'AKTIF', joined_at: '2026-07-13' }, conn);
    const cs = async (key: string, cls: string, sub: string, teacher: string) => insertRow('class_subjects', { id: mk(key), tenant_id: tid, class_id: ids[cls], subject_id: ids[sub], teacher_id: ids[teacher], semester: 0 }, conn);
    await cs('cs_ddjk', 'x_tkj1', 'ddjk', 'dimas'); await cs('cs_mtk', 'x_tkj1', 'mtk', 'andi'); await cs('cs_bind', 'x_tkj1', 'bind', 'rina'); await cs('cs_inf', 'x_tkj1', 'inf', 'dimas'); await cs('cs_bing', 'x_tkj1', 'bing', 'rina');
    await cs('cs2_ddpl', 'x_rpl1', 'ddpl', 'rina'); await cs('cs2_mtk', 'x_rpl1', 'mtk', 'andi'); await cs('cs2_bind', 'x_rpl1', 'bind', 'rina');
    const sched: [string, number, string, string, string][] = [['cs_ddjk', 1, '07:30', '10:30', 'lab1'], ['cs_mtk', 1, '10:45', '12:15', 'r1'], ['cs_bind', 2, '07:30', '09:00', 'r1'], ['cs_inf', 2, '09:15', '11:15', 'lab1'], ['cs_bing', 3, '07:30', '09:00', 'r1'], ['cs_ddjk', 4, '07:30', '10:30', 'lab1'], ['cs2_ddpl', 1, '07:30', '10:30', 'r1'], ['cs2_mtk', 2, '10:45', '12:15', 'r1'], ['cs2_bind', 3, '09:15', '10:45', 'r1']];
    for (const [k, d, s, e, room] of sched) await insertRow('schedule_entries', { id: newId(), tenant_id: tid, class_subject_id: ids[k], day_of_week: d, start_time: s, end_time: e, room_id: ids[room] }, conn);
    await insertRow('academic_calendar', { id: newId(), tenant_id: tid, academic_year_id: ids.ay, title: 'Penilaian Tengah Semester Ganjil', start_date: '2026-10-05', end_date: '2026-10-10', type: 'UJIAN' }, conn);
    await insertRow('academic_calendar', { id: newId(), tenant_id: tid, academic_year_id: ids.ay, title: 'Libur Semester Ganjil', start_date: '2026-12-21', end_date: '2027-01-03', type: 'LIBUR', is_holiday: 1 }, conn);
    let i = 0;
    for (const c of DEFAULT_COMPONENTS) await insertRow('grade_components', { id: newId(), tenant_id: tid, subject_id: null, code: c.code, name: c.name, weight: c.weight, order_no: i++ }, conn);

    // Concepts + question bank (DDJK)
    const concepts: [string, string, string][] = [['c_osi', 'OSI', 'Model OSI 7 layer'], ['c_ip', 'IPV4', 'Pengalamatan IPv4 & subnetting'], ['c_kabel', 'KABEL', 'Media transmisi & pengkabelan'], ['c_topo', 'TOPO', 'Topologi jaringan']];
    for (const [k, code, name] of concepts) await insertRow('concepts', { id: mk(k), tenant_id: tid, subject_id: ids.ddjk, code, name, grade_level: 10 }, conn);
    const q = async (key: string, concept: string, text: string, opts: [string, boolean, string?][], expl: string, diff = 'SEDANG') => {
      const options = opts.map(([t, ok, mis], idx) => ({ key: 'ABCDE'[idx], text: t, is_correct: ok, misconception: mis ?? null }));
      return insertRow('questions', { id: mk(key), tenant_id: tid, subject_id: ids.ddjk, concept_id: ids[concept], type: 'MC', text, options, answer_key: JSON.stringify(options.filter((o) => o.is_correct).map((o) => o.key)), explanation: expl, difficulty: diff, points: 1, grade_level: 10, created_by: ids.dimas }, conn);
    };
    await q('q1', 'c_osi', 'Lapisan OSI yang bertanggung jawab atas pengalamatan logis (IP) adalah…', [['Physical', false, 'Mengira pengalamatan ada di lapisan fisik'], ['Data Link', false, 'Tertukar dengan MAC address'], ['Network', true], ['Transport', false, 'Tertukar dengan port']], 'Lapisan Network (layer 3) menangani pengalamatan logis dan routing.');
    await q('q2', 'c_osi', 'Protokol TCP bekerja pada lapisan…', [['Session', false], ['Transport', true], ['Application', false, 'Mengira TCP = aplikasi'], ['Network', false]], 'TCP dan UDP adalah protokol lapisan Transport.');
    await q('q3', 'c_ip', 'Berapa jumlah host yang dapat dipakai pada jaringan 192.168.1.0/26?', [['64', false, 'Lupa mengurangi network & broadcast'], ['62', true], ['30', false], ['126', false]], '/26 → 64 alamat, dikurangi network dan broadcast = 62 host.');
    await q('q4', 'c_ip', 'Alamat 10.0.0.1 termasuk kelas…', [['A', true], ['B', false], ['C', false], ['D', false]], 'Rentang kelas A: 1.0.0.0 – 126.255.255.255.', 'MUDAH');
    await q('q5', 'c_ip', 'Subnet mask default untuk kelas C adalah…', [['255.0.0.0', false], ['255.255.0.0', false], ['255.255.255.0', true], ['255.255.255.255', false]], 'Kelas C memakai 24 bit network.', 'MUDAH');
    await q('q6', 'c_kabel', 'Urutan kabel straight standar T568B dimulai dengan warna…', [['Putih hijau', false, 'Tertukar dengan T568A'], ['Putih oranye', true], ['Biru', false], ['Putih cokelat', false]], 'T568B: putih-oranye, oranye, putih-hijau, biru, putih-biru, hijau, putih-cokelat, cokelat.');
    await q('q7', 'c_kabel', 'Kabel cross-over digunakan untuk menghubungkan…', [['PC ke switch', false], ['PC ke PC', true], ['Router ke switch', false], ['Switch ke hub', false, 'Lupa bahwa perangkat sejenis butuh cross']], 'Perangkat sejenis (PC–PC, switch–switch lama) memakai cross-over.');
    await q('q8', 'c_topo', 'Topologi yang setiap perangkatnya terhubung ke satu titik pusat adalah…', [['Bus', false], ['Ring', false], ['Star', true], ['Mesh', false]], 'Star: semua node terhubung ke switch/hub pusat.', 'MUDAH');
    await q('q9', 'c_topo', 'Kelemahan utama topologi bus adalah…', [['Butuh banyak kabel', false], ['Satu kabel putus melumpuhkan jaringan', true], ['Sulit dipasang', false], ['Mahal', false]], 'Bus memakai satu backbone; kerusakan backbone menghentikan semua komunikasi.');
    await q('q10', 'c_osi', 'Perangkat yang bekerja di lapisan Data Link dan meneruskan frame berdasarkan MAC address adalah…', [['Hub', false, 'Hub hanya repeater fisik'], ['Switch', true], ['Router', false], ['Modem', false]], 'Switch membaca MAC address (layer 2).', 'SULIT');
    await insertRow('questions', { id: mk('q11'), tenant_id: tid, subject_id: ids.ddjk, concept_id: ids.c_ip, type: 'SHORT', text: 'Tuliskan alamat broadcast dari jaringan 192.168.10.0/24.', answer_key: JSON.stringify(['192.168.10.255']), explanation: 'Semua bit host bernilai 1.', difficulty: 'SEDANG', points: 2, grade_level: 10, created_by: ids.dimas }, conn);
    await insertRow('questions', { id: mk('q12'), tenant_id: tid, subject_id: ids.ddjk, concept_id: ids.c_osi, type: 'TF', text: 'HTTP bekerja pada lapisan Application model OSI.', answer_key: 'true', explanation: 'HTTP adalah protokol lapisan aplikasi.', difficulty: 'MUDAH', points: 1, grade_level: 10, created_by: ids.dimas }, conn);
    await insertRow('questions', { id: mk('q13'), tenant_id: tid, subject_id: ids.ddjk, concept_id: ids.c_topo, type: 'ESSAY', text: 'Jelaskan kelebihan dan kekurangan topologi star dibanding bus (minimal 3 poin).', answer_key: JSON.stringify('Kelebihan: mudah troubleshooting, gangguan satu node tidak mempengaruhi lainnya, mudah menambah node. Kekurangan: bergantung pada switch pusat, butuh lebih banyak kabel.'), difficulty: 'SEDANG', points: 5, grade_level: 10, created_by: ids.dimas }, conn);

    // Materials
    await insertRow('materials', { id: mk('m1'), tenant_id: tid, class_subject_id: ids.cs_ddjk, title: 'Pengenalan Model OSI 7 Layer', description: 'Materi pertemuan 1: fungsi tiap lapisan OSI dan contoh protokolnya.', type: 'TEXT', content_text: '# Model OSI\n\nModel OSI membagi komunikasi jaringan menjadi 7 lapisan:\n\n1. **Physical** – kabel, sinyal listrik\n2. **Data Link** – MAC address, switch\n3. **Network** – IP address, router\n4. **Transport** – TCP/UDP, port\n5. **Session** – pengelolaan sesi\n6. **Presentation** – enkripsi, format data\n7. **Application** – HTTP, FTP, DNS\n\n> Cara mengingat: *Please Do Not Throw Sausage Pizza Away*.', is_published: 1, published_at: new Date(), created_by: ids.dimas }, conn);
    await insertRow('materials', { id: mk('m2'), tenant_id: tid, class_subject_id: ids.cs_ddjk, title: 'Video: Subnetting IPv4 dalam 15 menit', description: 'Tonton lalu kerjakan latihan di kuis.', type: 'VIDEO', content_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', is_published: 1, published_at: new Date(), created_by: ids.dimas }, conn);
    await insertRow('materials', { id: mk('m3'), tenant_id: tid, class_subject_id: ids.cs_mtk, title: 'Bilangan Berpangkat dan Logaritma', description: 'Ringkasan konsep + contoh soal.', type: 'TEXT', content_text: '# Bilangan Berpangkat\n\n$a^m \\times a^n = a^{m+n}$\n\n## Logaritma\n\n$\\log_a b = c \\iff a^c = b$', is_published: 1, published_at: new Date(), created_by: ids.andi }, conn);
    await insertRow('materials', { id: mk('m4'), tenant_id: tid, subject_id: ids.inf, major_id: null, grade_level: 10, title: 'Etika Digital dan Keamanan Akun', description: 'Materi umum untuk semua kelas X.', type: 'TEXT', content_text: '# Etika Digital\n\nGunakan kata sandi kuat, aktifkan verifikasi dua langkah, dan jangan bagikan data pribadi.', is_published: 1, published_at: new Date(), is_public: 1, created_by: ids.dimas }, conn);

    // Assignment + quiz
    await insertRow('assignments', { id: mk('a1'), tenant_id: tid, class_subject_id: ids.cs_ddjk, title: 'Rangkuman Fungsi Lapisan OSI', instructions: 'Buat rangkuman 1 halaman tentang fungsi tiap lapisan OSI beserta contoh protokol. Unggah PDF atau tulis langsung.', due_at: new Date(Date.now() + 5 * 86_400_000), allow_late: 1, max_score: 100, status: 'PUBLISHED', created_by: ids.dimas }, conn);
    await insertRow('assignments', { id: mk('a2'), tenant_id: tid, class_subject_id: ids.cs_mtk, title: 'Latihan Soal Logaritma', instructions: 'Kerjakan 10 soal pada materi, tulis jawaban beserta langkahnya.', due_at: new Date(Date.now() + 2 * 86_400_000), allow_late: 0, max_score: 100, status: 'PUBLISHED', created_by: ids.andi }, conn);
    await insertRow('submissions', { id: newId(), tenant_id: tid, assignment_id: ids.a1, student_id: ids.s2, content: 'Lapisan 1 Physical: mengirim bit melalui media... (rangkuman lengkap)', status: 'SUBMITTED', submitted_at: new Date() }, conn);
    await insertRow('quizzes', { id: mk('qz1'), tenant_id: tid, class_subject_id: ids.cs_ddjk, title: 'Kuis 1: OSI, IP, dan Topologi', description: '12 soal, 20 menit, boleh 2 kali percobaan. Nilai terbaik yang dihitung.', duration_min: 20, open_at: new Date(Date.now() - 3600_000), close_at: new Date(Date.now() + 14 * 86_400_000), shuffle_questions: 1, shuffle_options: 1, max_attempts: 2, show_result: 'IMMEDIATE', status: 'PUBLISHED', created_by: ids.dimas }, conn);
    let order = 0;
    for (const k of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12']) await insertRow('quiz_questions', { id: newId(), quiz_id: ids.qz1, question_id: ids[k], order_no: order++, points: k === 'q11' ? 2 : 1 }, conn);

    // Grades (manual UH) + attendance samples
    const uhSource = newId();
    for (let n = 1; n <= 12; n++) await insertRow('grades', { id: newId(), tenant_id: tid, class_subject_id: ids.cs_ddjk, student_id: ids[`s${n}`], component_code: 'UH', source_type: 'MANUAL', source_id: uhSource, title: 'UH 1 - Konsep Dasar Jaringan', score: 65 + ((n * 7) % 35), max_score: 100, graded_by: ids.dimas, graded_at: new Date() }, conn);
    for (let d = 1; d <= 10; d++) {
      const date = new Date(); date.setDate(date.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      for (let n = 1; n <= 12; n++) {
        const st = (n + d) % 17 === 0 ? 'A' : (n + d) % 11 === 0 ? 'S' : 'H';
        await insertRow('attendance_daily', { id: newId(), tenant_id: tid, class_id: ids.x_tkj1, student_id: ids[`s${n}`], date: date.toISOString().slice(0, 10), status: st, recorded_by: ids.dimas }, conn);
      }
    }
    await insertRow('announcements', { id: newId(), tenant_id: tid, title: 'Selamat datang di SINAU', body: 'Portal pembelajaran SMKN 1 Contoh sudah aktif. Silakan lengkapi profil dan ganti kata sandi Anda.', audience: 'ALL', is_pinned: 1, publish_at: new Date(), created_by: ids.admin }, conn);
    await insertRow('announcements', { id: newId(), tenant_id: tid, title: 'Jadwal PTS Ganjil', body: 'Penilaian Tengah Semester dilaksanakan 5–10 Oktober 2026. Ujian berbasis komputer melalui SINAU.', audience: 'ROLE', audience_role: 'SISWA', publish_at: new Date(), created_by: ids.admin }, conn);

    // Finance samples
    await insertRow('fee_types', { id: mk('spp'), tenant_id: tid, code: 'SPP', name: 'SPP Bulanan', default_amount: 250000, period: 'BULANAN' }, conn);
    await insertRow('fee_types', { id: mk('seragam'), tenant_id: tid, code: 'SERAGAM', name: 'Seragam & Atribut', default_amount: 850000, period: 'SEKALI' }, conn);
    await insertRow('late_fee_rules', { id: newId(), tenant_id: tid, fee_type_id: ids.spp, grace_days: 7, mode: 'FLAT', amount: 10000 }, conn);
    for (let n = 1; n <= 20; n++) {
      for (const month of ['2026-07', '2026-08', '2026-09']) {
        const paid = month !== '2026-09' || n % 3 === 0;
        const invId = newId();
        await insertRow('invoices', { id: invId, tenant_id: tid, number: `INV/${month.replace('-', '')}/${String(n).padStart(3, '0')}`, student_id: ids[`s${n}`], academic_year_id: ids.ay, fee_type_id: ids.spp, title: `SPP ${month}`, period: month, amount: 250000, paid: paid ? 250000 : 0, due_date: `${month}-10`, status: paid ? 'PAID' : 'UNPAID', created_by: ids.keu }, conn);
        if (paid) {
          const payId = newId();
          await insertRow('payments', { id: payId, tenant_id: tid, number: `PAY/${month.replace('-', '')}/${String(n).padStart(3, '0')}`, student_id: ids[`s${n}`], amount: 250000, method: n % 2 ? 'TRANSFER' : 'TUNAI', paid_at: new Date(`${month}-05T09:00:00`), received_by: ids.keu, status: 'CONFIRMED' }, conn);
          await insertRow('payment_allocations', { id: newId(), payment_id: payId, invoice_id: invId, amount: 250000 }, conn);
          await insertRow('cash_flows', { id: newId(), tenant_id: tid, tx_date: `${month}-05`, direction: 'IN', category: 'SPP', amount: 250000, description: `SPP ${month} ${studentNames[n - 1]}`, reference_type: 'PAYMENT', reference_id: payId, created_by: ids.keu }, conn);
        }
      }
    }
    // Payroll config, positions, components
    await insertRow('payroll_period_configs', { id: newId(), tenant_id: tid }, conn);
    await insertRow('job_positions', { id: mk('pos_guru'), tenant_id: tid, code: 'GURU', name: 'Guru', base_salary: 4500000 }, conn);
    await insertRow('job_positions', { id: mk('pos_kepsek'), tenant_id: tid, code: 'KEPSEK', name: 'Kepala Sekolah', base_salary: 7500000 }, conn);
    await insertRow('payroll_components', { id: mk('pc_gapok'), tenant_id: tid, code: 'GAPOK', name: 'Gaji Pokok', kind: 'EARNING', calc: 'FIXED', default_amount: 4500000, taxable: 1, order_no: 1 }, conn);
    await insertRow('payroll_components', { id: mk('pc_transport'), tenant_id: tid, code: 'TRANSPORT', name: 'Tunjangan Transport', kind: 'ALLOWANCE', calc: 'FIXED', default_amount: 500000, taxable: 1, order_no: 2 }, conn);
    await insertRow('payroll_components', { id: mk('pc_potongan'), tenant_id: tid, code: 'KOPERASI', name: 'Potongan Koperasi', kind: 'DEDUCTION', calc: 'FIXED', default_amount: 100000, taxable: 0, order_no: 3 }, conn);
    for (const k of ['dimas', 'rina', 'andi', 'bk', 'keu', 'admin', 'kepsek']) {
      await execute(`UPDATE \`${T('staff_profiles')}\` SET position_id = ?, ptkp_status = 'TK/0', join_date = '2020-07-01' WHERE user_id = ?`, [k === 'kepsek' ? ids.pos_kepsek : ids.pos_guru, ids[k]], conn);
      await insertRow('salary_structures', { id: newId(), tenant_id: tid, user_id: ids[k], component_id: ids.pc_gapok, amount: k === 'kepsek' ? 7500000 : 4500000 }, conn);
      await insertRow('salary_structures', { id: newId(), tenant_id: tid, user_id: ids[k], component_id: ids.pc_transport, amount: 500000 }, conn);
    }
    // Kesiswaan
    await insertRow('discipline_rules', { id: mk('dr1'), tenant_id: tid, code: 'TERLAMBAT', name: 'Terlambat masuk sekolah', kind: 'PELANGGARAN', points: 5 }, conn);
    await insertRow('discipline_rules', { id: mk('dr2'), tenant_id: tid, code: 'SERAGAM', name: 'Tidak memakai seragam lengkap', kind: 'PELANGGARAN', points: 10 }, conn);
    await insertRow('discipline_rules', { id: mk('dr3'), tenant_id: tid, code: 'JUARA', name: 'Juara lomba', kind: 'PENGHARGAAN', points: -20 }, conn);
    await insertRow('extracurriculars', { id: mk('ek1'), tenant_id: tid, code: 'PRAMUKA', name: 'Pramuka', coach_id: ids.andi, schedule_text: 'Jumat 14:00' }, conn);
    await insertRow('extracurriculars', { id: mk('ek2'), tenant_id: tid, code: 'FUTSAL', name: 'Futsal', coach_id: ids.dimas, schedule_text: 'Rabu 15:30' }, conn);
    for (let n = 1; n <= 8; n++) await insertRow('extracurricular_members', { id: newId(), tenant_id: tid, extracurricular_id: n % 2 ? ids.ek1 : ids.ek2, student_id: ids[`s${n}`], academic_year_id: ids.ay }, conn);
    await insertRow('achievements', { id: newId(), tenant_id: tid, student_id: ids.s3, title: 'Juara 2 LKS Jaringan Tingkat Kota', level: 'KOTA', rank_label: 'Juara 2', organizer: 'Dinas Pendidikan Kota Depok', achieved_at: '2026-08-20', is_public: 1 }, conn);
    // Aset & perpus
    await insertRow('assets', { id: newId(), tenant_id: tid, code: 'AST-0001', name: 'Proyektor Epson EB-X51', category: 'ELEKTRONIK', room_id: ids.r1, purchase_date: '2024-02-10', purchase_price: 6500000, useful_life_years: 5 }, conn);
    await insertRow('assets', { id: newId(), tenant_id: tid, code: 'AST-0002', name: 'PC Lab (30 unit)', category: 'ELEKTRONIK', room_id: ids.lab1, purchase_date: '2023-07-01', purchase_price: 180000000, useful_life_years: 4, quantity: 30 }, conn);
    await insertRow('library_books', { id: newId(), tenant_id: tid, code: 'BK-0001', title: 'Jaringan Komputer Dasar', author: 'Andrew S. Tanenbaum', publisher: 'Pearson', year: 2021, category: 'Teknologi', stock: 5, available: 5, shelf: 'A1' }, conn);
    await insertRow('library_books', { id: newId(), tenant_id: tid, code: 'BK-0002', title: 'Laskar Pelangi', author: 'Andrea Hirata', publisher: 'Bentang', year: 2005, category: 'Sastra', stock: 3, available: 3, shelf: 'B2' }, conn);
    // PPDB period, SMK partner, PDP retention defaults, landing
    await insertRow('ppdb_periods', { id: mk('ppdb'), tenant_id: tid, name: 'PPDB 2027/2028', open_at: new Date(Date.now() - 86_400_000), close_at: new Date(Date.now() + 90 * 86_400_000), quota: 144, requirements: ['Fotokopi ijazah/SKL', 'Kartu keluarga', 'Akta kelahiran', 'Pas foto 3x4'], paths: ['ZONASI', 'AFIRMASI', 'PRESTASI', 'PERPINDAHAN'], announcement: 'Pendaftaran dibuka! Silakan lengkapi formulir dan unggah dokumen.' }, conn);
    await insertRow('industry_partners', { id: mk('ip1'), tenant_id: tid, name: 'PT Jaringan Nusantara', sector: 'Telekomunikasi', city: 'Depok', contact_name: 'Ir. Hendra', contact_phone: '0812999000', quota: 6, mou_number: 'MOU/2026/01', mou_until: '2028-12-31' }, conn);
    await insertRow('competency_schemes', { id: mk('sk1'), tenant_id: tid, code: 'SKM-TKJ-01', name: 'Instalasi Jaringan Komputer Skala Kecil', major_id: ids.tkj, units: ['Merencanakan kebutuhan jaringan', 'Memasang kabel & perangkat', 'Mengonfigurasi IP & routing dasar', 'Menguji konektivitas'] }, conn);
    for (const [entity, months] of [['audit_logs', 24], ['notifications', 6], ['ppdb_applicants', 12], ['alumni', 120], ['counseling_notes', 60]] as [string, number][]) await insertRow('retention_policies', { id: newId(), tenant_id: tid, entity, retention_months: months }, conn);
    await insertRow('landing_pages', { id: newId(), tenant_id: tid, slug: 'home', title: 'Beranda', hero_title: 'SMK Negeri 1 Contoh', hero_subtitle: 'Unggul, Berkarakter, Siap Kerja — sekolah kejuruan berbasis industri di Depok.', sections: [{ type: 'stats' }, { type: 'majors' }, { type: 'news' }, { type: 'cta_ppdb' }], is_published: 1, order_no: 0 }, conn);
    await insertRow('landing_pages', { id: newId(), tenant_id: tid, slug: 'tentang', title: 'Tentang Kami', hero_title: 'Profil Sekolah', hero_subtitle: 'Berdiri sejak 1998, terakreditasi A.', sections: [{ type: 'text', title: 'Visi', body: 'Menjadi SMK unggulan yang menghasilkan lulusan kompeten dan berkarakter.' }, { type: 'text', title: 'Misi', body: 'Menyelenggarakan pembelajaran berbasis industri; membangun budaya kerja; mengembangkan kemitraan DUDI.' }], is_published: 1, order_no: 1 }, conn);
    await insertRow('news_articles', { id: newId(), tenant_id: tid, slug: 'pembukaan-tahun-ajaran-2026', title: 'Pembukaan Tahun Ajaran 2026/2027', excerpt: 'Upacara pembukaan tahun ajaran baru dihadiri seluruh siswa dan orang tua kelas X.', body: 'Senin, 13 Juli 2026, SMKN 1 Contoh membuka tahun ajaran baru dengan Masa Pengenalan Lingkungan Sekolah (MPLS) selama tiga hari...', category: 'Kegiatan', is_published: 1, published_at: new Date('2026-07-13'), author_id: ids.admin }, conn);
    await insertRow('faqs', { id: newId(), tenant_id: tid, question: 'Bagaimana cara mendaftar PPDB?', answer: 'Buka menu PPDB, isi formulir, lalu unggah dokumen. Simpan kode akses untuk memantau status.', category: 'PPDB' }, conn);
    await insertRow('facilities', { id: newId(), tenant_id: tid, name: 'Laboratorium Komputer', description: '3 lab dengan 90 unit PC dan koneksi fiber.' }, conn);
    await insertRow('testimonials', { id: newId(), tenant_id: tid, name: 'Rizky (Alumni 2024)', role_label: 'Network Engineer, PT Jaringan Nusantara', quote: 'Praktik di SMKN 1 Contoh benar-benar sesuai kebutuhan industri.' }, conn);
    await insertRow('letter_templates', { id: newId(), tenant_id: tid, code: 'SKA', name: 'Surat Keterangan Aktif', body_template: 'Yang bertanda tangan di bawah ini, Kepala {{school}}, menerangkan bahwa:\n\nNama: {{student_name}}\nNIS: {{nis}}\nKelas: {{class}}\n\nadalah benar siswa aktif pada tahun ajaran {{academic_year}}.', number_format: '{{seq}}/SKA/{{month_roman}}/{{year}}' }, conn);
  });
  logger.info({ tenant: 'smkn1-demo' }, 'demo tenant seeded');
  return { tenant_id: tid, created: true };
}

if (require.main === module) {
  runMigrations()
    .then(seedDemo)
    .then((r) => { logger.info(r, `demo seed ok — password for all demo accounts: ${PASSWORD}`); process.exit(0); })
    .catch((e) => { logger.error(e, 'demo seed failed'); process.exit(1); });
}
export const _q = query;
