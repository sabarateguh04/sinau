import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { T } from '../../config';
import { query, queryOne, execute } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit, notify, fileUrl } from '../../core/services';
import { newId, sha256, randomToken } from '../../core/ids';
import { insertRow } from '../../core/crud';
import { assertClass, assertClassSubject, assertStudentAccess, classScope, isTenantWide, childrenOf } from '../../core/scope';
import { hasRole } from '../../core/auth';

const r = Router();
const STATUS = z.enum(['H', 'S', 'I', 'A', 'T']); // hadir, sakit, izin, alpa, terlambat

// ---------- Absensi harian per kelas (wali kelas / admin) ----------
r.get('/daily', requirePermission('attendance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const classId = str(req.query.class_id);
  const date = str(req.query.date) ?? new Date().toISOString().slice(0, 10);
  if (!classId) throw badRequest('class_id wajib');
  await assertClass(u, classId);
  const rows = await query(`SELECT st.id AS student_id, st.full_name, st.avatar_url, sp.nis, ad.status, ad.note, ad.recorded_by
    FROM \`${T('class_students')}\` e JOIN \`${T('users')}\` st ON st.id = e.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id
    LEFT JOIN \`${T('attendance_daily')}\` ad ON ad.class_id = e.class_id AND ad.student_id = st.id AND ad.date = ?
    WHERE e.class_id = ? AND e.status = 'AKTIF' ORDER BY st.full_name`, [date, classId]);
  ok(res, { date, class_id: classId, students: rows });
}));
r.post('/daily', requirePermission('attendance:write'), validate(z.object({ class_id: z.string(), date: z.string().max(10), records: z.array(z.object({ student_id: z.string(), status: STATUS, note: z.string().max(255).nullable().optional() })).min(1) })), wrap(async (req, res) => {
  const u = req.auth!;
  await assertClass(u, req.body.class_id, { manage: true });
  const values: unknown[] = [];
  const marks = req.body.records.map((x: { student_id: string; status: string; note?: string | null }) => { values.push(newId(), u.tenantId, req.body.class_id, x.student_id, req.body.date, x.status, x.note ?? null, u.id); return '(?,?,?,?,?,?,?,?)'; });
  await execute(`INSERT INTO \`${T('attendance_daily')}\` (id, tenant_id, class_id, student_id, date, status, note, recorded_by) VALUES ${marks.join(',')} ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), recorded_by = VALUES(recorded_by)`, values);
  const absent = req.body.records.filter((x: { status: string }) => x.status === 'A');
  if (absent.length) {
    const guardians = await query(`SELECT guardian_user_id, student_id FROM \`${T('guardian_students')}\` WHERE student_id IN (${absent.map(() => '?').join(',')})`, absent.map((x: { student_id: string }) => x.student_id));
    for (const g of guardians) await notify({ tenantId: u.tenantId, userIds: [String(g.guardian_user_id)], type: 'ATTENDANCE', title: 'Anak Anda tercatat tidak hadir (alpa)', body: `Tanggal ${req.body.date}`, link: '/ortu/absensi' });
  }
  await audit(req, 'attendance.daily', 'attendance_daily', req.body.class_id, undefined, { date: req.body.date, count: req.body.records.length });
  ok(res, { saved: req.body.records.length });
}));

// ---------- Sesi per pertemuan mapel (guru) ----------
r.get('/sessions', requirePermission('attendance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [u.tenantId];
  let where = 'WHERE s.tenant_id = ?';
  const csId = str(req.query.class_subject_id);
  if (csId) { await assertClassSubject(u, csId); where += ' AND s.class_subject_id = ?'; params.push(csId); }
  else if (!isTenantWide(u)) { where += ' AND (cs.teacher_id = ? OR c.homeroom_teacher_id = ?)'; params.push(u.id, u.id); }
  if (str(req.query.date)) { where += ' AND s.date = ?'; params.push(String(req.query.date)); }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('attendance_sessions')}\` s JOIN \`${T('class_subjects')}\` cs ON cs.id = s.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT s.*, c.name AS class_name, sb.name AS subject_name, (SELECT COUNT(*) FROM \`${T('attendance_records')}\` ar WHERE ar.session_id = s.id AND ar.status = 'H') AS present_count, (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = cs.class_id AND e.status = 'AKTIF') AS student_count
    FROM \`${T('attendance_sessions')}\` s JOIN \`${T('class_subjects')}\` cs ON cs.id = s.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` sb ON sb.id = cs.subject_id ${where} ORDER BY s.date DESC, s.meeting_no DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paged(res, rows, { page, limit, total });
}));

r.post('/sessions', requirePermission('attendance:write'), validate(z.object({ class_subject_id: z.string(), date: z.string().max(10), meeting_no: z.number().int().min(1).optional(), topic: z.string().max(200).nullable().optional(), method: z.enum(['MANUAL', 'QR']).optional(), geo_lat: z.number().nullable().optional(), geo_lng: z.number().nullable().optional(), geo_radius_m: z.number().int().min(10).max(5000).nullable().optional(), records: z.array(z.object({ student_id: z.string(), status: STATUS, note: z.string().max(255).nullable().optional() })).optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  await assertClassSubject(u, req.body.class_subject_id, { teach: true });
  const id = newId();
  const { records, ...rest } = req.body;
  const last = await queryOne(`SELECT MAX(meeting_no) AS m FROM \`${T('attendance_sessions')}\` WHERE class_subject_id = ?`, [rest.class_subject_id]);
  await insertRow('attendance_sessions', { id, tenant_id: u.tenantId, ...rest, meeting_no: rest.meeting_no ?? Number(last?.m ?? 0) + 1, qr_secret: rest.method === 'QR' ? randomToken(16) : null, opened_at: rest.method === 'QR' ? new Date() : null, created_by: u.id });
  if (records?.length) await saveRecords(u.tenantId, id, records, u.id, 'MANUAL');
  await audit(req, 'attendance.session_create', 'attendance_sessions', id, undefined, rest);
  ok(res, await sessionView(id), 201);
}));

async function saveRecords(tenantId: string, sessionId: string, records: { student_id: string; status: string; note?: string | null }[], by: string | null, method: string) {
  const values: unknown[] = [];
  const marks = records.map((x) => { values.push(newId(), tenantId, sessionId, x.student_id, x.status, new Date(), method, x.note ?? null, by); return '(?,?,?,?,?,?,?,?,?)'; });
  await execute(`INSERT INTO \`${T('attendance_records')}\` (id, tenant_id, session_id, student_id, status, checked_at, method, note, recorded_by) VALUES ${marks.join(',')} ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), recorded_by = VALUES(recorded_by), checked_at = VALUES(checked_at), method = VALUES(method)`, values);
}
async function sessionView(id: string) {
  const s = await queryOne(`SELECT s.*, c.name AS class_name, c.id AS class_id, sb.name AS subject_name FROM \`${T('attendance_sessions')}\` s JOIN \`${T('class_subjects')}\` cs ON cs.id = s.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` sb ON sb.id = cs.subject_id WHERE s.id = ?`, [id]);
  if (!s) throw notFound();
  const students = await query(`SELECT st.id AS student_id, st.full_name, st.avatar_url, sp.nis, ar.status, ar.checked_at, ar.method, ar.note
    FROM \`${T('class_students')}\` e JOIN \`${T('users')}\` st ON st.id = e.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id LEFT JOIN \`${T('attendance_records')}\` ar ON ar.session_id = ? AND ar.student_id = st.id
    WHERE e.class_id = ? AND e.status = 'AKTIF' ORDER BY st.full_name`, [id, s.class_id]);
  const { qr_secret, ...rest } = s;
  return { ...rest, qr_active: !!qr_secret && !s.closed_at, students };
}

r.get('/sessions/:id', requirePermission('attendance:read'), wrap(async (req, res) => {
  const s = await queryOne(`SELECT class_subject_id FROM \`${T('attendance_sessions')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, req.auth!.tenantId]);
  if (!s) throw notFound();
  await assertClassSubject(req.auth!, String(s.class_subject_id));
  ok(res, await sessionView(req.params.id));
}));
r.put('/sessions/:id', requirePermission('attendance:write'), validate(z.object({ topic: z.string().max(200).nullable().optional(), records: z.array(z.object({ student_id: z.string(), status: STATUS, note: z.string().max(255).nullable().optional() })).optional(), close: z.boolean().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await queryOne(`SELECT * FROM \`${T('attendance_sessions')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!s) throw notFound();
  await assertClassSubject(u, String(s.class_subject_id), { teach: true });
  if (req.body.topic !== undefined) await execute(`UPDATE \`${T('attendance_sessions')}\` SET topic = ? WHERE id = ?`, [req.body.topic, s.id]);
  if (req.body.records?.length) await saveRecords(u.tenantId, String(s.id), req.body.records, u.id, 'MANUAL');
  if (req.body.close) await execute(`UPDATE \`${T('attendance_sessions')}\` SET closed_at = NOW() WHERE id = ?`, [s.id]);
  await audit(req, 'attendance.session_update', 'attendance_sessions', String(s.id));
  ok(res, await sessionView(String(s.id)));
}));
r.delete('/sessions/:id', requirePermission('attendance:write'), wrap(async (req, res) => {
  const s = await queryOne(`SELECT * FROM \`${T('attendance_sessions')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, req.auth!.tenantId]);
  if (!s) throw notFound();
  await assertClassSubject(req.auth!, String(s.class_subject_id), { teach: true });
  await execute(`DELETE FROM \`${T('attendance_sessions')}\` WHERE id = ?`, [s.id]);
  ok(res, { deleted: true });
}));

// ---------- QR ----------
/** Teacher: a fresh single-use token (rotates every call, expires in 60s) as PNG data URL. */
r.get('/sessions/:id/qr', requirePermission('attendance:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await queryOne(`SELECT * FROM \`${T('attendance_sessions')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!s) throw notFound();
  await assertClassSubject(u, String(s.class_subject_id), { teach: true });
  if (s.closed_at) throw badRequest('Sesi sudah ditutup');
  const token = randomToken(12);
  await insertRow('attendance_qr_tokens', { id: newId(), session_id: s.id, token_hash: sha256(token), expires_at: new Date(Date.now() + 60_000) });
  const payload = JSON.stringify({ s: s.id, t: token });
  const png = await QRCode.toDataURL(payload, { width: 360, margin: 1 });
  ok(res, { qr: png, payload, expires_in: 60 });
}));
/** Student: scan → check-in (token single-use; optional geofence). */
r.post('/checkin', requirePermission('attendance:self'), validate(z.object({ s: z.string(), t: z.string(), lat: z.number().optional(), lng: z.number().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await queryOne(`SELECT s.*, cs.class_id FROM \`${T('attendance_sessions')}\` s JOIN \`${T('class_subjects')}\` cs ON cs.id = s.class_subject_id WHERE s.id = ? AND s.tenant_id = ?`, [req.body.s, u.tenantId]);
  if (!s || s.closed_at) throw badRequest('Sesi tidak aktif');
  const enrolled = await queryOne(`SELECT 1 AS x FROM \`${T('class_students')}\` WHERE class_id = ? AND student_id = ? AND status = 'AKTIF'`, [s.class_id, u.id]);
  if (!enrolled) throw forbidden('Anda bukan anggota kelas ini');
  const tok = await queryOne(`SELECT * FROM \`${T('attendance_qr_tokens')}\` WHERE token_hash = ? AND session_id = ? AND used_at IS NULL AND expires_at > NOW()`, [sha256(req.body.t), s.id]);
  if (!tok) throw badRequest('QR kedaluwarsa, minta guru menampilkan QR baru');
  if (s.geo_lat && s.geo_lng && s.geo_radius_m) {
    if (req.body.lat === undefined || req.body.lng === undefined) throw badRequest('Lokasi wajib untuk sesi ini');
    const d = haversine(Number(s.geo_lat), Number(s.geo_lng), req.body.lat, req.body.lng);
    if (d > Number(s.geo_radius_m)) throw badRequest(`Anda berada ${Math.round(d)} m dari lokasi (maks ${s.geo_radius_m} m)`);
  }
  await execute(`UPDATE \`${T('attendance_qr_tokens')}\` SET used_by = ?, used_at = NOW() WHERE id = ?`, [u.id, tok.id]);
  await execute(`INSERT INTO \`${T('attendance_records')}\` (id, tenant_id, session_id, student_id, status, checked_at, method, lat, lng) VALUES (?,?,?,?,'H',NOW(),'QR',?,?) ON DUPLICATE KEY UPDATE status = 'H', checked_at = NOW(), method = 'QR', lat = VALUES(lat), lng = VALUES(lng)`, [newId(), u.tenantId, s.id, u.id, req.body.lat ?? null, req.body.lng ?? null]);
  ok(res, { checked_in: true, session: { id: s.id, topic: s.topic, date: s.date } });
}));
const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => { const R = 6371000; const toR = (x: number) => (x * Math.PI) / 180; const dLat = toR(lat2 - lat1); const dLon = toR(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };

// ---------- Rekap ----------
r.get('/recap/student/:studentId', requirePermission('attendance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const sid = req.params.studentId === 'me' ? u.id : req.params.studentId;
  await assertStudentAccess(u, sid);
  const month = str(req.query.month); // YYYY-MM
  const params: unknown[] = [sid];
  let extra = '';
  if (month) { extra = ' AND DATE_FORMAT(date, "%Y-%m") = ?'; params.push(month); }
  const daily = await query(`SELECT date, status, note FROM \`${T('attendance_daily')}\` WHERE student_id = ?${extra} ORDER BY date DESC LIMIT 400`, params);
  const summary = await queryOne(`SELECT SUM(status='H') AS H, SUM(status='S') AS S, SUM(status='I') AS I, SUM(status='A') AS A, SUM(status='T') AS T, COUNT(*) AS total FROM \`${T('attendance_daily')}\` WHERE student_id = ?${extra}`, params);
  const sessions = await query(`SELECT ar.status, ar.checked_at, s.date, s.topic, sb.name AS subject_name FROM \`${T('attendance_records')}\` ar JOIN \`${T('attendance_sessions')}\` s ON s.id = ar.session_id JOIN \`${T('class_subjects')}\` cs ON cs.id = s.class_subject_id JOIN \`${T('subjects')}\` sb ON sb.id = cs.subject_id WHERE ar.student_id = ?${month ? ' AND DATE_FORMAT(s.date, "%Y-%m") = ?' : ''} ORDER BY s.date DESC LIMIT 300`, params);
  ok(res, { summary, daily, sessions });
}));
r.get('/recap/class/:classId', requirePermission('attendance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const cls = await assertClass(u, req.params.classId);
  const month = str(req.query.month) ?? new Date().toISOString().slice(0, 7);
  const rows = await query(`SELECT st.id AS student_id, st.full_name, sp.nis, SUM(ad.status='H') AS H, SUM(ad.status='S') AS S, SUM(ad.status='I') AS I, SUM(ad.status='A') AS A, SUM(ad.status='T') AS T, COUNT(ad.id) AS total
    FROM \`${T('class_students')}\` e JOIN \`${T('users')}\` st ON st.id = e.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id
    LEFT JOIN \`${T('attendance_daily')}\` ad ON ad.class_id = e.class_id AND ad.student_id = st.id AND DATE_FORMAT(ad.date, '%Y-%m') = ?
    WHERE e.class_id = ? AND e.status = 'AKTIF' GROUP BY st.id, st.full_name, sp.nis ORDER BY st.full_name`, [month, cls.id]);
  const days = await query(`SELECT DISTINCT date FROM \`${T('attendance_daily')}\` WHERE class_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? ORDER BY date`, [cls.id, month]);
  const matrix = await query(`SELECT student_id, date, status FROM \`${T('attendance_daily')}\` WHERE class_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`, [cls.id, month]);
  ok(res, { class: cls, month, students: rows, days: days.map((d) => d.date), matrix });
}));
/** Tenant-wide discipline dashboard: absence rate per class this month. */
r.get('/recap/school', requirePermission('attendance:read', 'report:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const month = str(req.query.month) ?? new Date().toISOString().slice(0, 7);
  const sc = classScope(u);
  const rows = await query(`SELECT c.id, c.name, COUNT(ad.id) AS total, SUM(ad.status='H') AS H, SUM(ad.status='A') AS A, SUM(ad.status='S') AS S, SUM(ad.status='I') AS I, SUM(ad.status='T') AS T
    FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id AND ay.is_active = 1 LEFT JOIN \`${T('attendance_daily')}\` ad ON ad.class_id = c.id AND DATE_FORMAT(ad.date, '%Y-%m') = ?
    WHERE c.tenant_id = ? AND c.is_active = 1 AND ${sc.sql} GROUP BY c.id, c.name ORDER BY c.name`, [month, u.tenantId, ...sc.params]);
  ok(res, { month, classes: rows.map((x) => ({ ...x, present_rate: Number(x.total) ? Math.round((Number(x.H) / Number(x.total)) * 1000) / 10 : null })) });
}));

// ---------- Izin / sakit ----------
r.get('/permits', requirePermission('attendance:read', 'attendance:permit_submit'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [u.tenantId];
  let where = 'WHERE p.tenant_id = ?';
  if (hasRole(u, 'SISWA') && !isTenantWide(u)) { where += ' AND p.student_id = ?'; params.push(u.id); }
  else if (hasRole(u, 'WALI_MURID') && !isTenantWide(u)) { const kids = await childrenOf(u.id); if (!kids.length) return paged(res, [], { page, limit, total: 0 }); where += ` AND p.student_id IN (${kids.map(() => '?').join(',')})`; params.push(...kids); }
  else if (!isTenantWide(u)) { const sc = classScope(u); where += ` AND EXISTS (SELECT 1 FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id WHERE e.student_id = p.student_id AND e.status = 'AKTIF' AND ${sc.sql})`; params.push(...sc.params); }
  if (str(req.query.status)) { where += ' AND p.status = ?'; params.push(String(req.query.status)); }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('permits')}\` p ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT p.*, st.full_name AS student_name, rv.full_name AS reviewer_name, (SELECT c.name FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id WHERE e.student_id = p.student_id AND e.status = 'AKTIF' LIMIT 1) AS class_name
    FROM \`${T('permits')}\` p JOIN \`${T('users')}\` st ON st.id = p.student_id LEFT JOIN \`${T('users')}\` rv ON rv.id = p.reviewed_by ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paged(res, rows.map((x) => ({ ...x, attachment_url: fileUrl(x.attachment_file_id) })), { page, limit, total });
}));
r.post('/permits', requirePermission('attendance:permit_submit'), validate(z.object({ student_id: z.string().optional(), type: z.enum(['SAKIT', 'IZIN']), date_from: z.string().max(10), date_to: z.string().max(10), reason: z.string().min(3).max(2000), attachment_file_id: z.string().nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const sid = hasRole(u, 'SISWA') ? u.id : req.body.student_id;
  if (!sid) throw badRequest('student_id wajib');
  await assertStudentAccess(u, sid);
  const id = newId();
  await insertRow('permits', { id, tenant_id: u.tenantId, student_id: sid, type: req.body.type, date_from: req.body.date_from, date_to: req.body.date_to, reason: req.body.reason, attachment_file_id: req.body.attachment_file_id ?? null, submitted_by: u.id });
  const cls = await queryOne(`SELECT c.homeroom_teacher_id FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id WHERE e.student_id = ? AND e.status = 'AKTIF' LIMIT 1`, [sid]);
  if (cls?.homeroom_teacher_id) await notify({ tenantId: u.tenantId, userIds: [String(cls.homeroom_teacher_id)], type: 'PERMIT', title: 'Pengajuan izin/sakit baru', body: `${req.body.type} ${req.body.date_from} s.d. ${req.body.date_to}`, link: '/guru/absensi/izin' });
  await audit(req, 'attendance.permit_submit', 'permits', id);
  ok(res, { id }, 201);
}));
r.post('/permits/:id/review', requirePermission('attendance:permit_review'), validate(z.object({ status: z.enum(['APPROVED', 'REJECTED']), note: z.string().max(255).nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const p = await queryOne(`SELECT * FROM \`${T('permits')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!p) throw notFound();
  await assertStudentAccess(u, String(p.student_id));
  await execute(`UPDATE \`${T('permits')}\` SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?`, [req.body.status, u.id, req.body.note ?? null, p.id]);
  if (req.body.status === 'APPROVED') {
    // Fill daily attendance for the range with S/I.
    const cls = await queryOne(`SELECT class_id FROM \`${T('class_students')}\` WHERE student_id = ? AND status = 'AKTIF' LIMIT 1`, [p.student_id]);
    if (cls) {
      const status = p.type === 'SAKIT' ? 'S' : 'I';
      const from = new Date(p.date_from); const to = new Date(p.date_to);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0) continue;
        await execute(`INSERT INTO \`${T('attendance_daily')}\` (id, tenant_id, class_id, student_id, date, status, note, recorded_by) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note)`, [newId(), u.tenantId, cls.class_id, p.student_id, d.toISOString().slice(0, 10), status, `Izin disetujui: ${String(p.reason).slice(0, 200)}`, u.id]);
      }
    }
  }
  await notify({ tenantId: u.tenantId, userIds: [String(p.student_id), ...(p.submitted_by && p.submitted_by !== p.student_id ? [String(p.submitted_by)] : [])], type: 'PERMIT', title: `Pengajuan ${p.type} ${req.body.status === 'APPROVED' ? 'disetujui' : 'ditolak'}`, body: req.body.note ?? undefined });
  await audit(req, 'attendance.permit_review', 'permits', String(p.id), undefined, req.body);
  ok(res, { reviewed: true });
}));

// ---------- Absensi staf ----------
r.post('/staff/checkin', requirePermission('attendance:self'), validate(z.object({ type: z.enum(['IN', 'OUT']), note: z.string().max(255).nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  if (hasRole(u, 'SISWA')) throw forbidden();
  const today = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 8);
  if (req.body.type === 'IN') await execute(`INSERT INTO \`${T('staff_attendance')}\` (id, tenant_id, user_id, date, check_in, status, note) VALUES (?,?,?,?,?,'HADIR',?) ON DUPLICATE KEY UPDATE check_in = COALESCE(check_in, VALUES(check_in))`, [newId(), u.tenantId, u.id, today, time, req.body.note ?? null]);
  else await execute(`INSERT INTO \`${T('staff_attendance')}\` (id, tenant_id, user_id, date, check_out, status) VALUES (?,?,?,?,?,'HADIR') ON DUPLICATE KEY UPDATE check_out = VALUES(check_out)`, [newId(), u.tenantId, u.id, today, time]);
  ok(res, await queryOne(`SELECT * FROM \`${T('staff_attendance')}\` WHERE user_id = ? AND date = ?`, [u.id, today]));
}));
r.get('/staff', requirePermission('attendance:read', 'attendance:self'), wrap(async (req, res) => {
  const u = req.auth!;
  const month = str(req.query.month) ?? new Date().toISOString().slice(0, 7);
  const mine = !isTenantWide(u) || req.query.mine === '1';
  const params: unknown[] = [u.tenantId, month];
  let where = "WHERE sa.tenant_id = ? AND DATE_FORMAT(sa.date, '%Y-%m') = ?";
  if (mine) { where += ' AND sa.user_id = ?'; params.push(u.id); }
  if (str(req.query.user_id)) { where += ' AND sa.user_id = ?'; params.push(String(req.query.user_id)); }
  ok(res, await query(`SELECT sa.*, us.full_name FROM \`${T('staff_attendance')}\` sa JOIN \`${T('users')}\` us ON us.id = sa.user_id ${where} ORDER BY sa.date DESC, us.full_name LIMIT 1000`, params));
}));
r.post('/staff', requirePermission('attendance:write'), validate(z.object({ records: z.array(z.object({ user_id: z.string(), date: z.string().max(10), status: z.enum(['HADIR', 'SAKIT', 'IZIN', 'ALPA', 'CUTI', 'DINAS']), note: z.string().max(255).nullable().optional() })).min(1) })), wrap(async (req, res) => {
  const u = req.auth!;
  if (!isTenantWide(u)) throw forbidden();
  for (const x of req.body.records) await execute(`INSERT INTO \`${T('staff_attendance')}\` (id, tenant_id, user_id, date, status, note, recorded_by) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), recorded_by = VALUES(recorded_by)`, [newId(), u.tenantId, x.user_id, x.date, x.status, x.note ?? null, u.id]);
  ok(res, { saved: req.body.records.length });
}));

export default r;
