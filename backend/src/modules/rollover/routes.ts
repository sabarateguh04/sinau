/**
 * Tutup tahun ajaran: draft → pre-check → dry-run → execute → rollback.
 * Plan per class: PROMOTE (naik ke kelas target di tahun baru), GRADUATE (lulus → alumni), REPEAT (tinggal, pindah ke kelas target tingkat sama).
 * Students with report_cards.promoted = 0 (semester 2) are kept back automatically when the class is promoted.
 */
import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { notFound, badRequest } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { insertRow, mustGet } from '../../core/crud';
import { audit, notify } from '../../core/services';
import { newId } from '../../core/ids';

const r = Router();
const planSchema = z.array(z.object({ class_id: z.string(), action: z.enum(['PROMOTE', 'GRADUATE', 'REPEAT', 'SKIP']), target_class_name: z.string().max(60).nullable().optional(), target_grade_level: z.number().int().min(1).max(13).nullable().optional(), homeroom_teacher_id: z.string().nullable().optional() }));
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
const present = (row: Record<string, unknown>) => ({ ...row, plan: parse(row.plan), checks: parse(row.checks), result: parse(row.result) });

r.get('/runs', requirePermission('rollover:read'), wrap(async (req, res) => ok(res, (await query(`SELECT rr.*, f.name AS from_year, t.name AS to_year, u.full_name AS created_by_name FROM \`${T('rollover_runs')}\` rr JOIN \`${T('academic_years')}\` f ON f.id = rr.from_year_id JOIN \`${T('academic_years')}\` t ON t.id = rr.to_year_id LEFT JOIN \`${T('users')}\` u ON u.id = rr.created_by WHERE rr.tenant_id = ? ORDER BY rr.created_at DESC`, [req.auth!.tenantId])).map(present))));
/** Suggested plan from the current classes (X→XI, XI→XII, XII graduate). */
r.get('/suggest', requirePermission('rollover:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const from = await queryOne(`SELECT * FROM \`${T('academic_years')}\` WHERE tenant_id = ? AND is_active = 1`, [u.tenantId]);
  if (!from) throw badRequest('Tidak ada tahun ajaran aktif');
  const classes = await query(`SELECT c.*, (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = c.id AND e.status = 'AKTIF') AS students, (SELECT COUNT(*) FROM \`${T('report_cards')}\` rc WHERE rc.class_id = c.id AND rc.semester = 2 AND rc.status = 'APPROVED') AS approved_cards, (SELECT COUNT(*) FROM \`${T('report_cards')}\` rc2 WHERE rc2.class_id = c.id AND rc2.semester = 2 AND rc2.promoted = 0) AS held_back FROM \`${T('classes')}\` c WHERE c.academic_year_id = ? AND c.is_active = 1 ORDER BY c.grade_level, c.name`, [from.id]);
  const maxGrade = Math.max(...classes.map((c) => Number(c.grade_level)), 12);
  const [y1, y2] = String(from.name).split('/').map(Number);
  const roman = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'][n] ?? String(n);
  const plan = classes.map((c) => { const g = Number(c.grade_level); const graduate = g >= maxGrade; const name = String(c.name).replace(new RegExp(`^${roman(g)}\\b`), roman(g + 1)); return { class_id: c.id, class_name: c.name, grade_level: g, students: Number(c.students), approved_cards: Number(c.approved_cards), held_back: Number(c.held_back), action: graduate ? 'GRADUATE' : 'PROMOTE', target_class_name: graduate ? null : name === c.name ? `${c.name} (${g + 1})` : name, target_grade_level: graduate ? null : g + 1, homeroom_teacher_id: c.homeroom_teacher_id }; });
  ok(res, { from_year: from, suggested_to_year_name: `${y1 + 1}/${y2 + 1}`, plan });
}));
r.post('/runs', requirePermission('rollover:write'), validate(z.object({ to_year_name: z.string().regex(/^\d{4}\/\d{4}$/), plan: planSchema })), wrap(async (req, res) => {
  const u = req.auth!;
  const from = await queryOne(`SELECT * FROM \`${T('academic_years')}\` WHERE tenant_id = ? AND is_active = 1`, [u.tenantId]);
  if (!from) throw badRequest('Tidak ada tahun ajaran aktif');
  let to = await queryOne(`SELECT * FROM \`${T('academic_years')}\` WHERE tenant_id = ? AND name = ?`, [u.tenantId, req.body.to_year_name]);
  if (!to) { const id = newId(); const [y1] = req.body.to_year_name.split('/'); await insertRow('academic_years', { id, tenant_id: u.tenantId, name: req.body.to_year_name, start_date: `${y1}-07-13`, end_date: `${Number(y1) + 1}-06-30`, is_active: 0, active_semester: 1 }); to = await queryOne(`SELECT * FROM \`${T('academic_years')}\` WHERE id = ?`, [id]); }
  const id = newId();
  await insertRow('rollover_runs', { id, tenant_id: u.tenantId, from_year_id: from.id, to_year_id: to!.id, status: 'DRAFT', plan: req.body.plan, created_by: u.id });
  await audit(req, 'rollover.create', 'rollover_runs', id);
  ok(res, present((await queryOne(`SELECT * FROM \`${T('rollover_runs')}\` WHERE id = ?`, [id]))!), 201);
}));
r.get('/runs/:id', requirePermission('rollover:read'), wrap(async (req, res) => {
  const run = await mustGet('rollover_runs', req.params.id, req.auth!.tenantId);
  const items = await query(`SELECT * FROM \`${T('rollover_items')}\` WHERE run_id = ? ORDER BY kind, action`, [run.id]);
  ok(res, { ...present(run), items: items.map((i) => ({ ...i, detail: parse(i.detail) })) });
}));
r.post('/runs/:id/check', requirePermission('rollover:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const run = await mustGet('rollover_runs', req.params.id, u.tenantId);
  const plan = parse(run.plan) as { class_id: string; action: string }[];
  const checks: { class_id: string; class_name: string; level: 'OK' | 'WARN' | 'ERROR'; message: string }[] = [];
  for (const p of plan) {
    const c = await queryOne(`SELECT c.name, (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = c.id AND e.status = 'AKTIF') AS students, (SELECT COUNT(*) FROM \`${T('report_cards')}\` rc WHERE rc.class_id = c.id AND rc.semester = 2 AND rc.status = 'APPROVED') AS approved, (SELECT COUNT(*) FROM \`${T('report_cards')}\` rc2 WHERE rc2.class_id = c.id AND rc2.semester = 2 AND rc2.promoted IS NULL AND rc2.status = 'APPROVED') AS undecided FROM \`${T('classes')}\` c WHERE c.id = ?`, [p.class_id]);
    if (!c) { checks.push({ class_id: p.class_id, class_name: '?', level: 'ERROR', message: 'Kelas tidak ditemukan' }); continue; }
    if (p.action === 'SKIP') { checks.push({ class_id: p.class_id, class_name: String(c.name), level: 'OK', message: 'Dilewati' }); continue; }
    if (Number(c.students) === 0) checks.push({ class_id: p.class_id, class_name: String(c.name), level: 'WARN', message: 'Tidak ada siswa aktif' });
    if (Number(c.approved) < Number(c.students)) checks.push({ class_id: p.class_id, class_name: String(c.name), level: 'WARN', message: `Rapor semester 2 disahkan ${c.approved}/${c.students} — siswa tanpa rapor dianggap naik` });
    if (Number(c.undecided) > 0 && p.action === 'PROMOTE') checks.push({ class_id: p.class_id, class_name: String(c.name), level: 'WARN', message: `${c.undecided} rapor belum mengisi keputusan naik/tidak (dianggap naik)` });
    if (!checks.some((x) => x.class_id === p.class_id)) checks.push({ class_id: p.class_id, class_name: String(c.name), level: 'OK', message: `${c.students} siswa siap` });
  }
  const hasError = checks.some((c) => c.level === 'ERROR');
  await execute(`UPDATE \`${T('rollover_runs')}\` SET checks = ?, status = ? WHERE id = ?`, [JSON.stringify(checks), hasError ? 'DRAFT' : 'CHECKED', run.id]);
  ok(res, { checks, ok: !hasError });
}));
r.post('/runs/:id/dry-run', requirePermission('rollover:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const run = await mustGet('rollover_runs', req.params.id, u.tenantId);
  if (!['CHECKED', 'DRY_RUN'].includes(String(run.status))) throw badRequest('Jalankan pre-check dulu');
  const plan = parse(run.plan) as { class_id: string; action: string; target_class_name?: string | null; target_grade_level?: number | null; homeroom_teacher_id?: string | null }[];
  await execute(`DELETE FROM \`${T('rollover_items')}\` WHERE run_id = ?`, [run.id]);
  let promoted = 0; let graduated = 0; let repeated = 0; let classes = 0;
  for (const p of plan) {
    if (p.action === 'SKIP') continue;
    const cls = await queryOne(`SELECT * FROM \`${T('classes')}\` WHERE id = ?`, [p.class_id]);
    if (!cls) continue;
    const students = await query(`SELECT e.student_id, st.full_name, rc.promoted FROM \`${T('class_students')}\` e JOIN \`${T('users')}\` st ON st.id = e.student_id LEFT JOIN \`${T('report_cards')}\` rc ON rc.student_id = e.student_id AND rc.class_id = e.class_id AND rc.semester = 2 WHERE e.class_id = ? AND e.status = 'AKTIF'`, [cls.id]);
    if (p.action === 'GRADUATE') { for (const s of students) { await insertRow('rollover_items', { id: newId(), run_id: run.id, kind: 'STUDENT', source_id: s.student_id, action: 'GRADUATE', detail: { name: s.full_name, from_class: cls.name } }); graduated++; } continue; }
    const targetName = p.target_class_name ?? cls.name;
    await insertRow('rollover_items', { id: newId(), run_id: run.id, kind: 'CLASS', source_id: cls.id, action: 'CREATE_CLASS', detail: { name: targetName, grade_level: p.target_grade_level ?? cls.grade_level, major_id: cls.major_id, homeroom_teacher_id: p.homeroom_teacher_id ?? cls.homeroom_teacher_id, room_id: cls.room_id } });
    classes++;
    for (const s of students) {
      const stay = p.action === 'REPEAT' || s.promoted === 0;
      await insertRow('rollover_items', { id: newId(), run_id: run.id, kind: 'STUDENT', source_id: s.student_id, action: stay && p.action === 'PROMOTE' ? 'HOLD' : p.action === 'REPEAT' ? 'REPEAT' : 'PROMOTE', detail: { name: s.full_name, from_class: cls.name, to_class: stay && p.action === 'PROMOTE' ? `${cls.name} (tinggal — perlu penempatan manual)` : targetName, from_class_id: cls.id } });
      if (stay) repeated++; else promoted++;
    }
  }
  const result = { classes, promoted, graduated, repeated };
  await execute(`UPDATE \`${T('rollover_runs')}\` SET status = 'DRY_RUN', result = ? WHERE id = ?`, [JSON.stringify(result), run.id]);
  ok(res, result);
}));
r.post('/runs/:id/execute', requirePermission('rollover:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const run = await mustGet('rollover_runs', req.params.id, u.tenantId);
  if (run.status !== 'DRY_RUN') throw badRequest('Jalankan dry-run dulu');
  const items = await query(`SELECT * FROM \`${T('rollover_items')}\` WHERE run_id = ?`, [run.id]);
  const year = String((await queryOne(`SELECT name FROM \`${T('academic_years')}\` WHERE id = ?`, [run.from_year_id]))?.name ?? '').slice(5, 9);
  await withTransaction(async (conn) => {
    const classMap = new Map<string, string>();
    for (const it of items.filter((x) => x.action === 'CREATE_CLASS')) {
      const d = parse(it.detail) as Record<string, unknown>;
      const newId_ = newId();
      await insertRow('classes', { id: newId_, tenant_id: u.tenantId, academic_year_id: run.to_year_id, name: d.name, grade_level: d.grade_level, major_id: d.major_id ?? null, homeroom_teacher_id: d.homeroom_teacher_id ?? null, room_id: d.room_id ?? null, is_active: 1 }, conn);
      const subjects = await query(`SELECT subject_id, teacher_id, semester FROM \`${T('class_subjects')}\` WHERE class_id = ?`, [it.source_id], conn);
      for (const s of subjects) await execute(`INSERT IGNORE INTO \`${T('class_subjects')}\` (id, tenant_id, class_id, subject_id, teacher_id, semester) VALUES (?,?,?,?,?,?)`, [newId(), u.tenantId, newId_, s.subject_id, s.teacher_id, s.semester], conn);
      classMap.set(String(it.source_id), newId_);
      await execute(`UPDATE \`${T('rollover_items')}\` SET target_id = ?, status = 'DONE' WHERE id = ?`, [newId_, it.id], conn);
    }
    for (const it of items.filter((x) => x.kind === 'STUDENT')) {
      const d = parse(it.detail) as Record<string, unknown>;
      if (it.action === 'GRADUATE') {
        await execute(`UPDATE \`${T('class_students')}\` SET status = 'LULUS', left_at = CURDATE() WHERE student_id = ? AND status = 'AKTIF'`, [it.source_id], conn);
        await execute(`UPDATE \`${T('student_profiles')}\` SET status = 'LULUS' WHERE user_id = ?`, [it.source_id], conn);
        await execute(`INSERT IGNORE INTO \`${T('alumni')}\` (id, tenant_id, user_id, graduation_year, last_class) VALUES (?,?,?,?,?)`, [newId(), u.tenantId, it.source_id, Number(year) || new Date().getFullYear(), d.from_class ?? null], conn);
      } else if (it.action === 'PROMOTE' || it.action === 'REPEAT') {
        const target = classMap.get(String(d.from_class_id));
        if (!target) continue;
        await execute(`UPDATE \`${T('class_students')}\` SET status = 'PINDAH', left_at = CURDATE() WHERE student_id = ? AND class_id = ? AND status = 'AKTIF'`, [it.source_id, d.from_class_id], conn);
        await execute(`INSERT INTO \`${T('class_students')}\` (id, tenant_id, class_id, student_id, status, joined_at) VALUES (?,?,?,?,'AKTIF',CURDATE())`, [newId(), u.tenantId, target, it.source_id], conn);
        await execute(`UPDATE \`${T('rollover_items')}\` SET target_id = ? WHERE id = ?`, [target, it.id], conn);
      }
      await execute(`UPDATE \`${T('rollover_items')}\` SET status = 'DONE' WHERE id = ?`, [it.id], conn);
    }
    await execute(`UPDATE \`${T('classes')}\` SET is_active = 0 WHERE academic_year_id = ? AND id IN (${items.filter((x) => x.action === 'CREATE_CLASS').map(() => '?').join(',') || "''"})`, [run.from_year_id, ...items.filter((x) => x.action === 'CREATE_CLASS').map((x) => x.source_id)], conn);
    await execute(`UPDATE \`${T('academic_years')}\` SET is_active = IF(id = ?, 1, 0) WHERE tenant_id = ?`, [run.to_year_id, u.tenantId], conn);
    await execute(`UPDATE \`${T('rollover_runs')}\` SET status = 'EXECUTED', executed_at = NOW() WHERE id = ?`, [run.id], conn);
  });
  const staff = (await query(`SELECT DISTINCT user_id FROM \`${T('user_roles')}\` WHERE tenant_id = ? AND role IN ('GURU','KEPSEK','WAKEPSEK','KAPRODI')`, [u.tenantId])).map((x) => String(x.user_id));
  await notify({ tenantId: u.tenantId, userIds: staff, type: 'ROLLOVER', title: 'Tahun ajaran baru sudah aktif', body: 'Kelas, penugasan mapel, dan siswa telah dipindahkan.' });
  await audit(req, 'rollover.execute', 'rollover_runs', String(run.id));
  ok(res, { executed: true });
}));
r.post('/runs/:id/rollback', requirePermission('rollover:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const run = await mustGet('rollover_runs', req.params.id, u.tenantId);
  if (run.status !== 'EXECUTED') throw badRequest('Hanya run yang sudah dieksekusi');
  const items = await query(`SELECT * FROM \`${T('rollover_items')}\` WHERE run_id = ?`, [run.id]);
  await withTransaction(async (conn) => {
    for (const it of items.filter((x) => x.kind === 'STUDENT')) {
      const d = parse(it.detail) as Record<string, unknown>;
      if (it.action === 'GRADUATE') { await execute(`DELETE FROM \`${T('alumni')}\` WHERE user_id = ? AND tenant_id = ?`, [it.source_id, u.tenantId], conn); await execute(`UPDATE \`${T('student_profiles')}\` SET status = 'AKTIF' WHERE user_id = ?`, [it.source_id], conn); await execute(`UPDATE \`${T('class_students')}\` SET status = 'AKTIF', left_at = NULL WHERE student_id = ? AND status = 'LULUS'`, [it.source_id], conn); }
      else if (it.target_id) { await execute(`DELETE FROM \`${T('class_students')}\` WHERE student_id = ? AND class_id = ?`, [it.source_id, it.target_id], conn); await execute(`UPDATE \`${T('class_students')}\` SET status = 'AKTIF', left_at = NULL WHERE student_id = ? AND class_id = ?`, [it.source_id, d.from_class_id], conn); }
    }
    for (const it of items.filter((x) => x.action === 'CREATE_CLASS' && x.target_id)) { await execute(`DELETE FROM \`${T('classes')}\` WHERE id = ?`, [it.target_id], conn); await execute(`UPDATE \`${T('classes')}\` SET is_active = 1 WHERE id = ?`, [it.source_id], conn); }
    await execute(`UPDATE \`${T('academic_years')}\` SET is_active = IF(id = ?, 1, 0) WHERE tenant_id = ?`, [run.from_year_id, u.tenantId], conn);
    await execute(`UPDATE \`${T('rollover_items')}\` SET status = 'ROLLED_BACK' WHERE run_id = ?`, [run.id], conn);
    await execute(`UPDATE \`${T('rollover_runs')}\` SET status = 'ROLLED_BACK', rolled_back_at = NOW() WHERE id = ?`, [run.id], conn);
  });
  await audit(req, 'rollover.rollback', 'rollover_runs', String(run.id));
  ok(res, { rolled_back: true });
}));
r.delete('/runs/:id', requirePermission('rollover:write'), wrap(async (req, res) => { const run = await mustGet('rollover_runs', req.params.id, req.auth!.tenantId); if (run.status === 'EXECUTED') throw badRequest('Run yang sudah dieksekusi tidak bisa dihapus; lakukan rollback'); await execute(`DELETE FROM \`${T('rollover_runs')}\` WHERE id = ?`, [run.id]); ok(res, { deleted: true }); }));

/** KEPSEK approvals inbox: everything waiting for the principal. */
r.get('/approvals', requirePermission('rapor:approve', 'payroll:approve_principal', 'letter:sign', 'asset:approve', 'finance:approve'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  ok(res, {
    rapor: await query(`SELECT c.id AS class_id, c.name AS class_name, rc.semester, COUNT(*) AS count FROM \`${T('report_cards')}\` rc JOIN \`${T('classes')}\` c ON c.id = rc.class_id WHERE rc.tenant_id = ? AND rc.status = 'SUBMITTED' GROUP BY c.id, c.name, rc.semester`, [tid]),
    payroll: await query(`SELECT id, period, total_net, employee_count FROM \`${T('payroll_runs')}\` WHERE tenant_id = ? AND status = 'FINANCE_APPROVED'`, [tid]),
    letters: await query(`SELECT id, number, subject, letter_date FROM \`${T('official_letters')}\` WHERE tenant_id = ? AND status = 'SUBMITTED' ORDER BY letter_date`, [tid]),
    refunds: await query(`SELECT r.id, r.amount, r.reason, st.full_name FROM \`${T('refunds')}\` r JOIN \`${T('users')}\` st ON st.id = r.student_id WHERE r.tenant_id = ? AND r.status = 'PENDING'`, [tid]),
    asset_bookings: await query(`SELECT b.id, a.name AS asset_name, u.full_name, b.start_at FROM \`${T('asset_bookings')}\` b JOIN \`${T('assets')}\` a ON a.id = b.asset_id JOIN \`${T('users')}\` u ON u.id = b.booked_by WHERE b.tenant_id = ? AND b.status = 'PENDING'`, [tid]),
    pdp: Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('pdp_requests')}\` WHERE tenant_id = ? AND status = 'PENDING'`, [tid]))?.c ?? 0),
  });
}));

export default r;
export const _k = notFound;
