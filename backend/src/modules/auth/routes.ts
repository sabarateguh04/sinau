import { Router } from 'express';
import { z } from 'zod';
import { T, PLATFORM_TENANT_ID, config } from '../../config';
import { query, queryOne, execute, withTransaction, Row } from '../../database/db';
import { hashPassword, verifyPassword, signAccessToken } from '../../core/auth';
import { newId, sha256, randomToken } from '../../core/ids';
import { wrap, ok } from '../../core/http';
import { badRequest, unauthorized, notFound, forbidden, conflict } from '../../core/errors';
import { authenticate, loginLimiter, validate } from '../../middlewares';
import { audit, sendMail, upload, registerFile } from '../../core/services';
import { Role, ROLE_LABELS } from '../../core/rbac';
import { effectivePermissions } from '../../core/permissions';
import { insertRow } from '../../core/crud';

const r = Router();

interface UserRow extends Row {
  id: string; tenant_id: string; username: string; email: string | null; password_hash: string; full_name: string; phone: string | null; avatar_url: string | null;
  gender: string | null; is_active: number; must_change_password: number; token_version: number; theme: string; data_saver: number; last_login_at: Date | null;
}

async function loadRoles(userId: string): Promise<Role[]> {
  return (await query<{ role: Role } & Row>(`SELECT role FROM \`${T('user_roles')}\` WHERE user_id = ? ORDER BY role`, [userId])).map((x) => x.role);
}

async function issueTokens(user: UserRow, roles: Role[], ua?: string, ip?: string) {
  const accessToken = signAccessToken({ sub: user.id, tid: user.tenant_id, roles, v: user.token_version, name: user.full_name });
  const refreshToken = randomToken(48);
  const expires = new Date(Date.now() + config.jwt.refreshTtlDays * 86_400_000);
  await execute(`INSERT INTO \`${T('refresh_tokens')}\` (id, user_id, token_hash, expires_at, user_agent, ip) VALUES (?,?,?,?,?,?)`, [newId(), user.id, sha256(refreshToken), expires, (ua ?? '').slice(0, 255), ip ?? null]);
  return { accessToken, refreshToken, expiresInMin: config.jwt.accessTtlMin };
}

async function tenantInfo(tenantId: string) {
  const t = await queryOne(`SELECT t.id, t.slug, t.name, t.type, t.category, t.provinsi_id, t.kota_id, t.principal_name, b.display_name, b.tagline, b.logo_url, b.primary_color, b.accent_color, b.theme,
      s.self_registration, s.portal_share, s.approval_flow, s.timezone, s.maintenance, s.data_saver_default
    FROM \`${T('tenants')}\` t LEFT JOIN \`${T('tenant_branding')}\` b ON b.tenant_id = t.id LEFT JOIN \`${T('tenant_settings')}\` s ON s.tenant_id = t.id WHERE t.id = ?`, [tenantId]);
  return t;
}

export async function buildMe(userId: string, tenantId: string, roles: Role[], isSuperAdmin: boolean) {
  const u = await queryOne<UserRow>(`SELECT * FROM \`${T('users')}\` WHERE id = ?`, [userId]);
  if (!u) throw notFound();
  const permissions = isSuperAdmin ? ['*'] : [...(await effectivePermissions(tenantId, userId, roles))];
  const tenant = await tenantInfo(tenantId);
  const flags = await query(`SELECT flag_key, enabled FROM \`${T('feature_flags')}\` WHERE tenant_id IN (?, ?)`, [tenantId, PLATFORM_TENANT_ID]);
  const features: Record<string, boolean> = {};
  for (const f of flags) features[String(f.flag_key)] = !!f.enabled;
  const extra: Record<string, unknown> = {};
  if (roles.includes('SISWA')) {
    extra.classes = await query(`SELECT c.id, c.name, c.grade_level, c.major_id, m.name AS major_name, c.academic_year_id FROM \`${T('class_students')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id LEFT JOIN \`${T('majors')}\` m ON m.id = c.major_id WHERE cs.student_id = ? AND cs.status = 'AKTIF' AND c.is_active = 1`, [userId]);
    extra.profile = await queryOne(`SELECT * FROM \`${T('student_profiles')}\` WHERE user_id = ?`, [userId]);
  }
  if (roles.some((x) => ['GURU', 'KAPRODI', 'WAKEPSEK', 'BK', 'KEPSEK'].includes(x))) {
    extra.teaching = await query(`SELECT cs.id AS class_subject_id, c.id AS class_id, c.name AS class_name, s.id AS subject_id, s.name AS subject_name, cs.semester FROM \`${T('class_subjects')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE cs.teacher_id = ? AND ay.is_active = 1 ORDER BY c.name, s.name`, [userId]);
    extra.homeroom = await query(`SELECT c.id, c.name FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE c.homeroom_teacher_id = ? AND ay.is_active = 1`, [userId]);
    extra.profile = await queryOne(`SELECT * FROM \`${T('staff_profiles')}\` WHERE user_id = ?`, [userId]);
  }
  if (roles.includes('WALI_MURID')) {
    extra.children = await query(`SELECT u.id, u.full_name, u.avatar_url, gs.relation, c.name AS class_name FROM \`${T('guardian_students')}\` gs JOIN \`${T('users')}\` u ON u.id = gs.student_id LEFT JOIN \`${T('class_students')}\` cs ON cs.student_id = u.id AND cs.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = cs.class_id AND c.is_active = 1 WHERE gs.guardian_user_id = ?`, [userId]);
  }
  const unread = await queryOne(`SELECT COUNT(*) AS c FROM \`${T('notifications')}\` WHERE user_id = ? AND read_at IS NULL`, [userId]);
  const onboarding = await queryOne(`SELECT steps, completed_at FROM \`${T('user_onboarding')}\` WHERE user_id = ?`, [userId]);
  return {
    id: u.id, username: u.username, email: u.email, full_name: u.full_name, phone: u.phone, avatar_url: u.avatar_url, gender: u.gender, theme: u.theme, data_saver: !!u.data_saver,
    must_change_password: !!u.must_change_password, last_login_at: u.last_login_at,
    roles, role_labels: Object.fromEntries(roles.map((x) => [x, ROLE_LABELS[x]])), permissions, is_super_admin: isSuperAdmin,
    tenant_id: tenantId, home_tenant_id: u.tenant_id, tenant, features, unread_notifications: Number(unread?.c ?? 0),
    onboarding: onboarding ? { steps: parseJson(onboarding.steps), completed_at: onboarding.completed_at } : null,
    ...extra,
  };
}
const parseJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

// ---------- public ----------
r.get('/tenants', wrap(async (_req, res) => {
  const rows = await query(`SELECT t.id, t.slug, t.name, t.type, t.category, b.display_name, b.logo_url, b.primary_color, s.self_registration
    FROM \`${T('tenants')}\` t LEFT JOIN \`${T('tenant_branding')}\` b ON b.tenant_id = t.id LEFT JOIN \`${T('tenant_settings')}\` s ON s.tenant_id = t.id
    WHERE t.is_active = 1 AND t.deleted_at IS NULL AND t.id <> ? ORDER BY t.name`, [PLATFORM_TENANT_ID]);
  ok(res, rows);
}));

r.post('/login', loginLimiter, validate(z.object({ username: z.string().min(1).max(190), password: z.string().min(1).max(200) })), wrap(async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  const rows = await query<UserRow>(`SELECT * FROM \`${T('users')}\` WHERE (username = ? OR email = ?) AND deleted_at IS NULL ORDER BY (username = ?) DESC LIMIT 5`, [username, username, username]);
  let user: UserRow | null = null;
  for (const c of rows) if (await verifyPassword(password, c.password_hash)) { user = c; break; }
  if (!user) throw unauthorized('Nama pengguna atau kata sandi salah');
  if (!user.is_active) throw forbidden('Akun dinonaktifkan. Hubungi admin lembaga.');
  const tenant = await queryOne(`SELECT is_active, deleted_at FROM \`${T('tenants')}\` WHERE id = ?`, [user.tenant_id]);
  if (!tenant || (!tenant.is_active && user.tenant_id !== PLATFORM_TENANT_ID) || tenant.deleted_at) throw forbidden('Lembaga tidak aktif');
  const roles = await loadRoles(user.id);
  if (!roles.length) throw forbidden('Akun belum punya peran');
  const tokens = await issueTokens(user, roles, req.headers['user-agent'], req.ip);
  await execute(`UPDATE \`${T('users')}\` SET last_login_at = NOW() WHERE id = ?`, [user.id]);
  await execute(`INSERT INTO \`${T('audit_logs')}\` (id, tenant_id, user_id, action, ip, user_agent) VALUES (?,?,?,?,?,?)`, [newId(), user.tenant_id, user.id, 'auth.login', req.ip ?? null, (req.headers['user-agent'] ?? '').toString().slice(0, 255)]);
  const me = await buildMe(user.id, user.tenant_id, roles, roles.includes('SUPER_ADMIN'));
  ok(res, { ...tokens, user: me });
}));

r.post('/refresh', validate(z.object({ refreshToken: z.string().min(10) })), wrap(async (req, res) => {
  const hash = sha256(req.body.refreshToken);
  const row = await queryOne(`SELECT * FROM \`${T('refresh_tokens')}\` WHERE token_hash = ?`, [hash]);
  if (!row) throw unauthorized('Sesi tidak dikenal');
  if (row.revoked_at) {
    // Reuse of a rotated token → possible theft: revoke the whole family.
    await execute(`UPDATE \`${T('refresh_tokens')}\` SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`, [row.user_id]);
    throw unauthorized('Sesi tidak valid, silakan masuk kembali');
  }
  if (new Date(row.expires_at) < new Date()) throw unauthorized('Sesi kedaluwarsa');
  const user = await queryOne<UserRow>(`SELECT * FROM \`${T('users')}\` WHERE id = ? AND deleted_at IS NULL AND is_active = 1`, [row.user_id]);
  if (!user) throw unauthorized();
  const roles = await loadRoles(user.id);
  const tokens = await issueTokens(user, roles, req.headers['user-agent'], req.ip);
  await execute(`UPDATE \`${T('refresh_tokens')}\` SET revoked_at = NOW(), replaced_by = ? WHERE id = ?`, [sha256(tokens.refreshToken).slice(0, 36), row.id]);
  ok(res, tokens);
}));

r.post('/logout', wrap(async (req, res) => {
  const t = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null;
  if (t) await execute(`UPDATE \`${T('refresh_tokens')}\` SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL`, [sha256(t)]);
  ok(res, { loggedOut: true });
}));

r.post('/forgot-password', loginLimiter, validate(z.object({ email: z.string().email() })), wrap(async (req, res) => {
  const user = await queryOne<UserRow>(`SELECT * FROM \`${T('users')}\` WHERE email = ? AND deleted_at IS NULL AND is_active = 1 LIMIT 1`, [req.body.email]);
  if (user) {
    const token = randomToken(32);
    await execute(`INSERT INTO \`${T('password_resets')}\` (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)`, [newId(), user.id, sha256(token), new Date(Date.now() + 3_600_000)]);
    await sendMail(user.email!, 'Atur ulang kata sandi SINAU', `Halo ${user.full_name},\n\nBuka tautan berikut untuk mengatur ulang kata sandi (berlaku 1 jam):\n${config.appUrl}/reset-password?token=${token}\n\nAbaikan jika Anda tidak meminta ini.`);
  }
  ok(res, { sent: true });
}));

r.post('/reset-password', validate(z.object({ token: z.string().min(10), password: z.string().min(8).max(100) })), wrap(async (req, res) => {
  const row = await queryOne(`SELECT * FROM \`${T('password_resets')}\` WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`, [sha256(req.body.token)]);
  if (!row) throw badRequest('Tautan tidak valid atau sudah kedaluwarsa');
  const hash = await hashPassword(req.body.password);
  await execute(`UPDATE \`${T('users')}\` SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?`, [hash, row.user_id]);
  await execute(`UPDATE \`${T('password_resets')}\` SET used_at = NOW() WHERE id = ?`, [row.id]);
  await execute(`UPDATE \`${T('refresh_tokens')}\` SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`, [row.user_id]);
  ok(res, { reset: true });
}));

r.post('/register', loginLimiter, validate(z.object({ tenant_slug: z.string().min(1), username: z.string().min(4).max(60).regex(/^[a-z0-9._-]+$/i), email: z.string().email(), full_name: z.string().min(3).max(150), password: z.string().min(8).max(100), phone: z.string().max(30).optional() })), wrap(async (req, res) => {
  const t = await queryOne(`SELECT t.id, s.self_registration FROM \`${T('tenants')}\` t JOIN \`${T('tenant_settings')}\` s ON s.tenant_id = t.id WHERE t.slug = ? AND t.is_active = 1 AND t.deleted_at IS NULL`, [req.body.tenant_slug]);
  if (!t) throw notFound('Lembaga tidak ditemukan');
  if (!t.self_registration) throw forbidden('Pendaftaran mandiri ditutup untuk lembaga ini');
  const dup = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE username = ? OR email = ?`, [req.body.username, req.body.email]);
  if (dup) throw conflict('Nama pengguna atau e-mail sudah dipakai');
  const id = newId();
  await withTransaction(async (conn) => {
    await insertRow('users', { id, tenant_id: t.id, username: req.body.username.toLowerCase(), email: req.body.email, password_hash: await hashPassword(req.body.password), full_name: req.body.full_name, phone: req.body.phone ?? null, must_change_password: 0 }, conn);
    await insertRow('user_roles', { id: newId(), tenant_id: t.id, user_id: id, role: 'SISWA' }, conn);
    await insertRow('student_profiles', { user_id: id, tenant_id: t.id }, conn);
  });
  ok(res, { registered: true }, 201);
}));

r.post('/accept-invitation', validate(z.object({ token: z.string().min(10), username: z.string().min(4).max(60).regex(/^[a-z0-9._-]+$/i), password: z.string().min(8).max(100), full_name: z.string().min(3).max(150).optional() })), wrap(async (req, res) => {
  const inv = await queryOne(`SELECT * FROM \`${T('invitations')}\` WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > NOW()`, [sha256(req.body.token)]);
  if (!inv) throw badRequest('Undangan tidak valid atau sudah kedaluwarsa');
  const dup = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE username = ? OR email = ?`, [req.body.username, inv.email]);
  if (dup) throw conflict('Nama pengguna atau e-mail sudah dipakai');
  const id = newId();
  await withTransaction(async (conn) => {
    await insertRow('users', { id, tenant_id: inv.tenant_id, username: req.body.username.toLowerCase(), email: inv.email, password_hash: await hashPassword(req.body.password), full_name: req.body.full_name ?? inv.full_name ?? inv.email, must_change_password: 0 }, conn);
    await insertRow('user_roles', { id: newId(), tenant_id: inv.tenant_id, user_id: id, role: inv.role }, conn);
    await execute(`UPDATE \`${T('invitations')}\` SET accepted_at = NOW() WHERE id = ?`, [inv.id], conn);
  });
  ok(res, { accepted: true }, 201);
}));

// ---------- authenticated ----------
r.use(authenticate);

r.get('/me', wrap(async (req, res) => {
  const a = req.auth!;
  ok(res, await buildMe(a.id, a.tenantId, a.roles, a.isSuperAdmin));
}));

r.put('/me', validate(z.object({ full_name: z.string().min(3).max(150).optional(), phone: z.string().max(30).nullable().optional(), email: z.string().email().nullable().optional(), theme: z.enum(['system', 'light', 'dark']).optional(), data_saver: z.boolean().optional(), gender: z.enum(['L', 'P']).nullable().optional() })), wrap(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const cols = Object.keys(b);
  if (b.email) {
    const dup = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE email = ? AND id <> ?`, [b.email, req.auth!.id]);
    if (dup) throw conflict('E-mail sudah dipakai akun lain');
  }
  if (cols.length) await execute(`UPDATE \`${T('users')}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => (typeof b[c] === 'boolean' ? (b[c] ? 1 : 0) : b[c])), req.auth!.id]);
  await audit(req, 'auth.profile_update', 'users', req.auth!.id, undefined, b);
  ok(res, await buildMe(req.auth!.id, req.auth!.tenantId, req.auth!.roles, req.auth!.isSuperAdmin));
}));

r.post('/me/avatar', (req, _res, next) => { req.params.module = 'avatar'; next(); }, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('Berkas tidak ada');
  if (!req.file.mimetype.startsWith('image/')) throw badRequest('Avatar harus gambar');
  const f = await registerFile(req, req.file, 'avatar', true);
  await execute(`UPDATE \`${T('users')}\` SET avatar_url = ? WHERE id = ?`, [f.url, req.auth!.id]);
  ok(res, { avatar_url: f.url });
}));

r.post('/change-password', validate(z.object({ current_password: z.string().min(1), new_password: z.string().min(8).max(100) })), wrap(async (req, res) => {
  const u = await queryOne<UserRow>(`SELECT * FROM \`${T('users')}\` WHERE id = ?`, [req.auth!.id]);
  if (!u || !(await verifyPassword(req.body.current_password, u.password_hash))) throw badRequest('Kata sandi saat ini salah');
  await execute(`UPDATE \`${T('users')}\` SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?`, [await hashPassword(req.body.new_password), u.id]);
  await execute(`UPDATE \`${T('refresh_tokens')}\` SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`, [u.id]);
  await audit(req, 'auth.change_password', 'users', u.id);
  const fresh = await queryOne<UserRow>(`SELECT * FROM \`${T('users')}\` WHERE id = ?`, [u.id]);
  const tokens = await issueTokens(fresh!, req.auth!.roles, req.headers['user-agent'], req.ip);
  ok(res, tokens);
}));

r.post('/logout-all', wrap(async (req, res) => {
  await execute(`UPDATE \`${T('users')}\` SET token_version = token_version + 1 WHERE id = ?`, [req.auth!.id]);
  await execute(`UPDATE \`${T('refresh_tokens')}\` SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`, [req.auth!.id]);
  ok(res, { loggedOut: true });
}));

r.get('/sessions', wrap(async (req, res) => {
  ok(res, await query(`SELECT id, user_agent, ip, created_at, expires_at FROM \`${T('refresh_tokens')}\` WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC`, [req.auth!.id]));
}));

r.put('/onboarding', validate(z.object({ steps: z.record(z.boolean()), completed: z.boolean().optional() })), wrap(async (req, res) => {
  await execute(`INSERT INTO \`${T('user_onboarding')}\` (user_id, steps, completed_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE steps = VALUES(steps), completed_at = VALUES(completed_at)`, [req.auth!.id, JSON.stringify(req.body.steps), req.body.completed ? new Date() : null]);
  ok(res, { saved: true });
}));

export default r;
