import { Request, Response, NextFunction, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodSchema, ZodError } from 'zod';
import { verifyAccessToken, AuthUser, has } from '../core/auth';
import { effectivePermissions } from '../core/permissions';
import { HttpError, unauthorized, forbidden } from '../core/errors';
import { query, queryOne, Row } from '../database/db';
import { T, PLATFORM_TENANT_ID, config } from '../config';
import { Role } from '../core/rbac';
import { logger } from '../core/logger';

interface UserRow extends Row { id: string; tenant_id: string; full_name: string; is_active: number; token_version: number; deleted_at: Date | null }

/**
 * Authenticates via `Authorization: Bearer <access>` (or ?token= for SSE/downloads). Loads roles and
 * effective permissions. SUPER_ADMIN may act inside a tenant with `X-Tenant-Id`.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    const raw = header?.startsWith('Bearer ') ? header.slice(7) : typeof req.query.token === 'string' ? req.query.token : null;
    if (!raw) throw unauthorized();
    let payload;
    try {
      payload = verifyAccessToken(raw);
    } catch {
      throw unauthorized('Sesi berakhir, silakan masuk kembali');
    }
    const user = await queryOne<UserRow>(`SELECT id, tenant_id, full_name, is_active, token_version, deleted_at FROM \`${T('users')}\` WHERE id = ?`, [payload.sub]);
    if (!user || !user.is_active || user.deleted_at) throw unauthorized('Akun tidak aktif');
    if (user.token_version !== payload.v) throw unauthorized('Sesi dicabut, silakan masuk kembali');
    const roleRows = await query<{ role: Role } & Row>(`SELECT role FROM \`${T('user_roles')}\` WHERE user_id = ?`, [user.id]);
    const roles = roleRows.map((r) => r.role);
    const isSuperAdmin = roles.includes('SUPER_ADMIN');
    let tenantId = user.tenant_id;
    const switchTo = req.headers['x-tenant-id'];
    if (isSuperAdmin && typeof switchTo === 'string' && switchTo && switchTo !== PLATFORM_TENANT_ID) {
      const t = await queryOne(`SELECT id FROM \`${T('tenants')}\` WHERE id = ? AND deleted_at IS NULL`, [switchTo]);
      if (!t) throw forbidden('Lembaga tidak ditemukan');
      tenantId = switchTo;
    }
    const permissions = isSuperAdmin ? new Set<string>() : await effectivePermissions(tenantId, user.id, roles);
    const auth: AuthUser = { id: user.id, tenantId, homeTenantId: user.tenant_id, roles, name: user.full_name, permissions, isSuperAdmin };
    req.auth = auth;
    next();
  } catch (e) {
    next(e);
  }
};

/** Requires at least one of the listed permissions. */
export const requirePermission = (...perms: string[]): RequestHandler => (req, _res, next) => {
  const u = req.auth;
  if (!u) return next(unauthorized());
  if (perms.some((p) => has(u, p))) return next();
  return next(forbidden(`Butuh izin: ${perms.join(' / ')}`));
};

export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  const u = req.auth;
  if (!u) return next(unauthorized());
  if (u.isSuperAdmin || roles.some((r) => u.roles.includes(r))) return next();
  return next(forbidden());
};

/** Blocks tenant users while their tenant is in maintenance (SUPER_ADMIN passes). */
export const maintenanceGate: RequestHandler = async (req, _res, next) => {
  const u = req.auth;
  if (!u || u.isSuperAdmin) return next();
  const s = await queryOne<{ tenant_id: string; maintenance: number; maintenance_message: string | null } & Row>(
    `SELECT tenant_id, maintenance, maintenance_message FROM \`${T('tenant_settings')}\` WHERE tenant_id IN (?, ?) AND maintenance = 1 ORDER BY tenant_id = ? DESC LIMIT 1`, [u.tenantId, PLATFORM_TENANT_ID, PLATFORM_TENANT_ID],
  );
  if (!s) return next();
  // Tenant-level maintenance never locks out the tenant's own admins (they must be able to switch it off);
  // platform-level maintenance is bypassed by SUPER_ADMIN only.
  if (s.tenant_id === u.tenantId && u.roles.includes('ADMIN_SEKOLAH')) return next();
  next(new HttpError(503, 'MAINTENANCE', s.maintenance_message || 'Sistem sedang dalam pemeliharaan'));
};

type Part = 'body' | 'query' | 'params';
/** Validates and replaces req[part] with the parsed value. */
export const validate = (schema: ZodSchema, part: Part = 'body'): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse(req[part]);
  if (!result.success) {
    const err = result.error as ZodError;
    return next(new HttpError(400, 'VALIDATION', 'Data tidak valid', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
  }
  if (part === 'query') Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
  else if (part === 'params') Object.defineProperty(req, 'params', { value: result.data, writable: true, configurable: true });
  else req.body = result.data;
  next();
};

export const globalLimiter = rateLimit({ windowMs: 60_000, limit: config.rateLimit.global, standardHeaders: true, legacyHeaders: false, message: { error: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak permintaan' } });
export const loginLimiter = rateLimit({ windowMs: 60_000, limit: config.rateLimit.login, standardHeaders: true, legacyHeaders: false, message: { error: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak percobaan masuk, coba lagi sebentar' } });

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Rute tidak ditemukan' });
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    return;
  }
  const e = err as { code?: string; status?: number; message?: string; type?: string };
  if (e?.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ error: 'CONFLICT', message: 'Data sudah ada (duplikat)' });
    return;
  }
  if (e?.code === 'ER_NO_REFERENCED_ROW_2' || e?.code === 'ER_ROW_IS_REFERENCED_2') {
    res.status(409).json({ error: 'CONFLICT', message: 'Data terkait tidak ditemukan atau masih dipakai' });
    return;
  }
  if (e?.type === 'entity.too.large' || e?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Berkas terlalu besar' });
    return;
  }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'JSON tidak valid' });
    return;
  }
  logger.error({ err, url: req.originalUrl }, 'unhandled error');
  res.status(500).json({ error: 'INTERNAL', message: config.isProd ? 'Terjadi kesalahan pada server' : e?.message || 'Internal error' });
};
