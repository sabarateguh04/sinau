import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, badRequest, conflict } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter, insertRow, mustGet, updateRow } from '../../core/crud';
import { audit, notify, sendMail, fileUrl } from '../../core/services';
import { newId, randomPassword, slugify } from '../../core/ids';
import { hashPassword } from '../../core/auth';
import { ensureProfiles } from '../users/routes';
import { hasRole } from '../../core/auth';

const r = Router();

const periodSchema = z.object({ name: z.string().min(2).max(120), academic_year_id: z.string().nullable().optional(), open_at: z.string(), close_at: z.string(), quota: z.number().int().min(0).optional(), requirements: z.array(z.string()).optional(), paths: z.array(z.string()).optional(), is_active: z.boolean().optional(), announcement: z.string().max(4000).nullable().optional() });
r.use('/periods', crudRouter({ table: 'ppdb_periods', searchable: ['t.name'], sortable: ['open_at'], defaultSort: 'open_at', perms: { read: ['ppdb:read'], write: ['ppdb:write'] }, select: `(SELECT COUNT(*) FROM \`${T('ppdb_applicants')}\` a WHERE a.period_id = t.id) AS applicant_count, (SELECT COUNT(*) FROM \`${T('ppdb_applicants')}\` a2 WHERE a2.period_id = t.id AND a2.status = 'ACCEPTED') AS accepted_count`, createSchema: periodSchema, updateSchema: periodSchema.partial(),
  toRow: (i) => { const b = { ...(i as Record<string, unknown>) }; if (b.open_at) b.open_at = new Date(String(b.open_at)); if (b.close_at) b.close_at = new Date(String(b.close_at)); return b; }, present: (row) => ({ ...row, requirements: parse(row.requirements), paths: parse(row.paths) }) }));
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

const APP_SELECT = `a.*, p.name AS period_name, m1.name AS major1_name, m2.name AS major2_name, am.name AS accepted_major_name, vb.full_name AS verified_by_name, (SELECT COUNT(*) FROM \`${T('ppdb_documents')}\` d WHERE d.applicant_id = a.id) AS document_count`;
const APP_FROM = `FROM \`${T('ppdb_applicants')}\` a JOIN \`${T('ppdb_periods')}\` p ON p.id = a.period_id LEFT JOIN \`${T('majors')}\` m1 ON m1.id = a.major_choice_1 LEFT JOIN \`${T('majors')}\` m2 ON m2.id = a.major_choice_2 LEFT JOIN \`${T('majors')}\` am ON am.id = a.accepted_major_id LEFT JOIN \`${T('users')}\` vb ON vb.id = a.verified_by`;
const present = (row: Record<string, unknown>) => { const { access_token, ...rest } = row; void access_token; return rest; };

r.get('/applicants', requirePermission('ppdb:read', 'ppdb:self'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [u.tenantId];
  let where = 'WHERE a.tenant_id = ?';
  if (hasRole(u, 'CALON_SISWA') && !u.permissions.has('ppdb:read')) { where += ' AND a.user_id = ?'; params.push(u.id); }
  for (const [k, col] of [['period_id', 'a.period_id'], ['status', 'a.status'], ['path', 'a.path'], ['major_id', 'a.major_choice_1']] as const) if (str(req.query[k])) { where += ` AND ${col} = ?`; params.push(String(req.query[k])); }
  const q = str(req.query.q); if (q) { where += ' AND (a.full_name LIKE ? OR a.registration_no LIKE ? OR a.nisn LIKE ? OR a.origin_school LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${APP_FROM} ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT ${APP_SELECT} ${APP_FROM} ${where} ORDER BY a.score DESC, a.created_at ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paged(res, rows.map(present), { page, limit, total });
}));
r.get('/applicants/:id', requirePermission('ppdb:read', 'ppdb:self'), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT ${APP_SELECT} ${APP_FROM} WHERE a.id = ? AND a.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!a) throw notFound();
  if (hasRole(u, 'CALON_SISWA') && !u.permissions.has('ppdb:read') && a.user_id !== u.id) throw notFound();
  const docs = await query(`SELECT d.*, f.original_name, f.mime FROM \`${T('ppdb_documents')}\` d JOIN \`${T('files')}\` f ON f.id = d.file_id WHERE d.applicant_id = ?`, [a.id]);
  ok(res, { ...present(a), documents: docs.map((d) => ({ ...d, url: fileUrl(d.file_id) })) });
}));
r.put('/applicants/:id', requirePermission('ppdb:write'), validate(z.object({ full_name: z.string().min(3).max(150).optional(), nisn: z.string().max(20).nullable().optional(), nik: z.string().max(20).nullable().optional(), gender: z.enum(['L', 'P']).nullable().optional(), birth_place: z.string().max(100).nullable().optional(), birth_date: z.string().max(10).nullable().optional(), origin_school: z.string().max(200).nullable().optional(), address: z.string().max(2000).nullable().optional(), phone: z.string().max(30).optional(), email: z.string().email().nullable().optional(), parent_name: z.string().max(150).nullable().optional(), parent_phone: z.string().max(30).nullable().optional(), major_choice_1: z.string().nullable().optional(), major_choice_2: z.string().nullable().optional(), path: z.string().max(30).nullable().optional(), score: z.number().nullable().optional() })), wrap(async (req, res) => {
  const a = await mustGet('ppdb_applicants', req.params.id, req.auth!.tenantId);
  await updateRow('ppdb_applicants', String(a.id), req.body, undefined, req.auth!.tenantId);
  ok(res, present((await queryOne(`SELECT ${APP_SELECT} ${APP_FROM} WHERE a.id = ?`, [a.id]))!));
}));
r.put('/applicants/:id/documents/:docId', requirePermission('ppdb:verify'), validate(z.object({ status: z.enum(['UPLOADED', 'VALID', 'INVALID']), note: z.string().max(255).nullable().optional() })), wrap(async (req, res) => {
  await mustGet('ppdb_applicants', req.params.id, req.auth!.tenantId);
  await execute(`UPDATE \`${T('ppdb_documents')}\` SET status = ?, note = ? WHERE id = ? AND applicant_id = ?`, [req.body.status, req.body.note ?? null, req.params.docId, req.params.id]);
  ok(res, { saved: true });
}));
/** Status transitions: SUBMITTED → VERIFIED/REJECTED → ACCEPTED/WAITLIST/REJECTED → ENROLLED */
r.post('/applicants/:id/status', requirePermission('ppdb:verify'), validate(z.object({ status: z.enum(['VERIFIED', 'REJECTED', 'ACCEPTED', 'WAITLIST', 'WITHDRAWN']), note: z.string().max(255).nullable().optional(), accepted_major_id: z.string().nullable().optional(), score: z.number().nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await mustGet('ppdb_applicants', req.params.id, u.tenantId);
  await execute(`UPDATE \`${T('ppdb_applicants')}\` SET status = ?, verification_note = ?, verified_by = ?, verified_at = NOW(), accepted_major_id = COALESCE(?, accepted_major_id, major_choice_1), score = COALESCE(?, score) WHERE id = ?`, [req.body.status, req.body.note ?? null, u.id, req.body.accepted_major_id ?? null, req.body.score ?? null, a.id]);
  if (a.email) await sendMail(String(a.email), `Status PPDB: ${req.body.status}`, `Halo ${a.full_name},\n\nStatus pendaftaran ${a.registration_no}: ${req.body.status}.${req.body.note ? `\nCatatan: ${req.body.note}` : ''}`);
  if (a.user_id) await notify({ tenantId: u.tenantId, userIds: [String(a.user_id)], type: 'PPDB', title: `Status PPDB: ${req.body.status}`, body: req.body.note ?? undefined, link: '/calon/ppdb' });
  await audit(req, 'ppdb.status', 'ppdb_applicants', String(a.id), undefined, req.body);
  ok(res, { status: req.body.status });
}));
/** Bulk selection by score: top N per major → ACCEPTED, rest WAITLIST. */
r.post('/periods/:id/select', requirePermission('ppdb:verify'), validate(z.object({ quotas: z.record(z.number().int().min(0)).optional(), default_quota: z.number().int().min(0).optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const p = await mustGet('ppdb_periods', req.params.id, u.tenantId);
  const rows = await query(`SELECT id, major_choice_1, score FROM \`${T('ppdb_applicants')}\` WHERE period_id = ? AND status IN ('VERIFIED','ACCEPTED','WAITLIST') ORDER BY score DESC, created_at ASC`, [p.id]);
  const counts: Record<string, number> = {};
  let accepted = 0; let waitlist = 0;
  await withTransaction(async (conn) => {
    for (const a of rows) {
      const key = String(a.major_choice_1 ?? '-');
      const quota = req.body.quotas?.[key] ?? req.body.default_quota ?? Number(p.quota);
      counts[key] = (counts[key] ?? 0);
      const st = counts[key] < quota ? 'ACCEPTED' : 'WAITLIST';
      if (st === 'ACCEPTED') { counts[key]++; accepted++; } else waitlist++;
      await execute(`UPDATE \`${T('ppdb_applicants')}\` SET status = ?, accepted_major_id = COALESCE(accepted_major_id, major_choice_1) WHERE id = ?`, [st, a.id], conn);
    }
  });
  await audit(req, 'ppdb.select', 'ppdb_periods', String(p.id), undefined, { accepted, waitlist });
  ok(res, { accepted, waitlist });
}));
/** Enroll accepted applicants: create SISWA account (+ optional class), link applicant. */
r.post('/applicants/enroll', requirePermission('ppdb:enroll'), validate(z.object({ applicant_ids: z.array(z.string()).min(1), class_id: z.string().nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const out: { applicant_id: string; username: string; temporary_password: string }[] = [];
  const errors: { applicant_id: string; message: string }[] = [];
  for (const aid of req.body.applicant_ids) {
    try {
      const a = await mustGet('ppdb_applicants', aid, u.tenantId);
      if (a.status !== 'ACCEPTED') throw badRequest('Belum berstatus diterima');
      if (a.enrolled_user_id) throw conflict('Sudah punya akun');
      const base = slugify(String(a.full_name)).replace(/-/g, '.').slice(0, 20) || 'siswa';
      let username = base; let n = 1;
      while (await queryOne(`SELECT id FROM \`${T('users')}\` WHERE username = ?`, [username])) username = `${base}${++n}`;
      const pwd = randomPassword();
      const uid = newId();
      await withTransaction(async (conn) => {
        await insertRow('users', { id: uid, tenant_id: u.tenantId, username, email: a.email ?? null, phone: a.phone ?? null, gender: a.gender ?? null, password_hash: await hashPassword(pwd), full_name: a.full_name, must_change_password: 1 }, conn);
        await insertRow('user_roles', { id: newId(), tenant_id: u.tenantId, user_id: uid, role: 'SISWA' }, conn);
        await ensureProfiles(uid, u.tenantId, ['SISWA'], conn);
        await execute(`UPDATE \`${T('student_profiles')}\` SET nisn = ?, nik = ?, birth_place = ?, birth_date = ?, address = ?, parent_name = ?, parent_phone = ?, entry_year = YEAR(CURDATE()), major_id = ? WHERE user_id = ?`, [a.nisn, a.nik, a.birth_place, a.birth_date, a.address, a.parent_name, a.parent_phone, a.accepted_major_id ?? a.major_choice_1, uid], conn);
        if (req.body.class_id) await execute(`INSERT INTO \`${T('class_students')}\` (id, tenant_id, class_id, student_id, status, joined_at) VALUES (?,?,?,?,'AKTIF',CURDATE())`, [newId(), u.tenantId, req.body.class_id, uid], conn);
        await execute(`UPDATE \`${T('ppdb_applicants')}\` SET status = 'ENROLLED', enrolled_user_id = ?, enrolled_class_id = ? WHERE id = ?`, [uid, req.body.class_id ?? null, a.id], conn);
      });
      if (a.email) await sendMail(String(a.email), 'Akun SINAU Anda', `Selamat, Anda resmi terdaftar.\nNama pengguna: ${username}\nKata sandi sementara: ${pwd}\nSilakan masuk dan ganti kata sandi.`);
      out.push({ applicant_id: aid, username, temporary_password: pwd });
    } catch (e) { errors.push({ applicant_id: aid, message: e instanceof Error ? e.message : String(e) }); }
  }
  await audit(req, 'ppdb.enroll', 'ppdb_applicants', undefined, undefined, { count: out.length });
  ok(res, { enrolled: out, errors });
}));
r.get('/summary', requirePermission('ppdb:read'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const pid = str(req.query.period_id);
  const params: unknown[] = [tid]; let where = 'WHERE a.tenant_id = ?'; if (pid) { where += ' AND a.period_id = ?'; params.push(pid); }
  ok(res, { by_status: await query(`SELECT a.status, COUNT(*) AS c FROM \`${T('ppdb_applicants')}\` a ${where} GROUP BY a.status`, params), by_major: await query(`SELECT m.name, COUNT(*) AS c, SUM(a.status IN ('ACCEPTED','ENROLLED')) AS accepted FROM \`${T('ppdb_applicants')}\` a LEFT JOIN \`${T('majors')}\` m ON m.id = a.major_choice_1 ${where} GROUP BY m.name`, params), by_path: await query(`SELECT a.path, COUNT(*) AS c FROM \`${T('ppdb_applicants')}\` a ${where} GROUP BY a.path`, params), by_day: await query(`SELECT DATE(a.created_at) AS d, COUNT(*) AS c FROM \`${T('ppdb_applicants')}\` a ${where} GROUP BY DATE(a.created_at) ORDER BY d`, params) });
}));

export default r;
