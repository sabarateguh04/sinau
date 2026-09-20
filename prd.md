# PRD — SINAU LMS+SIS (Multi-tenant)

Versi 0.2 · 21 September 2026 · Status: **disetujui arah, menunggu konfirmasi milestone**

Keputusan yang sudah diambil (21 Sep 2026):
- **Multi-tenant sejak awal** — Super Admin mendaftarkan lembaga; isolasi data per tenant.
- **Cakupan = seluruh modul openlms**, dibangun bertahap per milestone (§8).
- **Satu port 4008** untuk API + frontend (Express menyajikan hasil build Vite).
- **Nama produk SINAU** — DB `db_sinau`, prefix tabel `tbl_sinau_`.

---

## 1. Latar belakang

Repo publik `superdevids/openlms` (direbrand "opensis") adalah super-app LMS + SIS untuk **satu** sekolah SMA/SMK Indonesia: 92 tabel, 38 modul API, 14 role. Stack-nya PostgreSQL + Prisma, NestJS + Redis/BullMQ/Socket.IO, Next.js monorepo Turborepo.

Proyek SINAU membangun ulang cakupan fungsional yang sama **dari nol** dengan stack dan konvensi proyek referensi `learning-universal/e-learning`, ditambah multi-tenant:

| Aspek | openlms / opensis | SINAU (proyek ini) |
|---|---|---|
| Tenancy | single-school | **multi-tenant** (lembaga = tenant) |
| Database | PostgreSQL + Prisma | **MySQL 8**, `mysql2`, SQL mentah, `migrate.ts` idempoten, DDL portabel |
| Backend | NestJS 11 + Redis + BullMQ + Socket.IO | **Express 5 + TypeScript**, `routes → controllers → services → repositories` |
| Frontend | Next.js 16 + shadcn/ui | **Vite + React 19**, react-router 7, Tailwind 4, zustand, axios |
| Port | 3000 (web) + 3001 (api) + 5432 + 6379 | **4008** (API + static FE) + MySQL |
| Struktur | monorepo apps/packages | `backend/` + `frontend/` |

openlms dipakai **hanya sebagai referensi fungsional** (daftar fitur, alur, relasi entitas). Tidak ada kode, skema, seed, gambar, teks, atau dokumen yang disalin.

## 2. Hasil audit openlms

### 2.1 Lisensi & hak cipta
- Lisensi **MIT** (© 2026 opensis contributors). MIT mengizinkan reuse dengan atribusi, tetapi kita memilih **clean-room rewrite** sehingga tidak ada kewajiban atribusi dan tidak ada risiko klaim.
- Boleh dijadikan acuan: daftar fitur, alur bisnis, struktur relasi entitas (ide/fungsi, bukan ekspresi).
- Tidak dibawa: nama `opensis`/`openlms`, README/CHANGELOG/CONTRIBUTING/docs, skema Prisma, seed, gambar landing, design system, komponen UI, konstanta/cookie/storage key.
- Gerbang rilis: `grep -ri "opensis\|openlms"` di repo SINAU harus **nol** hasil (kecuali file PRD ini).

### 2.2 Keamanan dependensi & kode
| Pemeriksaan | Hasil |
|---|---|
| Lifecycle script (`preinstall`/`postinstall`) di package.json | tidak ada |
| Dependensi non-registry (git/http/tarball) | tidak ada; semua `registry.npmjs.org` |
| Paket ber-install-script (dari lock) | `argon2`, `prisma`, `@prisma/engines`, `esbuild`, `sharp`, `fsevents`, `msgpackr-extract`, `unrs-resolver` — binary native wajar |
| `eval`/`new Function`/`child_process` di source | hanya `redis.eval` (Lua Redis) & komentar; tidak ada eksekusi dinamis |
| Blob base64/hex panjang (obfuscation) | tidak ada |
| URL keluar mencurigakan | tidak ada (`http://evil` = fixture test CSV-injection) |

**Kesimpulan:** tidak ada library berbahaya/virus. Karena rewrite, tidak ada kode openlms yang ikut. Yang sengaja **tidak dipakai** (kompleksitas/permukaan serangan tanpa kebutuhan): Redis, BullMQ, Socket.IO+redis-adapter, argon2, Prisma, sharp, Turborepo, Docker multi-service.

## 3. Visi & sasaran

**Visi:** platform SaaS SINAU — satu akun, satu sumber data, untuk seluruh operasional lembaga pendidikan (SMA/SMK, kampus, bimbel), ringan di jaringan lemah, dengan progres belajar terlacak per orang dan per konsep.

**Sasaran produk:**
1. Super Admin mendaftarkan lembaga baru (tenant) + admin pertamanya dalam < 5 menit; data antar-lembaga terisolasi total.
2. Admin lembaga menyiapkan tahun ajaran, jurusan, kelas, mapel, akun dalam < 30 menit (impor Excel/CSV).
3. LMS inti lengkap: materi, tugas, kuis, ujian online, nilai, absensi, e-rapor.
4. Operasional: keuangan (SPP), payroll, aset & perpustakaan, PPDB, prakerin/uji kompetensi SMK, BK, ekstrakurikuler.
5. Kepatuhan: UU PDP (akses/ekspor/hapus data), ekspor Dapodik, audit log.
6. Satu proses Node pada port 4008 + MySQL; deploy PM2 + nginx (pola `elearning-deploy`).

## 4. Pengguna & peran

Peran per tenant (kecuali `SUPER_ADMIN` yang lintas tenant). Satu akun boleh multi-role; izin backend = gabungan, peran aktif hanya mengatur UI. Izin berbentuk `resource:action:scope` dengan scope `SELF | CLASS | UNIT | TENANT | PLATFORM`.

| Kode | Nama | Cakupan | Milestone |
|---|---|---|---|
| `SUPER_ADMIN` | Super Admin platform | semua tenant, kelola lembaga, portal publik, feature flag global | M1 |
| `ADMIN_SEKOLAH` | Admin/Operator lembaga | seluruh data tenant; master data, akun, impor, branding, RBAC tenant | M1 |
| `KEPSEK` | Kepala sekolah | seluruh tenant read + approval (rapor, payroll, rollover) | M1 |
| `WAKEPSEK` | Wakil kepala sekolah | kurikulum/kesiswaan sesuai delegasi | M2 |
| `KAPRODI` | Ketua program keahlian | jurusan-nya | M2 |
| `GURU` | Guru / wali kelas | kelas×mapel yang diampu; wali kelas: kelasnya | M1 |
| `SISWA` | Siswa | dirinya; materi kelasnya | M1 |
| `WALI_MURID` | Orang tua/wali | anaknya (read-only) | M3 |
| `BK` | Guru BK | catatan konseling & kedisiplinan | M4 |
| `KEUANGAN` | Staf keuangan | tagihan, pembayaran, payroll (hitung) | M5 |
| `AUDITOR` | Auditor | read-only seluruh tenant + audit log | M5 |
| `CALON_SISWA` | Pendaftar PPDB | pendaftarannya sendiri | M6 |
| `PEMBIMBING_INDUSTRI` | Pembimbing prakerin (eksternal) | siswa bimbingannya | M7 |
| `PENGUJI_EKSTERNAL` | Penguji uji kompetensi | sesi ujinya | M7 |

## 5. Ruang lingkup fitur (peta lengkap)

### 5.1 Platform & tenant (M1)
- Kelola lembaga: nama, jenis (SMA/SMK/kampus/bimbel/umum), kategori NEGERI/SWASTA, wilayah (provinsi/kota — master wilayah), status aktif, kebijakan (self-registration, portal share, approval flow), admin pertama (password sementara sekali-tampil).
- Resolusi tenant: dari akun (username unik global, akun membawa `tenant_id`) — login tanpa pilih workspace, seperti SINAU `main-tenant`. Opsional subdomain di M8.
- Branding per tenant: nama tampilan, logo, warna utama/aksen, favicon.
- Feature flags per tenant (saklar modul & sub-fitur) + global (Super Admin).
- Maintenance mode global & per tenant.
- RBAC configurable: permission master, role → permission, override per user; dikelola Super Admin (platform) dan Admin (tenant, dalam batas template).
- Audit log seluruh aksi tulis penting; `GET /health`.

### 5.2 Auth & akun (M1)
Login username+password; JWT access 30 mnt + refresh 30 hari (hash di DB, rotasi, cabut semua); wajib ganti password pertama; lupa password via e-mail (mailer outbox seperti referensi); rate limit login; CRUD akun; impor Excel/CSV siswa/guru/staf dengan laporan error per baris; undangan akun via tautan; multi-role switcher; onboarding checklist per peran.

### 5.3 SIS — data induk & akademik (M1–M2)
Profil lembaga; tahun ajaran & semester aktif; jurusan/prodi; tingkat; kelas/rombel + wali kelas; mapel (kategori, berbasis kompetensi); penugasan guru×mapel×kelas; enrollment siswa (aktif/pindah/lulus/keluar); data induk siswa (NISN, NIK, alamat, wali), guru & staf (NUPTK, jabatan); jadwal pelajaran mingguan (deteksi bentrok guru/ruang); kalender akademik; referensi kurikulum (CP/ATP Kurikulum Merdeka); alumni; rollover tahun ajaran (draft → pre-check → dry-run → execute → rollback) (M8).

### 5.4 LMS inti (M1–M2)
- Materi: file (pdf/pptx/docx/gambar ≤ 20 MB), video (YouTube/tautan), teks/markdown; publish/draft; tag jurusan/tingkat/mapel; jejak baca per siswa.
- Tugas & pengumpulan: tenggat, izin terlambat, skor maks, lampiran; siswa kumpul teks/file; idempoten; guru nilai + feedback.
- Bank soal: PG, PG kompleks, benar/salah, isian, menjodohkan, esai; tingkat kesulitan; **label konsep per soal & label miskonsepsi per pengecoh** (keputusan SINAU §15); impor soal.
- Kuis: dari bank soal, durasi, jendela, acak soal & opsi, jumlah percobaan, penilaian otomatis.
- Ujian online (M2): paket soal, sesi ujian per kelas (token sesi, jendela waktu, pengawas), autosave jawaban idempoten, auto-submit server-side saat waktu habis, log jawaban (peristiwa belajar), kunci layar/deteksi pindah tab (best-effort), rekap & analisis butir.
- Nilai: komponen & bobot per mapel (tugas/kuis/UH/UTS/UAS/praktik), nilai akhir & predikat, rekap kelas, ekspor CSV/Excel.
- Absensi: harian per kelas (wali), per pertemuan mapel (guru), bulk idempoten; sesi QR + token sekali pakai + geofencing (M3); izin/sakit online + verifikasi; rekap & dashboard kedisiplinan.
- Peta penguasaan konsep (M3): agregasi jawaban per konsep → siswa/kelas/sekolah/wilayah.

### 5.5 e-Rapor (M3)
Konsolidasi nilai → nilai akhir per mapel + predikat + deskripsi; track P5 (proyek, dimensi, catatan); catatan wali kelas, kehadiran, ekstrakurikuler; rapor per siswa/kelas; approval KEPSEK; ekspor PDF per siswa (pdfkit); pengaturan bobot per tenant.

### 5.6 Portal wali murid (M3)
Read-only: profil anak, nilai, absensi, tugas, tagihan; notifikasi; tautan wali↔siswa (lebih dari satu anak).

### 5.7 Komunikasi & realtime (M1 dasar, M3 realtime)
Pengumuman (sekolah/kelas/peran), notifikasi in-app + e-mail outbox, surat resmi (template + nomor surat), realtime via **SSE** (notifikasi, `exam:tick`, `exam:force-submit`) — tanpa Socket.IO/Redis.

### 5.8 BK, kedisiplinan, ekstrakurikuler, prestasi (M4)
Catatan konseling (rahasia, hanya BK+KEPSEK), poin & catatan pelanggaran, ekstrakurikuler + pendaftaran + kehadiran, prestasi siswa (untuk rapor & landing).

### 5.9 Keuangan (M5)
Jenis tagihan (SPP, dsb.), generate tagihan massal per kelas, pembayaran & alokasi cicilan, aturan denda keterlambatan, refund, rekonsiliasi bank (impor CSV), arus kas, laporan; portal wali melihat tagihan.

### 5.10 Payroll (M5)
Jabatan, komponen gaji, struktur gaji per staf, konfigurasi periode, run bulanan (hitung → validasi → approve keuangan → rekap → approve kepsek), PPh 21 skema TER, BPJS, slip digital PDF, absensi staf.

### 5.11 Aset & perpustakaan (M6)
Inventaris, peminjaman (cek bentrok jadwal), penyusutan, pemeliharaan, opname; buku & peminjaman perpustakaan.

### 5.12 PPDB (M6)
Pendaftaran publik tanpa login (tenant dipilih dari tautan/slug), upload dokumen, tracking status, verifikasi, seleksi/waitlist, enroll ke kelas, akun CALON_SISWA.

### 5.13 SMK — prakerin & uji kompetensi (M7)
Mitra industri, pembimbing industri (akun eksternal), penempatan prakerin, jurnal harian + verifikasi, uji kompetensi (skema, rubrik, penguji eksternal, hasil).

### 5.14 Kepatuhan: PDP & Dapodik (M7)
Akses data pribadi sendiri, perbaikan profil, ekspor data pribadi, permintaan hapus + review petugas, consent, kebijakan retensi + job bulanan anonimisasi; ekspor Dapodik (peserta didik, pendidik, rombel — CSV ber-BOM).

### 5.15 Landing CMS & portal publik (M8)
Per tenant: beranda, tentang, program keahlian, fasilitas, ekstrakurikuler, prestasi, galeri, testimoni, FAQ, kontak, berita; portal bahan ajar publik (dibagikan Super Admin/Admin); SEO dasar (meta, OG, JSON-LD); dilayani dari port yang sama (`/s/:slug/*`).

### 5.16 Dashboard & pelaporan (lintas milestone)
Dashboard per peran (konfigurable widget per tenant), laporan hasil belajar per wilayah untuk Super Admin, ekspor job async (tabel job di MySQL, worker in-process) dengan status & unduh.

## 6. Arsitektur teknis

### 6.1 Struktur repo & satu port
```
clone-learning/
├─ prd.md
├─ backend/                   Express 5 + TypeScript (commonjs)
│  ├─ database/schema.sql     snapshot DDL (source of truth = src/database/migrate.ts)
│  ├─ uploads/                (gitignored; produksi via UPLOAD_ROOT)
│  └─ src/
│     ├─ server.ts            /api/v1/* + static frontend/dist + SPA fallback
│     ├─ config.ts
│     ├─ database/{db.ts, migrate.ts, portableDdl.ts, migrations/*.ts, seed/*.ts}
│     ├─ middlewares/{tenantResolver, authenticate, rbacGuard, validate, rateLimit, errorHandler}
│     ├─ modules/<modul>/{routes,controller,service,repository}.ts   (satu folder per modul §5)
│     ├─ jobs/                scheduler in-process (tenggat H-1, retensi PDP, ekspor)
│     ├─ realtime/            SSE hub
│     └─ utils/
├─ frontend/                  Vite + React 19 + TS → build ke frontend/dist
│  └─ src/{app, layouts, pages/<peran>, components/ui, features/<modul>, store, lib}
├─ deploy/{nginx.conf, ecosystem.config.cjs, DEPLOY.md, backup.sh}
└─ .env.example (backend), frontend/.env.example
```

**Satu port 4008:**
- Produksi: `node backend/dist/server.js` melayani `/api/v1/*`, `/uploads/*`, `/events` (SSE), dan file statis `frontend/dist` dengan fallback `index.html` (SPA). nginx hanya reverse-proxy 4008 + TLS.
- Development: `npm run dev` di root menjalankan **backend di 4008** dan **Vite di 4009 dengan proxy** `/api`,`/uploads`,`/events` → 4008 (HMR butuh proses sendiri). Buka `http://localhost:4009` saat dev; produksi tetap satu port 4008. Alternatif `npm run dev:single` menjalankan backend saja dengan Vite middleware mode di 4008 (tanpa proses kedua) — disediakan bila diperlukan.

### 6.2 Database — MySQL 8
- DB `db_sinau`, charset `utf8mb4_unicode_ci`, InnoDB. Prefix **`tbl_sinau_`**.
- PK `char(36)` UUID v4; `created_at`/`updated_at` di semua tabel; soft-delete (`deleted_at`) untuk data induk.
- **`tenant_id char(36) NOT NULL`** di setiap tabel milik tenant + index komposit `(tenant_id, …)`; tabel platform (tenants, wilayah, permission master) tanpa `tenant_id`. Setiap query repository wajib menerima `tenantId` (tipe `TenantScoped` di TS — tidak bisa lolos compile tanpa itu).
- DDL portabel MySQL 8 (tanpa sintaks MariaDB-only), migrasi bernomor idempoten (`migrations/0001_*.ts` …) dijalankan saat boot & `npm run db:migrate`; seed count-guarded (`db:seed:wilayah`, `db:seed:demo`).
- Enum status sebagai `varchar(32)` + validasi zod (bukan `ENUM` kolom).
- Uang: `decimal(15,2)`; koordinat `decimal(10,7)`; JSON untuk opsi soal/jawaban/widget config.

**Peta tabel (±90, dikelompokkan per domain):**

| Domain | Tabel `tbl_sinau_*` |
|---|---|
| Platform | `tenants`, `tenant_settings`, `tenant_branding`, `feature_flags`, `system_status`, `provinsi`, `kota`, `permissions`, `role_permissions`, `user_permission_overrides`, `audit_logs`, `jobs`, `files`, `export_logs` |
| Akun | `users`, `user_roles`, `user_profiles_student`, `user_profiles_staff`, `refresh_tokens`, `password_resets`, `invitations`, `user_onboarding`, `notifications`, `import_batches`, `import_errors` |
| Akademik | `academic_years`, `majors`, `subjects`, `classes`, `class_students`, `class_subjects`, `schedule_entries`, `rooms`, `academic_calendar`, `curriculum_refs`, `alumni`, `rollover_runs`, `rollover_items` |
| LMS | `materials`, `material_views`, `assignments`, `submissions`, `concepts`, `questions`, `question_options`, `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_answers`, `exam_packages`, `exam_package_questions`, `exams`, `exam_sessions`, `exam_attempts`, `exam_answer_logs`, `grade_components`, `grades` |
| Absensi | `attendance_daily`, `attendance_sessions`, `attendance_qr_tokens`, `attendance_records`, `permits`, `staff_attendance` |
| Rapor | `report_cards`, `report_card_subjects`, `report_card_p5`, `report_card_settings` |
| Keluarga | `guardians`, `guardian_students` |
| Komunikasi | `announcements`, `official_letters`, `letter_templates` |
| BK & kesiswaan | `counseling_notes`, `discipline_rules`, `discipline_records`, `extracurriculars`, `extracurricular_members`, `achievements` |
| Keuangan | `fee_types`, `invoices`, `invoice_items`, `payments`, `payment_allocations`, `late_fee_rules`, `refunds`, `reconciliation_batches`, `reconciliation_items`, `cash_flows` |
| Payroll | `job_positions`, `payroll_components`, `salary_structures`, `payroll_period_configs`, `payroll_runs`, `payroll_run_items`, `payslips` |
| Aset & perpus | `assets`, `asset_bookings`, `asset_maintenance`, `asset_audits`, `library_books`, `library_loans` |
| PPDB | `ppdb_periods`, `ppdb_applicants`, `ppdb_documents`, `ppdb_selections` |
| SMK | `industry_partners`, `industry_mentors`, `internships`, `internship_journals`, `competency_schemes`, `competency_rubrics`, `competency_tests`, `competency_results` |
| PDP | `consents`, `pdp_requests`, `retention_policies` |
| Landing | `landing_pages`, `landing_sections`, `news_articles`, `module_portal_shares` |
| Dashboard | `dashboard_configs` |

ERD detail (kolom, FK, index) ditulis per milestone di `docs/erd/<milestone>.md` sebelum coding milestone tersebut.

### 6.3 Backend — Express 5
- **Runtime deps:** `express@5`, `mysql2`, `jsonwebtoken`, `bcryptjs`, `cors`, `helmet`, `dotenv`, `zod`, `multer`, `express-rate-limit`, `pino`, `pino-http`, `pdfkit`, `exceljs` (impor/ekspor Excel), `uuid`, `qrcode`, `nodemailer` (opsional, default outbox file).
- **Tidak dipakai:** Redis, BullMQ, Socket.IO, Prisma, argon2, NestJS.
- Middleware chain rute terlindungi: `authenticate → tenantResolver(dari JWT) → rbacGuard('resource:action') → validate(zodSchema) → controller`. Super Admin dapat "masuk sebagai tenant" via header `X-Tenant-Id` (dicatat audit).
- Konvensi respons: `{ data }` / `{ data, meta:{page,limit,total} }` / `{ error, message, details? }`. Prefix `/api/v1`.
- Job async: tabel `jobs` (type, payload, status, attempts, run_at) + worker `setInterval` in-process dengan lock baris (`SELECT … FOR UPDATE SKIP LOCKED`); cron sederhana (tenggat H-1, retensi PDP bulanan, laporan).
- Realtime: SSE `/events` per user (auth via cookie/`token` query sekali pakai), hub in-memory; cukup untuk 1 proses; bila PM2 cluster >1, sticky by user id atau turun ke polling — dicatat di DEPLOY.md.
- Upload: multer → `UPLOAD_ROOT/<tenant>/<modul>/<uuid>.<ext>`, whitelist MIME, ≤ 20 MB (materi) / 4 MB (foto), akses non-publik lewat endpoint ber-auth.
- Keamanan: helmet, CORS whitelist, rate limit (global/IP, login, upload), bcrypt cost 12, refresh token hash SHA-256 + rotasi + deteksi reuse, CSV/Excel injection sanitizer saat ekspor, prepared statements, validasi zod semua endpoint tulis, audit log, header `X-Tenant-Id` hanya untuk SUPER_ADMIN.

### 6.4 Frontend — Vite + React 19
- **Deps:** `react-router-dom@7`, `zustand`, `axios`, `tailwindcss@4`, `lucide-react`, `framer-motion`, `react-hook-form` + `zod`, `date-fns`, `recharts`, `@tanstack/react-table` (tabel besar), `react-dropzone`.
- Struktur: `layouts/AppShell` (sidebar per peran, topbar, pemilih peran aktif & tenant [Super Admin]), `pages/<peran>/*` lazy-loaded, `features/<modul>/{api,hooks,components}`, `components/ui/*` ditulis sendiri.
- Routing: `/login`, `/ppdb/:slug/*`, `/s/:slug/*` (landing publik), `/admin/*`, `/guru/*`, `/siswa/*`, `/kepsek/*`, `/ortu/*`, `/keuangan/*`, `/bk/*`, `/superadmin/*`, `/pembimbing/*`, `/penguji/*`; `ProtectedRoute` cek peran + feature flag.
- Build `vite build` → `frontend/dist`, disajikan backend.

### 6.5 Arah desain UI
- **Identitas SINAU:** hijau-teal (utama) + amber (aksen); font `Plus Jakarta Sans` (fallback system-ui); token `--brand-*` di-override per tenant dari branding.
- Sidebar kolaps, kartu radius 16px bayangan lembut, header halaman + breadcrumb + aksi utama kanan; **mode gelap** sejak awal; **mobile-first** untuk siswa/wali (materi, tugas, kuis, ujian); **mode hemat data** (tanpa thumbnail/autoplay); micro-interaction ringan via token `lib/motionTokens.ts`.
- Komponen inti: Button, Input, Select, Combobox, DatePicker, Table (sort/filter/paginasi server), Modal, Drawer, Toast, Tabs, Badge, EmptyState, Skeleton, Stepper (PPDB/payroll), FileUpload, QR viewer/scanner.

## 7. Non-fungsional
| Aspek | Target |
|---|---|
| Kinerja | API p95 < 300 ms; FE first load < 2 s di 4G; lazy per route |
| Skala | banyak tenant, s.d. 3.000 pengguna/tenant, 300 pengguna serentak saat ujian per proses |
| Isolasi | setiap query ber-`tenant_id`; test otomatis "tenant A tidak bisa baca tenant B" per modul |
| Ketersediaan | PM2, restart otomatis, backup `mysqldump` harian + uploads |
| Keamanan | OWASP top-10 dasar; `npm audit` tanpa high; secret hanya di `.env` (tidak di-commit) |
| Kompatibilitas | Chrome/Edge/Firefox 2 versi terakhir, Android Chrome; MySQL 8.0+; Node 20+ |
| Bahasa | UI Bahasa Indonesia; kode/komentar Inggris |
| Observabilitas | log JSON pino, `/api/v1/health` (DB, disk uploads, job queue) |

## 8. Milestone & urutan pengerjaan

Setiap milestone = ERD detail → migrasi → API → UI → smoke test per peran (`PENGUJIAN.md`) → commit. Milestone diselesaikan berurutan; modul dalam satu milestone bisa paralel.

| M | Nama | Isi utama (§5) | Peran aktif |
|---|---|---|---|
| **M1** | Fondasi & LMS inti | 5.1 platform/tenant, 5.2 auth & akun, 5.3 master data dasar, 5.4 materi/tugas/bank soal/kuis/nilai/absensi manual, 5.7 pengumuman & notifikasi, dashboard dasar, deploy satu port | SUPER_ADMIN, ADMIN_SEKOLAH, KEPSEK, GURU, SISWA |
| **M2** | Akademik & ujian | jadwal, kalender, kurikulum, data induk lengkap, impor Excel, ujian online + analisis butir, WAKEPSEK/KAPRODI | +WAKEPSEK, KAPRODI |
| **M3** | Rapor, wali, realtime | e-rapor + PDF, portal wali, absensi QR+geofence, izin online, peta konsep, SSE | +WALI_MURID |
| **M4** | Kesiswaan | BK, kedisiplinan, ekstrakurikuler, prestasi, surat resmi | +BK |
| **M5** | Keuangan & payroll | tagihan, pembayaran, denda, refund, rekonsiliasi, arus kas; payroll penuh; AUDITOR | +KEUANGAN, AUDITOR |
| **M6** | Aset, perpus, PPDB | inventaris, peminjaman, penyusutan, opname; perpustakaan; PPDB publik | +CALON_SISWA |
| **M7** | SMK & kepatuhan | prakerin, uji kompetensi; PDP; Dapodik | +PEMBIMBING_INDUSTRI, PENGUJI_EKSTERNAL |
| **M8** | Landing, rollover, RBAC UI | landing CMS per tenant, portal publik, rollover tahun ajaran, RBAC editor, dashboard konfigurable, subdomain opsional | — |

Perkiraan volume: ±90 tabel, ±250 endpoint, ±120 halaman. M1 adalah fondasi yang menentukan semua milestone berikutnya (tenancy, RBAC, konvensi) — dikerjakan paling hati-hati.

## 9. Keputusan terbuka (perlu jawaban sebelum M1 selesai, tidak memblokir mulai)

| # | Pertanyaan | Rekomendasi |
|---|---|---|
| Q1 | Urutan milestone §8 sudah sesuai prioritas bisnis? | Ya, LMS inti → ujian → rapor → … |
| Q2 | Realtime SSE tanpa Redis cukup? (1 proses PM2) | Cukup; naik ke Socket.IO+Redis hanya jika perlu multi-proses |
| Q3 | Master wilayah: seed provinsi/kota dari data referensi `e-learning` (milik sendiri)? | Ya, itu data kita, bukan openlms |
| Q4 | E-mail: outbox file (seperti referensi) atau SMTP nyata dari awal? | Outbox dulu, SMTP via `.env` |
| Q5 | Dev: dua proses (4008 + Vite 4009 proxy) diterima? Produksi tetap satu port. | Ya |

## 10. Risiko
| Risiko | Mitigasi |
|---|---|
| Volume sangat besar (8 milestone) | Milestone ketat; tidak ada fitur baru masuk tanpa revisi PRD; M1 harus benar-benar solid |
| Kebocoran data antar-tenant | `tenant_id` wajib di tipe repository; test isolasi per modul; audit header `X-Tenant-Id` |
| Tidak sengaja menyalin openlms | Repo openlms tidak ada di workspace; hanya PRD ini yang merujuknya; gerbang grep nol |
| Beban ujian serentak tanpa Redis | Prepared statements + index; autosave batched; uji beban 300 user sebelum M2 rilis |
| MariaDB vs MySQL di server | DDL portabel MySQL 8 (pelajaran deploy e-learning) |
| Satu proses = single point | PM2 restart otomatis; SSE dan job worker toleran restart (state di MySQL) |
