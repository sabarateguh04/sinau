import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { requirePermission, validate } from '../../middlewares';
import { hasRole } from '../../core/auth';
import { isTenantWide, childrenOf } from '../../core/scope';
import { newId } from '../../core/ids';

const r = Router();

/** One endpoint; the payload adapts to the active role (?role=GURU to pick when multi-role). */
r.get('/', requirePermission('dashboard:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const tid = u.tenantId;
  const role = typeof req.query.role === 'string' && u.roles.includes(req.query.role as never) ? req.query.role : u.roles[0];
  const out: Record<string, unknown> = { role };
  const today = new Date().toISOString().slice(0, 10);
  const dow = ((new Date().getDay() + 6) % 7) + 1; // 1=Mon

  out.announcements = await query(`SELECT id, title, body, is_pinned, created_at FROM \`${T('announcements')}\` WHERE tenant_id = ? AND (publish_at IS NULL OR publish_at <= NOW()) AND (expires_at IS NULL OR expires_at >= NOW()) AND audience = 'ALL' ORDER BY is_pinned DESC, created_at DESC LIMIT 5`, [tid]);
  out.calendar = await query(`SELECT id, title, start_date, end_date, type, is_holiday FROM \`${T('academic_calendar')}\` WHERE tenant_id = ? AND end_date >= CURDATE() ORDER BY start_date LIMIT 6`, [tid]);

  if (isTenantWide(u) || hasRole(u, 'KAPRODI')) {
    out.stats = await queryOne(`SELECT
      (SELECT COUNT(*) FROM \`${T('user_roles')}\` r JOIN \`${T('users')}\` x ON x.id = r.user_id AND x.deleted_at IS NULL AND x.is_active = 1 WHERE r.tenant_id = ? AND r.role = 'SISWA') AS students,
      (SELECT COUNT(*) FROM \`${T('user_roles')}\` r JOIN \`${T('users')}\` x ON x.id = r.user_id AND x.deleted_at IS NULL AND x.is_active = 1 WHERE r.tenant_id = ? AND r.role = 'GURU') AS teachers,
      (SELECT COUNT(*) FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id WHERE c.tenant_id = ? AND ay.is_active = 1 AND c.is_active = 1) AS classes,
      (SELECT COUNT(*) FROM \`${T('subjects')}\` WHERE tenant_id = ? AND is_active = 1) AS subjects,
      (SELECT COUNT(*) FROM \`${T('materials')}\` WHERE tenant_id = ? AND is_published = 1) AS materials,
      (SELECT COUNT(*) FROM \`${T('assignments')}\` WHERE tenant_id = ? AND status = 'PUBLISHED') AS assignments,
      (SELECT COUNT(*) FROM \`${T('quiz_attempts')}\` WHERE tenant_id = ? AND started_at > DATE_SUB(NOW(), INTERVAL 7 DAY)) AS quiz_attempts_7d,
      (SELECT COUNT(*) FROM \`${T('users')}\` WHERE tenant_id = ? AND last_login_at > DATE_SUB(NOW(), INTERVAL 7 DAY)) AS active_7d,
      (SELECT COUNT(*) FROM \`${T('permits')}\` WHERE tenant_id = ? AND status = 'PENDING') AS pending_permits,
      (SELECT COUNT(*) FROM \`${T('ppdb_applicants')}\` WHERE tenant_id = ? AND status = 'SUBMITTED') AS pending_ppdb,
      (SELECT COALESCE(SUM(amount + late_fee - discount - paid),0) FROM \`${T('invoices')}\` WHERE tenant_id = ? AND status IN ('UNPAID','PARTIAL','OVERDUE')) AS outstanding_invoices`,
      Array(11).fill(tid));
    out.attendance_today = await queryOne(`SELECT COUNT(*) AS total, SUM(status='H') AS H, SUM(status='A') AS A, SUM(status='S') AS S, SUM(status='I') AS I FROM \`${T('attendance_daily')}\` WHERE tenant_id = ? AND date = ?`, [tid, today]);
    out.attendance_trend = await query(`SELECT date, ROUND(SUM(status='H')/COUNT(*)*100,1) AS present_rate, COUNT(*) AS total FROM \`${T('attendance_daily')}\` WHERE tenant_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) GROUP BY date ORDER BY date`, [tid]);
    out.activity = await query(`SELECT DATE(created_at) AS d, COUNT(*) AS c FROM \`${T('audit_logs')}\` WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY d`, [tid]);
    out.grade_by_subject = await query(`SELECT s.name, ROUND(AVG(g.score / NULLIF(g.max_score,0) * 100),1) AS avg FROM \`${T('grades')}\` g JOIN \`${T('class_subjects')}\` cs ON cs.id = g.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE g.tenant_id = ? GROUP BY s.name ORDER BY avg DESC LIMIT 10`, [tid]);
    out.recent_users = await query(`SELECT id, full_name, username, created_at, (SELECT GROUP_CONCAT(role) FROM \`${T('user_roles')}\` r WHERE r.user_id = u.id) AS roles FROM \`${T('users')}\` u WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`, [tid]);
    out.recent_audit = await query(`SELECT a.action, a.entity, a.created_at, us.full_name FROM \`${T('audit_logs')}\` a LEFT JOIN \`${T('users')}\` us ON us.id = a.user_id WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 8`, [tid]);
    if (hasRole(u, 'KEPSEK')) {
      out.approvals = await queryOne(`SELECT (SELECT COUNT(*) FROM \`${T('report_cards')}\` WHERE tenant_id = ? AND status = 'SUBMITTED') AS rapor, (SELECT COUNT(*) FROM \`${T('payroll_runs')}\` WHERE tenant_id = ? AND status = 'FINANCE_APPROVED') AS payroll, (SELECT COUNT(*) FROM \`${T('official_letters')}\` WHERE tenant_id = ? AND status = 'SUBMITTED') AS letters, (SELECT COUNT(*) FROM \`${T('asset_bookings')}\` WHERE tenant_id = ? AND status = 'PENDING') AS asset_bookings`, [tid, tid, tid, tid]);
    }
    if (hasRole(u, 'KEUANGAN')) {
      out.finance = await queryOne(`SELECT (SELECT COALESCE(SUM(amount),0) FROM \`${T('payments')}\` WHERE tenant_id = ? AND DATE_FORMAT(paid_at,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m') AND status = 'CONFIRMED') AS income_month, (SELECT COUNT(*) FROM \`${T('invoices')}\` WHERE tenant_id = ? AND status = 'OVERDUE') AS overdue, (SELECT COUNT(*) FROM \`${T('refunds')}\` WHERE tenant_id = ? AND status = 'PENDING') AS pending_refunds`, [tid, tid, tid]);
      out.income_trend = await query(`SELECT DATE_FORMAT(paid_at,'%Y-%m') AS month, SUM(amount) AS total FROM \`${T('payments')}\` WHERE tenant_id = ? AND status = 'CONFIRMED' AND paid_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) GROUP BY month ORDER BY month`, [tid]);
    }
    if (hasRole(u, 'BK')) {
      out.bk = await queryOne(`SELECT (SELECT COUNT(*) FROM \`${T('counseling_notes')}\` WHERE tenant_id = ? AND session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS sessions_30d, (SELECT COUNT(*) FROM \`${T('discipline_records')}\` WHERE tenant_id = ? AND incident_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS incidents_30d`, [tid, tid]);
      out.top_discipline = await query(`SELECT st.id, st.full_name, SUM(d.points) AS points FROM \`${T('discipline_records')}\` d JOIN \`${T('users')}\` st ON st.id = d.student_id WHERE d.tenant_id = ? GROUP BY st.id, st.full_name ORDER BY points DESC LIMIT 5`, [tid]);
    }
  }

  if (hasRole(u, 'GURU', 'KAPRODI', 'WAKEPSEK')) {
    out.teaching = await query(`SELECT cs.id AS class_subject_id, c.name AS class_name, s.name AS subject_name, cs.class_id, (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = cs.class_id AND e.status = 'AKTIF') AS student_count
      FROM \`${T('class_subjects')}\` cs JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id AND ay.is_active = 1 JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE cs.teacher_id = ? ORDER BY c.name, s.name`, [u.id]);
    out.today_schedule = await query(`SELECT se.start_time, se.end_time, c.name AS class_name, s.name AS subject_name, rm.name AS room_name, cs.id AS class_subject_id FROM \`${T('schedule_entries')}\` se JOIN \`${T('class_subjects')}\` cs ON cs.id = se.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id AND ay.is_active = 1 JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('rooms')}\` rm ON rm.id = se.room_id WHERE cs.teacher_id = ? AND se.day_of_week = ? ORDER BY se.start_time`, [u.id, dow]);
    out.to_grade = await query(`SELECT a.id, a.title, c.name AS class_name, s.name AS subject_name, COUNT(sb.id) AS waiting FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id JOIN \`${T('classes')}\` c ON c.id = cs.class_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('submissions')}\` sb ON sb.assignment_id = a.id AND sb.status = 'SUBMITTED' WHERE cs.teacher_id = ? GROUP BY a.id, a.title, c.name, s.name ORDER BY waiting DESC LIMIT 6`, [u.id]);
    out.homeroom = await query(`SELECT c.id, c.name, (SELECT COUNT(*) FROM \`${T('class_students')}\` e WHERE e.class_id = c.id AND e.status = 'AKTIF') AS student_count, (SELECT COUNT(*) FROM \`${T('attendance_daily')}\` ad WHERE ad.class_id = c.id AND ad.date = ?) AS attendance_today FROM \`${T('classes')}\` c JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id AND ay.is_active = 1 WHERE c.homeroom_teacher_id = ?`, [today, u.id]);
    out.pending_permits = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('permits')}\` p JOIN \`${T('class_students')}\` e ON e.student_id = p.student_id AND e.status = 'AKTIF' JOIN \`${T('classes')}\` c ON c.id = e.class_id WHERE p.status = 'PENDING' AND c.homeroom_teacher_id = ?`, [u.id]))?.c ?? 0);
    out.recent_materials = await query(`SELECT m.id, m.title, m.type, m.is_published, m.created_at, m.view_count FROM \`${T('materials')}\` m WHERE m.created_by = ? ORDER BY m.created_at DESC LIMIT 5`, [u.id]);
  }

  if (hasRole(u, 'SISWA')) {
    out.my_class = await queryOne(`SELECT c.id, c.name, c.grade_level, m.name AS major_name, h.full_name AS homeroom_name FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id AND ay.is_active = 1 LEFT JOIN \`${T('majors')}\` m ON m.id = c.major_id LEFT JOIN \`${T('users')}\` h ON h.id = c.homeroom_teacher_id WHERE e.student_id = ? AND e.status = 'AKTIF' LIMIT 1`, [u.id]);
    out.upcoming_assignments = await query(`SELECT a.id, a.title, a.due_at, s.name AS subject_name, sb.status AS my_status FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF' LEFT JOIN \`${T('submissions')}\` sb ON sb.assignment_id = a.id AND sb.student_id = ? WHERE a.status = 'PUBLISHED' AND (sb.status IS NULL OR sb.status IN ('DRAFT','RETURNED')) ORDER BY a.due_at IS NULL, a.due_at LIMIT 6`, [u.id, u.id]);
    out.open_quizzes = await query(`SELECT q.id, q.title, q.close_at, q.duration_min, s.name AS subject_name, (SELECT COUNT(*) FROM \`${T('quiz_attempts')}\` qa WHERE qa.quiz_id = q.id AND qa.student_id = ?) AS my_attempts, q.max_attempts FROM \`${T('quizzes')}\` q JOIN \`${T('class_subjects')}\` cs ON cs.id = q.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF' WHERE q.status = 'PUBLISHED' AND (q.open_at IS NULL OR q.open_at <= NOW()) AND (q.close_at IS NULL OR q.close_at >= NOW()) ORDER BY q.close_at LIMIT 6`, [u.id, u.id]);
    out.upcoming_exams = await query(`SELECT es.id, ex.title, es.start_at, es.end_at, s.name AS subject_name FROM \`${T('exam_sessions')}\` es JOIN \`${T('exams')}\` ex ON ex.id = es.exam_id LEFT JOIN \`${T('subjects')}\` s ON s.id = ex.subject_id JOIN \`${T('class_students')}\` e ON e.class_id = es.class_id AND e.student_id = ? AND e.status = 'AKTIF' WHERE es.end_at >= NOW() AND es.status IN ('SCHEDULED','ONGOING') ORDER BY es.start_at LIMIT 5`, [u.id]);
    out.recent_materials = await query(`SELECT m.id, m.title, m.type, m.created_at, s.name AS subject_name, (SELECT progress FROM \`${T('material_views')}\` v WHERE v.material_id = m.id AND v.user_id = ?) AS my_progress FROM \`${T('materials')}\` m JOIN \`${T('class_subjects')}\` cs ON cs.id = m.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF' WHERE m.is_published = 1 ORDER BY m.published_at DESC LIMIT 6`, [u.id, u.id]);
    out.recent_grades = await query(`SELECT g.title, g.score, g.max_score, g.component_code, g.graded_at, s.name AS subject_name FROM \`${T('grades')}\` g JOIN \`${T('class_subjects')}\` cs ON cs.id = g.class_subject_id JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE g.student_id = ? ORDER BY g.graded_at DESC LIMIT 6`, [u.id]);
    out.attendance_month = await queryOne(`SELECT COUNT(*) AS total, SUM(status='H') AS H, SUM(status='A') AS A, SUM(status='S') AS S, SUM(status='I') AS I FROM \`${T('attendance_daily')}\` WHERE student_id = ? AND DATE_FORMAT(date,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')`, [u.id]);
    out.today_schedule = await query(`SELECT se.start_time, se.end_time, s.name AS subject_name, us.full_name AS teacher_name, rm.name AS room_name FROM \`${T('schedule_entries')}\` se JOIN \`${T('class_subjects')}\` cs ON cs.id = se.class_subject_id JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF' JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id LEFT JOIN \`${T('users')}\` us ON us.id = cs.teacher_id LEFT JOIN \`${T('rooms')}\` rm ON rm.id = se.room_id WHERE se.day_of_week = ? ORDER BY se.start_time`, [u.id, dow]);
    out.outstanding = await queryOne(`SELECT COALESCE(SUM(amount + late_fee - discount - paid),0) AS total, COUNT(*) AS count FROM \`${T('invoices')}\` WHERE student_id = ? AND status IN ('UNPAID','PARTIAL','OVERDUE')`, [u.id]);
  }

  if (hasRole(u, 'WALI_MURID')) {
    const kids = await childrenOf(u.id);
    out.children = kids.length ? await query(`SELECT u.id, u.full_name, u.avatar_url, c.name AS class_name,
        (SELECT COUNT(*) FROM \`${T('attendance_daily')}\` ad WHERE ad.student_id = u.id AND ad.status = 'A' AND DATE_FORMAT(ad.date,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')) AS absent_month,
        (SELECT ROUND(AVG(g.score / NULLIF(g.max_score,0) * 100),1) FROM \`${T('grades')}\` g WHERE g.student_id = u.id) AS avg_score,
        (SELECT COUNT(*) FROM \`${T('assignments')}\` a JOIN \`${T('class_subjects')}\` cs ON cs.id = a.class_subject_id JOIN \`${T('class_students')}\` e2 ON e2.class_id = cs.class_id AND e2.student_id = u.id AND e2.status = 'AKTIF' LEFT JOIN \`${T('submissions')}\` sb ON sb.assignment_id = a.id AND sb.student_id = u.id WHERE a.status = 'PUBLISHED' AND sb.id IS NULL) AS pending_assignments,
        (SELECT COALESCE(SUM(i.amount + i.late_fee - i.discount - i.paid),0) FROM \`${T('invoices')}\` i WHERE i.student_id = u.id AND i.status IN ('UNPAID','PARTIAL','OVERDUE')) AS outstanding
      FROM \`${T('users')}\` u LEFT JOIN \`${T('class_students')}\` e ON e.student_id = u.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 WHERE u.id IN (${kids.map(() => '?').join(',')})`, kids) : [];
  }

  if (hasRole(u, 'PEMBIMBING_INDUSTRI')) {
    out.mentees = await query(`SELECT i.id, st.full_name, i.start_date, i.end_date, i.status, (SELECT COUNT(*) FROM \`${T('internship_journals')}\` j WHERE j.internship_id = i.id AND j.status = 'SUBMITTED') AS pending_journals FROM \`${T('internships')}\` i JOIN \`${T('industry_mentors')}\` m ON m.id = i.mentor_id JOIN \`${T('users')}\` st ON st.id = i.student_id WHERE m.user_id = ? ORDER BY i.start_date DESC`, [u.id]);
  }
  if (hasRole(u, 'PENGUJI_EKSTERNAL')) {
    out.tests = await query(`SELECT ct.id, ct.title, ct.test_date, ct.status, cs.name AS scheme_name, (SELECT COUNT(*) FROM \`${T('competency_results')}\` cr WHERE cr.test_id = ct.id) AS participants FROM \`${T('competency_tests')}\` ct JOIN \`${T('competency_schemes')}\` cs ON cs.id = ct.scheme_id WHERE ct.external_examiner_id = ? ORDER BY ct.test_date DESC`, [u.id]);
  }
  if (hasRole(u, 'CALON_SISWA')) {
    out.application = await queryOne(`SELECT a.*, p.name AS period_name FROM \`${T('ppdb_applicants')}\` a JOIN \`${T('ppdb_periods')}\` p ON p.id = a.period_id WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 1`, [u.id]);
  }
  out.widgets = await queryOne(`SELECT widgets FROM \`${T('dashboard_configs')}\` WHERE tenant_id = ? AND role = ?`, [tid, role]).then((x) => (x?.widgets ? (typeof x.widgets === 'string' ? JSON.parse(x.widgets) : x.widgets) : null));
  ok(res, out);
}));

r.put('/widgets/:role', requirePermission('dashboard:configure'), validate(z.object({ widgets: z.array(z.object({ key: z.string(), visible: z.boolean(), order: z.number().int().optional() })) })), wrap(async (req, res) => {
  await execute(`INSERT INTO \`${T('dashboard_configs')}\` (id, tenant_id, role, widgets) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE widgets = VALUES(widgets)`, [newId(), req.auth!.tenantId, req.params.role, JSON.stringify(req.body.widgets)]);
  ok(res, { saved: true });
}));

export default r;
