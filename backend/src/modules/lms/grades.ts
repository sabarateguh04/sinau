import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { T } from '../../config';
import { query, queryOne, execute, Exec, getPool } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit, notify } from '../../core/services';
import { newId } from '../../core/ids';
import { insertRow } from '../../core/crud';
import { assertClassSubject, assertStudentAccess, isTenantWide, classSubjectScope } from '../../core/scope';
import { hasRole } from '../../core/auth';

const r = Router();

export const DEFAULT_COMPONENTS = [
  { code: 'TUGAS', name: 'Tugas', weight: 20, order_no: 1 }, { code: 'KUIS', name: 'Kuis', weight: 10, order_no: 2 }, { code: 'UH', name: 'Ulangan Harian', weight: 20, order_no: 3 },
  { code: 'UTS', name: 'Ujian Tengah Semester', weight: 20, order_no: 4 }, { code: 'UAS', name: 'Ujian Akhir Semester', weight: 30, order_no: 5 },
];

export interface GradeInput { tenantId: string; classSubjectId: string; studentId: string; component: string; sourceType: 'ASSIGNMENT' | 'QUIZ' | 'EXAM' | 'MANUAL'; sourceId?: string | null; title?: string; score: number; maxScore: number; gradedBy?: string | null; note?: string | null }
/** Inserts or replaces the grade row for a source (assignment/quiz/exam) so re-grading never duplicates. */
export async function upsertGrade(g: GradeInput, exec: Exec = getPool()) {
  const existing = g.sourceId ? await queryOne(`SELECT id FROM \`${T('grades')}\` WHERE class_subject_id = ? AND student_id = ? AND source_type = ? AND source_id = ?`, [g.classSubjectId, g.studentId, g.sourceType, g.sourceId], exec) : null;
  if (existing) {
    await execute(`UPDATE \`${T('grades')}\` SET score = ?, max_score = ?, component_code = ?, title = ?, graded_by = ?, graded_at = NOW(), note = ? WHERE id = ?`, [g.score, g.maxScore, g.component, g.title ?? null, g.gradedBy ?? null, g.note ?? null, existing.id], exec);
    return String(existing.id);
  }
  const id = newId();
  await insertRow('grades', { id, tenant_id: g.tenantId, class_subject_id: g.classSubjectId, student_id: g.studentId, component_code: g.component, source_type: g.sourceType, source_id: g.sourceId ?? null, title: g.title ?? null, score: g.score, max_score: g.maxScore, graded_by: g.gradedBy ?? null, graded_at: new Date(), note: g.note ?? null }, exec);
  return id;
}

export async function componentsFor(tenantId: string, subjectId: string | null) {
  const rows = await query(`SELECT code, name, weight, order_no, subject_id FROM \`${T('grade_components')}\` WHERE tenant_id = ? AND (subject_id = ? OR subject_id IS NULL) ORDER BY order_no`, [tenantId, subjectId]);
  const specific = rows.filter((x) => x.subject_id);
  const list = specific.length ? specific : rows.filter((x) => !x.subject_id);
  return list.length ? list.map((x) => ({ code: String(x.code), name: String(x.name), weight: Number(x.weight) })) : DEFAULT_COMPONENTS;
}

export async function scaleFor(tenantId: string): Promise<{ min: number; predicate: string; description: string }[]> {
  const s = await queryOne(`SELECT grade_scale FROM \`${T('tenant_settings')}\` WHERE tenant_id = ?`, [tenantId]);
  const parsed = s?.grade_scale ? (typeof s.grade_scale === 'string' ? JSON.parse(s.grade_scale) : s.grade_scale) : null;
  return Array.isArray(parsed) && parsed.length ? parsed : [{ min: 90, predicate: 'A', description: 'Sangat baik' }, { min: 80, predicate: 'B', description: 'Baik' }, { min: 70, predicate: 'C', description: 'Cukup' }, { min: 0, predicate: 'D', description: 'Perlu bimbingan' }];
}
export const predicateOf = (score: number, scale: { min: number; predicate: string; description: string }[]) => scale.slice().sort((a, b) => b.min - a.min).find((s) => score >= s.min) ?? scale[scale.length - 1];

/** Weighted final score per student for one class-subject. */
export async function recapClassSubject(tenantId: string, classSubjectId: string) {
  const cs = await queryOne(`SELECT cs.*, c.name AS class_name, s.name AS subject_name, s.id AS sid FROM \`${T('class_subjects')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE cs.id = ?`, [classSubjectId]);
  if (!cs) throw notFound();
  const components = await componentsFor(tenantId, String(cs.subject_id));
  const scale = await scaleFor(tenantId);
  const students = await query(`SELECT u.id, u.full_name, sp.nis FROM \`${T('class_students')}\` e JOIN \`${T('users')}\` u ON u.id = e.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = u.id WHERE e.class_id = ? AND e.status = 'AKTIF' ORDER BY u.full_name`, [cs.class_id]);
  const grades = await query(`SELECT student_id, component_code, source_type, source_id, title, score, max_score FROM \`${T('grades')}\` WHERE class_subject_id = ?`, [classSubjectId]);
  const totalWeight = components.reduce((a, c) => a + c.weight, 0) || 1;
  const rows = students.map((st) => {
    const mine = grades.filter((g) => g.student_id === st.id);
    const perComponent: Record<string, { avg: number | null; items: { title: string; score: number; max: number; source_type: string; source_id: string | null }[] }> = {};
    let final = 0;
    let weightUsed = 0;
    for (const c of components) {
      const items = mine.filter((g) => g.component_code === c.code).map((g) => ({ title: String(g.title ?? c.name), score: Number(g.score), max: Number(g.max_score) || 100, source_type: String(g.source_type), source_id: g.source_id ? String(g.source_id) : null }));
      const avg = items.length ? items.reduce((a, i) => a + (i.score / i.max) * 100, 0) / items.length : null;
      perComponent[c.code] = { avg: avg === null ? null : Math.round(avg * 100) / 100, items };
      if (avg !== null) { final += avg * c.weight; weightUsed += c.weight; }
    }
    const finalScore = weightUsed ? Math.round((final / (weightUsed >= totalWeight ? totalWeight : weightUsed)) * 100) / 100 : null;
    return { student_id: st.id, full_name: st.full_name, nis: st.nis, components: perComponent, final_score: finalScore, predicate: finalScore === null ? null : predicateOf(finalScore, scale).predicate };
  });
  return { class_subject: { id: cs.id, class_name: cs.class_name, subject_name: cs.subject_name, class_id: cs.class_id, subject_id: cs.subject_id }, components, scale, students: rows };
}

// ---------- Components config ----------
r.get('/components', requirePermission('grade:read'), wrap(async (req, res) => {
  const subjectId = typeof req.query.subject_id === 'string' && req.query.subject_id ? req.query.subject_id : null;
  ok(res, { components: await componentsFor(req.auth!.tenantId, subjectId), defaults: DEFAULT_COMPONENTS, all: await query(`SELECT * FROM \`${T('grade_components')}\` WHERE tenant_id = ? ORDER BY subject_id, order_no`, [req.auth!.tenantId]) });
}));
r.put('/components', requirePermission('academic:write'), validate(z.object({ subject_id: z.string().nullable().optional(), components: z.array(z.object({ code: z.string().min(1).max(20), name: z.string().min(1).max(60), weight: z.number().min(0).max(100) })).min(1) })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const sum = req.body.components.reduce((a: number, c: { weight: number }) => a + c.weight, 0);
  if (Math.round(sum) !== 100) throw badRequest(`Total bobot harus 100 (sekarang ${sum})`);
  const sid = req.body.subject_id ?? null;
  await execute(`DELETE FROM \`${T('grade_components')}\` WHERE tenant_id = ? AND ${sid ? 'subject_id = ?' : 'subject_id IS NULL'}`, sid ? [tid, sid] : [tid]);
  let i = 0;
  for (const c of req.body.components) await insertRow('grade_components', { id: newId(), tenant_id: tid, subject_id: sid, code: c.code.toUpperCase(), name: c.name, weight: c.weight, order_no: i++ });
  await audit(req, 'grade.components_update', 'grade_components', sid ?? 'default', undefined, req.body);
  ok(res, { saved: true });
}));

// ---------- Manual grades ----------
r.get('/class-subject/:id', requirePermission('grade:read', 'grade:recap'), wrap(async (req, res) => {
  const u = req.auth!;
  await assertClassSubject(u, req.params.id);
  const recap = await recapClassSubject(u.tenantId, req.params.id);
  if (hasRole(u, 'SISWA') && !isTenantWide(u)) recap.students = recap.students.filter((s) => s.student_id === u.id);
  ok(res, recap);
}));

r.post('/class-subject/:id', requirePermission('grade:write'), validate(z.object({ component: z.string().min(1).max(20), title: z.string().min(1).max(200), max_score: z.number().min(1).max(1000).default(100), source_id: z.string().optional(), scores: z.array(z.object({ student_id: z.string(), score: z.number().min(0).max(1000).nullable(), note: z.string().max(255).nullable().optional() })).min(1) })), wrap(async (req, res) => {
  const u = req.auth!;
  await assertClassSubject(u, req.params.id, { teach: true });
  const sourceId = req.body.source_id ?? newId(); // groups the manual column
  let n = 0;
  for (const s of req.body.scores) {
    if (s.score === null) { await execute(`DELETE FROM \`${T('grades')}\` WHERE class_subject_id = ? AND student_id = ? AND source_type = 'MANUAL' AND source_id = ?`, [req.params.id, s.student_id, sourceId]); continue; }
    await upsertGrade({ tenantId: u.tenantId, classSubjectId: req.params.id, studentId: s.student_id, component: req.body.component.toUpperCase(), sourceType: 'MANUAL', sourceId, title: req.body.title, score: s.score, maxScore: req.body.max_score, gradedBy: u.id, note: s.note ?? null });
    n++;
  }
  await notify({ tenantId: u.tenantId, userIds: req.body.scores.filter((s: { score: number | null }) => s.score !== null).map((s: { student_id: string }) => s.student_id), type: 'GRADE', title: `Nilai baru: ${req.body.title}`, link: '/siswa/nilai' });
  await audit(req, 'grade.manual', 'grades', sourceId, undefined, { count: n, component: req.body.component });
  ok(res, { saved: n, source_id: sourceId });
}));

r.delete('/class-subject/:id/source/:sourceId', requirePermission('grade:write'), wrap(async (req, res) => {
  await assertClassSubject(req.auth!, req.params.id, { teach: true });
  const d = await execute(`DELETE FROM \`${T('grades')}\` WHERE class_subject_id = ? AND source_type = 'MANUAL' AND source_id = ?`, [req.params.id, req.params.sourceId]);
  ok(res, { deleted: d.affectedRows });
}));

/** All subjects of one student with final score (student card / parent portal). */
r.get('/student/:studentId', requirePermission('grade:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const sid = req.params.studentId === 'me' ? u.id : req.params.studentId;
  await assertStudentAccess(u, sid);
  const enrol = await queryOne(`SELECT e.class_id, c.name AS class_name, c.academic_year_id FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE e.student_id = ? AND e.status = 'AKTIF' AND ay.is_active = 1 LIMIT 1`, [sid]);
  if (!enrol) return ok(res, { class: null, subjects: [] });
  const css = await query(`SELECT cs.id, s.name AS subject_name, s.id AS subject_id, u.full_name AS teacher_name FROM \`${T('class_subjects')}\` cs JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = cs.teacher_id WHERE cs.class_id = ? ORDER BY s.name`, [enrol.class_id]);
  const subjects = [];
  for (const cs of css) {
    const recap = await recapClassSubject(u.tenantId, String(cs.id));
    const me = recap.students.find((s) => s.student_id === sid);
    subjects.push({ class_subject_id: cs.id, subject_id: cs.subject_id, subject_name: cs.subject_name, teacher_name: cs.teacher_name, components: me?.components ?? {}, final_score: me?.final_score ?? null, predicate: me?.predicate ?? null, weights: recap.components });
  }
  ok(res, { class: enrol, subjects });
}));

/** Whole class recap across subjects (homeroom / admin). */
r.get('/class/:classId', requirePermission('grade:recap'), wrap(async (req, res) => {
  const u = req.auth!;
  const cls = await queryOne(`SELECT * FROM \`${T('classes')}\` WHERE id = ? AND tenant_id = ?`, [req.params.classId, u.tenantId]);
  if (!cls) throw notFound();
  if (!isTenantWide(u) && cls.homeroom_teacher_id !== u.id) {
    const sc = classSubjectScope(u);
    const any = await queryOne(`SELECT 1 AS x FROM \`${T('class_subjects')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id WHERE cs.class_id = ? AND ${sc.sql} LIMIT 1`, [cls.id, ...sc.params]);
    if (!any) throw forbidden();
  }
  const css = await query(`SELECT cs.id, s.name AS subject_name FROM \`${T('class_subjects')}\` cs JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE cs.class_id = ? ORDER BY s.name`, [cls.id]);
  const students = await query(`SELECT u.id, u.full_name, sp.nis FROM \`${T('class_students')}\` e JOIN \`${T('users')}\` u ON u.id = e.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = u.id WHERE e.class_id = ? AND e.status = 'AKTIF' ORDER BY u.full_name`, [cls.id]);
  const matrix: Record<string, Record<string, number | null>> = {};
  for (const cs of css) {
    const recap = await recapClassSubject(u.tenantId, String(cs.id));
    for (const s of recap.students) { matrix[s.student_id] ??= {}; matrix[s.student_id][String(cs.id)] = s.final_score; }
  }
  const scale = await scaleFor(u.tenantId);
  const rows = students.map((st) => {
    const scores = css.map((cs) => matrix[String(st.id)]?.[String(cs.id)] ?? null);
    const valid = scores.filter((x): x is number => x !== null);
    const avg = valid.length ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100 : null;
    return { student_id: st.id, full_name: st.full_name, nis: st.nis, scores, average: avg, predicate: avg === null ? null : predicateOf(avg, scale).predicate };
  });
  rows.sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  rows.forEach((row, i) => Object.assign(row, { rank: row.average === null ? null : i + 1 }));
  ok(res, { class: cls, subjects: css, students: rows });
}));

r.get('/class-subject/:id/export', requirePermission('grade:recap'), wrap(async (req, res) => {
  const u = req.auth!;
  await assertClassSubject(u, req.params.id);
  const recap = await recapClassSubject(u.tenantId, req.params.id);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Nilai');
  ws.addRow(['NIS', 'Nama', ...recap.components.map((c) => `${c.name} (${c.weight}%)`), 'Nilai Akhir', 'Predikat']);
  for (const s of recap.students) ws.addRow([safe(s.nis), safe(s.full_name), ...recap.components.map((c) => s.components[c.code]?.avg ?? ''), s.final_score ?? '', s.predicate ?? '']);
  ws.getRow(1).font = { bold: true };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="nilai-${recap.class_subject.class_name}-${recap.class_subject.subject_name}.xlsx"`.replace(/\s+/g, '_'));
  await wb.xlsx.write(res);
  res.end();
}));

/** Neutralise spreadsheet formula injection in exported cells. */
export const safe = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };

export default r;
