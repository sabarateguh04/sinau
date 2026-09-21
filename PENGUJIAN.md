# Panduan Pengujian SINAU

Dua lapis: (A) skrip uji API otomatis per milestone, (B) skenario manual per peran di browser. Semua memakai tenant demo (`npm run db:seed:demo`), kata sandi `demo12345`.

## A. Uji API otomatis

Server harus hidup di `http://localhost:4008` (`npm run dev --prefix backend` atau `npm start`). Skrip smoke ada di riwayat pengembangan (M1–M8) dan mencakup:

| Skrip | Cakupan |
|---|---|
| smoke (M1–M3) | login/refresh/logout, tenant switch super admin, RBAC, akademik, materi, tugas, bank soal, kuis attempt, nilai, presensi, pengumuman |
| smoke-exam (M4) | paket soal → sesi bertoken → attempt siswa → pelanggaran → perpanjang → paksa kumpul → hasil |
| smoke-rapor (M4) | generate rapor → edit → ajukan → sahkan → PDF |
| smoke-finance (M5) | jenis biaya → tagihan massal → pembayaran + alokasi → kuitansi PDF → refund → rekonsiliasi → denda (job) |
| smoke-m6 | aset/booking bentrok/opname, perpustakaan pinjam-kembali-denda, PPDB apply → verifikasi → seleksi → enroll |
| smoke-m7 | mitra/pembimbing/prakerin/jurnal, skema kompetensi → uji → sertifikat PDF, PDP ekspor/permintaan/anonimisasi, Dapodik CSV |
| smoke-m8 | rollover suggest → run → check → dry-run → execute → rollback, inbox persetujuan kepsek, landing CMS + berita publik |

Cepat cek kesehatan: `curl -s localhost:4008/api/v1/health`.

## B. Skenario manual per peran

Login di `http://localhost:4008/login`. Pengguna multi-peran memilih peran saat login dan bisa berganti dari menu profil; URL berawalan prefix peran (`/admin/...`, `/guru/...`, `/siswa/...`).

### 1. Super Admin — `superadmin` / `superadmin123`
1. `/superadmin/lembaga` → buat lembaga baru (slug, jenis, warna) → buka detail → aktif/nonaktif, feature flag, maintenance.
2. Pindah tenant lewat pemilih lembaga di header → semua modul lembaga terlihat sebagai admin.
3. `/superadmin/rbac` → ubah izin template peran (mis. cabut `finance:write` dari KEUANGAN) → login `keu.wati` → menu Keuangan hilang.
4. `/superadmin/jobs`, `/superadmin/audit` → job terjadwal berjalan, log audit merekam aksi di atas.
5. `/superadmin/portal` → laporan lintas lembaga per provinsi/kota.

### 2. Admin Sekolah — `admin.smk1`
1. `/admin/lembaga`, `/admin/branding` → ganti nama tampilan, warna, logo → tema aplikasi & situs publik ikut berubah.
2. `/admin/pengguna` → tambah guru; undang via e-mail (lihat `backend/outbox/mail.log`); impor Excel siswa; tautkan wali murid.
3. Akademik: tahun ajaran, jurusan, mapel, ruang, kelas (`/admin/akademik/kelas` → anggota & mapel), jadwal (coba bentrokkan ruang/guru → ditolak), kalender, kurikulum.
4. `/admin/landing` → tambah berita & FAQ → buka `/s/smkn1-demo` tanpa login → tampil.
5. `/admin/ppdb` → buat periode → daftar dari `/s/smkn1-demo/ppdb` → verifikasi → seleksi → daftar ulang → akun siswa baru bisa login.
6. `/admin/akademik/rollover` → rencana baru → pre-check → dry-run → eksekusi → cek kelas baru → rollback.
7. `/admin/audit`, `/admin/fitur`, `/admin/rbac` (override izin per lembaga/pengguna).

### 3. Kepala Sekolah — `kepsek.smk1`
1. `/kepsek/dashboard` → KPI presensi, nilai, keuangan.
2. `/kepsek/persetujuan` → inbox: rapor menunggu sah, payroll menunggu kepsek, surat, refund, pinjam aset, PDP.
3. `/kepsek/rapor` → sahkan rapor yang diajukan guru → PDF terunduh.
4. `/kepsek/payroll` → setujui run gaji → keuangan bisa bayar.
5. `/kepsek/laporan` → laporan sekolah per periode.

### 4. Guru — `guru.dimas`
1. `/guru/kelas` → kelas & mapel yang diampu saja (scope).
2. `/guru/materi` → buat materi markdown + unggah berkas → siswa melihat.
3. `/guru/tugas` → buat tugas dengan tenggat → nilai pengumpulan siswa → nilai masuk `/guru/nilai`.
4. `/guru/bank-soal` → soal PG/menjodohkan/uraian → `/guru/kuis` → publikasikan → lihat hasil.
5. `/guru/ujian` → paket → sesi (token) → pantau pelanggaran → perpanjang waktu → paksa kumpul → analisis.
6. `/guru/absensi` → isi presensi pertemuan; `/guru/rapor` → generate, edit deskripsi, ajukan.
7. `/guru/konsep` → penguasaan konsep per siswa.

### 5. Siswa — `siswa.01`
1. `/siswa/dashboard` → jadwal hari ini, tugas mendekati tenggat, pengumuman.
2. `/siswa/materi`, `/siswa/tugas` (unggah jawaban), `/siswa/kuis` (kerjakan; kunci menjodohkan tidak bocor di jaringan), `/siswa/ujian` (masukkan token; pindah tab tercatat sebagai pelanggaran).
3. `/siswa/nilai`, `/siswa/rapor` (PDF setelah disahkan), `/siswa/absensi/izin` (ajukan izin).
4. `/siswa/tagihan` → lihat tagihan & kuitansi; `/siswa/prakerin` (jurnal harian); `/siswa/uji-kompetensi`.
5. `/siswa/pdp` → data saya, ekspor JSON, cabut consent, minta hapus.

### 6. Wali Murid — `wali.01`
1. `/ortu/dashboard` → ringkasan anak (siswa.01): presensi, nilai, tagihan.
2. `/ortu/tagihan`, `/ortu/rapor`, `/ortu/pengumuman`; tidak bisa membuka data siswa lain (403).

### 7. Guru BK — `bk.sari`
`/bk/bk/konseling` (catatan rahasia hanya BK/kepsek), `/bk/bk/kedisiplinan` (poin → notifikasi wali), `/bk/surat`.

### 8. Keuangan — `keu.wati`
1. `/keuangan/keuangan/jenis-biaya` → jenis biaya + aturan denda.
2. `/keuangan/keuangan/tagihan` → generate massal per kelas → `/keuangan/keuangan/pembayaran` → catat pembayaran, alokasi, cetak kuitansi.
3. `/keuangan/keuangan/rekonsiliasi` → unggah CSV bank → cocokkan; `/keuangan/keuangan/arus-kas`.
4. `/keuangan/payroll` → komponen, struktur, run → validasi → (kepsek) → bayar → slip PDF (`/guru/payroll/slip` untuk pegawai).

### 9. Kaprodi — `guru.andi` (pilih peran Kaprodi)
`/kaprodi/prakerin` (mitra, pembimbing, penempatan, verifikasi jurnal), `/kaprodi/uji-kompetensi` (skema, rubrik, jadwal uji, undang penguji eksternal → akun `PENGUJI_EKSTERNAL` → nilai → sertifikat).

### 10. Auditor / Staf / Wakepsek
Auditor: baca-saja audit, keuangan, payroll (tidak ada tombol ubah). Staf: presensi staf, sarana (`/staf/aset`, `/staf/perpustakaan`). Wakepsek: akademik + kesiswaan tanpa keuangan.

## C. Checklist non-fungsional

- [ ] Tenant A tidak bisa membaca data tenant B (ganti `X-Tenant-Id` sebagai non-super-admin → diabaikan).
- [ ] Login salah 10× dalam 1 menit → 429.
- [ ] Refresh token dipakai ulang → seluruh sesi pengguna dicabut.
- [ ] Maintenance mode aktif → non-admin dapat 503 dengan pesan.
- [ ] Unggah > `UPLOAD_MAX_MB` → 413; berkas privat tenant lain → 404.
- [ ] Tampilan mobile (≤ 400px) untuk siswa & wali: sidebar jadi drawer, tabel bisa digulir.
- [ ] Tema gelap & warna brand tenant diterapkan di seluruh halaman.
