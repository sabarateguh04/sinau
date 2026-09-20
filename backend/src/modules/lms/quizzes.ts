import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit, notify } from '../../core/services';
import { newId } from '../../core/ids';
import { insertRow, updateRow } from '../../core/crud';
import { assertClassSubject, classSubjectScope, isTenantWide, studentIdsOfClass } from '../../core/scope';
import { hasRole } from '../../core/auth';
import { scoreAnswer, presentQuestion } from './questions';
import { upsertGrade } from './grades';

const r = Router();

const schema = z.object({
  class_subject_id: z.string(), title: z.string().min(2).max(200), description: z.string().max(4000).nullable().optional(), duration_min: z.number().int().min(1).max(600).optional(),
  open_at: z.string().nullable().optional(), close_at: z.string().nullable().optional(), shuffle_questions: z.boolean().optional(), shuffle_options: z.boolean().optional(), max_attempts: z.number().int().min(1).max(10).optional(),
  show_result: z.enum(['IMMEDIATE', 'AFTER_CLOSE', 'NEVER']).optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(), grade_component: z.string().max(20).nullable().optional(),
  question_ids: z.array(z.string()).optional(), questions: z.array(z.object({ question_id: z.string(), points: z.number().min(0.5).max(100).optional() })).optional(),
});

const SELECT = `q.*, cs.class_id, cs.subject_id, c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name,
  (SELECT COUNT(*) FROM \`${T('quiz_questions')}\` qq WHERE qq.quiz_id = q.id) AS question_count, (SELECT COALESCE(SUM(points),0) FROM \`${T('quiz_questions')}\` qq2 WHERE qq2.quiz_id = q.id) AS total_points,
  (SELECT COUNT(DISTINCT student_id) FROM \`${T('quiz_attempts')}\` qa WHERE qa.quiz_id = q.id AND qa.status <> 'IN_PROGRESS') AS attempted_count,
  (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = cs.class_id AND e.status = 'AKTIF') AS student_count`;
const FROM = `FROM \`${T('quizzes')}\` q JOIN \`${T('class_subjects')}\` cs ON cs.id = q.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = cs.teacher_id`;

const isOpen = (qz: Record<string, unknown>) => {
  const now = Date.now();
  if (qz.status !== 'PUBLISHED') return false;
  if (qz.open_at && now < new Date(qz.open_at as string).getTime()) return false;
  if (qz.close_at && now > new Date(qz.close_at as string).getTime()) return false;
  return true;
};

r.get('/', requirePermission('quiz:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const sc = classSubjectScope(u);
  const params: unknown[] = [u.tenantId, ...sc.params];
  let where = `WHERE q.tenant_id = ? AND ${sc.sql}`;
  const student = hasRole(u, 'SISWA') && !isTenantWide(u);
  if (student) where += " AND q.status <> 'DRAFT'";
  if (str(req.query.class_subject_id)) { where += ' AND q.class_subject_id = ?'; params.push(String(req.query.class_subject_id)); }
  if (str(req.query.status)) { where += ' AND q.status = ?'; params.push(String(req.query.status)); }
  const qs = str(req.query.q);
  if (qs) { where += ' AND q.title LIKE ?'; params.push(`%${qs}%`); }
  const my = student ? `, (SELECT COUNT(*) FROM \`${T('quiz_attempts')}\` a WHERE a.quiz_id = q.id AND a.student_id = ?) AS my_attempts, (SELECT MAX(score) FROM \`${T('quiz_attempts')}\` a2 WHERE a2.quiz_id = q.id AND a2.student_id = ? AND a2.status IN ('SUBMITTED','GRADED')) AS my_best` : '';
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${FROM} ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT ${SELECT}${my} ${FROM} ${where} ORDER BY q.created_at DESC LIMIT ? OFFSET ?`, [...(student ? [u.id, u.id] : []), ...params, limit, offset]);
  paged(res, rows.map((x) => ({ ...x, is_open: isOpen(x) })), { page, limit, total });
}));

r.get('/:id', requirePermission('quiz:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const qz = await queryOne(`SELECT ${SELECT} ${FROM} WHERE q.id = ? AND q.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!qz) throw notFound();
  await assertClassSubject(u, String(qz.class_subject_id));
  const student = hasRole(u, 'SISWA') && !isTenantWide(u);
  if (student && qz.status === 'DRAFT') throw notFound();
  const questions = student ? [] : (await query(`SELECT qq.order_no, qq.points, qu.* FROM \`${T('quiz_questions')}\` qq JOIN \`${T('questions')}\` qu ON qu.id = qq.question_id WHERE qq.quiz_id = ? ORDER BY qq.order_no`, [qz.id])).map((x) => presentQuestion(x));
  const attempts = student
    ? await query(`SELECT id, attempt_no, started_at, submitted_at, status, score, max_score FROM \`${T('quiz_attempts')}\` WHERE quiz_id = ? AND student_id = ? ORDER BY attempt_no`, [qz.id, u.id])
    : await query(`SELECT a.id, a.student_id, st.full_name, a.attempt_no, a.started_at, a.submitted_at, a.status, a.score, a.max_score FROM \`${T('quiz_attempts')}\` a JOIN \`${T('users')}\` st ON st.id = a.student_id WHERE a.quiz_id = ? ORDER BY st.full_name, a.attempt_no`, [qz.id]);
  ok(res, { ...qz, is_open: isOpen(qz), questions, attempts });
}));

async function saveQuestions(quizId: string, tenantId: string, items: { question_id: string; points?: number }[], exec: import('../../database/db').Exec) {
  await execute(`DELETE FROM \`${T('quiz_questions')}\` WHERE quiz_id = ?`, [quizId], exec);
  let i = 0;
  for (const it of items) {
    const qrow = await queryOne(`SELECT id, points FROM \`${T('questions')}\` WHERE id = ? AND tenant_id = ?`, [it.question_id, tenantId], exec);
    if (!qrow) continue;
    await insertRow('quiz_questions', { id: newId(), quiz_id: quizId, question_id: it.question_id, order_no: i++, points: it.points ?? Number(qrow.points) ?? 1 }, exec);
    await execute(`UPDATE \`${T('questions')}\` SET usage_count = usage_count + 1 WHERE id = ?`, [it.question_id], exec);
  }
}
const itemsOf = (b: { question_ids?: string[]; questions?: { question_id: string; points?: number }[] }) => b.questions ?? b.question_ids?.map((question_id) => ({ question_id }));

r.post('/', requirePermission('quiz:write'), validate(schema), wrap(async (req, res) => {
  const u = req.auth!;
  const cs = await assertClassSubject(u, req.body.class_subject_id, { teach: true });
  const id = newId();
  const { question_ids, questions, ...rest } = req.body;
  await withTransaction(async (conn) => {
    await insertRow('quizzes', { id, tenant_id: u.tenantId, ...rest, open_at: rest.open_at ? new Date(rest.open_at) : null, close_at: rest.close_at ? new Date(rest.close_at) : null, created_by: u.id }, conn);
    const items = itemsOf({ question_ids, questions });
    if (items) await saveQuestions(id, u.tenantId, items, conn);
  });
  if (rest.status === 'PUBLISHED') await notify({ tenantId: u.tenantId, userIds: await studentIdsOfClass(String(cs.class_id)), type: 'QUIZ', title: `Kuis baru: ${rest.title}`, link: `/siswa/kuis/${id}` });
  await audit(req, 'quiz.create', 'quizzes', id, undefined, { title: rest.title });
  ok(res, await queryOne(`SELECT ${SELECT} ${FROM} WHERE q.id = ?`, [id]), 201);
}));

r.put('/:id', requirePermission('quiz:write'), validate(schema.partial()), wrap(async (req, res) => {
  const u = req.auth!;
  const qz = await queryOne(`SELECT * FROM \`${T('quizzes')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!qz) throw notFound();
  const cs = await assertClassSubject(u, String(qz.class_subject_id), { teach: true });
  const { question_ids, questions, ...rest } = req.body;
  const b = { ...rest } as Record<string, unknown>;
  if (b.open_at !== undefined) b.open_at = b.open_at ? new Date(String(b.open_at)) : null;
  if (b.close_at !== undefined) b.close_at = b.close_at ? new Date(String(b.close_at)) : null;
  await withTransaction(async (conn) => {
    await updateRow('quizzes', String(qz.id), b, conn, u.tenantId);
    const items = itemsOf({ question_ids, questions });
    if (items) {
      const started = await queryOne(`SELECT id FROM \`${T('quiz_attempts')}\` WHERE quiz_id = ? LIMIT 1`, [qz.id], conn);
      if (started) throw badRequest('Soal tidak bisa diubah setelah ada siswa yang mengerjakan');
      await saveQuestions(String(qz.id), u.tenantId, items, conn);
    }
  });
  if (b.status === 'PUBLISHED' && qz.status !== 'PUBLISHED') await notify({ tenantId: u.tenantId, userIds: await studentIdsOfClass(String(cs.class_id)), type: 'QUIZ', title: `Kuis baru: ${b.title ?? qz.title}`, link: `/siswa/kuis/${qz.id}` });
  await audit(req, 'quiz.update', 'quizzes', String(qz.id), qz, b);
  ok(res, await queryOne(`SELECT ${SELECT} ${FROM} WHERE q.id = ?`, [qz.id]));
}));

r.delete('/:id', requirePermission('quiz:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const qz = await queryOne(`SELECT * FROM \`${T('quizzes')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!qz) throw notFound();
  await assertClassSubject(u, String(qz.class_subject_id), { teach: true });
  await execute(`DELETE FROM \`${T('quizzes')}\` WHERE id = ?`, [qz.id]);
  await audit(req, 'quiz.delete', 'quizzes', String(qz.id), qz);
  ok(res, { deleted: true });
}));

// ---------- Attempts (student) ----------
const shuffle = <X,>(arr: X[]) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

r.post('/:id/start', requirePermission('quiz:attempt'), wrap(async (req, res) => {
  const u = req.auth!;
  const qz = await queryOne(`SELECT * FROM \`${T('quizzes')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!qz) throw notFound();
  await assertClassSubject(u, String(qz.class_subject_id));
  if (!isOpen(qz)) throw badRequest('Kuis belum dibuka atau sudah ditutup');
  const inProgress = await queryOne(`SELECT * FROM \`${T('quiz_attempts')}\` WHERE quiz_id = ? AND student_id = ? AND status = 'IN_PROGRESS'`, [qz.id, u.id]);
  if (inProgress) {
    if (new Date(inProgress.deadline_at) < new Date()) await finalizeAttempt(String(inProgress.id), 'EXPIRED');
    else return ok(res, await attemptView(String(inProgress.id), u.id));
  }
  const count = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('quiz_attempts')}\` WHERE quiz_id = ? AND student_id = ?`, [qz.id, u.id]))?.c ?? 0);
  if (count >= Number(qz.max_attempts)) throw badRequest('Kesempatan mengerjakan sudah habis');
  const qs = await query(`SELECT question_id FROM \`${T('quiz_questions')}\` WHERE quiz_id = ? ORDER BY order_no`, [qz.id]);
  if (!qs.length) throw badRequest('Kuis belum punya soal');
  let order = qs.map((x) => String(x.question_id));
  if (qz.shuffle_questions) order = shuffle(order);
  const id = newId();
  const deadline = new Date(Math.min(Date.now() + Number(qz.duration_min) * 60_000, qz.close_at ? new Date(qz.close_at).getTime() : Infinity));
  await insertRow('quiz_attempts', { id, tenant_id: u.tenantId, quiz_id: qz.id, student_id: u.id, attempt_no: count + 1, started_at: new Date(), deadline_at: deadline, status: 'IN_PROGRESS', question_order: order });
  await audit(req, 'quiz.start', 'quiz_attempts', id);
  ok(res, await attemptView(id, u.id), 201);
}));

async function attemptView(attemptId: string, studentId: string) {
  const a = await queryOne(`SELECT a.*, q.title, q.duration_min, q.shuffle_options, q.show_result, q.close_at FROM \`${T('quiz_attempts')}\` a JOIN \`${T('quizzes')}\` q ON q.id = a.quiz_id WHERE a.id = ? AND a.student_id = ?`, [attemptId, studentId]);
  if (!a) throw notFound();
  const order: string[] = typeof a.question_order === 'string' ? JSON.parse(a.question_order) : a.question_order ?? [];
  const qs = order.length ? await query(`SELECT qu.*, qq.points AS quiz_points FROM \`${T('questions')}\` qu JOIN \`${T('quiz_questions')}\` qq ON qq.question_id = qu.id AND qq.quiz_id = ? WHERE qu.id IN (${order.map(() => '?').join(',')})`, [a.quiz_id, ...order]) : [];
  const byId = new Map(qs.map((q) => [String(q.id), q]));
  const answers = await query(`SELECT question_id, answer FROM \`${T('quiz_answers')}\` WHERE attempt_id = ?`, [attemptId]);
  const ansMap = new Map(answers.map((x) => [String(x.question_id), typeof x.answer === 'string' ? JSON.parse(x.answer) : x.answer]));
  const finished = a.status !== 'IN_PROGRESS';
  const questions = order.map((qid, i) => {
    const q = byId.get(qid);
    if (!q) return null;
    const p = presentQuestion(q, !finished);
    if (!finished && a.shuffle_options && Array.isArray(p.options)) p.options = shuffleSeeded(p.options as unknown[], `${attemptId}:${qid}`);
    return { no: i + 1, ...p, points: Number(q.quiz_points), my_answer: ansMap.get(qid) ?? null } as Record<string, unknown> & { no: number };
  }).filter(Boolean);
  return { id: a.id, quiz_id: a.quiz_id, title: a.title, status: a.status, started_at: a.started_at, deadline_at: a.deadline_at, submitted_at: a.submitted_at, score: a.score, max_score: a.max_score, remaining_sec: Math.max(0, Math.floor((new Date(a.deadline_at).getTime() - Date.now()) / 1000)), show_result: a.show_result, questions };
}
/** Deterministic shuffle so a re-fetch of the same attempt keeps option order stable. */
function shuffleSeeded<X>(arr: X[], seed: string): X[] {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

r.get('/attempts/:attemptId', requirePermission('quiz:attempt', 'quiz:grade'), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT * FROM \`${T('quiz_attempts')}\` WHERE id = ? AND tenant_id = ?`, [req.params.attemptId, u.tenantId]);
  if (!a) throw notFound();
  if (a.student_id !== u.id) {
    const qz = await queryOne(`SELECT class_subject_id FROM \`${T('quizzes')}\` WHERE id = ?`, [a.quiz_id]);
    await assertClassSubject(u, String(qz!.class_subject_id), { teach: true });
  }
  const view = await attemptView(String(a.id), String(a.student_id));
  if (a.student_id === u.id && view.status !== 'IN_PROGRESS' && (view.show_result === 'NEVER' || (view.show_result === 'AFTER_CLOSE' && (!view.questions.length || !(await quizClosed(String(a.quiz_id))))))) {
    view.questions = view.questions.map((q) => ({ ...q!, answer_key: undefined, explanation: undefined, options: Array.isArray(q!.options) ? (q!.options as { key: string; text: string }[]).map((o) => ({ key: o.key, text: o.text })) : q!.options }));
    if (view.show_result === 'NEVER') { view.score = null; }
  }
  ok(res, view);
}));
const quizClosed = async (quizId: string) => { const q = await queryOne(`SELECT status, close_at FROM \`${T('quizzes')}\` WHERE id = ?`, [quizId]); return !q || q.status === 'CLOSED' || (q.close_at && new Date(q.close_at) < new Date()); };

r.post('/attempts/:attemptId/answer', requirePermission('quiz:attempt'), validate(z.object({ question_id: z.string(), answer: z.any() })), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT * FROM \`${T('quiz_attempts')}\` WHERE id = ? AND student_id = ? AND status = 'IN_PROGRESS'`, [req.params.attemptId, u.id]);
  if (!a) throw badRequest('Percobaan tidak aktif');
  if (new Date(a.deadline_at) < new Date()) { await finalizeAttempt(String(a.id), 'EXPIRED'); throw badRequest('Waktu habis, jawaban otomatis dikumpulkan'); }
  await execute(`INSERT INTO \`${T('quiz_answers')}\` (id, attempt_id, question_id, answer, answered_at) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE answer = VALUES(answer), answered_at = NOW()`, [newId(), a.id, req.body.question_id, JSON.stringify(req.body.answer ?? null)]);
  ok(res, { saved: true, remaining_sec: Math.max(0, Math.floor((new Date(a.deadline_at).getTime() - Date.now()) / 1000)) });
}));

r.post('/attempts/:attemptId/submit', requirePermission('quiz:attempt'), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT * FROM \`${T('quiz_attempts')}\` WHERE id = ? AND student_id = ?`, [req.params.attemptId, u.id]);
  if (!a) throw notFound();
  if (a.status !== 'IN_PROGRESS') return ok(res, await attemptView(String(a.id), u.id));
  await finalizeAttempt(String(a.id), 'SUBMITTED');
  await audit(req, 'quiz.submit', 'quiz_attempts', String(a.id));
  ok(res, await attemptView(String(a.id), u.id));
}));

/** Auto-grades every answer, stores the score, and pushes a KUIS grade when no essay is pending. */
export async function finalizeAttempt(attemptId: string, status: 'SUBMITTED' | 'EXPIRED') {
  const a = await queryOne(`SELECT a.*, q.class_subject_id, q.grade_component, q.title FROM \`${T('quiz_attempts')}\` a JOIN \`${T('quizzes')}\` q ON q.id = a.quiz_id WHERE a.id = ?`, [attemptId]);
  if (!a) return;
  const qs = await query(`SELECT qu.id, qu.type, qu.answer_key, qu.options, qq.points FROM \`${T('quiz_questions')}\` qq JOIN \`${T('questions')}\` qu ON qu.id = qq.question_id WHERE qq.quiz_id = ?`, [a.quiz_id]);
  const answers = await query(`SELECT question_id, answer FROM \`${T('quiz_answers')}\` WHERE attempt_id = ?`, [attemptId]);
  const ansMap = new Map(answers.map((x) => [String(x.question_id), typeof x.answer === 'string' ? JSON.parse(x.answer) : x.answer]));
  let total = 0; let max = 0; let pendingEssay = false;
  for (const q of qs) {
    max += Number(q.points);
    const ans = ansMap.get(String(q.id));
    const s = scoreAnswer({ type: String(q.type), answer_key: q.answer_key, options: q.options, points: Number(q.points) }, ans);
    if (s.score === null) { pendingEssay = true; }
    else total += s.score;
    await execute(`INSERT INTO \`${T('quiz_answers')}\` (id, attempt_id, question_id, answer, is_correct, score, answered_at) VALUES (?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE is_correct = VALUES(is_correct), score = VALUES(score)`, [newId(), attemptId, q.id, JSON.stringify(ans ?? null), s.is_correct === null ? null : s.is_correct ? 1 : 0, s.score]);
  }
  const score100 = max ? Math.round((total / max) * 10000) / 100 : 0;
  await execute(`UPDATE \`${T('quiz_attempts')}\` SET status = ?, submitted_at = NOW(), score = ?, max_score = ? WHERE id = ?`, [pendingEssay ? status : 'GRADED', score100, 100, attemptId]);
  if (!pendingEssay) await pushQuizGrade(a, score100);
}

async function pushQuizGrade(a: Record<string, unknown>, score: number) {
  // Best attempt counts.
  const best = await queryOne(`SELECT MAX(score) AS s FROM \`${T('quiz_attempts')}\` WHERE quiz_id = ? AND student_id = ? AND status = 'GRADED'`, [a.quiz_id, a.student_id]);
  await upsertGrade({ tenantId: String(a.tenant_id), classSubjectId: String(a.class_subject_id), studentId: String(a.student_id), component: String(a.grade_component || 'KUIS'), sourceType: 'QUIZ', sourceId: String(a.quiz_id), title: String(a.title), score: Number(best?.s ?? score), maxScore: 100 });
}

/** Teacher grades essay answers. */
r.post('/attempts/:attemptId/grade', requirePermission('quiz:grade'), validate(z.object({ scores: z.array(z.object({ question_id: z.string(), score: z.number().min(0) })) })), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT a.*, q.class_subject_id, q.grade_component, q.title FROM \`${T('quiz_attempts')}\` a JOIN \`${T('quizzes')}\` q ON q.id = a.quiz_id WHERE a.id = ? AND a.tenant_id = ?`, [req.params.attemptId, u.tenantId]);
  if (!a) throw notFound();
  await assertClassSubject(u, String(a.class_subject_id), { teach: true });
  for (const s of req.body.scores) {
    const qq = await queryOne(`SELECT points FROM \`${T('quiz_questions')}\` WHERE quiz_id = ? AND question_id = ?`, [a.quiz_id, s.question_id]);
    if (!qq) continue;
    const sc = Math.min(Number(qq.points), s.score);
    await execute(`INSERT INTO \`${T('quiz_answers')}\` (id, attempt_id, question_id, answer, is_correct, score, graded_by, answered_at) VALUES (?,?,?,NULL,?,?,?,NOW()) ON DUPLICATE KEY UPDATE score = VALUES(score), is_correct = VALUES(is_correct), graded_by = VALUES(graded_by)`, [newId(), a.id, s.question_id, sc >= Number(qq.points) ? 1 : 0, sc, u.id]);
  }
  const sums = await queryOne(`SELECT COALESCE(SUM(qa.score),0) AS total, (SELECT COALESCE(SUM(points),0) FROM \`${T('quiz_questions')}\` WHERE quiz_id = ?) AS max, SUM(qa.score IS NULL) AS pending FROM \`${T('quiz_answers')}\` qa WHERE qa.attempt_id = ?`, [a.quiz_id, a.id]);
  const score100 = Number(sums?.max) ? Math.round((Number(sums?.total) / Number(sums?.max)) * 10000) / 100 : 0;
  const done = !Number(sums?.pending);
  await execute(`UPDATE \`${T('quiz_attempts')}\` SET score = ?, max_score = 100, status = ? WHERE id = ?`, [score100, done ? 'GRADED' : a.status, a.id]);
  if (done) { await pushQuizGrade(a, score100); await notify({ tenantId: u.tenantId, userIds: [String(a.student_id)], type: 'GRADE', title: `Nilai kuis: ${a.title}`, body: `Skor ${score100}`, link: `/siswa/kuis/${a.quiz_id}` }); }
  await audit(req, 'quiz.grade_essay', 'quiz_attempts', String(a.id));
  ok(res, { score: score100, status: done ? 'GRADED' : a.status });
}));

/** Item analysis + concept mastery for a quiz (teacher). */
r.get('/:id/analysis', requirePermission('quiz:grade', 'quiz:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const qz = await queryOne(`SELECT * FROM \`${T('quizzes')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!qz) throw notFound();
  await assertClassSubject(u, String(qz.class_subject_id));
  const items = await query(`SELECT qu.id, qu.text, qu.type, qu.difficulty, cp.name AS concept_name, qq.points,
      COUNT(qa.id) AS answered, SUM(qa.is_correct = 1) AS correct, AVG(qa.score / NULLIF(qq.points,0)) AS avg_ratio
    FROM \`${T('quiz_questions')}\` qq JOIN \`${T('questions')}\` qu ON qu.id = qq.question_id LEFT JOIN \`${T('concepts')}\` cp ON cp.id = qu.concept_id
    LEFT JOIN \`${T('quiz_attempts')}\` at ON at.quiz_id = qq.quiz_id AND at.status IN ('SUBMITTED','GRADED','EXPIRED')
    LEFT JOIN \`${T('quiz_answers')}\` qa ON qa.attempt_id = at.id AND qa.question_id = qu.id
    WHERE qq.quiz_id = ? GROUP BY qu.id, qu.text, qu.type, qu.difficulty, cp.name, qq.points ORDER BY qq.order_no`, [qz.id]);
  const dist = await query(`SELECT qa.question_id, qa.answer, COUNT(*) AS c FROM \`${T('quiz_answers')}\` qa JOIN \`${T('quiz_attempts')}\` at ON at.id = qa.attempt_id WHERE at.quiz_id = ? AND at.status <> 'IN_PROGRESS' GROUP BY qa.question_id, qa.answer`, [qz.id]);
  const scores = await query(`SELECT score FROM \`${T('quiz_attempts')}\` WHERE quiz_id = ? AND status IN ('SUBMITTED','GRADED')`, [qz.id]);
  const arr = scores.map((s) => Number(s.score));
  const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  ok(res, { items: items.map((it) => ({ ...it, difficulty_index: it.answered ? Number(it.correct) / Number(it.answered) : null, distribution: dist.filter((d) => d.question_id === it.id).map((d) => ({ answer: typeof d.answer === 'string' ? JSON.parse(d.answer) : d.answer, count: Number(d.c) })) })), summary: { attempts: arr.length, average: avg === null ? null : Math.round(avg * 100) / 100, max: arr.length ? Math.max(...arr) : null, min: arr.length ? Math.min(...arr) : null } });
}));

export default r;
