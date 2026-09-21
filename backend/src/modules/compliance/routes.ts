/**
 * PDP (UU 27/2022): personal data access, correction, export, deletion requests, consent, retention.
 * Dapodik: CSV exports (UTF-8 BOM) for peserta didik, pendidik, rombongan belajar.
 */
import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { notFound, badRequest } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter, insertRow } from '../../core/crud';
import { audit, notify } from '../../core/services';
import { newId } from '../../core/ids';
import { safe } from '../lms/grades';

const r = Router();

// ---------- PDP: self ----------
async function personalData(userId: string) {
  const user = await queryOne(`SELECT id, username, email, full_name, phone, gender, avatar_url, theme, data_saver, created_at, last_login_at FROM \`${T('users')}\` WHERE id = ?`, [userId]);
  const student = await queryOne(`SELECT * FROM \`${T('student_profiles')}\` WHERE user_id = ?`, [userId]);
  const staff = await queryOne(`SELECT * FROM \`${T('staff_profiles')}\` WHERE user_id = ?`, [userId]);
  const roles = (await query(`SELECT role FROM \`${T('user_roles')}\` WHERE user_id = ?`, [userId])).map((x) => x.role);
  const classes = await query(`SELECT c.name, ay.name AS academic_year, e.status FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE e.student_id = ?`, [userId]);
  const grades = await query(`SELECT g.component_code, g.title, g.score, g.max_score, g.graded_at, s.name AS subject FROM \`${T('grades')}\` g JOIN \`${T('class_subjects')}\` cs ON cs.id = g.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE g.student_id = ? ORDER BY g.graded_at`, [userId]);
  const attendance = await query(`SELECT date, status, note FROM \`${T('attendance_daily')}\` WHERE student_id = ? ORDER BY date`, [userId]);
  const invoices = await query(`SELECT number, title, amount, paid, status, due_date FROM \`${T('invoices')}\` WHERE student_id = ?`, [userId]);
  const consents = await query(`SELECT purpose, granted, granted_at, revoked_at FROM \`${T('consents')}\` WHERE user_id = ?`, [userId]);
  const logins = await query(`SELECT created_at, ip, user_agent FROM \`${T('audit_logs')}\` WHERE user_id = ? AND action = 'auth.login' ORDER BY created_at DESC LIMIT 50`, [userId]);
  return { user, roles, student, staff, classes, grades, attendance, invoices, consents, logins, exported_at: new Date().toISOString() };
}
r.get('/pdp/me', requirePermission('pdp:self'), wrap(async (req, res) => ok(res, await personalData(req.auth!.id))));
r.get('/pdp/me/export', requirePermission('pdp:self'), wrap(async (req, res) => {
  const data = await personalData(req.auth!.id);
  await audit(req, 'pdp.export_self', 'users', req.auth!.id);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="data-pribadi-${req.auth!.id.slice(0, 8)}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));
r.get('/pdp/me/requests', requirePermission('pdp:self'), wrap(async (req, res) => ok(res, await query(`SELECT * FROM \`${T('pdp_requests')}\` WHERE user_id = ? ORDER BY created_at DESC`, [req.auth!.id]))));
r.post('/pdp/me/requests', requirePermission('pdp:self'), validate(z.object({ type: z.enum(['DELETE', 'CORRECTION', 'RESTRICT']), reason: z.string().min(5).max(2000) })), wrap(async (req, res) => {
  const u = req.auth!;
  const pending = await queryOne(`SELECT id FROM \`${T('pdp_requests')}\` WHERE user_id = ? AND status = 'PENDING' AND type = ?`, [u.id, req.body.type]);
  if (pending) throw badRequest('Masih ada permintaan serupa yang menunggu');
  const id = newId();
  await insertRow('pdp_requests', { id, tenant_id: u.tenantId, user_id: u.id, type: req.body.type, reason: req.body.reason, status: 'PENDING' });
  const reviewers = (await query(`SELECT DISTINCT user_id FROM \`${T('user_roles')}\` WHERE tenant_id = ? AND role IN ('ADMIN_SEKOLAH')`, [u.tenantId])).map((x) => String(x.user_id));
  await notify({ tenantId: u.tenantId, userIds: reviewers, type: 'PDP', title: `Permintaan ${req.body.type} data pribadi dari ${u.name}`, link: '/admin/pdp' });
  await audit(req, 'pdp.request', 'pdp_requests', id, undefined, req.body);
  ok(res, { id }, 201);
}));
r.put('/pdp/me/consents', requirePermission('pdp:self'), validate(z.object({ consents: z.array(z.object({ purpose: z.string().min(2).max(80), granted: z.boolean() })) })), wrap(async (req, res) => {
  const u = req.auth!;
  for (const c of req.body.consents) await execute(`INSERT INTO \`${T('consents')}\` (id, tenant_id, user_id, purpose, granted, granted_at, revoked_at, ip) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE granted = VALUES(granted), granted_at = IF(VALUES(granted) = 1, NOW(), granted_at), revoked_at = IF(VALUES(granted) = 0, NOW(), NULL), ip = VALUES(ip)`, [newId(), u.tenantId, u.id, c.purpose, c.granted ? 1 : 0, c.granted ? new Date() : null, c.granted ? null : new Date(), req.ip ?? null]);
  await audit(req, 'pdp.consent_update', 'consents', u.id, undefined, req.body);
  ok(res, { saved: true });
}));
export const CONSENT_PURPOSES = [{ key: 'foto_publikasi', label: 'Foto/video saya boleh dipublikasikan di situs & media sekolah' }, { key: 'kontak_wali', label: 'Nomor kontak boleh dihubungi untuk informasi sekolah' }, { key: 'analitik_belajar', label: 'Data belajar saya boleh dianalisis untuk rekomendasi' }];
r.get('/pdp/purposes', requirePermission('pdp:self'), wrap(async (_req, res) => ok(res, CONSENT_PURPOSES)));

// ---------- PDP: review (petugas) ----------
r.use('/pdp/requests', crudRouter({ table: 'pdp_requests', searchable: ['u.full_name', 't.reason'], sortable: ['created_at', 'status'], perms: { read: ['pdp:review'], write: ['pdp:review'] }, select: 'u.full_name, u.username, rb.full_name AS reviewed_by_name', joins: `JOIN \`${T('users')}\` u ON u.id = t.user_id LEFT JOIN \`${T('users')}\` rb ON rb.id = t.reviewed_by`, filters: [{ param: 'status', column: 't.status' }, { param: 'type', column: 't.type' }], createSchema: z.object({}), updateSchema: z.object({}) }));
r.post('/pdp/requests/:id/review', requirePermission('pdp:review'), validate(z.object({ approve: z.boolean(), note: z.string().max(255).nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const rq = await queryOne(`SELECT * FROM \`${T('pdp_requests')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!rq) throw notFound();
  if (rq.status !== 'PENDING') throw badRequest('Sudah ditinjau');
  await execute(`UPDATE \`${T('pdp_requests')}\` SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?`, [req.body.approve ? 'APPROVED' : 'REJECTED', u.id, req.body.note ?? null, rq.id]);
  if (req.body.approve && rq.type === 'DELETE') {
    // Anonymise: keep academic records (statutory), remove identifying fields, deactivate account.
    await withTransaction(async (conn) => {
      await execute(`UPDATE \`${T('users')}\` SET full_name = '[dihapus]', email = NULL, phone = NULL, avatar_url = NULL, is_active = 0, deleted_at = NOW(), token_version = token_version + 1, username = CONCAT('deleted.', LEFT(id, 8)) WHERE id = ?`, [rq.user_id], conn);
      await execute(`UPDATE \`${T('student_profiles')}\` SET nik = NULL, address = '[dihapus]', parent_name = NULL, parent_phone = NULL, birth_place = NULL, notes = NULL WHERE user_id = ?`, [rq.user_id], conn);
      await execute(`UPDATE \`${T('staff_profiles')}\` SET nik = NULL, address = '[dihapus]', npwp = NULL, bank_account = NULL, notes = NULL WHERE user_id = ?`, [rq.user_id], conn);
      await execute(`UPDATE \`${T('pdp_requests')}\` SET executed_at = NOW() WHERE id = ?`, [rq.id], conn);
    });
  } else if (req.body.approve) await execute(`UPDATE \`${T('pdp_requests')}\` SET executed_at = NOW() WHERE id = ?`, [rq.id]);
  if (rq.type !== 'DELETE' || !req.body.approve) await notify({ tenantId: u.tenantId, userIds: [String(rq.user_id)], type: 'PDP', title: `Permintaan ${rq.type} ${req.body.approve ? 'disetujui' : 'ditolak'}`, body: req.body.note ?? undefined });
  await audit(req, 'pdp.review', 'pdp_requests', String(rq.id), undefined, req.body);
  ok(res, { status: req.body.approve ? 'APPROVED' : 'REJECTED' });
}));
const retSchema = z.object({ entity: z.enum(['audit_logs', 'notifications', 'alumni', 'ppdb_applicants', 'counseling_notes']), retention_months: z.number().int().min(1).max(600), action: z.enum(['ANONYMIZE', 'DELETE']).optional(), is_active: z.boolean().optional() });
r.use('/pdp/retention', crudRouter({ table: 'retention_policies', sortable: ['entity'], defaultSort: 'entity', defaultOrder: 'ASC', perms: { read: ['pdp:review'], write: ['pdp:review'] }, createSchema: retSchema, updateSchema: retSchema.partial() }));
r.get('/pdp/stats', requirePermission('pdp:review'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  ok(res, { pending: Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('pdp_requests')}\` WHERE tenant_id = ? AND status = 'PENDING'`, [tid]))?.c ?? 0), consents: await query(`SELECT purpose, SUM(granted=1) AS granted, SUM(granted=0) AS revoked FROM \`${T('consents')}\` WHERE tenant_id = ? GROUP BY purpose`, [tid]), last_retention: await queryOne(`SELECT MAX(last_run_at) AS at FROM \`${T('retention_policies')}\` WHERE tenant_id = ?`, [tid]) });
}));

// ---------- Dapodik ----------
const csv = (rows: Record<string, unknown>[], cols: string[]) => '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => { const v = safe(r[c]); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(';'))].join('\r\n');
r.get('/dapodik/preview', requirePermission('dapodik:export'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  ok(res, { students: Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('user_roles')}\` r JOIN \`${T('users')}\` u ON u.id = r.user_id AND u.deleted_at IS NULL AND u.is_active = 1 WHERE r.tenant_id = ? AND r.role = 'SISWA'`, [tid]))?.c ?? 0), teachers: Number((await queryOne(`SELECT COUNT(DISTINCT r.user_id) AS c FROM \`${T('user_roles')}\` r JOIN \`${T('users')}\` u ON u.id = r.user_id AND u.deleted_at IS NULL WHERE r.tenant_id = ? AND r.role IN ('GURU','KEPSEK','WAKEPSEK','KAPRODI','BK')`, [tid]))?.c ?? 0), classes: Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id AND ay.is_active = 1 WHERE c.tenant_id = ? AND c.is_active = 1`, [tid]))?.c ?? 0), missing_nisn: Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('student_profiles')}\` sp JOIN \`${T('users')}\` u ON u.id = sp.user_id AND u.deleted_at IS NULL WHERE sp.tenant_id = ? AND (sp.nisn IS NULL OR sp.nisn = '')`, [tid]))?.c ?? 0), missing_nuptk: Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('staff_profiles')}\` sp JOIN \`${T('user_roles')}\` r ON r.user_id = sp.user_id AND r.role = 'GURU' WHERE sp.tenant_id = ? AND (sp.nuptk IS NULL OR sp.nuptk = '')`, [tid]))?.c ?? 0) });
}));
r.get('/dapodik/export/:kind', requirePermission('dapodik:export'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const kind = req.params.kind;
  let rows: Record<string, unknown>[] = []; let cols: string[] = [];
  if (kind === 'peserta_didik') {
    rows = await query(`SELECT sp.nisn, sp.nik, u.full_name AS nama, u.gender AS jenis_kelamin, sp.birth_place AS tempat_lahir, DATE_FORMAT(sp.birth_date, '%Y-%m-%d') AS tanggal_lahir, sp.religion AS agama, sp.address AS alamat, sp.parent_name AS nama_ayah_ibu, sp.parent_phone AS hp_orang_tua, c.name AS rombel, m.code AS jurusan, sp.entry_year AS tahun_masuk, sp.status FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id AND r.role = 'SISWA' LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = u.id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = u.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 LEFT JOIN \`${T('majors')}\` m ON m.id = c.major_id WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 ORDER BY c.name, u.full_name`, [tid]);
    cols = ['nisn', 'nik', 'nama', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir', 'agama', 'alamat', 'nama_ayah_ibu', 'hp_orang_tua', 'rombel', 'jurusan', 'tahun_masuk', 'status'];
  } else if (kind === 'pendidik') {
    rows = await query(`SELECT DISTINCT sp.nuptk, sp.nip, sp.nik, u.full_name AS nama, u.gender AS jenis_kelamin, sp.birth_place AS tempat_lahir, DATE_FORMAT(sp.birth_date, '%Y-%m-%d') AS tanggal_lahir, sp.employment_status AS status_kepegawaian, sp.education AS pendidikan_terakhir, jp.name AS jabatan, DATE_FORMAT(sp.join_date, '%Y-%m-%d') AS tmt, u.email, u.phone AS hp FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id AND r.role IN ('GURU','KEPSEK','WAKEPSEK','KAPRODI','BK','STAF') LEFT JOIN \`${T('staff_profiles')}\` sp ON sp.user_id = u.id LEFT JOIN \`${T('job_positions')}\` jp ON jp.id = sp.position_id WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 ORDER BY u.full_name`, [tid]);
    cols = ['nuptk', 'nip', 'nik', 'nama', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir', 'status_kepegawaian', 'pendidikan_terakhir', 'jabatan', 'tmt', 'email', 'hp'];
  } else if (kind === 'rombongan_belajar') {
    rows = await query(`SELECT c.name AS nama_rombel, c.grade_level AS tingkat, m.code AS jurusan, ay.name AS tahun_ajaran, h.full_name AS wali_kelas, rm.name AS ruang, (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = c.id AND e.status = 'AKTIF') AS jumlah_siswa, (SELECT GROUP_CONCAT(CONCAT(s.name, ':', COALESCE(t.full_name, '-')) SEPARATOR ' | ') FROM \`${T('class_subjects')}\` cs JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` t ON t.id = cs.teacher_id WHERE cs.class_id = c.id) AS pembelajaran FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id AND ay.is_active = 1 LEFT JOIN \`${T('majors')}\` m ON m.id = c.major_id LEFT JOIN \`${T('users')}\` h ON h.id = c.homeroom_teacher_id LEFT JOIN \`${T('rooms')}\` rm ON rm.id = c.room_id WHERE c.tenant_id = ? AND c.is_active = 1 ORDER BY c.grade_level, c.name`, [tid]);
    cols = ['nama_rombel', 'tingkat', 'jurusan', 'tahun_ajaran', 'wali_kelas', 'ruang', 'jumlah_siswa', 'pembelajaran'];
  } else throw notFound();
  await audit(req, 'dapodik.export', 'dapodik', kind, undefined, { rows: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv(rows, cols));
}));

export default r;
