# Deploy SINAU (produksi)

Satu proses Node melayani API (`/api/v1`) dan frontend statis di port **4008**, di belakang Nginx (TLS). Database MySQL 8 / MariaDB 10.4+.

## 1. Server

```bash
# Ubuntu 22.04/24.04 sebagai contoh
sudo apt install -y nginx mysql-server
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2
```

MySQL:

```sql
CREATE DATABASE db_sinau CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sinau'@'localhost' IDENTIFIED BY 'kata-sandi-kuat';
GRANT ALL ON db_sinau.* TO 'sinau'@'localhost';
```

Migrasi juga bisa membuat database sendiri bila user MySQL punya hak `CREATE`.

## 2. Aplikasi

```bash
sudo mkdir -p /opt/sinau && sudo chown $USER /opt/sinau
git clone https://github.com/sabarateguh04/sinau.git /opt/sinau && cd /opt/sinau
npm run install:all
bash deploy/setup-env.sh <DB_PASSWORD>      # → backend/.env dari deploy/env.server (172.20.4.220:4008, user db_sinau) + JWT secret acak
```

`deploy/env.server` sudah berisi nilai server (PORT 4008, `APP_URL`/`CORS_ORIGIN` = `http://172.20.4.220:4008`, `DB_USER=db_sinau`, `DB_NAME=db_sinau`); hanya password DB & JWT yang diisi skrip supaya tidak pernah masuk git. Ubah nilai lain langsung di `backend/.env` bila perlu.

**Membawa data dari laptop (demo + hasil uji):**

```bash
npm run build && npm run db:migrate            # skema (MySQL 8 aman — DDL portabel)
npm run db:import --prefix backend             # isi dari deploy/db_sinau-data.sql (122 tabel; TRUNCATE lalu INSERT)
```

Di laptop, perbarui berkas dump dengan `npm run db:dump --prefix backend` lalu commit. Berkas unggahan (`backend/uploads/`) tidak ikut git — salin manual dengan `rsync`/`scp` bila ada.

Bila nanti dipasang di domain publik (bukan IP internal), ubah di `backend/.env`: `APP_URL`/`CORS_ORIGIN` ke `https://domain-anda`, `UPLOAD_ROOT` ke folder di luar repo (mis. `/var/lib/sinau/uploads`), dan `BOOTSTRAP_SUPERADMIN_PASSWORD` sebelum migrasi pertama. `.env` tidak pernah di-commit.

```bash
mkdir -p logs
pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```

Cek: `curl -s localhost:4008/api/v1/health` → `{"status":"ok",...}`, lalu buka `http://172.20.4.220:4008` (Nginx/TLS opsional untuk jaringan internal).

## 3. Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/sinau
# ganti server_name + path sertifikat (certbot --nginx -d sinau.example.id)
sudo ln -s /etc/nginx/sites-available/sinau /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Catatan penting dalam `deploy/nginx.conf`: lokasi `/api/v1/events` (SSE) di-set `proxy_buffering off` supaya notifikasi realtime tidak tertahan; `client_max_body_size` ≥ `UPLOAD_MAX_MB`. Backend memakai `trust proxy 1`, jadi rate limit & audit membaca IP dari `X-Forwarded-For`.

## 4. Update versi

```bash
cd /opt/sinau && git pull
npm run install:all && npm run build
npm run db:migrate
pm2 reload sinau
```

Migrasi hanya menambah (tabel/kolom/indeks bila belum ada) dan dicatat di `tbl_sinau_migrations`; tidak pernah menghapus data.

## 5. Backup

- Database: `mysqldump --single-transaction db_sinau | gzip > sinau-$(date +%F).sql.gz` (cron harian).
- Berkas unggahan: `UPLOAD_ROOT` (rsync/restic).
- `backend/.env` disimpan di tempat aman (berisi secret JWT — bila berganti, semua sesi login gugur).

## 6. Job worker

Worker berjalan di dalam proses (poll `tbl_sinau_jobs` tiap `JOB_POLL_MS`). Job terjadwal: pengingat harian, denda keterlambatan tagihan, retensi data pribadi. Bila menjalankan lebih dari satu instance PM2, aktifkan `ENABLE_JOBS=true` hanya di satu instance.

## 7. Subdomain per lembaga (opsional)

Aplikasi mengenali lembaga dari slug URL (`/s/<slug>`), jadi tidak butuh DNS khusus. Bila ingin `smkn1.sinau.id`, tambahkan wildcard `*.sinau.id` di `server_name` dan `return 302 https://sinau.id/s/$subdomain;` lewat `map $host`. Belum ada routing berbasis Host di aplikasi (lihat prd.md, bagian opsional).

## 8. Pemantauan

- `pm2 logs sinau` (pino JSON; `LOG_LEVEL=info`).
- `GET /api/v1/health` untuk uptime monitor.
- Halaman *Audit* dan *Jobs* di menu Admin Sekolah / Super Admin.
