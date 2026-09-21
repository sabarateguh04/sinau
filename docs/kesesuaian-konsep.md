# Kesesuaian SINAU dengan Dokumen Konsep Produk (Draft 1.0)

Pemetaan isi `SINAU-Konsep-Produk.pdf` (21 halaman: visi, 7 domain modul, Alesha, heatmap, jalur adaptif, kompetensi, privasi, roadmap) terhadap sistem yang sudah dibangun. Dokumen PDF sendiri tidak di-commit (bertanda "untuk diskusi internal"; repositori ini publik).

Legenda: ✅ ada · 🟡 sebagian · ❌ belum (roadmap)

## 1. Visi & siklus inti

| Konsep | Status | Di SINAU |
|---|---|---|
| Multi-tenant, satu data belajar | ✅ | `tenant_id` di 122 tabel, isolasi diuji (LAPORAN-UJI §4) |
| Siklus Materi → Pembelajaran → Aktivitas → Evaluasi → **Analisis AI → Rekomendasi** | 🟡 | Materi/tugas/kuis/ujian/nilai lengkap; analisis = peta konsep + deteksi miskonsepsi; rekomendasi lewat Alesha (engine demo) |
| Alesha sebagai lapisan intelijen (bukan modul sejajar) | 🟡 | Widget Alesha hadir di semua halaman (login-in & publik), membaca data lintas modul; engine masih dummy, titik sambung `ALESHA_API_URL` |
| Tagline "Learn. Teach. Improve. Grow." | ✅ | Halaman login & footer publik |

## 2. Pengguna & peran (§04)

| Peran konsep | Peran SINAU | Status |
|---|---|---|
| Pendidik (guru/dosen/trainer) | GURU, KAPRODI, WAKEPSEK | ✅ Teaching workspace = Kelas Saya, materi, bank soal, kuis, ujian, peta konsep |
| Pembelajar | SISWA (+CALON_SISWA) | ✅ |
| Admin tenant | ADMIN_SEKOLAH | ✅ |
| Eksekutif institusi | KEPSEK (+AUDITOR) | ✅ laporan sekolah, dashboard KPI, persetujuan |
| Administrator platform | SUPER_ADMIN | ✅ tenant, RBAC template, audit, jobs, portal wilayah |
| Orang tua / wali — opsional, terbatas pada capaian & saran | WALI_MURID | ✅ hanya capaian/kehadiran/tagihan; Alesha untuk wali sengaja tidak menampilkan jejak aktivitas |

Prinsip P1–P7: P1 (analisis berakhir pada tindakan) & P3 (hati-hati klaim kausal) diterapkan pada teks Alesha (menyebut jumlah bukti, "pola untuk diuji, bukan kesimpulan"); P2 (AI mengusulkan, manusia memutuskan) — draf RPP/soal tidak pernah tersimpan otomatis; P6 (privasi anak) — modul PDP; P7 (jaringan lemah) — mode hemat data.

## 3. Tujuh domain modul (§05)

| Domain | Objek inti | Status | Catatan |
|---|---|---|---|
| 1 Identity & Access | Tenant, User, Role, Permission, Session | ✅ | RBAC 15 peran, override per tenant/pengguna, refresh token berputar |
| 2 Learning Management | Class, Course, Module, Material, Enrollment | ✅ | Kelas, kurikulum, materi, penugasan guru×mapel, jadwal |
| 3 Teaching Management | LessonPlan, Session, TeachingMethod, Rubric | 🟡 | Rubrik ✅ (uji kompetensi); LessonPlan hanya draf dari Alesha (belum tersimpan sebagai entitas); TeachingMethod & mode *teaching experiment* ❌ |
| 4 Learning Experience | LearningProfile, LearningPath, Activity, Progress | 🟡 | Profil = mastery per konsep; jalur adaptif & tes diagnostik ❌ |
| 5 Assessment & Competency | Item, Assessment, Attempt, Competency, Credential | 🟡 | Bank soal **dengan pengecoh berlabel miskonsepsi** ✅, kuis/ujian/attempt ✅, skema kompetensi & sertifikat PDF ✅; kredensial terbuka (open badge) ❌, penilaian esai dibantu AI ❌, portofolio ❌ |
| 6 Analytics & Intelligence | LearningEvent, Metric, Insight, Report | 🟡 | Metrik & laporan ✅; aliran peristiwa belajar seragam (xAPI-like) ❌ — analitik dihitung dari tabel jawaban |
| 7 Alesha AI | Agent, Prompt, Knowledge, Recommendation | 🟡 | 7 peran Alesha dipetakan ke intent dummy (lihat §5); Knowledge/Learning/Analytics Engine ❌ |
| Layanan platform | Notification, File, Subscription, AuditLog, Job | 🟡 | Semua ✅ kecuali Subscription/penagihan tenant ❌ |

## 4. Fitur penanda

| Fitur | Status | Di SINAU |
|---|---|---|
| **Absorption Heatmap** — penyerapan per sub-konsep | 🟡 | Menu *Peta Konsep*: mastery per konsep per siswa & per kelas, jumlah bukti ditampilkan. Belum berbentuk pohon berjenjang (konsep masih datar per mapel) |
| Deteksi miskonsepsi kelas | ✅ | Opsi soal punya label miskonsepsi; peta kelas & Alesha Teaching Insight menghitung pengecoh yang sama |
| Rekomendasi pedagogis adaptif | 🟡 | Teks rekomendasi Alesha (demo) dari konsep terlemah; belum belajar dari sinyal keterlibatan/waktu |
| AI Lesson Assistant | 🟡 | Draf RPP 3 pertemuan + rubrik (demo, bertanda "perlu verifikasi") |
| Tutor 10 mode (Explain … Socratic) | 🟡 | Semua mode ada di widget; **Socratic otomatis** saat siswa punya kuis/ujian berjalan ✅; Quiz Me memakai bank soal nyata + umpan balik miskonsepsi ✅; penjelasan bebas masih templat |
| Adaptive Learning Path (BKT/Elo, retensi, spaced review) | ❌ | Roadmap fase 2 |
| Competency Engine → Digital Competency Profile | 🟡 | Uji kompetensi + sertifikat; profil kompetensi lintas bukti ❌ |
| Lifelong learning / 4 edisi (EDU, TRAINING, CORPORATE, LIFE) | 🟡 | Jenis tenant KAMPUS/BIMBEL/UMUM sudah ada; katalog kursus publik & bagi hasil ❌ |
| Gamifikasi (XP, lencana, misi) | ❌ | Roadmap; peringkat memang harus mati bawaan |
| Indikasi efektivitas metode / teaching experiment | ❌ | Butuh entitas TeachingMethod & pre/post-test terstruktur |

## 5. Tujuh peran Alesha → implementasi demo

| Peran | Intent yang sudah dijawab dari data nyata |
|---|---|
| AI Personal Tutor | tugas mendekati tenggat, konsep lemah + langkah berikutnya, jadwal, tagihan, kehadiran, Quiz Me (soal nyata, cek jawaban, label miskonsepsi), mode Socratic otomatis |
| AI Teaching Assistant | **Teaching Insight** (konsep belum terserap per kelas + miskonsepsi + rekomendasi + tingkat keyakinan), tugas belum dinilai, jadwal mengajar |
| AI Content Assistant | draf rancangan pembelajaran (templat) |
| AI Assessment Assistant | draf soal berlabel miskonsepsi (templat) |
| AI Learning Analyst | ringkasan lembaga (siswa/guru/kelas/kehadiran/tagihan) |
| AI Recommendation | setiap jawaban ditutup satu tindakan konkret |
| AI Knowledge Assistant | publik: PPDB, berita, kontak lembaga; semua jawaban menyebut sumber |

Kontrak kepercayaan: `sources[]` di setiap balasan ("data lembaga Anda" vs "pengetahuan umum model — perlu verifikasi"), tidak ada keputusan otomatis berdampak tinggi (rapor/kelulusan/rollover selalu lewat manusia).

## 6. Arsitektur teknis & privasi (§16–17)

| Aspek | Status |
|---|---|
| Isolasi per tenant, branding per tenant | ✅ |
| SSO institusi / Google / Microsoft | ❌ |
| LTI / API publik / impor-ekspor paket | ❌ (API internal ada, belum dipublikasikan) |
| Dapodik | ✅ ekspor CSV |
| Mode hemat data, web responsif | ✅ |
| Aksesibilitas (kontras, keyboard, screen reader) | 🟡 kontras & keyboard dasar |
| Webhook / katalog integrasi | ❌ |
| UU PDP: consent wali, minimisasi, retensi, ekspor, hapus/anonimisasi | ✅ modul PDP |
| Tidak melatih model dengan data siswa | ✅ (tidak ada pelatihan) |
| Konten AI ditandai + sumber | ✅ |
| Larangan keputusan otomatis berdampak tinggi | ✅ |

## 7. Posisi terhadap roadmap (§19)

| Fase | Status |
|---|---|
| 0 · Fondasi (identitas, tenant, kelas, materi, kuis, bank soal berlabel miskonsepsi, tutor dasar) | ✅ selesai — plus SIS lengkap (keuangan, PPDB, dst.) |
| 1 · Intelijen (peta penyerapan, deteksi miskonsepsi, wawasan pendidik, perancang pembelajaran) | 🟡 peta & deteksi ada; wawasan & perancang masih engine demo |
| 2 · Adaptif (diagnostik, graf pengetahuan, jalur adaptif, spaced review, competency engine) | ❌ |
| 3 · Ekosistem (edisi korporat/lifelong, kredensial, marketplace, API mitra) | ❌ |

## 8. Saran urutan pengerjaan berikutnya

1. **Engine Alesha nyata** — sambungkan `ALESHA_API_URL` atau LLM langsung; system prompt dari fakta terstruktur yang sudah dihitung engine dummy (`backend/src/modules/alesha/engine.ts`).
2. **Graf konsep berjenjang** — tambah `parent_id` + prasyarat di `concepts`, tampilkan heatmap pohon di Peta Konsep.
3. **Aliran peristiwa belajar** — tabel `learning_events` (actor/verb/object/context/result) diisi dari kuis, ujian, materi dibuka, tugas dikumpulkan; semua analitik pindah ke sini.
4. **LessonPlan sebagai entitas** — simpan draf Alesha yang disetujui guru, tautkan ke pertemuan & asesmen (menutup putaran Topik → Rancang → Ajar → Asesmen → Analisis).
5. **Tes diagnostik + jalur adaptif** (fase 2), lalu gamifikasi dengan peringkat mati bawaan.
