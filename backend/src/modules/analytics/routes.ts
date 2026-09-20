import { Router } from 'express';
import { T, PLATFORM_TENANT_ID } from '../../config';
import { query, queryOne } from '../../database/db';
import { wrap, ok, str } from '../../core/http';
import { requirePermission, requireRole } from '../../middlewares';
import { assertClass, assertStudentAccess, classScope } from '../../core/scope';

const r = Router();

/** Answers joined to concepts from quizzes and exams. */
const ANSWER_UNION = (tenantId: string) => `(
  SELECT qa.question_id, qa.is_correct, qa.answer, at.student_id, 'QUIZ' AS source FROM \`${T('quiz_answers')}\` qa JOIN \`${T('quiz_attempts')}\` at ON at.id = qa.attempt_id WHERE at.tenant_id = '${tenantId}' AND at.status IN ('SUBMITTED','GRADED','EXPIRED') AND qa.is_correct IS NOT NULL
  UNION ALL
  SELECT ea.question_id, ea.is_correct, ea.answer, at2.student_id, 'EXAM' FROM \`${T('exam_answers')}\` ea JOIN \`${T('exam_attempts')}\` at2 ON at2.id = ea.attempt_id WHERE at2.tenant_id = '${tenantId}' AND at2.status IN ('SUBMITTED','GRADED') AND ea.is_correct IS NOT NULL
)`;

r.get('/concepts/student/:studentId', requirePermission('grade:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const sid = req.params.studentId === 'me' ? u.id : req.params.studentId;
  await assertStudentAccess(u, sid);
  const rows = await query(`SELECT cp.id, cp.code, cp.name, s.name AS subject_name, COUNT(*) AS answered, SUM(a.is_correct = 1) AS correct
    FROM ${ANSWER_UNION(u.tenantId)} a JOIN \`${T('questions')}\` q ON q.id = a.question_id JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id LEFT JOIN \`${T('subjects')}\` s ON s.id = cp.subject_id
    WHERE a.student_id = ? GROUP BY cp.id, cp.code, cp.name, s.name ORDER BY s.name, cp.code`, [sid]);
  // Most frequent misconceptions (wrong MC picks with labelled distractors)
  const wrong = await query(`SELECT q.id, q.options, a.answer, cp.name AS concept_name FROM ${ANSWER_UNION(u.tenantId)} a JOIN \`${T('questions')}\` q ON q.id = a.question_id LEFT JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id WHERE a.student_id = ? AND a.is_correct = 0 AND q.type = 'MC'`, [sid]);
  const mis = new Map<string, number>();
  for (const w of wrong) { const opts = typeof w.options === 'string' ? JSON.parse(w.options) : w.options; const ans = typeof w.answer === 'string' ? JSON.parse(w.answer) : w.answer; const o = Array.isArray(opts) ? opts.find((x: { key: string }) => x.key === ans) : null; if (o?.misconception) mis.set(`${w.concept_name ?? '-'}|${o.misconception}`, (mis.get(`${w.concept_name ?? '-'}|${o.misconception}`) ?? 0) + 1); }
  ok(res, { concepts: rows.map((x) => ({ ...x, mastery: Number(x.answered) ? Math.round((Number(x.correct) / Number(x.answered)) * 100) : null })), misconceptions: [...mis.entries()].map(([k, count]) => { const [concept, label] = k.split('|'); return { concept, label, count }; }).sort((a, b) => b.count - a.count).slice(0, 10) });
}));

r.get('/concepts/class/:classId', requirePermission('grade:recap', 'grade:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const cls = await assertClass(u, req.params.classId);
  const params: unknown[] = [cls.id];
  let extra = '';
  if (str(req.query.subject_id)) { extra = ' AND cp.subject_id = ?'; params.push(String(req.query.subject_id)); }
  const rows = await query(`SELECT cp.id, cp.code, cp.name, s.name AS subject_name, COUNT(*) AS answered, SUM(a.is_correct = 1) AS correct, COUNT(DISTINCT a.student_id) AS students
    FROM ${ANSWER_UNION(u.tenantId)} a JOIN \`${T('questions')}\` q ON q.id = a.question_id JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id LEFT JOIN \`${T('subjects')}\` s ON s.id = cp.subject_id
    JOIN \`${T('class_students')}\` e ON e.student_id = a.student_id AND e.class_id = ? AND e.status = 'AKTIF' WHERE 1=1${extra} GROUP BY cp.id, cp.code, cp.name, s.name ORDER BY s.name, cp.code`, params);
  const perStudent = await query(`SELECT st.id, st.full_name, cp.id AS concept_id, COUNT(*) AS answered, SUM(a.is_correct = 1) AS correct
    FROM ${ANSWER_UNION(u.tenantId)} a JOIN \`${T('questions')}\` q ON q.id = a.question_id JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id JOIN \`${T('class_students')}\` e ON e.student_id = a.student_id AND e.class_id = ? AND e.status = 'AKTIF' JOIN \`${T('users')}\` st ON st.id = a.student_id
    WHERE 1=1${extra} GROUP BY st.id, st.full_name, cp.id`, params);
  const students = new Map<string, { id: string; full_name: string; mastery: Record<string, number> }>();
  for (const p of perStudent) { const s = students.get(String(p.id)) ?? { id: String(p.id), full_name: String(p.full_name), mastery: {} }; s.mastery[String(p.concept_id)] = Math.round((Number(p.correct) / Number(p.answered)) * 100); students.set(String(p.id), s); }
  ok(res, { class: cls, concepts: rows.map((x) => ({ ...x, mastery: Number(x.answered) ? Math.round((Number(x.correct) / Number(x.answered)) * 100) : null })), students: [...students.values()] });
}));

r.get('/concepts/school', requirePermission('report:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const sc = classScope(u);
  const rows = await query(`SELECT s.name AS subject_name, cp.code, cp.name, COUNT(*) AS answered, SUM(a.is_correct = 1) AS correct, COUNT(DISTINCT a.student_id) AS students
    FROM ${ANSWER_UNION(u.tenantId)} a JOIN \`${T('questions')}\` q ON q.id = a.question_id JOIN \`${T('concepts')}\` cp ON cp.id = q.concept_id LEFT JOIN \`${T('subjects')}\` s ON s.id = cp.subject_id
    WHERE EXISTS (SELECT 1 FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id WHERE e.student_id = a.student_id AND e.status = 'AKTIF' AND ${sc.sql})
    GROUP BY s.name, cp.code, cp.name ORDER BY s.name, cp.code`, sc.params);
  ok(res, rows.map((x) => ({ ...x, mastery: Number(x.answered) ? Math.round((Number(x.correct) / Number(x.answered)) * 100) : null })));
}));

/** School-wide summary report for KEPSEK / admin / auditor. */
r.get('/reports/summary', requirePermission('report:read'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const year = await queryOne(`SELECT id, name FROM \`${T('academic_years')}\` WHERE tenant_id = ? AND is_active = 1`, [tid]);
  const byClass = await query(`SELECT c.id, c.name, c.grade_level, m.code AS major, (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = c.id AND e.status = 'AKTIF') AS students,
      (SELECT ROUND(AVG(g.score / NULLIF(g.max_score,0) * 100),1) FROM \`${T('grades')}\` g JOIN \`${T('class_subjects')}\` cs ON cs.id = g.class_subject_id WHERE cs.class_id = c.id) AS avg_score,
      (SELECT ROUND(SUM(ad.status='H')/NULLIF(COUNT(*),0)*100,1) FROM \`${T('attendance_daily')}\` ad WHERE ad.class_id = c.id AND ad.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS attendance_30d
    FROM \`${T('classes')}\` c LEFT JOIN \`${T('majors')}\` m ON m.id = c.major_id WHERE c.tenant_id = ? AND c.academic_year_id = ? AND c.is_active = 1 ORDER BY c.grade_level, c.name`, [tid, year?.id ?? '']);
  const byMajor = await query(`SELECT m.code, m.name, COUNT(DISTINCT e.student_id) AS students FROM \`${T('majors')}\` m JOIN \`${T('classes')}\` c ON c.major_id = m.id AND c.is_active = 1 JOIN \`${T('class_students')}\` e ON e.class_id = c.id AND e.status = 'AKTIF' WHERE m.tenant_id = ? GROUP BY m.code, m.name`, [tid]);
  const gender = await queryOne(`SELECT SUM(u.gender='L') AS L, SUM(u.gender='P') AS P, COUNT(*) AS total FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id AND r.role = 'SISWA' WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.is_active = 1`, [tid]);
  const subjectAvg = await query(`SELECT s.name, ROUND(AVG(g.score / NULLIF(g.max_score,0) * 100),1) AS avg, COUNT(DISTINCT g.student_id) AS students FROM \`${T('grades')}\` g JOIN \`${T('class_subjects')}\` cs ON cs.id = g.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE g.tenant_id = ? GROUP BY s.name ORDER BY avg DESC`, [tid]);
  const teacherLoad = await query(`SELECT u.full_name, COUNT(cs.id) AS classes, SUM(s.hours_per_week) AS hours, (SELECT COUNT(*) FROM \`${T('materials')}\` m WHERE m.created_by = u.id) AS materials, (SELECT COUNT(*) FROM \`${T('assignments')}\` a WHERE a.created_by = u.id) AS assignments FROM \`${T('users')}\` u JOIN \`${T('class_subjects')}\` cs ON cs.teacher_id = u.id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id AND c.is_active = 1 WHERE u.tenant_id = ? GROUP BY u.id, u.full_name ORDER BY u.full_name`, [tid]);
  const finance = await queryOne(`SELECT (SELECT COALESCE(SUM(amount),0) FROM \`${T('payments')}\` WHERE tenant_id = ? AND status = 'CONFIRMED' AND YEAR(paid_at) = YEAR(CURDATE())) AS income_ytd, (SELECT COALESCE(SUM(amount + late_fee - discount - paid),0) FROM \`${T('invoices')}\` WHERE tenant_id = ? AND status IN ('UNPAID','PARTIAL','OVERDUE')) AS outstanding, (SELECT COUNT(DISTINCT student_id) FROM \`${T('invoices')}\` WHERE tenant_id = ? AND status = 'OVERDUE') AS students_overdue`, [tid, tid, tid]);
  const discipline = await query(`SELECT c.name AS class_name, COUNT(d.id) AS incidents, SUM(d.points) AS points FROM \`${T('discipline_records')}\` d JOIN \`${T('class_students')}\` e ON e.student_id = d.student_id AND e.status = 'AKTIF' JOIN \`${T('classes')}\` c ON c.id = e.class_id WHERE d.tenant_id = ? AND d.incident_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) GROUP BY c.name ORDER BY points DESC LIMIT 10`, [tid]);
  ok(res, { academic_year: year, by_class: byClass, by_major: byMajor, gender, subject_avg: subjectAvg, teacher_load: teacherLoad, finance, discipline });
}));

/** Platform: learning outcomes per region (SUPER_ADMIN). */
r.get('/platform/regions', requireRole('SUPER_ADMIN'), wrap(async (_req, res) => {
  ok(res, await query(`SELECT p.nama AS provinsi, COUNT(DISTINCT t.id) AS tenants, COUNT(DISTINCT r.user_id) AS students,
      (SELECT ROUND(AVG(g.score / NULLIF(g.max_score,0) * 100),1) FROM \`${T('grades')}\` g WHERE g.tenant_id IN (SELECT id FROM \`${T('tenants')}\` WHERE provinsi_id = p.id)) AS avg_score,
      (SELECT COUNT(*) FROM \`${T('materials')}\` m WHERE m.tenant_id IN (SELECT id FROM \`${T('tenants')}\` WHERE provinsi_id = p.id)) AS materials
    FROM \`${T('provinsi')}\` p JOIN \`${T('tenants')}\` t ON t.provinsi_id = p.id AND t.deleted_at IS NULL AND t.id <> ? LEFT JOIN \`${T('user_roles')}\` r ON r.tenant_id = t.id AND r.role = 'SISWA' GROUP BY p.id, p.nama ORDER BY students DESC`, [PLATFORM_TENANT_ID]));
}));

export default r;
