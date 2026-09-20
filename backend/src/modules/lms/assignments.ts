import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit, notify, fileUrl } from '../../core/services';
import { newId } from '../../core/ids';
import { insertRow, updateRow } from '../../core/crud';
import { assertClassSubject, classSubjectScope, isTenantWide, studentIdsOfClass, assertStudentAccess } from '../../core/scope';
import { hasRole } from '../../core/auth';
import { upsertGrade } from './grades';

const r = Router();

const schema = z.object({
  class_subject_id: z.string(), title: z.string().min(2).max(200), instructions: z.string().max(20000).nullable().optional(), attachment_file_id: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(), allow_late: z.boolean().optional(), max_score: z.number().min(1).max(1000).optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(),
  submission_type: z.enum(['TEXT', 'FILE', 'BOTH']).optional(),
});

const SELECT = `a.*, cs.class_id, cs.subject_id, c.name AS class_name, s.name AS subject_name, u.full_name AS teacher_name, f.original_name AS attachment_name,
  (SELECT COUNT(*) FROM \`${T('submissions')}\` sb WHERE sb.assignment_id = a.id AND sb.status IN ('SUBMITTED','GRADED','RETURNED')) AS submitted_count,
  (SELECT COUNT(*) FROM \`${T('submissions')}\` sb2 WHERE sb2.assignment_id = a.id AND sb2.status = 'GRADED') AS graded_count,
  (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = cs.class_id AND e.status = 'AKTIF') AS student_count`;
const FROM = `FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = cs.teacher_id LEFT JOIN \`${T('files')}\` f ON f.id = a.attachment_file_id`;
const present = (row: Record<string, unknown>) => ({ ...row, attachment_url: fileUrl(row.attachment_file_id as string | null) });

r.get('/', requirePermission('assignment:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const sc = classSubjectScope(u);
  const params: unknown[] = [u.tenantId, ...sc.params];
  let where = `WHERE a.tenant_id = ? AND ${sc.sql}`;
  const student = hasRole(u, 'SISWA') && !isTenantWide(u);
  if (student || hasRole(u, 'WALI_MURID')) where += " AND a.status <> 'DRAFT'";
  if (str(req.query.class_subject_id)) { where += ' AND a.class_subject_id = ?'; params.push(String(req.query.class_subject_id)); }
  if (str(req.query.class_id)) { where += ' AND cs.class_id = ?'; params.push(String(req.query.class_id)); }
  if (str(req.query.status)) { where += ' AND a.status = ?'; params.push(String(req.query.status)); }
  const q = str(req.query.q);
  if (q) { where += ' AND a.title LIKE ?'; params.push(`%${q}%`); }
  const mySub = student ? `, (SELECT sb.status FROM \`${T('submissions')}\` sb WHERE sb.assignment_id = a.id AND sb.student_id = ?) AS my_status, (SELECT sb.score FROM \`${T('submissions')}\` sb WHERE sb.assignment_id = a.id AND sb.student_id = ?) AS my_score` : '';
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${FROM} ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT ${SELECT}${mySub} ${FROM} ${where} ORDER BY COALESCE(a.due_at, a.created_at) DESC LIMIT ? OFFSET ?`, [...(student ? [u.id, u.id] : []), ...params, limit, offset]);
  paged(res, rows.map(present), { page, limit, total });
}));

r.get('/:id', requirePermission('assignment:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const row = await queryOne(`SELECT ${SELECT} ${FROM} WHERE a.id = ? AND a.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!row) throw notFound();
  await assertClassSubject(u, String(row.class_subject_id));
  if (row.status === 'DRAFT' && hasRole(u, 'SISWA', 'WALI_MURID') && !isTenantWide(u)) throw notFound();
  let my_submission = null;
  if (hasRole(u, 'SISWA')) my_submission = await queryOne(`SELECT sb.*, f.original_name AS attachment_name FROM \`${T('submissions')}\` sb LEFT JOIN \`${T('files')}\` f ON f.id = sb.attachment_file_id WHERE sb.assignment_id = ? AND sb.student_id = ?`, [row.id, u.id]);
  ok(res, { ...present(row), my_submission: my_submission ? { ...my_submission, attachment_url: fileUrl(my_submission.attachment_file_id) } : null });
}));

r.post('/', requirePermission('assignment:write'), validate(schema), wrap(async (req, res) => {
  const u = req.auth!;
  const cs = await assertClassSubject(u, req.body.class_subject_id, { teach: true });
  const id = newId();
  await insertRow('assignments', { id, tenant_id: u.tenantId, ...req.body, due_at: req.body.due_at ? new Date(req.body.due_at) : null, created_by: u.id });
  if (req.body.status === 'PUBLISHED') await notifyStudents(u.tenantId, String(cs.class_id), id, req.body.title, req.body.due_at);
  await audit(req, 'assignment.create', 'assignments', id, undefined, { title: req.body.title });
  ok(res, present((await queryOne(`SELECT ${SELECT} ${FROM} WHERE a.id = ?`, [id]))!), 201);
}));

async function notifyStudents(tenantId: string, classId: string, id: string, title: string, due?: string | null) {
  const ids = await studentIdsOfClass(classId);
  await notify({ tenantId, userIds: ids, type: 'ASSIGNMENT', title: `Tugas baru: ${title}`, body: due ? `Tenggat ${new Date(due).toLocaleString('id-ID')}` : undefined, link: `/siswa/tugas/${id}` });
}

r.put('/:id', requirePermission('assignment:write'), validate(schema.partial()), wrap(async (req, res) => {
  const u = req.auth!;
  const row = await queryOne(`SELECT * FROM \`${T('assignments')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!row) throw notFound();
  const cs = await assertClassSubject(u, String(row.class_subject_id), { teach: true });
  const b = { ...req.body } as Record<string, unknown>;
  if (b.due_at !== undefined) b.due_at = b.due_at ? new Date(String(b.due_at)) : null;
  await updateRow('assignments', String(row.id), b, undefined, u.tenantId);
  if (b.status === 'PUBLISHED' && row.status !== 'PUBLISHED') await notifyStudents(u.tenantId, String(cs.class_id), String(row.id), String(b.title ?? row.title), (b.due_at as Date | null)?.toISOString?.() ?? (row.due_at ? new Date(row.due_at).toISOString() : null));
  await audit(req, 'assignment.update', 'assignments', String(row.id), row, b);
  ok(res, present((await queryOne(`SELECT ${SELECT} ${FROM} WHERE a.id = ?`, [row.id]))!));
}));

r.delete('/:id', requirePermission('assignment:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const row = await queryOne(`SELECT * FROM \`${T('assignments')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!row) throw notFound();
  await assertClassSubject(u, String(row.class_subject_id), { teach: true });
  await execute(`DELETE FROM \`${T('assignments')}\` WHERE id = ?`, [row.id]);
  await audit(req, 'assignment.delete', 'assignments', String(row.id), row);
  ok(res, { deleted: true });
}));

// ---------- Submissions ----------
r.get('/:id/submissions', requirePermission('assignment:grade', 'assignment:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT a.*, cs.class_id FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id WHERE a.id = ? AND a.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!a) throw notFound();
  if (hasRole(u, 'SISWA') && !isTenantWide(u)) throw forbidden();
  await assertClassSubject(u, String(a.class_subject_id));
  const rows = await query(`SELECT st.id AS student_id, st.full_name, st.avatar_url, sp.nis, sb.id AS submission_id, sb.status, sb.submitted_at, sb.is_late, sb.score, sb.feedback, sb.graded_at, sb.content, sb.attachment_file_id, f.original_name AS attachment_name
    FROM \`${T('class_students')}\` e JOIN \`${T('users')}\` st ON st.id = e.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id
    LEFT JOIN \`${T('submissions')}\` sb ON sb.assignment_id = ? AND sb.student_id = st.id LEFT JOIN \`${T('files')}\` f ON f.id = sb.attachment_file_id
    WHERE e.class_id = ? AND e.status = 'AKTIF' ORDER BY st.full_name`, [a.id, a.class_id]);
  ok(res, rows.map((x) => ({ ...x, status: x.status ?? 'NONE', attachment_url: fileUrl(x.attachment_file_id) })));
}));

r.post('/:id/submit', requirePermission('assignment:submit'), validate(z.object({ content: z.string().max(50000).nullable().optional(), attachment_file_id: z.string().nullable().optional(), draft: z.boolean().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT a.*, cs.class_id FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id WHERE a.id = ? AND a.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!a) throw notFound();
  await assertClassSubject(u, String(a.class_subject_id));
  if (a.status !== 'PUBLISHED') throw badRequest('Tugas tidak menerima pengumpulan');
  const existing = await queryOne(`SELECT * FROM \`${T('submissions')}\` WHERE assignment_id = ? AND student_id = ?`, [a.id, u.id]);
  if (existing && existing.status === 'GRADED') throw badRequest('Tugas sudah dinilai');
  const now = new Date();
  const late = a.due_at ? now > new Date(a.due_at) : false;
  if (late && !a.allow_late && !req.body.draft) throw badRequest('Tenggat sudah lewat dan tugas tidak menerima keterlambatan');
  if (!req.body.draft && !req.body.content && !req.body.attachment_file_id) throw badRequest('Isi jawaban atau lampirkan berkas');
  const status = req.body.draft ? 'DRAFT' : 'SUBMITTED';
  if (existing) {
    await execute(`UPDATE \`${T('submissions')}\` SET content = ?, attachment_file_id = ?, status = ?, submitted_at = ?, is_late = ? WHERE id = ?`, [req.body.content ?? existing.content, req.body.attachment_file_id ?? existing.attachment_file_id, status, status === 'SUBMITTED' ? now : existing.submitted_at, late ? 1 : 0, existing.id]);
  } else {
    await insertRow('submissions', { id: newId(), tenant_id: u.tenantId, assignment_id: a.id, student_id: u.id, content: req.body.content ?? null, attachment_file_id: req.body.attachment_file_id ?? null, status, submitted_at: status === 'SUBMITTED' ? now : null, is_late: late });
  }
  if (status === 'SUBMITTED') {
    const cs = await queryOne(`SELECT teacher_id FROM \`${T('class_subjects')}\` WHERE id = ?`, [a.class_subject_id]);
    if (cs?.teacher_id) await notify({ tenantId: u.tenantId, userIds: [String(cs.teacher_id)], type: 'SUBMISSION', title: `${u.name} mengumpulkan tugas`, body: String(a.title), link: `/guru/tugas/${a.id}` });
  }
  await audit(req, 'assignment.submit', 'assignments', String(a.id), undefined, { status, late });
  ok(res, await queryOne(`SELECT * FROM \`${T('submissions')}\` WHERE assignment_id = ? AND student_id = ?`, [a.id, u.id]));
}));

r.post('/:id/grade', requirePermission('assignment:grade'), validate(z.object({ grades: z.array(z.object({ student_id: z.string(), score: z.number().min(0).max(1000).nullable(), feedback: z.string().max(4000).nullable().optional(), return: z.boolean().optional() })).min(1) })), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await queryOne(`SELECT a.*, cs.class_id FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id WHERE a.id = ? AND a.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!a) throw notFound();
  await assertClassSubject(u, String(a.class_subject_id), { teach: true });
  let n = 0;
  for (const g of req.body.grades) {
    const sub = await queryOne(`SELECT id FROM \`${T('submissions')}\` WHERE assignment_id = ? AND student_id = ?`, [a.id, g.student_id]);
    const status = g.return ? 'RETURNED' : g.score === null ? 'SUBMITTED' : 'GRADED';
    if (sub) await execute(`UPDATE \`${T('submissions')}\` SET score = ?, feedback = ?, status = ?, graded_by = ?, graded_at = NOW() WHERE id = ?`, [g.score, g.feedback ?? null, status, u.id, sub.id]);
    else await insertRow('submissions', { id: newId(), tenant_id: u.tenantId, assignment_id: a.id, student_id: g.student_id, status, score: g.score, feedback: g.feedback ?? null, graded_by: u.id, graded_at: new Date() });
    if (g.score !== null && !g.return) {
      await upsertGrade({ tenantId: u.tenantId, classSubjectId: String(a.class_subject_id), studentId: g.student_id, component: 'TUGAS', sourceType: 'ASSIGNMENT', sourceId: String(a.id), title: String(a.title), score: g.score, maxScore: Number(a.max_score), gradedBy: u.id });
      await notify({ tenantId: u.tenantId, userIds: [g.student_id], type: 'GRADE', title: `Nilai tugas: ${a.title}`, body: `Skor ${g.score}/${a.max_score}`, link: `/siswa/tugas/${a.id}` });
    } else if (g.return) {
      await notify({ tenantId: u.tenantId, userIds: [g.student_id], type: 'GRADE', title: `Tugas dikembalikan: ${a.title}`, body: g.feedback ?? 'Perbaiki dan kumpulkan lagi', link: `/siswa/tugas/${a.id}` });
    }
    n++;
  }
  await audit(req, 'assignment.grade', 'assignments', String(a.id), undefined, { count: n });
  ok(res, { graded: n });
}));

/** Student/guardian: assignments of one student (for parent portal). */
r.get('/student/:studentId', requirePermission('assignment:read'), wrap(async (req, res) => {
  const u = req.auth!;
  await assertStudentAccess(u, req.params.studentId);
  const rows = await query(`SELECT a.id, a.title, a.due_at, a.max_score, a.status, s.name AS subject_name, sb.status AS submission_status, sb.score, sb.submitted_at, sb.is_late
    FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id
    JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF'
    LEFT JOIN \`${T('submissions')}\` sb ON sb.assignment_id = a.id AND sb.student_id = e.student_id WHERE a.tenant_id = ? AND a.status <> 'DRAFT' ORDER BY a.due_at DESC LIMIT 200`, [req.params.studentId, u.tenantId]);
  ok(res, rows);
}));

export default r;
