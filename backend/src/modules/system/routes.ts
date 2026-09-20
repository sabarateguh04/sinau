import { Router } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { T, config } from '../../config';
import { query, queryOne, execute, getPool } from '../../database/db';
import { wrap, ok, paged, paging } from '../../core/http';
import { notFound, forbidden } from '../../core/errors';
import { authenticate, validate, requirePermission } from '../../middlewares';
import { sse, getFileRow, absoluteFilePath, getJob, listJobs, upload, registerFile } from '../../core/services';
import { newId } from '../../core/ids';

const r = Router();

r.get('/health', wrap(async (_req, res) => {
  let db = 'ok';
  try { await getPool().query('SELECT 1'); } catch { db = 'down'; }
  let uploads = 'ok';
  try { fs.accessSync(config.uploadRoot, fs.constants.W_OK); } catch { uploads = 'not-writable'; }
  const pending = db === 'ok' ? Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('jobs')}\` WHERE status = 'PENDING'`))?.c ?? 0) : null;
  res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, uploads, sse_clients: sse.count(), pending_jobs: pending, time: new Date().toISOString(), version: '0.1.0' });
}));

r.get('/regions/provinsi', wrap(async (_req, res) => ok(res, await query(`SELECT id, kode, nama FROM \`${T('provinsi')}\` ORDER BY nama`))));
r.get('/regions/kota', wrap(async (req, res) => {
  const pid = Number(req.query.provinsi_id);
  ok(res, pid ? await query(`SELECT id, kode, nama FROM \`${T('kota')}\` WHERE provinsi_id = ? ORDER BY nama`, [pid]) : []);
}));

/** Files: public ones need no login; private ones require same tenant (or SUPER_ADMIN). */
r.get('/files/:id', wrap(async (req, res, next) => {
  const f = await getFileRow(req.params.id);
  if (!f) throw notFound('Berkas tidak ditemukan');
  const send = () => {
    const abs = absoluteFilePath(f.stored_path);
    if (!fs.existsSync(abs)) throw notFound('Berkas hilang di penyimpanan');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', f.is_public ? 'public, max-age=86400' : 'private, max-age=300');
    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
    fs.createReadStream(abs).pipe(res);
  };
  if (f.is_public) return send();
  authenticate(req, res, (err?: unknown) => {
    if (err) return next(err);
    const a = req.auth!;
    if (!a.isSuperAdmin && a.tenantId !== f.tenant_id) return next(forbidden());
    send();
  });
}));

// ---- authenticated below ----
r.use(authenticate);

r.post('/files/:module', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw notFound('Berkas tidak ada');
  const isPublic = req.body?.public === '1' || req.body?.public === 'true';
  ok(res, await registerFile(req, req.file, req.params.module, isPublic), 201);
}));

/** Server-Sent Events stream for the current user: notifications, exam ticks, announcements. */
r.get('/events', (req, res) => {
  const a = req.auth!;
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: hello\ndata: ${JSON.stringify({ user: a.id, at: Date.now() })}\n\n`);
  const client = { userId: a.id, tenantId: a.tenantId, write: (event: string, data: unknown) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } };
  sse.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); sse.remove(client); });
});

r.get('/notifications', wrap(async (req, res) => {
  const { page, limit, offset } = paging(req.query, 100);
  const unreadOnly = req.query.unread === '1';
  const where = `WHERE user_id = ?${unreadOnly ? ' AND read_at IS NULL' : ''}`;
  const total = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('notifications')}\` ${where}`, [req.auth!.id]))?.c ?? 0);
  const rows = await query(`SELECT id, type, title, body, link, read_at, created_at FROM \`${T('notifications')}\` ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [req.auth!.id, limit, offset]);
  paged(res, rows, { page, limit, total });
}));
r.post('/notifications/read', validate(z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() })), wrap(async (req, res) => {
  if (req.body.all) await execute(`UPDATE \`${T('notifications')}\` SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL`, [req.auth!.id]);
  else if (req.body.ids?.length) await execute(`UPDATE \`${T('notifications')}\` SET read_at = NOW() WHERE user_id = ? AND id IN (${req.body.ids.map(() => '?').join(',')})`, [req.auth!.id, ...req.body.ids]);
  ok(res, { updated: true });
}));

r.get('/jobs', requirePermission('job:read'), wrap(async (req, res) => ok(res, await listJobs(req.auth!.tenantId))));
r.get('/jobs/:id', wrap(async (req, res) => {
  const j = await getJob(req.params.id);
  if (!j || (j.tenant_id && j.tenant_id !== req.auth!.tenantId && !req.auth!.isSuperAdmin)) throw notFound();
  ok(res, j);
}));

r.get('/audit', requirePermission('audit:read'), wrap(async (req, res) => {
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [req.auth!.tenantId];
  let where = 'WHERE a.tenant_id = ?';
  if (req.query.user_id) { where += ' AND a.user_id = ?'; params.push(String(req.query.user_id)); }
  if (req.query.action) { where += ' AND a.action LIKE ?'; params.push(`${String(req.query.action)}%`); }
  if (req.query.entity) { where += ' AND a.entity = ?'; params.push(String(req.query.entity)); }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('audit_logs')}\` a ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT a.*, u.full_name AS user_name, u.username FROM \`${T('audit_logs')}\` a LEFT JOIN \`${T('users')}\` u ON u.id = a.user_id ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paged(res, rows, { page, limit, total });
}));

r.post('/contact', validate(z.object({ name: z.string().min(2).max(150), email: z.string().email().optional(), phone: z.string().max(30).optional(), subject: z.string().max(200).optional(), message: z.string().min(5).max(4000) })), wrap(async (req, res) => {
  await execute(`INSERT INTO \`${T('contact_messages')}\` (id, tenant_id, name, email, phone, subject, message, ip) VALUES (?,?,?,?,?,?,?,?)`, [newId(), req.auth!.tenantId, req.body.name, req.body.email ?? null, req.body.phone ?? null, req.body.subject ?? null, req.body.message, req.ip ?? null]);
  ok(res, { sent: true }, 201);
}));

export default r;
