import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit, notify, sse } from '../../core/services';
import { newId } from '../../core/ids';
import { crudRouter, insertRow, updateRow, mustGet } from '../../core/crud';
import { assertClass, classScope, isTenantWide, studentIdsOfClass } from '../../core/scope';
import { hasRole } from '../../core/auth';
import { scoreAnswer, presentQuestion } from '../lms/questions';
import { upsertGrade } from '../lms/grades';

const r = Router();
const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genToken = () => Array.from({ length: 6 }, () => TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)]).join('');

// ---------- Paket soal ----------
const pkgSchema = z.object({ subject_id: z.string().nullable().optional(), grade_level: z.number().int().nullable().optional(), title: z.string().min(2).max(200), description: z.string().max(4000).nullable().optional(), status: z.enum(['DRAFT', 'READY', 'ARCHIVED']).optional(), questions: z.array(z.object({ question_id: z.string(), points: z.number().min(0.5).max(100).optional() })).optional() });
async function savePackageQuestions(pkgId: string, tenantId: string, items: { question_id: string; points?: number }[], exec: import('../../database/db').Exec) {
  await execute(`DELETE FROM \`${T('exam_package_questions')}\` WHERE package_id = ?`, [pkgId], exec);
  let i = 0; let total = 0;
  for (const it of items) {
    const q = await queryOne(`SELECT id, points FROM \`${T('questions')}\` WHERE id = ? AND tenant_id = ?`, [it.question_id, tenantId], exec);
    if (!q) continue;
    const pts = it.points ?? Number(q.points) ?? 1;
    await insertRow('exam_package_questions', { id: newId(), package_id: pkgId, question_id: it.question_id, order_no: i++, points: pts }, exec);
    total += pts;
  }
  await execute(`UPDATE \`${T('exam_packages')}\` SET total_points = ? WHERE id = ?`, [total, pkgId], exec);
}
r.use('/packages', crudRouter({
  table: 'exam_packages', searchable: ['t.title'], sortable: ['created_at', 'title'], perms: { read: ['exam:read'], write: ['exam:write'] },
  select: `s.name AS subject_name, u.full_name AS author_name, (SELECT COUNT(*) FROM \`${T('exam_package_questions')}\` pq WHERE pq.package_id = t.id) AS question_count, (SELECT COUNT(*) FROM \`${T('exams')}\` e WHERE e.package_id = t.id) AS exam_count`,
  joins: `LEFT JOIN \`${T('subjects')}\` s ON s.id = t.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = t.created_by`,
  filters: [{ param: 'subject_id', column: 't.subject_id' }, { param: 'status', column: 't.status' }, { param: 'grade_level', column: 't.grade_level' }],
  createSchema: pkgSchema, updateSchema: pkgSchema.partial(),
  toRow: (input, req, isCreate) => { const { questions, ...rest } = input as Record<string, unknown>; void questions; return isCreate ? { ...rest, created_by: req.auth!.id } : rest; },
  afterCreate: async (row, req, exec) => { const qs = (req.body as { questions?: { question_id: string; points?: number }[] }).questions; if (qs) await savePackageQuestions(String(row.id), req.auth!.tenantId, qs, exec); },
  afterUpdate: async (id, _row, req, exec) => { const qs = (req.body as { questions?: { question_id: string; points?: number }[] }).questions; if (qs) await savePackageQuestions(id, req.auth!.tenantId, qs, exec); },
}));
r.get('/packages/:id/questions', requirePermission('exam:read'), wrap(async (req, res) => {
  await mustGet('exam_packages', req.params.id, req.auth!.tenantId);
  ok(res, (await query(`SELECT pq.order_no, pq.points, qu.* FROM \`${T('exam_package_questions')}\` pq JOIN \`${T('questions')}\` qu ON qu.id = pq.question_id WHERE pq.package_id = ? ORDER BY pq.order_no`, [req.params.id])).map((x) => presentQuestion(x)));
}));

// ---------- Ujian ----------
const examSchema = z.object({ package_id: z.string(), subject_id: z.string().nullable().optional(), title: z.string().min(2).max(200), type: z.enum(['UH', 'UTS', 'UAS', 'TRYOUT', 'LAINNYA']).optional(), academic_year_id: z.string().nullable().optional(), semester: z.number().int().min(1).max(2).optional(), duration_min: z.number().int().min(5).max(600).optional(), shuffle_questions: z.boolean().optional(), shuffle_options: z.boolean().optional(), passing_score: z.number().min(0).max(100).nullable().optional(), show_result: z.enum(['IMMEDIATE', 'AFTER_CLOSE', 'NEVER']).optional(), lock_screen: z.boolean().optional(), max_violations: z.number().int().min(0).max(20).optional(), grade_component: z.string().max(20).nullable().optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional() });
// (exams CRUD router is mounted at the end so /sessions, /attempts, /packages are matched first)


// ---------- Sesi ----------
const sessionSchema = z.object({ exam_id: z.string(), class_id: z.string(), class_subject_id: z.string().nullable().optional(), start_at: z.string(), end_at: z.string(), proctor_id: z.string().nullable().optional(), room_id: z.string().nullable().optional(), note: z.string().max(255).nullable().optional() });
const SESSION_SELECT = `es.*, ex.title AS exam_title, ex.duration_min, ex.type AS exam_type, ex.lock_screen, ex.show_result, c.name AS class_name, pr.full_name AS proctor_name, rm.name AS room_name, s.name AS subject_name,
  (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = es.class_id AND e.status = 'AKTIF') AS student_count,
  (SELECT COUNT(*) FROM \`${T('exam_attempts')}\` a WHERE a.session_id = es.id) AS started_count,
  (SELECT COUNT(*) FROM \`${T('exam_attempts')}\` a2 WHERE a2.session_id = es.id AND a2.status <> 'IN_PROGRESS') AS finished_count`;
const SESSION_FROM = `FROM \`${T('exam_sessions')}\` es JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id JOIN \`${T('classes')}\` c ON c.id = es.class_id LEFT JOIN \`${T('users')}\` pr ON pr.id = es.proctor_id LEFT JOIN \`${T('rooms')}\` rm ON rm.id = es.room_id LEFT JOIN \`${T('subjects')}\` s ON s.id = ex.subject_id`;
const withStatus = (row: Record<string, unknown>): Record<string, unknown> => { const now = Date.now(); const s = new Date(row.start_at as string).getTime(); const e = new Date(row.end_at as string).getTime(); const live = row.status === 'CANCELLED' ? 'CANCELLED' : now < s ? 'SCHEDULED' : now <= e ? 'ONGOING' : 'FINISHED'; return { ...row, live_status: live, token: undefined, has_token: !!row.token }; };

r.get('/sessions', requirePermission('exam:read', 'exam:attempt'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [u.tenantId];
  let where = 'WHERE es.tenant_id = ?';
  if (hasRole(u, 'SISWA') && !isTenantWide(u)) { where += ` AND EXISTS (SELECT 1 FROM \`${T('class_students')}\` e WHERE e.class_id = es.class_id AND e.student_id = ? AND e.status = 'AKTIF') AND ex.status = 'PUBLISHED'`; params.push(u.id); }
  else if (!isTenantWide(u)) { const sc = classScope(u); where += ` AND (es.proctor_id = ? OR ex.created_by = ? OR ${sc.sql})`; params.push(u.id, u.id, ...sc.params); }
  if (str(req.query.exam_id)) { where += ' AND es.exam_id = ?'; params.push(String(req.query.exam_id)); }
  if (str(req.query.class_id)) { where += ' AND es.class_id = ?'; params.push(String(req.query.class_id)); }
  if (req.query.upcoming === '1') where += ' AND es.end_at >= NOW()';
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${SESSION_FROM} ${where}`, params))?.c ?? 0);
  const my = hasRole(u, 'SISWA') ? `, (SELECT a.status FROM \`${T('exam_attempts')}\` a WHERE a.session_id = es.id AND a.student_id = ?) AS my_status, (SELECT a.id FROM \`${T('exam_attempts')}\` a WHERE a.session_id = es.id AND a.student_id = ?) AS my_attempt_id, (SELECT a.score FROM \`${T('exam_attempts')}\` a WHERE a.session_id = es.id AND a.student_id = ?) AS my_score` : '';
  const rows = await query(`SELECT ${SESSION_SELECT}${my} ${SESSION_FROM} ${where} ORDER BY es.start_at DESC LIMIT ? OFFSET ?`, [...(hasRole(u, 'SISWA') ? [u.id, u.id, u.id] : []), ...params, limit, offset]);
  paged(res, rows.map((x) => { const v = withStatus(x); if (v.show_result === 'NEVER' || (v.show_result === 'AFTER_CLOSE' && v.live_status !== 'FINISHED')) v.my_score = null; return v; }), { page, limit, total });
}));
r.post('/sessions', requirePermission('exam:schedule'), validate(sessionSchema), wrap(async (req, res) => {
  const u = req.auth!;
  const ex = await mustGet('exams', req.body.exam_id, u.tenantId);
  await assertClass(u, req.body.class_id);
  if (new Date(req.body.end_at) <= new Date(req.body.start_at)) throw badRequest('Waktu selesai harus setelah mulai');
  let csId = req.body.class_subject_id ?? null;
  if (!csId && ex.subject_id) { const cs = await queryOne(`SELECT id FROM \`${T('class_subjects')}\` WHERE class_id = ? AND subject_id = ? LIMIT 1`, [req.body.class_id, ex.subject_id]); csId = cs ? String(cs.id) : null; }
  const id = newId();
  await insertRow('exam_sessions', { id, tenant_id: u.tenantId, ...req.body, class_subject_id: csId, start_at: new Date(req.body.start_at), end_at: new Date(req.body.end_at), token: genToken(), status: 'SCHEDULED' });
  await notify({ tenantId: u.tenantId, userIds: await studentIdsOfClass(req.body.class_id), type: 'EXAM', title: `Jadwal ujian: ${ex.title}`, body: `${new Date(req.body.start_at).toLocaleString('id-ID')}`, link: '/siswa/ujian' });
  await audit(req, 'exam.session_create', 'exam_sessions', id, undefined, req.body);
  ok(res, withStatus((await queryOne(`SELECT ${SESSION_SELECT} ${SESSION_FROM} WHERE es.id = ?`, [id]))!), 201);
}));
r.put('/sessions/:id', requirePermission('exam:schedule'), validate(sessionSchema.partial().extend({ status: z.enum(['SCHEDULED', 'CANCELLED']).optional(), regenerate_token: z.boolean().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await mustGet('exam_sessions', req.params.id, u.tenantId);
  const { regenerate_token, ...b } = req.body as Record<string, unknown>;
  if (b.start_at) b.start_at = new Date(String(b.start_at));
  if (b.end_at) b.end_at = new Date(String(b.end_at));
  if (regenerate_token) b.token = genToken();
  await updateRow('exam_sessions', String(s.id), b, undefined, u.tenantId);
  await audit(req, 'exam.session_update', 'exam_sessions', String(s.id), s, b);
  ok(res, withStatus((await queryOne(`SELECT ${SESSION_SELECT} ${SESSION_FROM} WHERE es.id = ?`, [s.id]))!));
}));
r.delete('/sessions/:id', requirePermission('exam:schedule'), wrap(async (req, res) => {
  const s = await mustGet('exam_sessions', req.params.id, req.auth!.tenantId);
  const started = await queryOne(`SELECT id FROM \`${T('exam_attempts')}\` WHERE session_id = ? LIMIT 1`, [s.id]);
  if (started) throw badRequest('Sesi sudah dimulai siswa; batalkan saja (status CANCELLED)');
  await execute(`DELETE FROM \`${T('exam_sessions')}\` WHERE id = ?`, [s.id]);
  ok(res, { deleted: true });
}));
/** Proctor view: token + live per-student progress. */
r.get('/sessions/:id', requirePermission('exam:read', 'exam:proctor', 'exam:attempt'), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await queryOne(`SELECT ${SESSION_SELECT} ${SESSION_FROM} WHERE es.id = ? AND es.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!s) throw notFound();
  const student = hasRole(u, 'SISWA') && !isTenantWide(u);
  if (student) { const v = withStatus(s); return ok(res, { ...v, my_attempt: await queryOne(`SELECT id, status, started_at, submitted_at, score FROM \`${T('exam_attempts')}\` WHERE session_id = ? AND student_id = ?`, [s.id, u.id]) }); }
  await assertClass(u, String(s.class_id));
  const students = await query(`SELECT st.id AS student_id, st.full_name, st.avatar_url, sp.nis, a.id AS attempt_id, a.status, a.started_at, a.submitted_at, a.last_saved_at, a.violations, a.score, a.submit_reason,
      (SELECT COUNT(*) FROM \`${T('exam_answers')}\` ans WHERE ans.attempt_id = a.id AND ans.answer IS NOT NULL AND ans.answer <> 'null') AS answered
    FROM \`${T('class_students')}\` e JOIN \`${T('users')}\` st ON st.id = e.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id LEFT JOIN \`${T('exam_attempts')}\` a ON a.session_id = ? AND a.student_id = st.id
    WHERE e.class_id = ? AND e.status = 'AKTIF' ORDER BY st.full_name`, [s.id, s.class_id]);
  ok(res, { ...withStatus(s), token: s.token, students });
}));
/** Force-submit one attempt or the whole session (proctor). */
r.post('/sessions/:id/force-submit', requirePermission('exam:proctor'), validate(z.object({ student_id: z.string().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await mustGet('exam_sessions', req.params.id, u.tenantId);
  const rows = await query(`SELECT id, student_id FROM \`${T('exam_attempts')}\` WHERE session_id = ? AND status = 'IN_PROGRESS'${req.body.student_id ? ' AND student_id = ?' : ''}`, req.body.student_id ? [s.id, req.body.student_id] : [s.id]);
  for (const a of rows) { sse.toUser(String(a.student_id), 'exam:force-submit', { session_id: s.id }); await finalizeExamAttempt(String(a.id), 'FORCED'); }
  await audit(req, 'exam.force_submit', 'exam_sessions', String(s.id), undefined, { count: rows.length });
  ok(res, { submitted: rows.length });
}));
r.post('/sessions/:id/extend', requirePermission('exam:proctor'), validate(z.object({ minutes: z.number().int().min(1).max(180) })), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await mustGet('exam_sessions', req.params.id, u.tenantId);
  await execute(`UPDATE \`${T('exam_sessions')}\` SET end_at = DATE_ADD(end_at, INTERVAL ? MINUTE) WHERE id = ?`, [req.body.minutes, s.id]);
  await execute(`UPDATE \`${T('exam_attempts')}\` SET deadline_at = DATE_ADD(deadline_at, INTERVAL ? MINUTE) WHERE session_id = ? AND status = 'IN_PROGRESS'`, [req.body.minutes, s.id]);
  const ids = (await query(`SELECT student_id FROM \`${T('exam_attempts')}\` WHERE session_id = ? AND status = 'IN_PROGRESS'`, [s.id])).map((x) => String(x.student_id));
  sse.toUsers(ids, 'exam:tick', { session_id: s.id, extended_min: req.body.minutes });
  ok(res, { extended: req.body.minutes });
}));

// ---------- Attempts (student) ----------
r.post('/sessions/:id/start', requirePermission('exam:attempt'), validate(z.object({ token: z.string().min(4).max(12) })), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await queryOne(`SELECT es.*, ex.duration_min, ex.shuffle_questions, ex.package_id, ex.status AS exam_status FROM \`${T('exam_sessions')}\` es JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id WHERE es.id = ? AND es.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!s) throw notFound();
  const enrolled = await queryOne(`SELECT 1 AS x FROM \`${T('class_students')}\` WHERE class_id = ? AND student_id = ? AND status = 'AKTIF'`, [s.class_id, u.id]);
  if (!enrolled) throw forbidden('Anda bukan peserta sesi ini');
  if (s.exam_status !== 'PUBLISHED' || s.status === 'CANCELLED') throw badRequest('Ujian tidak aktif');
  const now = Date.now();
  if (now < new Date(s.start_at).getTime()) throw badRequest('Ujian belum dimulai');
  if (now > new Date(s.end_at).getTime()) throw badRequest('Sesi ujian sudah berakhir');
  const existing = await queryOne(`SELECT * FROM \`${T('exam_attempts')}\` WHERE session_id = ? AND student_id = ?`, [s.id, u.id]);
  if (existing) {
    if (existing.status !== 'IN_PROGRESS') throw badRequest('Anda sudah mengumpulkan ujian ini');
    if (new Date(existing.deadline_at) < new Date()) { await finalizeExamAttempt(String(existing.id), 'TIMEOUT'); throw badRequest('Waktu ujian Anda sudah habis'); }
    return ok(res, await examAttemptView(String(existing.id), u.id));
  }
  if (String(req.body.token).toUpperCase() !== String(s.token).toUpperCase()) throw badRequest('Token salah');
  const qs = await query(`SELECT question_id FROM \`${T('exam_package_questions')}\` WHERE package_id = ? ORDER BY order_no`, [s.package_id]);
  if (!qs.length) throw badRequest('Paket soal kosong');
  let order = qs.map((x) => String(x.question_id));
  if (s.shuffle_questions) { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
  const id = newId();
  const deadline = new Date(Math.min(now + Number(s.duration_min) * 60_000, new Date(s.end_at).getTime()));
  await insertRow('exam_attempts', { id, tenant_id: u.tenantId, session_id: s.id, student_id: u.id, started_at: new Date(), deadline_at: deadline, status: 'IN_PROGRESS', question_order: order, ip: req.ip ?? null, user_agent: (req.headers['user-agent'] ?? '').toString().slice(0, 255) });
  await execute(`UPDATE \`${T('exam_sessions')}\` SET status = 'ONGOING' WHERE id = ? AND status = 'SCHEDULED'`, [s.id]);
  await audit(req, 'exam.start', 'exam_attempts', id);
  ok(res, await examAttemptView(id, u.id), 201);
}));

async function examAttemptView(attemptId: string, studentId: string) {
  const a = await queryOne(`SELECT a.*, ex.title, ex.duration_min, ex.shuffle_options, ex.show_result, ex.lock_screen, ex.max_violations, es.end_at, es.id AS session_id FROM \`${T('exam_attempts')}\` a JOIN \`${T('exam_sessions')}\` es ON es.id = a.session_id JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id WHERE a.id = ? AND a.student_id = ?`, [attemptId, studentId]);
  if (!a) throw notFound();
  const order: string[] = typeof a.question_order === 'string' ? JSON.parse(a.question_order) : a.question_order ?? [];
  const pkg = await queryOne(`SELECT package_id FROM \`${T('exams')}\` ex JOIN \`${T('exam_sessions')}\` es ON es.exam_id = ex.id WHERE es.id = ?`, [a.session_id]);
  const qs = order.length ? await query(`SELECT qu.*, pq.points AS pkg_points FROM \`${T('questions')}\` qu JOIN \`${T('exam_package_questions')}\` pq ON pq.question_id = qu.id AND pq.package_id = ? WHERE qu.id IN (${order.map(() => '?').join(',')})`, [pkg?.package_id, ...order]) : [];
  const byId = new Map(qs.map((q) => [String(q.id), q]));
  const answers = await query(`SELECT question_id, answer FROM \`${T('exam_answers')}\` WHERE attempt_id = ?`, [attemptId]);
  const ansMap = new Map(answers.map((x) => [String(x.question_id), typeof x.answer === 'string' ? JSON.parse(x.answer) : x.answer]));
  const finished = a.status !== 'IN_PROGRESS';
  const closed = new Date(a.end_at) < new Date();
  const reveal = finished && (a.show_result === 'IMMEDIATE' || (a.show_result === 'AFTER_CLOSE' && closed));
  const questions = order.map((qid, i) => { const q = byId.get(qid); if (!q) return null; const p = presentQuestion(q, !reveal); if (!finished && a.shuffle_options && Array.isArray(p.options)) p.options = seeded(p.options as unknown[], `${attemptId}:${qid}`); return { no: i + 1, ...p, points: Number(q.pkg_points), my_answer: ansMap.get(qid) ?? null } as Record<string, unknown>; }).filter(Boolean);
  return { id: a.id, session_id: a.session_id, title: a.title, status: a.status, started_at: a.started_at, deadline_at: a.deadline_at, submitted_at: a.submitted_at, score: a.show_result === 'NEVER' ? null : a.score, max_score: a.max_score, violations: a.violations, max_violations: a.max_violations, lock_screen: !!a.lock_screen, remaining_sec: Math.max(0, Math.floor((new Date(a.deadline_at).getTime() - Date.now()) / 1000)), show_result: a.show_result, questions };
}
function seeded<X>(arr: X[], seed: string): X[] { let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; }; const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

r.get('/attempts/:attemptId', requirePermission('exam:attempt', 'exam:grade', 'exam:proctor'), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT * FROM \`${T('exam_attempts')}\` WHERE id = ? AND tenant_id = ?`, [req.params.attemptId, u.tenantId]);
  if (!a) throw notFound();
  if (a.student_id !== u.id) { const s = await queryOne(`SELECT class_id FROM \`${T('exam_sessions')}\` WHERE id = ?`, [a.session_id]); await assertClass(u, String(s!.class_id)); const view = await examAttemptView(String(a.id), String(a.student_id)); return ok(res, { ...view, questions: (await teacherQuestions(String(a.id))) }); }
  ok(res, await examAttemptView(String(a.id), u.id));
}));
async function teacherQuestions(attemptId: string) {
  const a = await queryOne(`SELECT a.question_order, ex.package_id FROM \`${T('exam_attempts')}\` a JOIN \`${T('exam_sessions')}\` es ON es.id = a.session_id JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id WHERE a.id = ?`, [attemptId]);
  const order: string[] = typeof a?.question_order === 'string' ? JSON.parse(a.question_order) : a?.question_order ?? [];
  const qs = order.length ? await query(`SELECT qu.*, pq.points AS pkg_points FROM \`${T('questions')}\` qu JOIN \`${T('exam_package_questions')}\` pq ON pq.question_id = qu.id AND pq.package_id = ? WHERE qu.id IN (${order.map(() => '?').join(',')})`, [a?.package_id, ...order]) : [];
  const answers = await query(`SELECT question_id, answer, score, is_correct FROM \`${T('exam_answers')}\` WHERE attempt_id = ?`, [attemptId]);
  const byId = new Map(qs.map((q) => [String(q.id), q]));
  const am = new Map(answers.map((x) => [String(x.question_id), x]));
  return order.map((qid, i) => { const q = byId.get(qid); if (!q) return null; const an = am.get(qid); return { no: i + 1, ...presentQuestion(q), points: Number(q.pkg_points), my_answer: an ? (typeof an.answer === 'string' ? JSON.parse(an.answer) : an.answer) : null, score: an?.score ?? null, is_correct: an?.is_correct ?? null }; }).filter(Boolean);
}
r.post('/attempts/:attemptId/answer', requirePermission('exam:attempt'), validate(z.object({ question_id: z.string(), answer: z.any() })), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT * FROM \`${T('exam_attempts')}\` WHERE id = ? AND student_id = ? AND status = 'IN_PROGRESS'`, [req.params.attemptId, u.id]);
  if (!a) throw badRequest('Ujian tidak aktif');
  if (new Date(a.deadline_at) < new Date()) { await finalizeExamAttempt(String(a.id), 'TIMEOUT'); throw badRequest('Waktu habis, jawaban otomatis dikumpulkan'); }
  const seq = Number((await queryOne(`SELECT COALESCE(MAX(seq),0) AS s FROM \`${T('exam_answer_logs')}\` WHERE attempt_id = ?`, [a.id]))?.s ?? 0) + 1;
  const ans = JSON.stringify(req.body.answer ?? null);
  await execute(`INSERT INTO \`${T('exam_answers')}\` (id, attempt_id, question_id, answer, seq, answered_at) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE answer = VALUES(answer), seq = VALUES(seq), answered_at = NOW()`, [newId(), a.id, req.body.question_id, ans, seq]);
  await insertRow('exam_answer_logs', { id: newId(), attempt_id: a.id, question_id: req.body.question_id, answer: ans, event: 'ANSWER', seq });
  await execute(`UPDATE \`${T('exam_attempts')}\` SET last_saved_at = NOW() WHERE id = ?`, [a.id]);
  ok(res, { saved: true, seq, remaining_sec: Math.max(0, Math.floor((new Date(a.deadline_at).getTime() - Date.now()) / 1000)) });
}));
r.post('/attempts/:attemptId/violation', requirePermission('exam:attempt'), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT a.*, ex.max_violations FROM \`${T('exam_attempts')}\` a JOIN \`${T('exam_sessions')}\` es ON es.id = a.session_id JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id WHERE a.id = ? AND a.student_id = ? AND a.status = 'IN_PROGRESS'`, [req.params.attemptId, u.id]);
  if (!a) return ok(res, { ignored: true });
  const v = Number(a.violations) + 1;
  await execute(`UPDATE \`${T('exam_attempts')}\` SET violations = ? WHERE id = ?`, [v, a.id]);
  await insertRow('exam_answer_logs', { id: newId(), attempt_id: a.id, question_id: '-', answer: null, event: 'VIOLATION', seq: v });
  const s = await queryOne(`SELECT proctor_id FROM \`${T('exam_sessions')}\` WHERE id = ?`, [a.session_id]);
  if (s?.proctor_id) sse.toUser(String(s.proctor_id), 'exam:violation', { attempt_id: a.id, student_id: u.id, violations: v });
  if (Number(a.max_violations) > 0 && v >= Number(a.max_violations)) { await finalizeExamAttempt(String(a.id), 'VIOLATION'); return ok(res, { violations: v, force_submitted: true }); }
  ok(res, { violations: v, remaining: Number(a.max_violations) - v });
}));
r.post('/attempts/:attemptId/submit', requirePermission('exam:attempt'), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT * FROM \`${T('exam_attempts')}\` WHERE id = ? AND student_id = ?`, [req.params.attemptId, u.id]);
  if (!a) throw notFound();
  if (a.status === 'IN_PROGRESS') { await finalizeExamAttempt(String(a.id), req.body?.reason === 'TIMEOUT' ? 'TIMEOUT' : 'MANUAL'); await audit(req, 'exam.submit', 'exam_attempts', String(a.id)); }
  ok(res, await examAttemptView(String(a.id), u.id));
}));

export async function finalizeExamAttempt(attemptId: string, reason: 'MANUAL' | 'TIMEOUT' | 'FORCED' | 'VIOLATION') {
  const a = await queryOne(`SELECT a.*, ex.package_id, ex.grade_component, ex.title, ex.passing_score, es.class_subject_id, es.class_id, ex.subject_id FROM \`${T('exam_attempts')}\` a JOIN \`${T('exam_sessions')}\` es ON es.id = a.session_id JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id WHERE a.id = ? AND a.status = 'IN_PROGRESS'`, [attemptId]);
  if (!a) return;
  const qs = await query(`SELECT qu.id, qu.type, qu.answer_key, qu.options, pq.points FROM \`${T('exam_package_questions')}\` pq JOIN \`${T('questions')}\` qu ON qu.id = pq.question_id WHERE pq.package_id = ?`, [a.package_id]);
  const answers = await query(`SELECT question_id, answer FROM \`${T('exam_answers')}\` WHERE attempt_id = ?`, [attemptId]);
  const ansMap = new Map(answers.map((x) => [String(x.question_id), typeof x.answer === 'string' ? JSON.parse(x.answer) : x.answer]));
  let total = 0; let max = 0; let pending = false;
  for (const q of qs) {
    max += Number(q.points);
    const s = scoreAnswer({ type: String(q.type), answer_key: q.answer_key, options: q.options, points: Number(q.points) }, ansMap.get(String(q.id)));
    if (s.score === null) pending = true; else total += s.score;
    await execute(`INSERT INTO \`${T('exam_answers')}\` (id, attempt_id, question_id, answer, is_correct, score, answered_at) VALUES (?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE is_correct = VALUES(is_correct), score = VALUES(score)`, [newId(), attemptId, q.id, JSON.stringify(ansMap.get(String(q.id)) ?? null), s.is_correct === null ? null : s.is_correct ? 1 : 0, s.score]);
  }
  const score100 = max ? Math.round((total / max) * 10000) / 100 : 0;
  await execute(`UPDATE \`${T('exam_attempts')}\` SET status = ?, submitted_at = NOW(), submit_reason = ?, score = ?, max_score = 100 WHERE id = ?`, [pending ? 'SUBMITTED' : 'GRADED', reason, score100, attemptId]);
  if (!pending) await pushExamGrade({ ...a, score: score100 });
}
async function pushExamGrade(a: Record<string, unknown>) {
  let csId = a.class_subject_id ? String(a.class_subject_id) : null;
  if (!csId && a.subject_id) { const cs = await queryOne(`SELECT id FROM \`${T('class_subjects')}\` WHERE class_id = ? AND subject_id = ? LIMIT 1`, [a.class_id, a.subject_id]); csId = cs ? String(cs.id) : null; }
  if (!csId) return;
  await upsertGrade({ tenantId: String(a.tenant_id), classSubjectId: csId, studentId: String(a.student_id), component: String(a.grade_component || 'UH'), sourceType: 'EXAM', sourceId: String(a.session_id), title: String(a.title), score: Number(a.score), maxScore: 100 });
}
r.post('/attempts/:attemptId/grade', requirePermission('exam:grade'), validate(z.object({ scores: z.array(z.object({ question_id: z.string(), score: z.number().min(0) })) })), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT a.*, ex.package_id, ex.grade_component, ex.title, es.class_subject_id, es.class_id, ex.subject_id FROM \`${T('exam_attempts')}\` a JOIN \`${T('exam_sessions')}\` es ON es.id = a.session_id JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id WHERE a.id = ? AND a.tenant_id = ?`, [req.params.attemptId, u.tenantId]);
  if (!a) throw notFound();
  await assertClass(u, String(a.class_id));
  for (const s of req.body.scores) {
    const pq = await queryOne(`SELECT points FROM \`${T('exam_package_questions')}\` WHERE package_id = ? AND question_id = ?`, [a.package_id, s.question_id]);
    if (!pq) continue;
    const sc = Math.min(Number(pq.points), s.score);
    await execute(`INSERT INTO \`${T('exam_answers')}\` (id, attempt_id, question_id, answer, is_correct, score, graded_by, answered_at) VALUES (?,?,?,NULL,?,?,?,NOW()) ON DUPLICATE KEY UPDATE score = VALUES(score), is_correct = VALUES(is_correct), graded_by = VALUES(graded_by)`, [newId(), a.id, s.question_id, sc >= Number(pq.points) ? 1 : 0, sc, u.id]);
  }
  const sums = await queryOne(`SELECT COALESCE(SUM(ea.score),0) AS total, (SELECT COALESCE(SUM(points),0) FROM \`${T('exam_package_questions')}\` WHERE package_id = ?) AS max, SUM(ea.score IS NULL) AS pending FROM \`${T('exam_answers')}\` ea WHERE ea.attempt_id = ?`, [a.package_id, a.id]);
  const score100 = Number(sums?.max) ? Math.round((Number(sums?.total) / Number(sums?.max)) * 10000) / 100 : 0;
  const done = !Number(sums?.pending);
  await execute(`UPDATE \`${T('exam_attempts')}\` SET score = ?, max_score = 100, status = ? WHERE id = ?`, [score100, done ? 'GRADED' : a.status, a.id]);
  if (done) { await pushExamGrade({ ...a, score: score100 }); await notify({ tenantId: u.tenantId, userIds: [String(a.student_id)], type: 'GRADE', title: `Nilai ujian: ${a.title}`, body: `Skor ${score100}`, link: '/siswa/ujian' }); }
  ok(res, { score: score100, status: done ? 'GRADED' : a.status });
}));

/** Results + item analysis for one session. */
r.get('/sessions/:id/results', requirePermission('exam:read', 'exam:grade'), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await queryOne(`SELECT ${SESSION_SELECT}, ex.package_id, ex.passing_score ${SESSION_FROM} WHERE es.id = ? AND es.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!s) throw notFound();
  await assertClass(u, String(s.class_id));
  const attempts = await query(`SELECT a.id, a.student_id, st.full_name, sp.nis, a.status, a.started_at, a.submitted_at, a.submit_reason, a.violations, a.score FROM \`${T('exam_attempts')}\` a JOIN \`${T('users')}\` st ON st.id = a.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id WHERE a.session_id = ? ORDER BY a.score DESC, st.full_name`, [s.id]);
  const items = await query(`SELECT qu.id, qu.text, qu.type, qu.difficulty, cp.name AS concept_name, pq.points, COUNT(ea.id) AS answered, SUM(ea.is_correct = 1) AS correct
    FROM \`${T('exam_package_questions')}\` pq JOIN \`${T('questions')}\` qu ON qu.id = pq.question_id LEFT JOIN \`${T('concepts')}\` cp ON cp.id = qu.concept_id
    LEFT JOIN \`${T('exam_attempts')}\` at ON at.session_id = ? AND at.status <> 'IN_PROGRESS' LEFT JOIN \`${T('exam_answers')}\` ea ON ea.attempt_id = at.id AND ea.question_id = qu.id
    WHERE pq.package_id = ? GROUP BY qu.id, qu.text, qu.type, qu.difficulty, cp.name, pq.points ORDER BY pq.order_no`, [s.id, s.package_id]);
  const scores = attempts.filter((a) => a.score !== null).map((a) => Number(a.score));
  const pass = s.passing_score ? scores.filter((x) => x >= Number(s.passing_score)).length : null;
  ok(res, { session: withStatus(s), attempts, items: items.map((it) => ({ ...it, difficulty_index: it.answered ? Number(it.correct) / Number(it.answered) : null })), summary: { participants: attempts.length, average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null, max: scores.length ? Math.max(...scores) : null, min: scores.length ? Math.min(...scores) : null, passed: pass } });
}));

// ---------- Ujian (CRUD) — mounted last ----------
r.use('/', crudRouter({
  table: 'exams', searchable: ['t.title'], sortable: ['created_at', 'title', 'type'], perms: { read: ['exam:read'], write: ['exam:write'] },
  select: `p.title AS package_title, p.total_points, s.name AS subject_name, (SELECT COUNT(*) FROM \`${T('exam_sessions')}\` es WHERE es.exam_id = t.id) AS session_count, (SELECT COUNT(*) FROM \`${T('exam_package_questions')}\` pq WHERE pq.package_id = t.package_id) AS question_count`,
  joins: `JOIN \`${T('exam_packages')}\` p ON p.id = t.package_id LEFT JOIN \`${T('subjects')}\` s ON s.id = COALESCE(t.subject_id, p.subject_id)`,
  filters: [{ param: 'status', column: 't.status' }, { param: 'type', column: 't.type' }, { param: 'subject_id', column: 't.subject_id' }],
  scope: (req) => (hasRole(req.auth!, 'SISWA') && !isTenantWide(req.auth!) ? { sql: '1=0', params: [] } : null),
  createSchema: examSchema, updateSchema: examSchema.partial(),
  toRow: (input, req, isCreate) => { const b = { ...(input as Record<string, unknown>) }; if (!b.subject_id) delete b.subject_id; return isCreate ? { ...b, created_by: req.auth!.id } : b; },
  beforeCreate: async (row, req) => { const p = await queryOne(`SELECT subject_id FROM \`${T('exam_packages')}\` WHERE id = ? AND tenant_id = ?`, [row.package_id, req.auth!.tenantId]); if (!p) throw badRequest('Paket soal tidak ditemukan'); if (!row.subject_id) row.subject_id = p.subject_id; },
}));

export default r;
export const _keep = withTransaction;
