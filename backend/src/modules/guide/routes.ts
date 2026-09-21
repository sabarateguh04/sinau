/**
 * Panduan pengguna (backend/docs/panduan.html) di balik kode akses.
 * Kode diperiksa di server; setelah benar, cookie httpOnly 30 hari dipasang. Kode diambil dari
 * GUIDE_ACCESS_CODE (.env); bila kosong dipakai hash bawaan (kode tidak disimpan mentah di repo).
 */
import { Router, Request } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { config } from '../../config';

const FILE = path.resolve(__dirname, '..', '..', '..', 'docs', 'panduan.html');
const DEFAULT_HASH = '4602d34369cb1acffc62a2e3fc67db040bea3238179644fded80c9d8f62fbab3';
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const codeHash = () => (process.env.GUIDE_ACCESS_CODE ? sha(process.env.GUIDE_ACCESS_CODE) : DEFAULT_HASH);
const COOKIE = 'sinau_panduan';
const token = () => crypto.createHmac('sha256', config.jwt.accessSecret).update('panduan:' + codeHash()).digest('hex');
const cookieOf = (req: Request) => (req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) ?? '';
const eq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const allowed = (req: Request) => eq(cookieOf(req), token());

const gate = (error = '') => `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panduan SINAU — kode akses</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5faf8;color:#12211f;font:17px/1.5 "Segoe UI",system-ui,sans-serif;padding:16px;box-sizing:border-box}
.card{width:100%;max-width:400px;background:#fff;border:1px solid #d6e5e1;border-radius:16px;padding:28px;box-shadow:0 8px 24px -12px rgba(15,118,110,.25)}
.mark{width:44px;height:44px;border-radius:12px;background:#0f766e;color:#fff;display:grid;place-items:center;font-weight:800;font-size:22px}
h1{font-size:1.25rem;margin:14px 0 4px}p{margin:0 0 18px;color:#57706c;font-size:.95rem}
input{width:100%;box-sizing:border-box;font:inherit;padding:10px 12px;border:1px solid #d6e5e1;border-radius:10px;margin-bottom:10px}
button{width:100%;font:inherit;font-weight:600;padding:10px;border:0;border-radius:10px;background:#0f766e;color:#fff;cursor:pointer}
.err{color:#b42318;font-size:.9rem;margin:0 0 10px}</style></head><body><form class="card" method="post" action="/panduan">
<div class="mark">S</div><h1>Panduan Pengguna SINAU</h1><p>Halaman ini untuk pimpinan &amp; pengelola. Masukkan kode akses yang Anda terima.</p>
${error ? `<p class="err">${error}</p>` : ''}<input id="code" name="code" type="password" placeholder="Kode akses" autofocus autocomplete="off" required><button type="submit">Buka panduan</button></form></body></html>`;

const r = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: gate('Terlalu banyak percobaan, coba lagi sebentar.') });

r.get(['/panduan', '/panduan.html'], (req, res) => {
  if (allowed(req)) { res.setHeader('Cache-Control', 'private, no-store'); return res.sendFile(FILE); }
  res.status(401).type('html').send(gate());
});
r.post('/panduan', limiter, (req, res) => {
  const code = String((req.body as { code?: string })?.code ?? '');
  if (code && eq(sha(code), codeHash())) {
    res.setHeader('Set-Cookie', `${COOKIE}=${token()}; Path=/panduan; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);
    return res.redirect(303, '/panduan');
  }
  res.status(401).type('html').send(gate('Kode akses salah.'));
});

export default r;
