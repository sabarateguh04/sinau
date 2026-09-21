# SINAU — LMS + Sistem Informasi Sekolah (multi-tenant)

SINAU adalah platform pembelajaran dan administrasi sekolah untuk lembaga pendidikan Indonesia (SD/SMP/SMA/SMK/pesantren/kursus). Satu instalasi melayani banyak lembaga (tenant) dengan data terisolasi, peran & izin yang bisa dikonfigurasi, dan situs publik per lembaga.

Ditulis dari nol (clean-room) berdasarkan `prd.md`: **Express 5 + TypeScript + MySQL (mysql2, SQL murni)** di backend dan **Vite + React 19 + Tailwind 4** di frontend. Tidak ada kode dari proyek lain. Semua berjalan di **satu port: 4008**.

## Fitur

| Domain | Yang ada |
|---|---|
| Platform | Multi-tenant, super admin, branding per lembaga (warna/logo/tema), feature flags, maintenance mode, audit log, job worker in-process, notifikasi realtime (SSE), outbox e-mail |
| Akun & RBAC | 15 peran, izin `modul:aksi` dengan override per tenant/pengguna, JWT + refresh token berputar, undangan, impor Excel, wali murid ↔ siswa, onboarding |
| Akademik | Tahun ajaran, jurusan, mapel, ruang, kelas, penugasan guru×mapel, jadwal (deteksi bentrok), kalender, kurikulum, alumni, **tutup tahun** (kenaikan/kelulusan, pre-check → dry-run → eksekusi → rollback) |
| LMS | Materi (markdown/berkas/video), tugas + pengumpulan + penilaian, bank soal (PG, PG kompleks, benar/salah, isian, uraian, menjodohkan), kuis dengan attempt, peta konsep/penguasaan |
| Ujian | Paket soal, sesi ujian bertoken, pengawasan pelanggaran, perpanjangan waktu, paksa kumpul, hasil & analisis |
| Nilai & Rapor | Rekap nilai per kelas-mapel, skala & predikat, e-Rapor (generate → edit → ajukan → sahkan) + PDF |
| Presensi | Presensi siswa per pertemuan, izin/sakit, presensi staf |
| Kesiswaan | Konseling BK, kedisiplinan (poin), ekstrakurikuler, prestasi, surat resmi + PDF |
| Keuangan | Jenis biaya, tagihan massal, pembayaran & alokasi, kuitansi PDF, denda keterlambatan (job), refund, rekonsiliasi bank (upload), arus kas |
| Payroll | Jabatan, komponen gaji, struktur, run gaji (PPh21 TER, BPJS), alur validasi → keuangan → kepsek → bayar, slip PDF |
| Sarana | Aset + penyusutan, peminjaman (cek bentrok), pemeliharaan, stock opname, perpustakaan (katalog, pinjam, denda) |
| PPDB | Periode, pendaftaran publik, verifikasi dokumen, seleksi otomatis, pendaftaran ulang → akun siswa |
| SMK | Mitra industri, pembimbing (akun opsional), prakerin, jurnal harian + verifikasi, skema/rubrik kompetensi, uji kompetensi oleh penguji eksternal, sertifikat PDF |
| Kepatuhan | PDP (data saya, ekspor, consent, permintaan hapus/anonimisasi, retensi), ekspor Dapodik CSV |
| Publik | Landing per lembaga (halaman, berita, fasilitas, galeri, testimoni, FAQ, kontak), portal berbagi materi, PPDB online |

## Menjalankan

Prasyarat: Node.js ≥ 20, MySQL 8 atau MariaDB ≥ 10.4.

```bash
npm run install:all                     # root + backend + frontend
cp backend/.env.example backend/.env    # isi DB_* dan JWT_*
npm run db:migrate                      # buat database/tabel (idempoten) + seed platform & wilayah
npm run db:seed:demo                    # opsional: tenant demo "smkn1-demo"
npm run build && npm start              # → http://localhost:4008
```

Mode pengembangan (API 4008 + Vite HMR 4009 yang mem-proxy `/api`):

```bash
npm run dev            # buka http://localhost:4009
```

Perintah lain: `npm run typecheck`, `npm run db:snapshot --prefix backend` (perbarui `backend/database/schema.sql` & `docs/erd.md`).

## Akun

| Akun | Kata sandi | Keterangan |
|---|---|---|
| `superadmin` | `superadmin123` | dibuat otomatis saat migrasi (ubah lewat `BOOTSTRAP_SUPERADMIN_*` di `.env`, ganti setelah login) |
| `admin.smk1` | `demo12345` | Admin Sekolah tenant demo |
| `kepsek.smk1` | `demo12345` | Kepala Sekolah + Guru |
| `wakepsek.smk1` | `demo12345` | Wakil Kepala Sekolah + Guru |
| `guru.dimas`, `guru.rina`, `guru.andi` | `demo12345` | Guru (andi juga Kaprodi) |
| `bk.sari` / `keu.wati` | `demo12345` | Guru BK / Staf Keuangan |
| `staf.budi` / `auditor.smk1` | `demo12345` | Tenaga Kependidikan / Auditor |
| `siswa.01` … `siswa.22` | `demo12345` | Siswa (X RPL 1, X TKJ 1) |
| `wali.01` | `demo12345` | Wali murid siswa.01 |

Akun demo hanya ada setelah `npm run db:seed:demo`. Situs publik demo: `http://localhost:4008/s/smkn1-demo`.

## Struktur

```
backend/   Express 5 API + host frontend statis; src/database/migrations = sumber kebenaran skema
frontend/  Vite + React; src/pages/registry.tsx = daftar halaman; src/lib/nav.ts = menu per peran
deploy/    nginx.conf, ecosystem.config.cjs (PM2)
docs/      erd.md (Mermaid), backend/database/schema.sql (snapshot)
prd.md     spesifikasi produk & keputusan desain
```

Lihat `DEPLOY.md` untuk produksi dan `PENGUJIAN.md` untuk skenario uji per peran.

## Lisensi & asal kode

Seluruh kode di repositori ini ditulis khusus untuk SINAU. Dependensi pihak ketiga tercantum di masing-masing `package.json` (semua berlisensi MIT/ISC/Apache-2.0); tidak ada skrip `postinstall` maupun paket dengan akses jaringan/sistem yang tidak diperlukan.
