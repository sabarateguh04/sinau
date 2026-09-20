/**
 * Cross-cutting services: audit log, notifications (+SSE push), mail outbox, file storage, jobs.
 */
import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import multer from 'multer';
import { T, config } from '../config';
import { execute, query, queryOne, Exec, getPool, Row } from '../database/db';
import { newId } from './ids';
import { logger } from './logger';
import { badRequest } from './errors';

// ---------- Audit ----------
export async function audit(req: Request, action: string, entity?: string, entityId?: string, before?: unknown, after?: unknown, exec: Exec = getPool()) {
  const u = req.auth;
  await execute(
    `INSERT INTO \`${T('audit_logs')}\` (id, tenant_id, user_id, action, entity, entity_id, before_data, after_data, ip, user_agent) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [newId(), u?.tenantId ?? null, u?.id ?? null, action, entity ?? null, entityId ?? null, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, req.ip ?? null, (req.headers['user-agent'] ?? '').toString().slice(0, 255)],
    exec,
  ).catch((e) => logger.warn(e, 'audit insert failed'));
}

// ---------- SSE hub ----------
type SseClient = { userId: string; tenantId: string; write: (event: string, data: unknown) => void };
const clients = new Set<SseClient>();
export const sse = {
  add: (c: SseClient) => clients.add(c),
  remove: (c: SseClient) => clients.delete(c),
  toUser(userId: string, event: string, data: unknown) {
    for (const c of clients) if (c.userId === userId) c.write(event, data);
  },
  toUsers(userIds: string[], event: string, data: unknown) {
    const set = new Set(userIds);
    for (const c of clients) if (set.has(c.userId)) c.write(event, data);
  },
  toTenant(tenantId: string, event: string, data: unknown) {
    for (const c of clients) if (c.tenantId === tenantId) c.write(event, data);
  },
  count: () => clients.size,
};

// ---------- Notifications ----------
export interface NotifyInput { tenantId: string; userIds: string[]; type: string; title: string; body?: string; link?: string }
export async function notify(input: NotifyInput, exec: Exec = getPool()) {
  const ids = [...new Set(input.userIds)].filter(Boolean);
  if (!ids.length) return;
  const values: unknown[] = [];
  const rows = ids.map((uid) => {
    values.push(newId(), input.tenantId, uid, input.type, input.title.slice(0, 200), input.body ?? null, input.link ?? null);
    return '(?,?,?,?,?,?,?)';
  });
  await execute(`INSERT INTO \`${T('notifications')}\` (id, tenant_id, user_id, type, title, body, link) VALUES ${rows.join(',')}`, values, exec);
  sse.toUsers(ids, 'notification', { type: input.type, title: input.title, body: input.body, link: input.link });
}

// ---------- Mail outbox ----------
export async function sendMail(to: string, subject: string, text: string) {
  const dir = path.resolve(process.cwd(), 'outbox');
  fs.mkdirSync(dir, { recursive: true });
  const line = `[${new Date().toISOString()}] TO: ${to}\nSUBJECT: ${subject}\n${text}\n---\n`;
  fs.appendFileSync(path.join(dir, 'mail.log'), line);
  logger.info({ to, subject }, 'mail written to outbox');
}

// ---------- Files ----------
const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls', 'text/csv': 'csv', 'text/plain': 'txt',
  'application/zip': 'zip', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3',
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const tenant = req.auth?.tenantId ?? 'public';
    const mod = (req.params.module || req.body?.module || 'misc').toString().replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'misc';
    const dir = path.join(config.uploadRoot, tenant, mod);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] || path.extname(file.originalname).replace('.', '').toLowerCase().slice(0, 5) || 'bin';
    cb(null, `${newId()}.${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.uploadMaxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) cb(null, true);
    else cb(badRequest(`Tipe berkas tidak didukung: ${file.mimetype}`));
  },
});

export interface FileRecord { id: string; url: string; original_name: string; mime: string; size: number }
/** Persists an uploaded file row; returns id and the public/authenticated URL. */
export async function registerFile(req: Request, file: Express.Multer.File, module: string, isPublic = false, exec: Exec = getPool()): Promise<FileRecord> {
  const id = newId();
  const rel = path.relative(config.uploadRoot, file.path).split(path.sep).join('/');
  await execute(
    `INSERT INTO \`${T('files')}\` (id, tenant_id, uploaded_by, module, original_name, stored_path, mime, size, is_public) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, req.auth?.tenantId ?? '00000000-0000-0000-0000-000000000000', req.auth?.id ?? null, module, file.originalname.slice(0, 255), rel, file.mimetype, file.size, isPublic ? 1 : 0],
    exec,
  );
  return { id, url: `/api/v1/files/${id}`, original_name: file.originalname, mime: file.mimetype, size: file.size };
}
export const fileUrl = (id: string | null | undefined) => (id ? `/api/v1/files/${id}` : null);
export async function getFileRow(id: string) {
  return queryOne<{ id: string; tenant_id: string; stored_path: string; mime: string; original_name: string; is_public: number; module: string } & Row>(
    `SELECT id, tenant_id, stored_path, mime, original_name, is_public, module FROM \`${T('files')}\` WHERE id = ?`, [id],
  );
}
export const absoluteFilePath = (rel: string) => path.join(config.uploadRoot, ...rel.split('/'));

// ---------- Jobs ----------
export async function enqueueJob(type: string, payload: unknown, opts: { tenantId?: string | null; runAt?: Date; createdBy?: string | null; maxAttempts?: number } = {}) {
  const id = newId();
  await execute(
    `INSERT INTO \`${T('jobs')}\` (id, tenant_id, type, payload, status, run_at, created_by, max_attempts) VALUES (?,?,?,?,'PENDING',?,?,?)`,
    [id, opts.tenantId ?? null, type, JSON.stringify(payload ?? {}), opts.runAt ?? new Date(), opts.createdBy ?? null, opts.maxAttempts ?? 3],
  );
  return id;
}
export const getJob = (id: string) => queryOne(`SELECT * FROM \`${T('jobs')}\` WHERE id = ?`, [id]);
export const listJobs = (tenantId: string, limit = 50) => query(`SELECT id, type, status, attempts, run_at, finished_at, result, error, created_at FROM \`${T('jobs')}\` WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`, [tenantId, limit]);
