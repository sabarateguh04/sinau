import { Router } from 'express';
import { z } from 'zod';
import { T, PLATFORM_TENANT_ID } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, conflict, forbidden } from '../../core/errors';
import { requireRole, requirePermission, validate } from '../../middlewares';
import { audit, notify } from '../../core/services';
import { newId, slugify, randomPassword } from '../../core/ids';
import { hashPassword } from '../../core/auth';
import { insertRow, updateRow } from '../../core/crud';
import { invalidateTenant } from '../../core/permissions';

const r = Router();

const tenantSchema = z.object({
  name: z.string().min(3).max(200),
  slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/).optional(),
  type: z.enum(['SD', 'SMP', 'SMA', 'SMK', 'MA', 'KAMPUS', 'BIMBEL', 'UMUM']).default('SMK'),
  category: z.enum(['NEGERI', 'SWASTA']).nullable().optional(),
  npsn: z.string().max(20).nullable().optional(),
  provinsi_id: z.number().int().nullable().optional(),
  kota_id: z.number().int().nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().max(190).nullable().optional(),
  principal_name: z.string().max(150).nullable().optional(),
  is_active: z.boolean().optional(),
});
const settingsSchema = z.object({
  self_registration: z.boolean().optional(), portal_share: z.enum(['AUTO', 'MANUAL']).optional(), approval_flow: z.enum(['UNIT_HEAD', 'TERRITORY']).optional(),
  timezone: z.string().max(40).optional(), maintenance: z.boolean().optional(), maintenance_message: z.string().max(255).nullable().optional(), data_saver_default: z.boolean().optional(),
  grade_scale: z.any().optional(), extra: z.any().optional(),
});
const brandingSchema = z.object({
  display_name: z.string().max(120).nullable().optional(), tagline: z.string().max(200).nullable().optional(), logo_url: z.string().max(255).nullable().optional(),
  favicon_url: z.string().max(255).nullable().optional(), primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
});
const adminSchema = z.object({ username: z.string().min(4).max(60).regex(/^[a-z0-9._-]+$/i), full_name: z.string().min(3).max(150), email: z.string().email().nullable().optional(), password: z.string().min(8).max(100).optional(), phone: z.string().max(30).nullable().optional() });

const fullTenant = (id: string) => queryOne(`SELECT t.*, p.nama AS provinsi_nama, k.nama AS kota_nama,
    b.display_name, b.tagline, b.logo_url, b.favicon_url, b.primary_color, b.accent_color, b.theme,
    s.self_registration, s.portal_share, s.approval_flow, s.timezone, s.maintenance, s.maintenance_message, s.data_saver_default, s.grade_scale, s.extra,
    (SELECT COUNT(*) FROM \`${T('users')}\` u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS user_count
  FROM \`${T('tenants')}\` t LEFT JOIN \`${T('provinsi')}\` p ON p.id = t.provinsi_id LEFT JOIN \`${T('kota')}\` k ON k.id = t.kota_id
  LEFT JOIN \`${T('tenant_branding')}\` b ON b.tenant_id = t.id LEFT JOIN \`${T('tenant_settings')}\` s ON s.tenant_id = t.id WHERE t.id = ?`, [id]);

// ---------- Platform (SUPER_ADMIN) ----------
r.get('/', requireRole('SUPER_ADMIN'), wrap(async (req, res) => {
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [PLATFORM_TENANT_ID];
  let where = 'WHERE t.id <> ? AND t.deleted_at IS NULL';
  const q = str(req.query.q);
  if (q) { where += ' AND (t.name LIKE ? OR t.slug LIKE ? OR t.npsn LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (req.query.type) { where += ' AND t.type = ?'; params.push(String(req.query.type)); }
  if (req.query.provinsi_id) { where += ' AND t.provinsi_id = ?'; params.push(Number(req.query.provinsi_id)); }
  if (req.query.is_active !== undefined && req.query.is_active !== '') { where += ' AND t.is_active = ?'; params.push(req.query.is_active === '1' ? 1 : 0); }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('tenants')}\` t ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT t.id, t.slug, t.name, t.type, t.category, t.npsn, t.is_active, t.created_at, p.nama AS provinsi_nama, k.nama AS kota_nama, b.logo_url, b.primary_color,
      (SELECT COUNT(*) FROM \`${T('users')}\` u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS user_count,
      (SELECT COUNT(*) FROM \`${T('user_roles')}\` ur JOIN \`${T('users')}\` u2 ON u2.id = ur.user_id WHERE ur.tenant_id = t.id AND ur.role = 'SISWA' AND u2.deleted_at IS NULL) AS student_count
    FROM \`${T('tenants')}\` t LEFT JOIN \`${T('provinsi')}\` p ON p.id = t.provinsi_id LEFT JOIN \`${T('kota')}\` k ON k.id = t.kota_id LEFT JOIN \`${T('tenant_branding')}\` b ON b.tenant_id = t.id
    ${where} ORDER BY t.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paged(res, rows, { page, limit, total });
}));

r.post('/', requireRole('SUPER_ADMIN'), validate(tenantSchema.extend({ admin: adminSchema.optional(), branding: brandingSchema.optional(), settings: settingsSchema.optional() })), wrap(async (req, res) => {
  const b = req.body;
  const slug = b.slug ?? slugify(b.name);
  const dup = await queryOne(`SELECT id FROM \`${T('tenants')}\` WHERE slug = ?`, [slug]);
  if (dup) throw conflict('Slug sudah dipakai lembaga lain');
  const id = newId();
  let adminOut: Record<string, unknown> | null = null;
  await withTransaction(async (conn) => {
    await insertRow('tenants', { id, slug, name: b.name, type: b.type, category: b.category ?? null, npsn: b.npsn ?? null, provinsi_id: b.provinsi_id ?? null, kota_id: b.kota_id ?? null, address: b.address ?? null, phone: b.phone ?? null, email: b.email ?? null, website: b.website ?? null, principal_name: b.principal_name ?? null, is_active: b.is_active ?? true }, conn);
    await insertRow('tenant_settings', { tenant_id: id, ...(b.settings ?? {}) }, conn);
    await insertRow('tenant_branding', { tenant_id: id, display_name: b.branding?.display_name ?? b.name, ...(b.branding ?? {}) }, conn);
    if (b.admin) {
      const dupU = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE username = ?`, [b.admin.username], conn);
      if (dupU) throw conflict('Nama pengguna admin sudah dipakai');
      const pwd = b.admin.password ?? randomPassword();
      const uid = newId();
      await insertRow('users', { id: uid, tenant_id: id, username: b.admin.username.toLowerCase(), email: b.admin.email ?? null, phone: b.admin.phone ?? null, password_hash: await hashPassword(pwd), full_name: b.admin.full_name, must_change_password: 1 }, conn);
      await insertRow('user_roles', { id: newId(), tenant_id: id, user_id: uid, role: 'ADMIN_SEKOLAH' }, conn);
      await insertRow('staff_profiles', { user_id: uid, tenant_id: id }, conn);
      adminOut = { id: uid, username: b.admin.username.toLowerCase(), temporary_password: pwd };
    }
  });
  await audit(req, 'tenant.create', 'tenants', id, undefined, { name: b.name, slug });
  ok(res, { ...(await fullTenant(id)), admin: adminOut }, 201);
}));

r.get('/:id', requireRole('SUPER_ADMIN'), wrap(async (req, res) => {
  const t = await fullTenant(req.params.id);
  if (!t || t.id === PLATFORM_TENANT_ID) throw notFound();
  const admins = await query(`SELECT u.id, u.username, u.full_name, u.email, u.is_active, u.last_login_at FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id AND r.role = 'ADMIN_SEKOLAH' WHERE u.tenant_id = ? AND u.deleted_at IS NULL`, [t.id]);
  const roleCounts = await query(`SELECT r.role, COUNT(*) AS c FROM \`${T('user_roles')}\` r JOIN \`${T('users')}\` u ON u.id = r.user_id AND u.deleted_at IS NULL WHERE r.tenant_id = ? GROUP BY r.role`, [t.id]);
  ok(res, { ...t, admins, role_counts: roleCounts });
}));

r.put('/:id', requireRole('SUPER_ADMIN'), validate(tenantSchema.partial()), wrap(async (req, res) => {
  const t = await queryOne(`SELECT * FROM \`${T('tenants')}\` WHERE id = ? AND id <> ?`, [req.params.id, PLATFORM_TENANT_ID]);
  if (!t) throw notFound();
  if (req.body.slug) {
    const dup = await queryOne(`SELECT id FROM \`${T('tenants')}\` WHERE slug = ? AND id <> ?`, [req.body.slug, t.id]);
    if (dup) throw conflict('Slug sudah dipakai');
  }
  await updateRow('tenants', t.id, req.body);
  await audit(req, 'tenant.update', 'tenants', t.id, t, req.body);
  ok(res, await fullTenant(t.id));
}));

r.delete('/:id', requireRole('SUPER_ADMIN'), wrap(async (req, res) => {
  const t = await queryOne(`SELECT id FROM \`${T('tenants')}\` WHERE id = ? AND id <> ?`, [req.params.id, PLATFORM_TENANT_ID]);
  if (!t) throw notFound();
  await execute(`UPDATE \`${T('tenants')}\` SET deleted_at = NOW(), is_active = 0 WHERE id = ?`, [t.id]);
  await audit(req, 'tenant.delete', 'tenants', t.id);
  ok(res, { deleted: true });
}));

r.post('/:id/admins', requireRole('SUPER_ADMIN'), validate(adminSchema), wrap(async (req, res) => {
  const t = await queryOne(`SELECT id FROM \`${T('tenants')}\` WHERE id = ? AND id <> ? AND deleted_at IS NULL`, [req.params.id, PLATFORM_TENANT_ID]);
  if (!t) throw notFound();
  const dup = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE username = ?`, [req.body.username]);
  if (dup) throw conflict('Nama pengguna sudah dipakai');
  const pwd = req.body.password ?? randomPassword();
  const uid = newId();
  await withTransaction(async (conn) => {
    await insertRow('users', { id: uid, tenant_id: t.id, username: req.body.username.toLowerCase(), email: req.body.email ?? null, phone: req.body.phone ?? null, password_hash: await hashPassword(pwd), full_name: req.body.full_name, must_change_password: 1 }, conn);
    await insertRow('user_roles', { id: newId(), tenant_id: t.id, user_id: uid, role: 'ADMIN_SEKOLAH' }, conn);
    await insertRow('staff_profiles', { user_id: uid, tenant_id: t.id }, conn);
  });
  await audit(req, 'tenant.add_admin', 'users', uid);
  ok(res, { id: uid, username: req.body.username.toLowerCase(), temporary_password: pwd }, 201);
}));

/** Platform-wide overview for the super admin dashboard. */
r.get('/platform/overview', requireRole('SUPER_ADMIN'), wrap(async (_req, res) => {
  const totals = await queryOne(`SELECT
      (SELECT COUNT(*) FROM \`${T('tenants')}\` WHERE deleted_at IS NULL AND id <> ?) AS tenants,
      (SELECT COUNT(*) FROM \`${T('tenants')}\` WHERE deleted_at IS NULL AND is_active = 1 AND id <> ?) AS active_tenants,
      (SELECT COUNT(*) FROM \`${T('users')}\` WHERE deleted_at IS NULL AND tenant_id <> ?) AS users,
      (SELECT COUNT(*) FROM \`${T('user_roles')}\` WHERE role = 'SISWA') AS students,
      (SELECT COUNT(*) FROM \`${T('user_roles')}\` WHERE role = 'GURU') AS teachers,
      (SELECT COUNT(*) FROM \`${T('materials')}\`) AS materials,
      (SELECT COUNT(*) FROM \`${T('quiz_attempts')}\`) AS quiz_attempts,
      (SELECT COUNT(*) FROM \`${T('users')}\` WHERE last_login_at > DATE_SUB(NOW(), INTERVAL 7 DAY)) AS active_7d`, [PLATFORM_TENANT_ID, PLATFORM_TENANT_ID, PLATFORM_TENANT_ID]);
  const byType = await query(`SELECT type, COUNT(*) AS c FROM \`${T('tenants')}\` WHERE deleted_at IS NULL AND id <> ? GROUP BY type`, [PLATFORM_TENANT_ID]);
  const byProvince = await query(`SELECT p.nama, COUNT(*) AS c FROM \`${T('tenants')}\` t JOIN \`${T('provinsi')}\` p ON p.id = t.provinsi_id WHERE t.deleted_at IS NULL GROUP BY p.nama ORDER BY c DESC LIMIT 10`);
  const recent = await query(`SELECT id, name, slug, type, created_at FROM \`${T('tenants')}\` WHERE deleted_at IS NULL AND id <> ? ORDER BY created_at DESC LIMIT 5`, [PLATFORM_TENANT_ID]);
  ok(res, { totals, by_type: byType, by_province: byProvince, recent });
}));

// ---------- Own tenant (ADMIN_SEKOLAH with tenant:settings) ----------
r.get('/me/profile', requirePermission('tenant:settings', 'dashboard:read'), wrap(async (req, res) => {
  const t = await fullTenant(req.auth!.tenantId);
  if (!t) throw notFound();
  ok(res, t);
}));
r.put('/me/profile', requirePermission('tenant:settings'), validate(tenantSchema.partial().omit({ slug: true, is_active: true })), wrap(async (req, res) => {
  if (req.auth!.tenantId === PLATFORM_TENANT_ID) throw forbidden('Pilih lembaga dulu');
  await updateRow('tenants', req.auth!.tenantId, req.body);
  await audit(req, 'tenant.profile_update', 'tenants', req.auth!.tenantId, undefined, req.body);
  ok(res, await fullTenant(req.auth!.tenantId));
}));
r.put('/me/settings', requirePermission('tenant:settings'), validate(settingsSchema), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  await execute(`INSERT IGNORE INTO \`${T('tenant_settings')}\` (tenant_id) VALUES (?)`, [tid]);
  const b = { ...req.body };
  if (b.grade_scale !== undefined) b.grade_scale = JSON.stringify(b.grade_scale);
  if (b.extra !== undefined) b.extra = JSON.stringify(b.extra);
  const cols = Object.keys(b);
  if (cols.length) await execute(`UPDATE \`${T('tenant_settings')}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE tenant_id = ?`, [...cols.map((c) => (typeof b[c] === 'boolean' ? (b[c] ? 1 : 0) : b[c])), tid]);
  await audit(req, 'tenant.settings_update', 'tenant_settings', tid, undefined, req.body);
  ok(res, await fullTenant(tid));
}));
r.put('/me/branding', requirePermission('tenant:settings'), validate(brandingSchema), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  await execute(`INSERT IGNORE INTO \`${T('tenant_branding')}\` (tenant_id) VALUES (?)`, [tid]);
  const cols = Object.keys(req.body);
  if (cols.length) await execute(`UPDATE \`${T('tenant_branding')}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE tenant_id = ?`, [...cols.map((c) => req.body[c]), tid]);
  await audit(req, 'tenant.branding_update', 'tenant_branding', tid, undefined, req.body);
  ok(res, await fullTenant(tid));
}));

// ---------- Feature flags ----------
r.get('/me/features', requirePermission('feature:read', 'dashboard:read'), wrap(async (req, res) => {
  const rows = await query(`SELECT tenant_id, flag_key, enabled, config FROM \`${T('feature_flags')}\` WHERE tenant_id IN (?, ?) ORDER BY flag_key`, [req.auth!.tenantId, PLATFORM_TENANT_ID]);
  ok(res, rows);
}));
r.put('/me/features', requirePermission('feature:write'), validate(z.object({ flags: z.array(z.object({ key: z.string().min(2).max(80), enabled: z.boolean(), config: z.any().optional() })) })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  for (const f of req.body.flags) {
    await execute(`INSERT INTO \`${T('feature_flags')}\` (id, tenant_id, flag_key, enabled, config) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), config = VALUES(config)`, [newId(), tid, f.key, f.enabled ? 1 : 0, f.config ? JSON.stringify(f.config) : null]);
  }
  invalidateTenant(tid);
  await audit(req, 'tenant.features_update', 'feature_flags', tid, undefined, req.body);
  ok(res, { saved: true });
}));

/** Broadcast announcement notification to every active user of the tenant (admin helper). */
r.post('/me/broadcast', requirePermission('announcement:write'), validate(z.object({ title: z.string().min(3).max(200), body: z.string().max(2000).optional(), roles: z.array(z.string()).optional() })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const params: unknown[] = [tid];
  let sql = `SELECT DISTINCT u.id FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id WHERE u.tenant_id = ? AND u.is_active = 1 AND u.deleted_at IS NULL`;
  if (req.body.roles?.length) { sql += ` AND r.role IN (${req.body.roles.map(() => '?').join(',')})`; params.push(...req.body.roles); }
  const ids = (await query(sql, params)).map((x) => String(x.id));
  await notify({ tenantId: tid, userIds: ids, type: 'BROADCAST', title: req.body.title, body: req.body.body });
  ok(res, { sent: ids.length });
}));

export default r;
