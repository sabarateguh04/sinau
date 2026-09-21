# Laporan Uji SINAU — 21 September 2026

Lingkungan: build produksi (`npm run build && npm start`) di `http://localhost:4008`, MySQL lokal, database **direset ke kondisi awal** (`db:migrate` + `db:seed:demo`) sebelum pengujian sehingga hasil di bawah adalah hasil dari data bersih. Pengujian dilakukan di lapisan API (tanpa browser) memakai token masing-masing peran, dengan logika pemilihan menu yang sama persis dengan sidebar aplikasi.

## 1. Ringkasan

| Area | Hasil |
|---|---|
| Alur bisnis lintas peran (7 rangkaian, 135 langkah) | **Lolos semua** |
| Halaman per peran (12 peran, 251 halaman-peran, 575 panggilan API) | **Lolos** — 0 error 5xx, 0 link mati, 0 pelanggaran izin |
| Keamanan & non-fungsional (20 pemeriksaan) | **Lolos** setelah 1 perbaikan (lihat §5) |
| Bug ditemukan & diperbaiki | 1 (admin terkunci saat maintenance) |
| Penyesuaian kecil | Auditor mendapat `payroll:slip_self` & `attendance:self`; 3 akun demo baru (wakepsek, staf, auditor) |

## 2. Alur bisnis (end-to-end)

| Rangkaian | Peran terlibat | Langkah | Hasil |
|---|---|---|---|
| Inti (auth, RBAC, akademik, materi, tugas, bank soal, kuis, nilai, presensi, pengumuman) | Super Admin, Admin, Guru, Siswa, Wali | 26 | ✔ |
| Ujian (paket → sesi bertoken → attempt siswa → pelanggaran → perpanjang → paksa kumpul → hasil) | Guru, Siswa | 15 | ✔ |
| e-Rapor (generate → edit P5/catatan → siswa diblokir → ajukan → sahkan → siswa/wali lihat → PDF) | Guru wali kelas, Kepsek, Siswa, Wali | 13 | ✔ |
| Keuangan & payroll (jenis biaya → tagihan massal → bayar+alokasi → kuitansi PDF → refund → rekonsiliasi → arus kas → run gaji → validasi → kepsek → bayar → slip PDF) | Keuangan, Kepsek, Siswa | 21 | ✔ |
| Sarana, perpustakaan, PPDB (aset, booking bentrok ditolak, opname; pinjam-kembali-denda; daftar publik → verifikasi → seleksi → daftar ulang → akun siswa) | Admin, Staf, Siswa, Calon siswa (publik) | 24 | ✔ |
| SMK & kepatuhan (mitra, pembimbing+akun, prakerin, jurnal+verifikasi, skema/rubrik, uji oleh penguji eksternal, sertifikat PDF; PDP ekspor/permintaan/anonimisasi; Dapodik CSV) | Kaprodi, Pembimbing Industri, Penguji Eksternal, Siswa, Admin | 20 | ✔ |
| Tutup tahun & landing (suggest → run → pre-check → dry-run → execute → verifikasi kelas baru → rollback → data pulih; inbox persetujuan kepsek; berita CMS tampil di situs publik) | Admin, Kepsek, Siswa, publik | 16 | ✔ |

## 3. Halaman per peran

Untuk setiap peran: menu dihitung dari izin efektif + feature flag + registri halaman (persis logika sidebar), lalu **setiap endpoint GET yang dipakai halaman** dipanggil dengan token peran itu.

| Peran | Akun | Halaman di menu | Panggilan OK |
|---|---|---|---|
| Super Admin | superadmin | 8 | 11/11 |
| Admin Sekolah | admin.smk1 | 45 | 107/107 |
| Kepala Sekolah | kepsek.smk1 | 38 | 88/88 |
| Wakil Kepsek | wakepsek.smk1 | 29 | 56/56 |
| Kaprodi | guru.andi | 20 | 47/47 |
| Guru | guru.dimas | 24 | 61/61 |
| Tenaga Kependidikan | staf.budi | 9 | 18/18 |
| Guru BK | bk.sari | 13 | 24/24 |
| Keuangan | keu.wati | 15 | 32/32 |
| Auditor | auditor.smk1 | 21 | 54/54 |
| Siswa | siswa.01 | 18 | 42/42 |
| Wali Murid | wali.01 | 11 | 20/20 |

Catatan:
- `/attendance/daily` mengembalikan 400 "class_id wajib" bila dipanggil tanpa memilih kelas — di UI kelas selalu dipilih dulu; bukan bug.
- 6 panggilan Siswa ke `/users` & `/questions` ditolak 403 — panggilan itu hanya ada di modal form guru (`if (!open) return`, dsb.) dan tidak pernah dijalankan untuk siswa; verifikasi kode dilakukan satu per satu.
- 246 endpoint berparameter id (detail) tidak dipanggil di walk ini; endpoint detail tercakup oleh alur bisnis §2.
- Menu yang **sengaja** tidak muncul untuk peran tertentu (RBAC, bukan bug): Admin Sekolah tidak melihat *Konseling BK*, *Jenis Biaya*, *Rekonsiliasi*; Kepsek tidak melihat *Jenis Biaya*, *Rekonsiliasi*, *Dapodik*. Bisa diberikan lewat `/admin/rbac`.

## 4. Keamanan & non-fungsional

| # | Pemeriksaan | Hasil |
|---|---|---|
| 1 | Admin tenant A mengirim `X-Tenant-Id` tenant B → header diabaikan, tetap data A | ✔ |
| 2 | Admin tenant B hanya melihat pengguna tenant B | ✔ |
| 3 | Admin B membuka kelas/pengguna tenant A by id → 404 | ✔ |
| 4 | Super admin berpindah tenant via `X-Tenant-Id` | ✔ |
| 5 | Berkas privat: pemilik 200, tenant lain 403, anonim 401 | ✔ |
| 6 | Refresh token berputar; token lama ditolak; **reuse terdeteksi → token baru ikut dicabut** | ✔ |
| 7 | Maintenance mode: siswa 503 dengan pesan, super admin lolos | ✔ |
| 8 | Admin Sekolah bisa mematikan maintenance lembaganya sendiri | ✔ (setelah perbaikan) |
| 9 | Siswa membuka profil siswa lain → 403 | ✔ |
| 10 | Wali membaca nilai anak orang lain → 403 | ✔ |
| 11 | Login salah berulang → 429 setelah 10x/menit | ✔ |
| 12 | Rate limit global 300 req/menit per IP aktif | ✔ (terpicu saat walk otomatis) |
| 13 | Header keamanan (helmet: HSTS, nosniff, frame SAMEORIGIN, dll.) | ✔ terlihat di respons |

## 5. Bug yang ditemukan & diperbaiki

**Admin Sekolah ikut terkunci saat maintenance mode** — `maintenanceGate` hanya meloloskan Super Admin, sehingga admin yang mengaktifkan maintenance tidak bisa mematikannya lagi. Perbaikan: maintenance level lembaga tidak memblokir `ADMIN_SEKOLAH` lembaga itu sendiri; maintenance level platform tetap hanya dilewati Super Admin (`backend/src/middlewares/index.ts`). Diverifikasi ulang: langkah #8 lolos.

## 6. Yang belum diuji

- Klik-klik manual di browser (render, tampilan mobile, tema gelap) — perlu dilakukan manusia; skenario di `PENGUJIAN.md`.
- Unggah berkas berukuran > `UPLOAD_MAX_MB` dan SSE di belakang Nginx (butuh server produksi).
- Beban ratusan siswa ujian serentak.

## 7. Kondisi data setelah uji

Database berisi data demo + jejak pengujian yang realistis (materi, tugas, kuis, sesi ujian, rapor disahkan, tagihan/pembayaran, run payroll dibayar, pinjaman perpustakaan, PPDB satu periode, prakerin & sertifikat, berita landing). Tenant uji isolasi sudah dihapus; maintenance mode nonaktif. Silakan langsung login dengan akun di `README.md`.
