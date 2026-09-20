import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { requirePermission } from '../../middlewares';
import { crudRouter } from '../../core/crud';
import { notify, fileUrl } from '../../core/services';
import { isTenantWide, studentIdsOfClass, childrenOf } from '../../core/scope';
import { hasRole } from '../../core/auth';

const r = Router();

const annSchema = z.object({ title: z.string().min(2).max(200), body: z.string().min(1).max(20000), audience: z.enum(['ALL', 'ROLE', 'CLASS']).default('ALL'), audience_role: z.string().max(40).nullable().optional(), class_id: z.string().nullable().optional(), is_pinned: z.boolean().optional(), publish_at: z.string().nullable().optional(), expires_at: z.string().nullable().optional(), attachment_file_id: z.string().nullable().optional() });

/** Visibility: ALL; ROLE = one of my roles; CLASS = my class (student), child class (guardian), taught/homeroom class (teacher). Authors and tenant-wide roles see everything. */
function scope(req: import('express').Request) {
  const u = req.auth!;
  if (isTenantWide(u)) return null;
  const parts = [`t.audience = 'ALL'`, 't.created_by = ?'];
  const params: unknown[] = [u.id];
  if (u.roles.length) { parts.push(`(t.audience = 'ROLE' AND t.audience_role IN (${u.roles.map(() => '?').join(',')}))`); params.push(...u.roles); }
  const cls: string[] = [];
  if (hasRole(u, 'SISWA')) cls.push(`SELECT class_id FROM \`${T('class_students')}\` WHERE student_id = ? AND status = 'AKTIF'`);
  if (hasRole(u, 'WALI_MURID')) cls.push(`SELECT e.class_id FROM \`${T('class_students')}\` e JOIN \`${T('guardian_students')}\` g ON g.student_id = e.student_id WHERE g.guardian_user_id = ? AND e.status = 'AKTIF'`);
  if (hasRole(u, 'GURU', 'KAPRODI', 'WAKEPSEK')) cls.push(`SELECT class_id FROM \`${T('class_subjects')}\` WHERE teacher_id = ?`, `SELECT id FROM \`${T('classes')}\` WHERE homeroom_teacher_id = ?`);
  if (cls.length) { parts.push(`(t.audience = 'CLASS' AND t.class_id IN (${cls.join(' UNION ')}))`); cls.forEach(() => params.push(u.id)); }
  return { sql: `(${parts.join(' OR ')}) AND (t.publish_at IS NULL OR t.publish_at <= NOW()) AND (t.expires_at IS NULL OR t.expires_at >= NOW())`, params };
}

r.use('/announcements', crudRouter({
  table: 'announcements', searchable: ['t.title', 't.body'], sortable: ['created_at', 'publish_at', 'title'], defaultSort: 'created_at', perms: { read: ['announcement:read'], write: ['announcement:write'] },
  select: 'u.full_name AS author_name, c.name AS class_name', joins: `LEFT JOIN \`${T('users')}\` u ON u.id = t.created_by LEFT JOIN \`${T('classes')}\` c ON c.id = t.class_id`,
  filters: [{ param: 'audience', column: 't.audience' }, { param: 'class_id', column: 't.class_id' }, { param: 'pinned', column: 't.is_pinned', op: 'BOOL' }, { param: 'mine', column: 't.created_by' }],
  scope, createSchema: annSchema, updateSchema: annSchema.partial(),
  toRow: (input, req, isCreate) => { const b = { ...(input as Record<string, unknown>) }; if (b.publish_at !== undefined) b.publish_at = b.publish_at ? new Date(String(b.publish_at)) : null; if (b.expires_at !== undefined) b.expires_at = b.expires_at ? new Date(String(b.expires_at)) : null; return isCreate ? { ...b, created_by: req.auth!.id } : b; },
  afterCreate: async (row, req) => {
    const u = req.auth!;
    let ids: string[] = [];
    if (row.audience === 'CLASS' && row.class_id) ids = await studentIdsOfClass(String(row.class_id));
    else if (row.audience === 'ROLE' && row.audience_role) ids = (await query(`SELECT user_id FROM \`${T('user_roles')}\` WHERE tenant_id = ? AND role = ?`, [u.tenantId, row.audience_role])).map((x) => String(x.user_id));
    else ids = (await query(`SELECT id FROM \`${T('users')}\` WHERE tenant_id = ? AND is_active = 1 AND deleted_at IS NULL`, [u.tenantId])).map((x) => String(x.id));
    if (row.audience === 'CLASS' && ids.length) { const g = await query(`SELECT guardian_user_id FROM \`${T('guardian_students')}\` WHERE student_id IN (${ids.map(() => '?').join(',')})`, ids); ids.push(...g.map((x) => String(x.guardian_user_id))); }
    await notify({ tenantId: u.tenantId, userIds: ids.filter((id) => id !== u.id), type: 'ANNOUNCEMENT', title: String(row.title), body: String(row.body).slice(0, 200), link: `/pengumuman/${row.id}` });
  },
  present: (row) => ({ ...row, attachment_url: fileUrl(row.attachment_file_id as string | null) }),
}));

/** Guardian: children summary (used by parent portal home). */
r.get('/children', requirePermission('dashboard:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const ids = await childrenOf(u.id);
  if (!ids.length) return ok(res, []);
  const rows = await query(`SELECT u.id, u.full_name, u.avatar_url, sp.nis, c.name AS class_name, c.id AS class_id,
      (SELECT COUNT(*) FROM \`${T('attendance_daily')}\` ad WHERE ad.student_id = u.id AND ad.status = 'A' AND DATE_FORMAT(ad.date,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')) AS absent_this_month,
      (SELECT COALESCE(SUM(i.amount + i.late_fee - i.discount - i.paid),0) FROM \`${T('invoices')}\` i WHERE i.student_id = u.id AND i.status IN ('UNPAID','PARTIAL','OVERDUE')) AS outstanding
    FROM \`${T('users')}\` u LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = u.id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = u.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1
    WHERE u.id IN (${ids.map(() => '?').join(',')})`, ids);
  ok(res, rows);
}));

export default r;
export const _unused = queryOne;
