import { Router, Request } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { T, PLATFORM_TENANT_ID, config } from '../../config';
import { query, queryOne, execute, withTransaction, Exec, getPool } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, conflict, forbidden, badRequest } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit, sendMail, notify } from '../../core/services';
import { newId, randomPassword, sha256, randomToken } from '../../core/ids';
import { hashPassword } from '../../core/auth';
import { insertRow, updateRow } from '../../core/crud';
import { ROLES, TENANT_ROLES, STAFF_ROLES, ROLE_RANK, Role, isRole } from '../../core/rbac';

const r = Router();

const studentProfile = z.object({
  nis: z.string().max(30).nullable().optional(), nisn: z.string().max(20).nullable().optional(), nik: z.string().max(20).nullable().optional(), birth_place: z.string().max(100).nullable().optional(),
  birth_date: z.string().max(10).nullable().optional(), religion: z.string().max(30).nullable().optional(), address: z.string().max(2000).nullable().optional(), provinsi_id: z.number().int().nullable().optional(),
  kota_id: z.number().int().nullable().optional(), entry_year: z.number().int().nullable().optional(), major_id: z.string().nullable().optional(), status: z.enum(['AKTIF', 'PINDAH', 'LULUS', 'KELUAR', 'CUTI']).optional(),
  parent_name: z.string().max(150).nullable().optional(), parent_phone: z.string().max(30).nullable().optional(), blood_type: z.string().max(3).nullable().optional(), notes: z.string().max(2000).nullable().optional(),
});
const staffProfile = z.object({
  nip: z.string().max(30).nullable().optional(), nuptk: z.string().max(30).nullable().optional(), nik: z.string().max(20).nullable().optional(), position_id: z.string().nullable().optional(),
  employment_status: z.enum(['PNS', 'PPPK', 'GTY', 'GTT', 'HONORER', 'KONTRAK', 'TETAP']).nullable().optional(), join_date: z.string().max(10).nullable().optional(), birth_date: z.string().max(10).nullable().optional(),
  birth_place: z.string().max(100).nullable().optional(), address: z.string().max(2000).nullable().optional(), education: z.string().max(80).nullable().optional(), npwp: z.string().max(30).nullable().optional(),
  bank_name: z.string().max(60).nullable().optional(), bank_account: z.string().max(40).nullable().optional(), ptkp_status: z.string().max(10).nullable().optional(), notes: z.string().max(2000).nullable().optional(),
});
const userSchema = z.object({
  username: z.string().min(3).max(60).regex(/^[a-z0-9._-]+$/i), full_name: z.string().min(2).max(150), email: z.string().email().nullable().optional(), phone: z.string().max(30).nullable().optional(),
  gender: z.enum(['L', 'P']).nullable().optional(), password: z.string().min(8).max(100).optional(), roles: z.array(z.string()).min(1), is_active: z.boolean().optional(),
  student: studentProfile.optional(), staff: staffProfile.optional(), class_id: z.string().nullable().optional(),
});

const userSelect = `u.id, u.tenant_id, u.username, u.email, u.full_name, u.phone, u.avatar_url, u.gender, u.is_active, u.must_change_password, u.last_login_at, u.created_at,
  (SELECT GROUP_CONCAT(r.role ORDER BY r.role) FROM \`${T('user_roles')}\` r WHERE r.user_id = u.id) AS roles_csv,
  sp.nis, sp.nisn, sp.status AS student_status, sp.major_id, m.name AS major_name, st.nip, st.nuptk, st.employment_status,
  (SELECT c.name FROM \`${T('class_students')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id WHERE cs.student_id = u.id AND cs.status = 'AKTIF' AND c.is_active = 1 ORDER BY c.created_at DESC LIMIT 1) AS class_name,
  (SELECT cs2.class_id FROM \`${T('class_students')}\` cs2 JOIN \`${T('classes')}\` c2 ON c2.id = cs2.class_id WHERE cs2.student_id = u.id AND cs2.status = 'AKTIF' AND c2.is_active = 1 ORDER BY c2.created_at DESC LIMIT 1) AS class_id`;
const userFrom = `FROM \`${T('users')}\` u LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = u.id LEFT JOIN \`${T('majors')}\` m ON m.id = sp.major_id LEFT JOIN \`${T('staff_profiles')}\` st ON st.user_id = u.id`;
const present = (row: Record<string, unknown>) => ({ ...row, roles: row.roles_csv ? String(row.roles_csv).split(',') : [], roles_csv: undefined });

function assertManageable(req: Request, roles: string[]) {
  const a = req.auth!;
  if (a.isSuperAdmin) return;
  const myRank = Math.min(...a.roles.map((x) => ROLE_RANK[x]));
  for (const role of roles) {
    if (!isRole(role) || !TENANT_ROLES.includes(role)) throw badRequest(`Peran tidak valid: ${role}`);
    if (ROLE_RANK[role] < myRank) throw forbidden(`Tidak boleh memberi peran ${role}`);
  }
}

export async function ensureProfiles(userId: string, tenantId: string, roles: string[], exec: Exec) {
  if (roles.includes('SISWA') || roles.includes('CALON_SISWA')) await execute(`INSERT IGNORE INTO \`${T('student_profiles')}\` (user_id, tenant_id) VALUES (?,?)`, [userId, tenantId], exec);
  if (roles.some((x) => (STAFF_ROLES as string[]).includes(x))) await execute(`INSERT IGNORE INTO \`${T('staff_profiles')}\` (user_id, tenant_id) VALUES (?,?)`, [userId, tenantId], exec);
  if (roles.includes('WALI_MURID')) await execute(`INSERT IGNORE INTO \`${T('guardians')}\` (id, tenant_id, user_id) VALUES (?,?,?)`, [newId(), tenantId, userId], exec);
}

async function setClass(studentId: string, classId: string | null | undefined, tenantId: string, exec: Exec) {
  if (classId === undefined) return;
  await execute(`UPDATE \`${T('class_students')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id SET cs.status = 'PINDAH', cs.left_at = CURDATE() WHERE cs.student_id = ? AND cs.status = 'AKTIF' AND ay.is_active = 1 AND cs.class_id <> ?`, [studentId, classId ?? ''], exec);
  if (classId) {
    const c = await queryOne(`SELECT id FROM \`${T('classes')}\` WHERE id = ? AND tenant_id = ?`, [classId, tenantId], exec);
    if (!c) throw badRequest('Kelas tidak ditemukan');
    await execute(`INSERT INTO \`${T('class_students')}\` (id, tenant_id, class_id, student_id, status, joined_at) VALUES (?,?,?,?,'AKTIF',CURDATE()) ON DUPLICATE KEY UPDATE status = 'AKTIF', left_at = NULL`, [newId(), tenantId, classId, studentId], exec);
  }
}

r.get('/roles', wrap(async (req, res) => {
  const a = req.auth!;
  const myRank = a.isSuperAdmin ? -1 : Math.min(...a.roles.map((x) => ROLE_RANK[x]));
  ok(res, ROLES.filter((x) => (a.isSuperAdmin ? true : TENANT_ROLES.includes(x) && ROLE_RANK[x] >= myRank)).map((code) => ({ code, rank: ROLE_RANK[code] })));
}));

r.get('/', requirePermission('user:read'), wrap(async (req, res) => {
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [req.auth!.tenantId];
  let where = 'WHERE u.tenant_id = ? AND u.deleted_at IS NULL';
  const q = str(req.query.q);
  if (q) { where += ' AND (u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR sp.nis LIKE ? OR sp.nisn LIKE ? OR st.nip LIKE ?)'; params.push(...Array(6).fill(`%${q}%`)); }
  const role = str(req.query.role);
  if (role) { where += ` AND EXISTS (SELECT 1 FROM \`${T('user_roles')}\` rr WHERE rr.user_id = u.id AND rr.role = ?)`; params.push(role); }
  if (req.query.is_active !== undefined && req.query.is_active !== '') { where += ' AND u.is_active = ?'; params.push(req.query.is_active === '1' ? 1 : 0); }
  if (str(req.query.class_id)) { where += ` AND EXISTS (SELECT 1 FROM \`${T('class_students')}\` cs3 WHERE cs3.student_id = u.id AND cs3.class_id = ? AND cs3.status = 'AKTIF')`; params.push(String(req.query.class_id)); }
  if (str(req.query.major_id)) { where += ' AND sp.major_id = ?'; params.push(String(req.query.major_id)); }
  if (str(req.query.no_class) === '1') { where += ` AND NOT EXISTS (SELECT 1 FROM \`${T('class_students')}\` cs4 JOIN \`${T('classes')}\` c4 ON c4.id = cs4.class_id JOIN \`${T('academic_years')}\` ay4 ON ay4.id = c4.academic_year_id WHERE cs4.student_id = u.id AND cs4.status = 'AKTIF' AND ay4.is_active = 1)`; }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${userFrom} ${where}`, params))?.c ?? 0);
  const sort = ['full_name', 'username', 'created_at', 'last_login_at'].includes(String(req.query.sort)) ? String(req.query.sort) : 'full_name';
  const order = String(req.query.order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const rows = await query(`SELECT ${userSelect} ${userFrom} ${where} ORDER BY u.${sort} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paged(res, rows.map(present), { page, limit, total });
}));

r.get('/:id', requirePermission('user:read'), wrap(async (req, res) => {
  const row = await queryOne(`SELECT ${userSelect} ${userFrom} WHERE u.id = ? AND u.tenant_id = ? AND u.deleted_at IS NULL`, [req.params.id, req.auth!.tenantId]);
  if (!row) throw notFound();
  const student = await queryOne(`SELECT * FROM \`${T('student_profiles')}\` WHERE user_id = ?`, [row.id]);
  const staff = await queryOne(`SELECT * FROM \`${T('staff_profiles')}\` WHERE user_id = ?`, [row.id]);
  const classes = await query(`SELECT c.id, c.name, c.grade_level, ay.name AS academic_year, cs.status FROM \`${T('class_students')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE cs.student_id = ? ORDER BY ay.name DESC`, [row.id]);
  const teaching = await query(`SELECT cs.id, c.name AS class_name, s.name AS subject_name, cs.semester FROM \`${T('class_subjects')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE cs.teacher_id = ?`, [row.id]);
  const guardians = await query(`SELECT g.guardian_user_id AS id, u.full_name, u.phone, g.relation FROM \`${T('guardian_students')}\` g JOIN \`${T('users')}\` u ON u.id = g.guardian_user_id WHERE g.student_id = ?`, [row.id]);
  const children = await query(`SELECT g.student_id AS id, u.full_name, g.relation FROM \`${T('guardian_students')}\` g JOIN \`${T('users')}\` u ON u.id = g.student_id WHERE g.guardian_user_id = ?`, [row.id]);
  const overrides = await query(`SELECT permission_code, effect FROM \`${T('user_permission_overrides')}\` WHERE user_id = ?`, [row.id]);
  ok(res, { ...present(row), student, staff, classes, teaching, guardians, children, overrides });
}));

r.post('/', requirePermission('user:write'), validate(userSchema), wrap(async (req, res) => {
  const b = req.body;
  const tid = req.auth!.tenantId;
  if (tid === PLATFORM_TENANT_ID && !b.roles.includes('SUPER_ADMIN')) throw badRequest('Pilih lembaga dulu (X-Tenant-Id)');
  assertManageable(req, b.roles);
  const dup = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE username = ? OR (email IS NOT NULL AND email = ?)`, [b.username.toLowerCase(), b.email ?? '']);
  if (dup) throw conflict('Nama pengguna atau e-mail sudah dipakai');
  const pwd = b.password ?? randomPassword();
  const id = newId();
  await withTransaction(async (conn) => {
    await insertRow('users', { id, tenant_id: tid, username: b.username.toLowerCase(), email: b.email ?? null, phone: b.phone ?? null, gender: b.gender ?? null, password_hash: await hashPassword(pwd), full_name: b.full_name, is_active: b.is_active ?? true, must_change_password: 1 }, conn);
    for (const role of b.roles) await insertRow('user_roles', { id: newId(), tenant_id: tid, user_id: id, role }, conn);
    await ensureProfiles(id, tid, b.roles, conn);
    if (b.student) await updateProfile('student_profiles', id, b.student, conn);
    if (b.staff) await updateProfile('staff_profiles', id, b.staff, conn);
    if (b.roles.includes('SISWA')) await setClass(id, b.class_id, tid, conn);
  });
  await audit(req, 'user.create', 'users', id, undefined, { username: b.username, roles: b.roles });
  const row = await queryOne(`SELECT ${userSelect} ${userFrom} WHERE u.id = ?`, [id]);
  ok(res, { ...present(row!), temporary_password: pwd }, 201);
}));

async function updateProfile(table: 'student_profiles' | 'staff_profiles', userId: string, data: Record<string, unknown>, exec: Exec) {
  const cols = Object.keys(data).filter((c) => data[c] !== undefined);
  if (!cols.length) return;
  await execute(`UPDATE \`${T(table)}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE user_id = ?`, [...cols.map((c) => data[c]), userId], exec);
}

r.put('/:id', requirePermission('user:write'), validate(userSchema.partial().omit({ password: true })), wrap(async (req, res) => {
  const b = req.body;
  const tid = req.auth!.tenantId;
  const u = await queryOne(`SELECT * FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.params.id, tid]);
  if (!u) throw notFound();
  const currentRoles = (await query(`SELECT role FROM \`${T('user_roles')}\` WHERE user_id = ?`, [u.id])).map((x) => String(x.role));
  assertManageable(req, currentRoles);
  if (b.roles) assertManageable(req, b.roles);
  if (b.username || b.email) {
    const dup = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE (username = ? OR (email IS NOT NULL AND email = ?)) AND id <> ?`, [b.username?.toLowerCase() ?? '', b.email ?? '', u.id]);
    if (dup) throw conflict('Nama pengguna atau e-mail sudah dipakai');
  }
  await withTransaction(async (conn) => {
    const { roles, student, staff, class_id, ...rest } = b;
    if (rest.username) rest.username = rest.username.toLowerCase();
    await updateRow('users', u.id, rest as Record<string, unknown>, conn, tid);
    if (roles) {
      await execute(`DELETE FROM \`${T('user_roles')}\` WHERE user_id = ?`, [u.id], conn);
      for (const role of roles) await insertRow('user_roles', { id: newId(), tenant_id: tid, user_id: u.id, role }, conn);
      await ensureProfiles(u.id, tid, roles, conn);
    }
    if (student) { await ensureProfiles(u.id, tid, ['SISWA'], conn); await updateProfile('student_profiles', u.id, student, conn); }
    if (staff) { await ensureProfiles(u.id, tid, ['GURU'], conn); await updateProfile('staff_profiles', u.id, staff, conn); }
    if (class_id !== undefined) await setClass(u.id, class_id, tid, conn);
  });
  await audit(req, 'user.update', 'users', u.id, u, b);
  const row = await queryOne(`SELECT ${userSelect} ${userFrom} WHERE u.id = ?`, [u.id]);
  ok(res, present(row!));
}));

r.delete('/:id', requirePermission('user:write'), wrap(async (req, res) => {
  const u = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.params.id, req.auth!.tenantId]);
  if (!u) throw notFound();
  if (u.id === req.auth!.id) throw badRequest('Tidak bisa menghapus akun sendiri');
  await execute(`UPDATE \`${T('users')}\` SET deleted_at = NOW(), is_active = 0, token_version = token_version + 1 WHERE id = ?`, [u.id]);
  await audit(req, 'user.delete', 'users', u.id);
  ok(res, { deleted: true });
}));

r.post('/:id/reset-password', requirePermission('user:write'), validate(z.object({ password: z.string().min(8).max(100).optional() })), wrap(async (req, res) => {
  const u = await queryOne(`SELECT id, email, full_name FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.params.id, req.auth!.tenantId]);
  if (!u) throw notFound();
  const pwd = req.body.password ?? randomPassword();
  await execute(`UPDATE \`${T('users')}\` SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?`, [await hashPassword(pwd), u.id]);
  await execute(`UPDATE \`${T('refresh_tokens')}\` SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`, [u.id]);
  await audit(req, 'user.reset_password', 'users', u.id);
  ok(res, { temporary_password: pwd });
}));

r.post('/:id/toggle-active', requirePermission('user:write'), wrap(async (req, res) => {
  const u = await queryOne(`SELECT id, is_active FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.params.id, req.auth!.tenantId]);
  if (!u) throw notFound();
  if (u.id === req.auth!.id) throw badRequest('Tidak bisa menonaktifkan akun sendiri');
  const next = u.is_active ? 0 : 1;
  await execute(`UPDATE \`${T('users')}\` SET is_active = ?, token_version = token_version + 1 WHERE id = ?`, [next, u.id]);
  await audit(req, next ? 'user.activate' : 'user.deactivate', 'users', u.id);
  ok(res, { is_active: !!next });
}));

r.put('/:id/overrides', requirePermission('rbac:write'), validate(z.object({ overrides: z.array(z.object({ permission_code: z.string(), effect: z.enum(['ALLOW', 'DENY']) })) })), wrap(async (req, res) => {
  const u = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, req.auth!.tenantId]);
  if (!u) throw notFound();
  await withTransaction(async (conn) => {
    await execute(`DELETE FROM \`${T('user_permission_overrides')}\` WHERE user_id = ?`, [u.id], conn);
    for (const o of req.body.overrides) await insertRow('user_permission_overrides', { id: newId(), tenant_id: req.auth!.tenantId, user_id: u.id, permission_code: o.permission_code, effect: o.effect }, conn);
  });
  await audit(req, 'user.overrides', 'users', u.id, undefined, req.body);
  ok(res, { saved: true });
}));

// ---------- Guardians ↔ students ----------
r.post('/:id/guardians', requirePermission('user:write'), validate(z.object({ guardian_user_id: z.string(), relation: z.enum(['AYAH', 'IBU', 'WALI', 'ORANG_TUA']).default('ORANG_TUA'), is_primary: z.boolean().optional() })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const s = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, tid]);
  const g = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ?`, [req.body.guardian_user_id, tid]);
  if (!s || !g) throw notFound();
  await execute(`INSERT IGNORE INTO \`${T('user_roles')}\` (id, tenant_id, user_id, role) VALUES (?,?,?,'WALI_MURID')`, [newId(), tid, g.id]);
  await ensureProfiles(String(g.id), tid, ['WALI_MURID'], getPool());
  await execute(`INSERT INTO \`${T('guardian_students')}\` (id, tenant_id, guardian_user_id, student_id, relation, is_primary) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE relation = VALUES(relation), is_primary = VALUES(is_primary)`, [newId(), tid, g.id, s.id, req.body.relation, req.body.is_primary === false ? 0 : 1]);
  ok(res, { linked: true }, 201);
}));
r.delete('/:id/guardians/:guardianId', requirePermission('user:write'), wrap(async (req, res) => {
  await execute(`DELETE FROM \`${T('guardian_students')}\` WHERE tenant_id = ? AND student_id = ? AND guardian_user_id = ?`, [req.auth!.tenantId, req.params.id, req.params.guardianId]);
  ok(res, { unlinked: true });
}));

// ---------- Invitations ----------
r.get('/invitations/list', requirePermission('user:write'), wrap(async (req, res) => {
  ok(res, await query(`SELECT id, email, full_name, role, expires_at, accepted_at, created_at FROM \`${T('invitations')}\` WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200`, [req.auth!.tenantId]));
}));
r.post('/invitations', requirePermission('user:write'), validate(z.object({ email: z.string().email(), full_name: z.string().max(150).optional(), role: z.string() })), wrap(async (req, res) => {
  assertManageable(req, [req.body.role]);
  const token = randomToken(24);
  const id = newId();
  await insertRow('invitations', { id, tenant_id: req.auth!.tenantId, email: req.body.email, full_name: req.body.full_name ?? null, role: req.body.role, token_hash: sha256(token), expires_at: new Date(Date.now() + 14 * 86_400_000), created_by: req.auth!.id });
  const link = `${config.appUrl}/undangan?token=${token}`;
  await sendMail(req.body.email, 'Undangan bergabung di SINAU', `Halo ${req.body.full_name ?? ''},\n\nAnda diundang sebagai ${req.body.role}. Buat akun lewat tautan berikut (berlaku 14 hari):\n${link}`);
  await audit(req, 'user.invite', 'invitations', id, undefined, { email: req.body.email, role: req.body.role });
  ok(res, { id, link }, 201);
}));

// ---------- Import (xlsx / csv) ----------
const IMPORT_COLUMNS: Record<string, string[]> = {
  siswa: ['username', 'full_name', 'nis', 'nisn', 'nik', 'gender', 'birth_place', 'birth_date', 'email', 'phone', 'class_name', 'major_code', 'parent_name', 'parent_phone', 'password'],
  guru: ['username', 'full_name', 'nip', 'nuptk', 'nik', 'gender', 'email', 'phone', 'employment_status', 'roles', 'password'],
};
r.get('/import/template/:type', requirePermission('user:import'), wrap(async (req, res) => {
  const cols = IMPORT_COLUMNS[req.params.type];
  if (!cols) throw notFound();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('data');
  ws.addRow(cols);
  ws.addRow(req.params.type === 'siswa' ? ['siswa.budi', 'Budi Santoso', '2026001', '0071234567', '', 'L', 'Depok', '2010-05-17', 'budi@contoh.id', '0812', 'X TKJ 1', 'TKJ', 'Bapak Budi', '0813', ''] : ['guru.rina', 'Rina Wijaya, S.Pd', '19800101', '', '', 'P', 'rina@contoh.id', '0812', 'GTY', 'GURU', '']);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="template-${req.params.type}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

import { upload } from '../../core/services';
r.post('/import/:type', requirePermission('user:import'), upload.single('file'), wrap(async (req, res) => {
  const type = req.params.type;
  const cols = IMPORT_COLUMNS[type];
  if (!cols) throw notFound();
  if (!req.file) throw badRequest('Berkas tidak ada');
  const tid = req.auth!.tenantId;
  const rows = await readSheet(req.file.path, req.file.mimetype);
  const batchId = newId();
  const errors: { row_no: number; message: string; raw: unknown }[] = [];
  let success = 0;
  const created: { username: string; temporary_password: string }[] = [];
  const classes = await query(`SELECT c.id, c.name FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE c.tenant_id = ? AND ay.is_active = 1`, [tid]);
  const majors = await query(`SELECT id, code FROM \`${T('majors')}\` WHERE tenant_id = ?`, [tid]);
  for (let i = 0; i < rows.length; i++) {
    const rec = rows[i];
    const rowNo = i + 2;
    try {
      if (!rec.username || !rec.full_name) throw new Error('username dan full_name wajib');
      const username = String(rec.username).toLowerCase().trim();
      if (!/^[a-z0-9._-]+$/.test(username)) throw new Error('username hanya huruf/angka/._-');
      const dup = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE username = ?`, [username]);
      if (dup) throw new Error('username sudah ada');
      const pwd = rec.password ? String(rec.password) : randomPassword();
      const id = newId();
      const roles = type === 'siswa' ? ['SISWA'] : String(rec.roles || 'GURU').split(/[,;| ]+/).map((x) => x.trim().toUpperCase()).filter(isRole);
      if (!roles.length) throw new Error('peran tidak valid');
      assertManageable(req, roles);
      await withTransaction(async (conn) => {
        await insertRow('users', { id, tenant_id: tid, username, email: rec.email ? String(rec.email) : null, phone: rec.phone ? String(rec.phone) : null, gender: rec.gender === 'L' || rec.gender === 'P' ? rec.gender : null, password_hash: await hashPassword(pwd), full_name: String(rec.full_name), must_change_password: 1 }, conn);
        for (const role of roles) await insertRow('user_roles', { id: newId(), tenant_id: tid, user_id: id, role }, conn);
        await ensureProfiles(id, tid, roles, conn);
        if (type === 'siswa') {
          const major = rec.major_code ? majors.find((m) => String(m.code).toUpperCase() === String(rec.major_code).toUpperCase()) : null;
          await updateProfile('student_profiles', id, { nis: rec.nis ?? null, nisn: rec.nisn ?? null, nik: rec.nik ?? null, birth_place: rec.birth_place ?? null, birth_date: toDate(rec.birth_date), parent_name: rec.parent_name ?? null, parent_phone: rec.parent_phone ?? null, major_id: major ? major.id : null }, conn);
          if (rec.class_name) {
            const cls = classes.find((c) => String(c.name).toLowerCase() === String(rec.class_name).toLowerCase());
            if (!cls) throw new Error(`kelas "${rec.class_name}" tidak ditemukan di tahun ajaran aktif`);
            await setClass(id, String(cls.id), tid, conn);
          }
        } else {
          await updateProfile('staff_profiles', id, { nip: rec.nip ?? null, nuptk: rec.nuptk ?? null, nik: rec.nik ?? null, employment_status: rec.employment_status ?? null }, conn);
        }
      });
      success++;
      created.push({ username, temporary_password: pwd });
    } catch (e) {
      errors.push({ row_no: rowNo, message: e instanceof Error ? e.message : String(e), raw: rec });
    }
  }
  await insertRow('import_batches', { id: batchId, tenant_id: tid, type, file_name: req.file.originalname, total: rows.length, success, failed: errors.length, created_by: req.auth!.id });
  for (const e of errors) await insertRow('import_errors', { id: newId(), batch_id: batchId, row_no: e.row_no, message: e.message.slice(0, 500), raw: e.raw });
  await audit(req, 'user.import', 'import_batches', batchId, undefined, { type, total: rows.length, success, failed: errors.length });
  ok(res, { batch_id: batchId, total: rows.length, success, failed: errors.length, errors, created });
}));
r.get('/import/batches', requirePermission('user:import'), wrap(async (req, res) => {
  ok(res, await query(`SELECT * FROM \`${T('import_batches')}\` WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50`, [req.auth!.tenantId]));
}));

const toDate = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

export async function readSheet(filePath: string, mime: string): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  if (mime === 'text/csv' || filePath.endsWith('.csv')) await wb.csv.readFile(filePath);
  else await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const header: string[] = [];
  ws.getRow(1).eachCell((cell, col) => { header[col] = String(cell.value ?? '').trim().toLowerCase(); });
  const out: Record<string, unknown>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const rec: Record<string, unknown> = {};
    let any = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = header[col];
      if (!key) return;
      const v = cell.value;
      const val = v && typeof v === 'object' && 'text' in v ? (v as { text: string }).text : v && typeof v === 'object' && 'result' in v ? (v as { result: unknown }).result : v;
      if (val !== null && val !== undefined && String(val).trim() !== '') { rec[key] = typeof val === 'string' ? val.trim() : val; any = true; }
    });
    if (any) out.push(rec);
  });
  return out;
}

export default r;
