/**
 * Job handlers. Registered by side effect when the worker starts.
 *  - reminder.daily     : H-1 assignment deadlines, exam sessions tomorrow, overdue invoices → notifications
 *  - finance.late_fees  : apply late-fee rules to overdue invoices
 *  - pdp.retention      : anonymise rows older than each retention policy
 *  - export.*           : long-running exports produce a file row (result.file_id)
 */
import { T } from '../config';
import { query, queryOne, execute } from '../database/db';
import { notify } from '../core/services';
import { registerJob } from './worker';
import { logger } from '../core/logger';

registerJob('reminder.daily', async (_payload, job) => {
  const tid = job.tenant_id!;
  let sent = 0;
  const due = await query(`SELECT a.id, a.title, a.due_at, cs.class_id FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id WHERE a.tenant_id = ? AND a.status = 'PUBLISHED' AND a.due_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 DAY)`, [tid]);
  for (const a of due) {
    const students = await query(`SELECT e.student_id FROM \`${T('class_students')}\` e LEFT JOIN \`${T('submissions')}\` s ON s.assignment_id = ? AND s.student_id = e.student_id AND s.status IN ('SUBMITTED','GRADED') WHERE e.class_id = ? AND e.status = 'AKTIF' AND s.id IS NULL`, [a.id, a.class_id]);
    const ids = students.map((s) => String(s.student_id));
    if (ids.length) { await notify({ tenantId: tid, userIds: ids, type: 'REMINDER', title: `Tenggat besok: ${a.title}`, link: `/siswa/tugas/${a.id}` }); sent += ids.length; }
  }
  const exams = await query(`SELECT es.id, ex.title, es.start_at, es.class_id FROM \`${T('exam_sessions')}\` es JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id WHERE es.tenant_id = ? AND es.status = 'SCHEDULED' AND es.start_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 DAY)`, [tid]);
  for (const e of exams) {
    const ids = (await query(`SELECT student_id FROM \`${T('class_students')}\` WHERE class_id = ? AND status = 'AKTIF'`, [e.class_id])).map((x) => String(x.student_id));
    if (ids.length) { await notify({ tenantId: tid, userIds: ids, type: 'REMINDER', title: `Ujian besok: ${e.title}`, body: new Date(e.start_at).toLocaleString('id-ID'), link: '/siswa/ujian' }); sent += ids.length; }
  }
  const overdue = await query(`SELECT i.id, i.title, i.student_id, (i.amount + i.late_fee - i.discount - i.paid) AS remaining FROM \`${T('invoices')}\` i WHERE i.tenant_id = ? AND i.status IN ('UNPAID','PARTIAL','OVERDUE') AND i.due_date = DATE_ADD(CURDATE(), INTERVAL 3 DAY)`, [tid]);
  for (const inv of overdue) {
    const g = await query(`SELECT guardian_user_id FROM \`${T('guardian_students')}\` WHERE student_id = ?`, [inv.student_id]);
    const ids = [String(inv.student_id), ...g.map((x) => String(x.guardian_user_id))];
    await notify({ tenantId: tid, userIds: ids, type: 'INVOICE', title: `Tagihan jatuh tempo 3 hari lagi: ${inv.title}`, body: `Sisa Rp ${Number(inv.remaining).toLocaleString('id-ID')}`, link: '/siswa/tagihan' });
    sent += ids.length;
  }
  // Auto-expire quiz attempts past deadline and close exam sessions past end.
  const { finalizeAttempt } = await import('../modules/lms/quizzes');
  const stale = await query(`SELECT id FROM \`${T('quiz_attempts')}\` WHERE tenant_id = ? AND status = 'IN_PROGRESS' AND deadline_at < NOW()`, [tid]);
  for (const s of stale) await finalizeAttempt(String(s.id), 'EXPIRED');
  return { sent, expired_attempts: stale.length };
});

registerJob('finance.late_fees', async (_payload, job) => {
  const tid = job.tenant_id!;
  await execute(`UPDATE \`${T('invoices')}\` SET status = 'OVERDUE' WHERE tenant_id = ? AND status IN ('UNPAID','PARTIAL') AND due_date IS NOT NULL AND due_date < CURDATE()`, [tid]);
  const rules = await query(`SELECT * FROM \`${T('late_fee_rules')}\` WHERE tenant_id = ? AND is_active = 1`, [tid]);
  let applied = 0;
  for (const rule of rules) {
    const inv = await query(`SELECT id, amount, discount, late_fee, due_date, DATEDIFF(CURDATE(), due_date) AS days FROM \`${T('invoices')}\` WHERE tenant_id = ? AND status = 'OVERDUE' AND ${rule.fee_type_id ? 'fee_type_id = ?' : '1=1'} AND DATEDIFF(CURDATE(), due_date) > ?`, rule.fee_type_id ? [tid, rule.fee_type_id, rule.grace_days] : [tid, rule.grace_days]);
    for (const i of inv) {
      const base = Number(i.amount) - Number(i.discount);
      let fee = rule.mode === 'PERCENT' ? (base * Number(rule.amount)) / 100 : rule.mode === 'PER_DAY' ? Number(rule.amount) * (Number(i.days) - Number(rule.grace_days)) : Number(rule.amount);
      if (rule.max_amount) fee = Math.min(fee, Number(rule.max_amount));
      fee = Math.round(fee);
      if (fee !== Number(i.late_fee)) { await execute(`UPDATE \`${T('invoices')}\` SET late_fee = ? WHERE id = ?`, [fee, i.id]); applied++; }
    }
  }
  return { applied };
});

registerJob('pdp.retention', async (_payload, job) => {
  const tid = job.tenant_id!;
  const policies = await query(`SELECT * FROM \`${T('retention_policies')}\` WHERE tenant_id = ? AND is_active = 1`, [tid]);
  const result: Record<string, number> = {};
  for (const p of policies) {
    const months = Number(p.retention_months);
    let n = 0;
    if (p.entity === 'audit_logs') n = (await execute(`DELETE FROM \`${T('audit_logs')}\` WHERE tenant_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? MONTH)`, [tid, months])).affectedRows;
    else if (p.entity === 'notifications') n = (await execute(`DELETE FROM \`${T('notifications')}\` WHERE tenant_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? MONTH)`, [tid, months])).affectedRows;
    else if (p.entity === 'alumni') n = (await execute(`UPDATE \`${T('users')}\` u JOIN \`${T('alumni')}\` a ON a.user_id = u.id SET u.email = NULL, u.phone = NULL, u.avatar_url = NULL WHERE u.tenant_id = ? AND a.created_at < DATE_SUB(NOW(), INTERVAL ? MONTH) AND u.email IS NOT NULL`, [tid, months])).affectedRows;
    else if (p.entity === 'ppdb_applicants') n = (await execute(`UPDATE \`${T('ppdb_applicants')}\` SET nik = NULL, address = '[dihapus]', phone = '[dihapus]', email = NULL, parent_phone = NULL WHERE tenant_id = ? AND status IN ('REJECTED','WITHDRAWN') AND created_at < DATE_SUB(NOW(), INTERVAL ? MONTH) AND nik IS NOT NULL`, [tid, months])).affectedRows;
    else if (p.entity === 'counseling_notes') n = (await execute(`DELETE FROM \`${T('counseling_notes')}\` WHERE tenant_id = ? AND session_date < DATE_SUB(CURDATE(), INTERVAL ? MONTH)`, [tid, months])).affectedRows;
    result[String(p.entity)] = n;
    await execute(`UPDATE \`${T('retention_policies')}\` SET last_run_at = NOW() WHERE id = ?`, [p.id]);
  }
  return result;
});

registerJob('export.generic', async (payload) => {
  logger.info(payload, 'generic export placeholder');
  return { ok: true };
});

export const _keep = queryOne;
