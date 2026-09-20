import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok, str } from '../../core/http';
import { notFound, badRequest, conflict } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit, notify } from '../../core/services';
import { newId } from '../../core/ids';
import { crudRouter, insertRow, mustGet } from '../../core/crud';

const r = Router();
const READ = ['academic:read'];
const WRITE = ['academic:write'];

// ---------- Tahun ajaran ----------
const yearSchema = z.object({ name: z.string().regex(/^\d{4}\/\d{4}$/, 'Format 2026/2027'), start_date: z.string().max(10).nullable().optional(), end_date: z.string().max(10).nullable().optional(), is_active: z.boolean().optional(), active_semester: z.number().int().min(1).max(2).optional() });
r.use('/years', crudRouter({
  table: 'academic_years', searchable: ['t.name'], sortable: ['name', 'created_at'], defaultSort: 'name', perms: { read: READ, write: WRITE },
  createSchema: yearSchema, updateSchema: yearSchema.partial(), entityName: 'academic_year',
  beforeCreate: async (row, req, exec) => { if (row.is_active) await execute(`UPDATE \`${T('academic_years')}\` SET is_active = 0 WHERE tenant_id = ?`, [req.auth!.tenantId], exec); },
  beforeUpdate: async (id, row, req, exec) => { if (row.is_active) await execute(`UPDATE \`${T('academic_years')}\` SET is_active = 0 WHERE tenant_id = ? AND id <> ?`, [req.auth!.tenantId, id], exec); },
}));
r.post('/years/:id/activate', requirePermission(...WRITE), wrap(async (req, res) => {
  const y = await mustGet('academic_years', req.params.id, req.auth!.tenantId);
  await execute(`UPDATE \`${T('academic_years')}\` SET is_active = IF(id = ?, 1, 0) WHERE tenant_id = ?`, [y.id, req.auth!.tenantId]);
  await audit(req, 'academic_year.activate', 'academic_years', String(y.id));
  ok(res, { activated: true });
}));
r.get('/years/active/current', wrap(async (req, res) => ok(res, await queryOne(`SELECT * FROM \`${T('academic_years')}\` WHERE tenant_id = ? AND is_active = 1`, [req.auth!.tenantId]))));

// ---------- Jurusan, mapel, ruang ----------
r.use('/majors', crudRouter({
  table: 'majors', searchable: ['t.code', 't.name'], sortable: ['code', 'name'], defaultSort: 'code', defaultOrder: 'ASC', perms: { read: READ, write: WRITE },
  select: `h.full_name AS head_name, (SELECT COUNT(*) FROM \`${T('classes')}\` c WHERE c.major_id = t.id AND c.is_active = 1) AS class_count`, joins: `LEFT JOIN \`${T('users')}\` h ON h.id = t.head_user_id`,
  filters: [{ param: 'is_active', column: 't.is_active', op: 'BOOL' }],
  createSchema: z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(120), description: z.string().max(2000).nullable().optional(), head_user_id: z.string().nullable().optional(), is_active: z.boolean().optional() }),
  updateSchema: z.object({ code: z.string().min(1).max(20).optional(), name: z.string().min(2).max(120).optional(), description: z.string().max(2000).nullable().optional(), head_user_id: z.string().nullable().optional(), is_active: z.boolean().optional() }),
  afterCreate: async (row, req, exec) => { if (row.head_user_id) await execute(`INSERT IGNORE INTO \`${T('user_roles')}\` (id, tenant_id, user_id, role) VALUES (?,?,?,'KAPRODI')`, [newId(), req.auth!.tenantId, row.head_user_id], exec); },
  afterUpdate: async (_id, row, req, exec) => { if (row.head_user_id) await execute(`INSERT IGNORE INTO \`${T('user_roles')}\` (id, tenant_id, user_id, role) VALUES (?,?,?,'KAPRODI')`, [newId(), req.auth!.tenantId, row.head_user_id], exec); },
}));
const subjectSchema = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(120), category: z.enum(['UMUM', 'KEJURUAN', 'MULOK', 'P5', 'PILIHAN']).optional(), is_competency: z.boolean().optional(), hours_per_week: z.number().int().min(0).max(40).optional(), is_active: z.boolean().optional() });
r.use('/subjects', crudRouter({ table: 'subjects', searchable: ['t.code', 't.name'], sortable: ['code', 'name', 'category'], defaultSort: 'name', defaultOrder: 'ASC', perms: { read: READ, write: WRITE }, filters: [{ param: 'category', column: 't.category' }, { param: 'is_active', column: 't.is_active', op: 'BOOL' }], createSchema: subjectSchema, updateSchema: subjectSchema.partial() }));
const roomSchema = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(120), capacity: z.number().int().min(1).max(500).optional(), type: z.enum(['KELAS', 'LAB', 'BENGKEL', 'AULA', 'PERPUS', 'LAINNYA']).optional(), is_active: z.boolean().optional() });
r.use('/rooms', crudRouter({ table: 'rooms', searchable: ['t.code', 't.name'], sortable: ['code', 'name'], defaultSort: 'code', defaultOrder: 'ASC', perms: { read: READ, write: WRITE }, createSchema: roomSchema, updateSchema: roomSchema.partial() }));

// ---------- Kelas ----------
const classSchema = z.object({ academic_year_id: z.string(), name: z.string().min(1).max(60), grade_level: z.number().int().min(1).max(13), major_id: z.string().nullable().optional(), homeroom_teacher_id: z.string().nullable().optional(), room_id: z.string().nullable().optional(), capacity: z.number().int().min(1).max(200).optional(), is_active: z.boolean().optional() });
r.use('/classes', crudRouter({
  table: 'classes', searchable: ['t.name'], sortable: ['name', 'grade_level', 'created_at'], defaultSort: 'name', defaultOrder: 'ASC', perms: { read: READ, write: WRITE },
  select: `ay.name AS academic_year, ay.is_active AS year_active, m.code AS major_code, m.name AS major_name, h.full_name AS homeroom_name, rm.name AS room_name,
    (SELECT COUNT(*) FROM \`${T('class_students')}\` cs WHERE cs.class_id = t.id AND cs.status = 'AKTIF') AS student_count,
    (SELECT COUNT(*) FROM \`${T('class_subjects')}\` x WHERE x.class_id = t.id) AS subject_count`,
  joins: `JOIN \`${T('academic_years')}\` ay ON ay.id = t.academic_year_id LEFT JOIN \`${T('majors')}\` m ON m.id = t.major_id LEFT JOIN \`${T('users')}\` h ON h.id = t.homeroom_teacher_id LEFT JOIN \`${T('rooms')}\` rm ON rm.id = t.room_id`,
  filters: [{ param: 'academic_year_id', column: 't.academic_year_id' }, { param: 'major_id', column: 't.major_id' }, { param: 'grade_level', column: 't.grade_level' }, { param: 'is_active', column: 't.is_active', op: 'BOOL' }, { param: 'active_year', column: 'ay.is_active', op: 'BOOL' }, { param: 'homeroom_teacher_id', column: 't.homeroom_teacher_id' }],
  createSchema: classSchema, updateSchema: classSchema.partial(), entityName: 'class',
}));

r.get('/classes/:id/students', requirePermission('enrollment:read', 'academic:read'), wrap(async (req, res) => {
  await mustGet('classes', req.params.id, req.auth!.tenantId);
  const rows = await query(`SELECT cs.id AS enrollment_id, cs.status, cs.joined_at, u.id, u.full_name, u.username, u.gender, u.avatar_url, u.email, u.phone, sp.nis, sp.nisn, sp.parent_name, sp.parent_phone
    FROM \`${T('class_students')}\` cs JOIN \`${T('users')}\` u ON u.id = cs.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = u.id
    WHERE cs.class_id = ? AND u.deleted_at IS NULL ${req.query.all === '1' ? '' : "AND cs.status = 'AKTIF'"} ORDER BY u.full_name`, [req.params.id]);
  ok(res, rows);
}));
r.post('/classes/:id/students', requirePermission('enrollment:write'), validate(z.object({ student_ids: z.array(z.string()).min(1) })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const cls = await mustGet('classes', req.params.id, tid);
  const year = await queryOne(`SELECT id FROM \`${T('academic_years')}\` WHERE id = ?`, [cls.academic_year_id]);
  let added = 0;
  await withTransaction(async (conn) => {
    for (const sid of req.body.student_ids as string[]) {
      const u = await queryOne(`SELECT u.id FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id AND r.role = 'SISWA' WHERE u.id = ? AND u.tenant_id = ?`, [sid, tid], conn);
      if (!u) continue;
      // one active class per academic year
      await execute(`UPDATE \`${T('class_students')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id SET cs.status = 'PINDAH', cs.left_at = CURDATE() WHERE cs.student_id = ? AND cs.status = 'AKTIF' AND c.academic_year_id = ? AND cs.class_id <> ?`, [sid, year?.id, cls.id], conn);
      const res2 = await execute(`INSERT INTO \`${T('class_students')}\` (id, tenant_id, class_id, student_id, status, joined_at) VALUES (?,?,?,?,'AKTIF',CURDATE()) ON DUPLICATE KEY UPDATE status = 'AKTIF', left_at = NULL`, [newId(), tid, cls.id, sid], conn);
      if (res2.affectedRows) added++;
    }
  });
  await audit(req, 'class.add_students', 'classes', String(cls.id), undefined, { count: added });
  ok(res, { added });
}));
r.delete('/classes/:id/students/:studentId', requirePermission('enrollment:write'), wrap(async (req, res) => {
  await mustGet('classes', req.params.id, req.auth!.tenantId);
  await execute(`UPDATE \`${T('class_students')}\` SET status = 'KELUAR', left_at = CURDATE() WHERE class_id = ? AND student_id = ?`, [req.params.id, req.params.studentId]);
  await audit(req, 'class.remove_student', 'classes', req.params.id, undefined, { student_id: req.params.studentId });
  ok(res, { removed: true });
}));

r.get('/classes/:id/subjects', requirePermission('enrollment:read', 'academic:read'), wrap(async (req, res) => {
  await mustGet('classes', req.params.id, req.auth!.tenantId);
  ok(res, await query(`SELECT cs.id, cs.subject_id, cs.teacher_id, cs.semester, s.code AS subject_code, s.name AS subject_name, s.category, s.hours_per_week, u.full_name AS teacher_name,
    (SELECT COUNT(*) FROM \`${T('materials')}\` m WHERE m.class_subject_id = cs.id) AS material_count, (SELECT COUNT(*) FROM \`${T('assignments')}\` a WHERE a.class_subject_id = cs.id) AS assignment_count
    FROM \`${T('class_subjects')}\` cs JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = cs.teacher_id WHERE cs.class_id = ? ORDER BY s.name`, [req.params.id]));
}));
r.post('/classes/:id/subjects', requirePermission('enrollment:write'), validate(z.object({ subject_id: z.string(), teacher_id: z.string().nullable().optional(), semester: z.number().int().min(0).max(2).optional() })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const cls = await mustGet('classes', req.params.id, tid);
  await mustGet('subjects', req.body.subject_id, tid);
  if (req.body.teacher_id) {
    const t = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`, [req.body.teacher_id, tid]);
    if (!t) throw badRequest('Guru tidak ditemukan');
    await execute(`INSERT IGNORE INTO \`${T('user_roles')}\` (id, tenant_id, user_id, role) VALUES (?,?,?,'GURU')`, [newId(), tid, req.body.teacher_id]);
  }
  const id = newId();
  await execute(`INSERT INTO \`${T('class_subjects')}\` (id, tenant_id, class_id, subject_id, teacher_id, semester) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id)`, [id, tid, cls.id, req.body.subject_id, req.body.teacher_id ?? null, req.body.semester ?? 0]);
  await audit(req, 'class.assign_subject', 'class_subjects', id, undefined, req.body);
  ok(res, { saved: true }, 201);
}));
r.put('/class-subjects/:id', requirePermission('enrollment:write'), validate(z.object({ teacher_id: z.string().nullable().optional(), semester: z.number().int().min(0).max(2).optional() })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const cs = await mustGet('class_subjects', req.params.id, tid);
  if (req.body.teacher_id) await execute(`INSERT IGNORE INTO \`${T('user_roles')}\` (id, tenant_id, user_id, role) VALUES (?,?,?,'GURU')`, [newId(), tid, req.body.teacher_id]);
  const cols = Object.keys(req.body);
  if (cols.length) await execute(`UPDATE \`${T('class_subjects')}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => req.body[c]), cs.id]);
  ok(res, { saved: true });
}));
r.delete('/class-subjects/:id', requirePermission('enrollment:write'), wrap(async (req, res) => {
  const cs = await mustGet('class_subjects', req.params.id, req.auth!.tenantId);
  await execute(`DELETE FROM \`${T('class_subjects')}\` WHERE id = ?`, [cs.id]);
  ok(res, { deleted: true });
}));
/** Flat list of class-subject assignments (for pickers). ?teacher_id=me for own. */
r.get('/class-subjects', wrap(async (req, res) => {
  const a = req.auth!;
  const params: unknown[] = [a.tenantId];
  let where = 'WHERE cs.tenant_id = ? AND ay.is_active = 1';
  const teacher = str(req.query.teacher_id);
  if (teacher) { where += ' AND cs.teacher_id = ?'; params.push(teacher === 'me' ? a.id : teacher); }
  if (str(req.query.class_id)) { where += ' AND cs.class_id = ?'; params.push(String(req.query.class_id)); }
  if (str(req.query.student_id)) { where += ` AND EXISTS (SELECT 1 FROM \`${T('class_students')}\` e WHERE e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF')`; params.push(req.query.student_id === 'me' ? a.id : String(req.query.student_id)); }
  ok(res, await query(`SELECT cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.semester, c.name AS class_name, c.grade_level, c.major_id, s.name AS subject_name, s.code AS subject_code, u.full_name AS teacher_name
    FROM \`${T('class_subjects')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = cs.teacher_id ${where} ORDER BY c.name, s.name`, params));
}));

// ---------- Jadwal ----------
const schedSchema = z.object({ class_subject_id: z.string(), day_of_week: z.number().int().min(1).max(7), start_time: z.string().regex(/^\d{2}:\d{2}/), end_time: z.string().regex(/^\d{2}:\d{2}/), room_id: z.string().nullable().optional() });
r.get('/schedule', requirePermission('academic:read'), wrap(async (req, res) => {
  const a = req.auth!;
  const params: unknown[] = [a.tenantId];
  let where = 'WHERE se.tenant_id = ? AND ay.is_active = 1';
  if (str(req.query.class_id)) { where += ' AND cs.class_id = ?'; params.push(String(req.query.class_id)); }
  if (str(req.query.teacher_id)) { where += ' AND cs.teacher_id = ?'; params.push(req.query.teacher_id === 'me' ? a.id : String(req.query.teacher_id)); }
  if (str(req.query.student_id)) { where += ` AND EXISTS (SELECT 1 FROM \`${T('class_students')}\` e WHERE e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF')`; params.push(req.query.student_id === 'me' ? a.id : String(req.query.student_id)); }
  if (str(req.query.room_id)) { where += ' AND se.room_id = ?'; params.push(String(req.query.room_id)); }
  ok(res, await query(`SELECT se.*, cs.class_id, cs.subject_id, cs.teacher_id, c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name, rm.name AS room_name
    FROM \`${T('schedule_entries')}\` se JOIN \`${T('class_subjects')}\` cs ON cs.id = se.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id
    JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = cs.teacher_id LEFT JOIN \`${T('rooms')}\` rm ON rm.id = se.room_id ${where} ORDER BY se.day_of_week, se.start_time`, params));
}));
r.post('/schedule', requirePermission('academic:write'), validate(schedSchema), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const cs = await mustGet('class_subjects', req.body.class_subject_id, tid);
  if (req.body.end_time <= req.body.start_time) throw badRequest('Jam selesai harus setelah jam mulai');
  // Conflict check: same teacher or same class or same room overlapping on that day.
  const conflicts = await query(`SELECT se.id, c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name, se.start_time, se.end_time,
      CASE WHEN cs2.teacher_id = ? THEN 'GURU' WHEN cs2.class_id = ? THEN 'KELAS' ELSE 'RUANG' END AS reason
    FROM \`${T('schedule_entries')}\` se JOIN \`${T('class_subjects')}\` cs2 ON cs2.id = se.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs2.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id
    JOIN \`${T('subjects')}\` s ON s.id = cs2.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = cs2.teacher_id
    WHERE se.tenant_id = ? AND ay.is_active = 1 AND se.day_of_week = ? AND se.start_time < ? AND se.end_time > ?
      AND ((cs2.teacher_id IS NOT NULL AND cs2.teacher_id = ?) OR cs2.class_id = ? OR (se.room_id IS NOT NULL AND se.room_id = ?))`,
    [cs.teacher_id, cs.class_id, tid, req.body.day_of_week, req.body.end_time, req.body.start_time, cs.teacher_id ?? '', cs.class_id, req.body.room_id ?? '']);
  if (conflicts.length && req.query.force !== '1') throw conflict('Jadwal bentrok', conflicts);
  const id = newId();
  await insertRow('schedule_entries', { id, tenant_id: tid, ...req.body });
  await audit(req, 'schedule.create', 'schedule_entries', id, undefined, req.body);
  ok(res, { id, conflicts }, 201);
}));
r.delete('/schedule/:id', requirePermission('academic:write'), wrap(async (req, res) => {
  await mustGet('schedule_entries', req.params.id, req.auth!.tenantId);
  await execute(`DELETE FROM \`${T('schedule_entries')}\` WHERE id = ?`, [req.params.id]);
  ok(res, { deleted: true });
}));

// ---------- Kalender akademik ----------
const calSchema = z.object({ academic_year_id: z.string().nullable().optional(), title: z.string().min(2).max(200), start_date: z.string().max(10), end_date: z.string().max(10), type: z.enum(['LIBUR', 'UJIAN', 'KEGIATAN', 'RAPAT', 'LAINNYA']).optional(), description: z.string().max(2000).nullable().optional(), is_holiday: z.boolean().optional() });
r.use('/calendar', crudRouter({ table: 'academic_calendar', searchable: ['t.title'], sortable: ['start_date', 'title'], defaultSort: 'start_date', defaultOrder: 'ASC', perms: { read: ['academic:read', 'dashboard:read'], write: WRITE }, filters: [{ param: 'academic_year_id', column: 't.academic_year_id' }, { param: 'type', column: 't.type' }, { param: 'from', column: 't.end_date', op: '>=' }, { param: 'to', column: 't.start_date', op: '<=' }], createSchema: calSchema, updateSchema: calSchema.partial() }));

// ---------- Kurikulum (CP/ATP/TP) ----------
const curSchema = z.object({ subject_id: z.string(), grade_level: z.number().int().nullable().optional(), type: z.enum(['CP', 'ATP', 'TP', 'ELEMEN']).optional(), code: z.string().max(40).nullable().optional(), description: z.string().min(2).max(4000), parent_id: z.string().nullable().optional(), order_no: z.number().int().optional() });
r.use('/curriculum', crudRouter({ table: 'curriculum_refs', searchable: ['t.code', 't.description'], sortable: ['order_no', 'code'], defaultSort: 'order_no', defaultOrder: 'ASC', perms: { read: READ, write: WRITE }, select: 's.name AS subject_name', joins: `JOIN \`${T('subjects')}\` s ON s.id = t.subject_id`, filters: [{ param: 'subject_id', column: 't.subject_id' }, { param: 'grade_level', column: 't.grade_level' }, { param: 'type', column: 't.type' }], createSchema: curSchema, updateSchema: curSchema.partial() }));

// ---------- Alumni ----------
const alumniSchema = z.object({ user_id: z.string(), graduation_year: z.number().int(), last_class: z.string().max(60).nullable().optional(), major_name: z.string().max(120).nullable().optional(), continuing: z.enum(['KULIAH', 'KERJA', 'WIRAUSAHA', 'LAINNYA']).optional(), institution: z.string().max(200).nullable().optional(), phone: z.string().max(30).nullable().optional(), email: z.string().max(190).nullable().optional(), notes: z.string().max(2000).nullable().optional() });
r.use('/alumni', crudRouter({ table: 'alumni', searchable: ['u.full_name', 't.institution'], sortable: ['graduation_year', 'created_at'], defaultSort: 'graduation_year', perms: { read: ['alumni:read'], write: ['alumni:write'] }, select: 'u.full_name, u.username, u.avatar_url', joins: `JOIN \`${T('users')}\` u ON u.id = t.user_id`, filters: [{ param: 'graduation_year', column: 't.graduation_year' }, { param: 'continuing', column: 't.continuing' }], createSchema: alumniSchema, updateSchema: alumniSchema.partial() }));

/** Graduate a whole class: mark students LULUS, create alumni rows, deactivate enrollment. */
r.post('/classes/:id/graduate', requirePermission('alumni:write', 'rollover:write'), validate(z.object({ graduation_year: z.number().int(), student_ids: z.array(z.string()).optional() })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const cls = await mustGet('classes', req.params.id, tid);
  const major = cls.major_id ? await queryOne(`SELECT name FROM \`${T('majors')}\` WHERE id = ?`, [cls.major_id]) : null;
  const students = await query(`SELECT student_id FROM \`${T('class_students')}\` WHERE class_id = ? AND status = 'AKTIF'`, [cls.id]);
  const targets = students.map((s) => String(s.student_id)).filter((id) => !req.body.student_ids || req.body.student_ids.includes(id));
  await withTransaction(async (conn) => {
    for (const sid of targets) {
      await execute(`UPDATE \`${T('class_students')}\` SET status = 'LULUS', left_at = CURDATE() WHERE class_id = ? AND student_id = ?`, [cls.id, sid], conn);
      await execute(`UPDATE \`${T('student_profiles')}\` SET status = 'LULUS' WHERE user_id = ?`, [sid], conn);
      await execute(`INSERT IGNORE INTO \`${T('alumni')}\` (id, tenant_id, user_id, graduation_year, last_class, major_name) VALUES (?,?,?,?,?,?)`, [newId(), tid, sid, req.body.graduation_year, cls.name, major?.name ?? null], conn);
    }
  });
  await notify({ tenantId: tid, userIds: targets, type: 'GRADUATION', title: 'Selamat, Anda dinyatakan lulus!', body: `Kelas ${cls.name} — tahun ${req.body.graduation_year}` });
  await audit(req, 'class.graduate', 'classes', String(cls.id), undefined, { count: targets.length });
  ok(res, { graduated: targets.length });
}));

export default r;
