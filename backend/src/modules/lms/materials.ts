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
import { assertClassSubject, classSubjectScope, isTenantWide, studentIdsOfClass } from '../../core/scope';
import { hasRole } from '../../core/auth';

const r = Router();

const materialSchema = z.object({
  class_subject_id: z.string().nullable().optional(), subject_id: z.string().nullable().optional(), major_id: z.string().nullable().optional(), grade_level: z.number().int().nullable().optional(),
  title: z.string().min(2).max(200), description: z.string().max(4000).nullable().optional(), type: z.enum(['FILE', 'VIDEO', 'LINK', 'TEXT']).default('FILE'),
  content_url: z.string().max(500).nullable().optional(), content_text: z.string().max(200000).nullable().optional(), file_id: z.string().nullable().optional(), is_published: z.boolean().optional(), is_public: z.boolean().optional(),
});

const SELECT = `m.*, cs.class_id, c.name AS class_name, s.name AS subject_name, s2.name AS subject_name2, u.full_name AS author_name, f.original_name AS file_name, f.mime AS file_mime, f.size AS file_size,
  (SELECT COUNT(*) FROM \`${T('material_views')}\` v WHERE v.material_id = m.id) AS reader_count`;
const FROM = `FROM \`${T('materials')}\` m LEFT JOIN \`${T('class_subjects')}\` cs ON cs.id = m.class_subject_id LEFT JOIN \`${T('classes')}\` c ON c.id = cs.class_id LEFT JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id
  LEFT JOIN \`${T('subjects')}\` s2 ON s2.id = m.subject_id LEFT JOIN \`${T('users')}\` u ON u.id = m.created_by LEFT JOIN \`${T('files')}\` f ON f.id = m.file_id`;
const present = (row: Record<string, unknown>, viewerId?: string) => ({ ...row, subject_name: row.subject_name ?? row.subject_name2, subject_name2: undefined, file_url: fileUrl(row.file_id as string | null), is_mine: viewerId ? row.created_by === viewerId : undefined });

/** Visibility: tenant-wide roles see all; teachers their class-subjects + own uploads + general (no class) materials of their subjects; students their class + general materials matching major/grade. */
function visibility(u: import('../../core/auth').AuthUser): { sql: string; params: unknown[] } {
  if (isTenantWide(u)) return { sql: '1=1', params: [] };
  const parts: string[] = ['m.created_by = ?'];
  const params: unknown[] = [u.id];
  const sc = classSubjectScope(u, 'cs', 'c');
  parts.push(`(m.class_subject_id IS NOT NULL AND ${sc.sql})`); params.push(...sc.params);
  if (hasRole(u, 'SISWA')) {
    parts.push(`(m.class_subject_id IS NULL AND m.is_published = 1 AND EXISTS (SELECT 1 FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c2 ON c2.id = e.class_id WHERE e.student_id = ? AND e.status = 'AKTIF' AND (m.major_id IS NULL OR m.major_id = c2.major_id) AND (m.grade_level IS NULL OR m.grade_level = c2.grade_level)))`);
    params.push(u.id);
  } else if (hasRole(u, 'GURU', 'KAPRODI')) {
    parts.push('(m.class_subject_id IS NULL AND m.is_published = 1)');
  }
  return { sql: `(${parts.join(' OR ')})`, params };
}

r.get('/', requirePermission('material:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const vis = visibility(u);
  const params: unknown[] = [u.tenantId, ...vis.params];
  let where = `WHERE m.tenant_id = ? AND ${vis.sql}`;
  if (hasRole(u, 'SISWA', 'WALI_MURID') && !isTenantWide(u)) where += ' AND m.is_published = 1';
  const q = str(req.query.q);
  if (q) { where += ' AND (m.title LIKE ? OR m.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (str(req.query.class_subject_id)) { where += ' AND m.class_subject_id = ?'; params.push(String(req.query.class_subject_id)); }
  if (str(req.query.class_id)) { where += ' AND cs.class_id = ?'; params.push(String(req.query.class_id)); }
  if (str(req.query.subject_id)) { where += ' AND (cs.subject_id = ? OR m.subject_id = ?)'; params.push(String(req.query.subject_id), String(req.query.subject_id)); }
  if (str(req.query.type)) { where += ' AND m.type = ?'; params.push(String(req.query.type)); }
  if (req.query.mine === '1') { where += ' AND m.created_by = ?'; params.push(u.id); }
  if (req.query.published !== undefined && req.query.published !== '') { where += ' AND m.is_published = ?'; params.push(req.query.published === '1' ? 1 : 0); }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${FROM} ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT ${SELECT}, (SELECT progress FROM \`${T('material_views')}\` v2 WHERE v2.material_id = m.id AND v2.user_id = ?) AS my_progress ${FROM} ${where} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`, [u.id, ...params, limit, offset]);
  paged(res, rows.map((x) => present(x, u.id)), { page, limit, total });
}));

r.get('/:id', requirePermission('material:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const vis = visibility(u);
  const row = await queryOne(`SELECT ${SELECT} ${FROM} WHERE m.id = ? AND m.tenant_id = ? AND ${vis.sql}`, [req.params.id, u.tenantId, ...vis.params]);
  if (!row) throw notFound();
  if (!row.is_published && row.created_by !== u.id && !isTenantWide(u) && hasRole(u, 'SISWA', 'WALI_MURID')) throw notFound();
  // Track reading for students.
  if (hasRole(u, 'SISWA')) {
    await execute(`INSERT INTO \`${T('material_views')}\` (id, tenant_id, material_id, user_id, first_viewed_at, last_viewed_at, view_count) VALUES (?,?,?,?,NOW(),NOW(),1) ON DUPLICATE KEY UPDATE last_viewed_at = NOW(), view_count = view_count + 1`, [newId(), u.tenantId, row.id, u.id]);
    await execute(`UPDATE \`${T('materials')}\` SET view_count = view_count + 1 WHERE id = ?`, [row.id]);
  }
  const readers = isTenantWide(u) || row.created_by === u.id || hasRole(u, 'GURU', 'KAPRODI')
    ? await query(`SELECT v.user_id, us.full_name, v.first_viewed_at, v.last_viewed_at, v.view_count, v.progress FROM \`${T('material_views')}\` v JOIN \`${T('users')}\` us ON us.id = v.user_id WHERE v.material_id = ? ORDER BY v.last_viewed_at DESC LIMIT 200`, [row.id])
    : undefined;
  ok(res, { ...present(row, u.id), readers });
}));

r.post('/', requirePermission('material:write'), validate(materialSchema), wrap(async (req, res) => {
  const u = req.auth!;
  const b = req.body;
  if (b.class_subject_id) await assertClassSubject(u, b.class_subject_id, { teach: true });
  if (b.type === 'FILE' && !b.file_id) throw badRequest('Unggah berkas dulu (file_id)');
  if ((b.type === 'VIDEO' || b.type === 'LINK') && !b.content_url) throw badRequest('Tautan wajib diisi');
  if (b.type === 'TEXT' && !b.content_text) throw badRequest('Isi materi wajib diisi');
  const id = newId();
  const publish = b.is_published ?? false;
  await insertRow('materials', { id, tenant_id: u.tenantId, ...b, is_published: publish, published_at: publish ? new Date() : null, created_by: u.id });
  if (publish && b.class_subject_id) await notifyClass(u.tenantId, b.class_subject_id, id, b.title);
  await audit(req, 'material.create', 'materials', id, undefined, { title: b.title, type: b.type });
  const row = await queryOne(`SELECT ${SELECT} ${FROM} WHERE m.id = ?`, [id]);
  ok(res, present(row!, u.id), 201);
}));

async function notifyClass(tenantId: string, classSubjectId: string, materialId: string, title: string) {
  const cs = await queryOne(`SELECT cs.class_id, s.name AS subject_name FROM \`${T('class_subjects')}\` cs JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE cs.id = ?`, [classSubjectId]);
  if (!cs) return;
  const ids = await studentIdsOfClass(String(cs.class_id));
  await notify({ tenantId, userIds: ids, type: 'MATERIAL', title: `Materi baru: ${title}`, body: String(cs.subject_name), link: `/siswa/materi/${materialId}` });
}

async function loadOwn(req: import('express').Request) {
  const u = req.auth!;
  const row = await queryOne(`SELECT * FROM \`${T('materials')}\` WHERE id = ? AND tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!row) throw notFound();
  if (row.created_by !== u.id && !(isTenantWide(u) && !hasRole(u, 'AUDITOR'))) {
    if (row.class_subject_id) await assertClassSubject(u, String(row.class_subject_id), { teach: true });
    else throw forbidden('Bukan materi Anda');
  }
  return row;
}

r.put('/:id', requirePermission('material:write'), validate(materialSchema.partial()), wrap(async (req, res) => {
  const u = req.auth!;
  const row = await loadOwn(req);
  if (req.body.class_subject_id) await assertClassSubject(u, req.body.class_subject_id, { teach: true });
  const b = { ...req.body } as Record<string, unknown>;
  if (b.is_published && !row.is_published) b.published_at = new Date();
  await updateRow('materials', String(row.id), b, undefined, u.tenantId);
  if (b.is_published && !row.is_published && (b.class_subject_id ?? row.class_subject_id)) await notifyClass(u.tenantId, String(b.class_subject_id ?? row.class_subject_id), String(row.id), String(b.title ?? row.title));
  await audit(req, 'material.update', 'materials', String(row.id), row, b);
  const fresh = await queryOne(`SELECT ${SELECT} ${FROM} WHERE m.id = ?`, [row.id]);
  ok(res, present(fresh!, u.id));
}));

r.post('/:id/publish', requirePermission('material:publish'), wrap(async (req, res) => {
  const row = await loadOwn(req);
  const next = row.is_published ? 0 : 1;
  await execute(`UPDATE \`${T('materials')}\` SET is_published = ?, published_at = IF(? = 1, NOW(), published_at) WHERE id = ?`, [next, next, row.id]);
  if (next && row.class_subject_id) await notifyClass(req.auth!.tenantId, String(row.class_subject_id), String(row.id), String(row.title));
  await audit(req, next ? 'material.publish' : 'material.unpublish', 'materials', String(row.id));
  ok(res, { is_published: !!next });
}));

r.delete('/:id', requirePermission('material:write'), wrap(async (req, res) => {
  const row = await loadOwn(req);
  await execute(`DELETE FROM \`${T('materials')}\` WHERE id = ?`, [row.id]);
  await audit(req, 'material.delete', 'materials', String(row.id), row);
  ok(res, { deleted: true });
}));

r.post('/:id/progress', requirePermission('material:read'), validate(z.object({ progress: z.number().int().min(0).max(100) })), wrap(async (req, res) => {
  const u = req.auth!;
  await execute(`INSERT INTO \`${T('material_views')}\` (id, tenant_id, material_id, user_id, first_viewed_at, last_viewed_at, view_count, progress) VALUES (?,?,?,?,NOW(),NOW(),1,?) ON DUPLICATE KEY UPDATE last_viewed_at = NOW(), progress = GREATEST(progress, VALUES(progress))`, [newId(), u.tenantId, req.params.id, u.id, req.body.progress]);
  ok(res, { saved: true });
}));

export default r;
