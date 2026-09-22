# Setup lokal untuk kontributor

## 1. Prasyarat
- Node.js ≥ 20 (cek `node -v`), Git.
- MySQL 8 atau MariaDB ≥ 10.4 lokal (XAMPP/Laragon juga bisa). Siapkan user yang boleh `CREATE DATABASE`, atau buat dulu database kosong `db_sinau`.

## 2. Clone & pasang
```bash
git clone https://github.com/sabarateguh04/sinau.git
cd sinau
npm run install:all
cp backend/.env.example backend/.env       # Windows: copy backend\.env.example backend\.env
```
Edit `backend/.env`: isi `DB_USER`, `DB_PASSWORD` (lokal biasanya `root` tanpa sandi), biarkan `DB_NAME=db_sinau`, `PORT=4008`. Isi `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` dengan teks acak apa saja.

## 3. Database
Pilih salah satu:
```bash
npm run db:migrate && npm run db:import --prefix backend   # A) skema + data lengkap (sama dengan server: akun, materi, kuis, rapor, tagihan, hasil uji)
npm run db:migrate && npm run db:seed:demo                 # B) skema + data demo awal saja (lebih bersih)
```
Migrasi idempoten — aman diulang setelah `git pull`.

## 4. Jalankan
```bash
npm run dev        # API di :4008 + Vite hot-reload di :4009 → buka http://localhost:4009
```
Atau mode produksi satu port: `npm run build && npm start` → http://localhost:4008.

Akun: `superadmin`/`superadmin123`; tenant demo `admin.smk1`, `guru.dimas`, `siswa.01`, `wali.01`, `kepsek.smk1`, … semua `demo12345` (daftar lengkap di README).

## 5. Peta kode untuk fitur AI (Alesha)
| Bagian | File |
|---|---|
| Engine (dummy → nyata) | `backend/src/modules/alesha/engine.ts` — `chat()` adalah satu-satunya titik masuk; `dummyReply()` menjawab dari data tenant; `forwardToAlesha()` mem-proxy ke `ALESHA_API_URL` bila diisi |
| Route HTTP | `backend/src/modules/alesha/routes.ts` — `GET /api/v1/alesha/status`, `POST /api/v1/alesha/chat` (auth opsional; `req.auth` berisi peran & tenant) |
| Klien | `frontend/src/lib/alesha.ts` — `askAlesha()`, STT/TTS browser |
| Widget UI | `frontend/src/components/AleshaWidget.tsx` (dipasang di `layouts/AppShell.tsx` & `pages/public/PublicLayout.tsx`) |
| Data yang bisa dibaca engine | `backend/src/core/scope.ts` (batas akses per peran), `modules/analytics/routes.ts` (peta konsep & miskonsepsi) |
| Uji cepat | `curl -X POST localhost:4008/api/v1/alesha/chat -H "Content-Type: application/json" -d '{"message":"halo"}'` |

Kontrak balasan (`ChatReply`): `reply`, `suggestions[]`, `sources[]`, `mode`, `engine`, `state` (dipakai Quiz Me untuk mengingat soal terakhir). Pertahankan kontrak ini agar widget tidak perlu diubah.

Arah yang disepakati (lihat `docs/kesesuaian-konsep.md` §8): sambungkan LLM/engine nyata dengan *system prompt* dari fakta terstruktur yang sudah dihitung engine dummy; jawaban wajib menyebut sumber; mode Socratic tetap otomatis saat siswa sedang mengerjakan kuis/ujian; tidak ada keputusan otomatis berdampak tinggi.

## 6. Alur kerja git
```bash
git checkout -b fitur/alesha-llm     # branch per fitur
npm run typecheck                    # wajib lolos sebelum push
git push -u origin fitur/alesha-llm  # lalu buat Pull Request ke main
```
Jangan commit `backend/.env`, `uploads/`, `outbox/` (sudah di `.gitignore`). Perubahan skema selalu lewat migrasi baru di `backend/src/database/migrations/` (portable MySQL 8/MariaDB, lihat `ddl.ts`), bukan ALTER manual.
