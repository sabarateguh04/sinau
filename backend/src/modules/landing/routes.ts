import { Router } from 'express';
import { z } from 'zod';
import { T, PLATFORM_TENANT_ID } from '../../config';
import { query, queryOne, execute } from '../../database/db';
import { wrap, ok, str } from '../../core/http';
import { notFound } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter } from '../../core/crud';
import { audit, fileUrl } from '../../core/services';
import { newId, slugify } from '../../core/ids';

const r = Router();
const P = { read: ['landing:read'], write: ['landing:write'] };
const withFile = (col: string) => (row: Record<string, unknown>) => ({ ...row, [`${col.replace('_file_id', '')}_url`]: fileUrl(row[col] as string | null) });

// ---------- Portal curation ----------
r.get('/portal/:which', requirePermission('landing:read', 'tenant:read', 'material:publish'), wrap(async (req, res) => {
  const u = req.auth!;
  const shared = req.params.which === 'shared';
  if (!shared && req.params.which !== 'candidates') throw notFound();
  const params: unknown[] = [];
  let where = 'WHERE m.is_published = 1';
  if (!(u.isSuperAdmin && u.tenantId === PLATFORM_TENANT_ID)) { where += ' AND m.tenant_id = ?'; params.push(u.tenantId); }
  where += shared ? ' AND sh.id IS NOT NULL' : ' AND sh.id IS NULL AND m.is_public = 1';
  const q = str(req.query.q);
  if (q) { where += ' AND m.title LIKE ?'; params.push(`%${q}%`); }
  ok(res, await query(`SELECT m.id, m.title, m.type, m.view_count, m.published_at, t.name AS tenant_name, u.full_name AS author_name, sh.is_featured,
      COALESCE(s1.name, s2.name) AS subject_name
    FROM \`${T('materials')}\` m JOIN \`${T('tenants')}\` t ON t.id = m.tenant_id LEFT JOIN \`${T('users')}\` u ON u.id = m.created_by LEFT JOIN \`${T('module_portal_shares')}\` sh ON sh.material_id = m.id
    LEFT JOIN \`${T('class_subjects')}\` cs ON cs.id = m.class_subject_id LEFT JOIN \`${T('subjects')}\` s1 ON s1.id = cs.subject_id LEFT JOIN \`${T('subjects')}\` s2 ON s2.id = m.subject_id ${where} ORDER BY m.published_at DESC LIMIT 300`, params));
}));
r.post('/portal/share', requirePermission('landing:write', 'material:publish'), validate(z.object({ material_id: z.string(), is_featured: z.boolean().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const m = await queryOne(`SELECT id, tenant_id, file_id FROM \`${T('materials')}\` WHERE id = ?`, [req.body.material_id]);
  if (!m || (!u.isSuperAdmin && m.tenant_id !== u.tenantId)) throw notFound();
  await execute(`INSERT INTO \`${T('module_portal_shares')}\` (id, tenant_id, material_id, shared_by, is_featured) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE is_featured = VALUES(is_featured), shared_by = VALUES(shared_by)`, [newId(), m.tenant_id, m.id, u.id, req.body.is_featured ? 1 : 0]);
  if (m.file_id) await execute(`UPDATE \`${T('files')}\` SET is_public = 1 WHERE id = ?`, [m.file_id]);
  await audit(req, 'portal.share', 'materials', String(m.id), undefined, req.body);
  ok(res, { shared: true });
}));
r.delete('/portal/share/:materialId', requirePermission('landing:write', 'material:publish'), wrap(async (req, res) => {
  const u = req.auth!;
  await execute(`DELETE FROM \`${T('module_portal_shares')}\` WHERE material_id = ?${u.isSuperAdmin ? '' : ' AND tenant_id = ?'}`, u.isSuperAdmin ? [req.params.materialId] : [req.params.materialId, u.tenantId]);
  await audit(req, 'portal.unshare', 'materials', req.params.materialId);
  ok(res, { unshared: true });
}));

// ---------- CMS ----------
const pageSchema = z.object({ slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/), title: z.string().min(2).max(150), hero_title: z.string().max(200).nullable().optional(), hero_subtitle: z.string().max(300).nullable().optional(), hero_image_file_id: z.string().nullable().optional(), sections: z.any().optional(), seo_description: z.string().max(300).nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() });
r.use('/pages', crudRouter({ table: 'landing_pages', searchable: ['t.title', 't.slug'], sortable: ['order_no', 'title'], defaultSort: 'order_no', defaultOrder: 'ASC', perms: P, createSchema: pageSchema, updateSchema: pageSchema.partial(), present: (row) => ({ ...withFile('hero_image_file_id')(row), sections: typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections }) }));
const newsSchema = z.object({ slug: z.string().max(120).optional(), title: z.string().min(2).max(200), excerpt: z.string().max(400).nullable().optional(), body: z.string().max(200000).nullable().optional(), cover_file_id: z.string().nullable().optional(), category: z.string().max(40).nullable().optional(), is_published: z.boolean().optional(), published_at: z.string().nullable().optional() });
r.use('/news', crudRouter({ table: 'news_articles', searchable: ['t.title', 't.excerpt'], sortable: ['published_at', 'title', 'view_count'], perms: P, select: 'u.full_name AS author', joins: `LEFT JOIN \`${T('users')}\` u ON u.id = t.author_id`, filters: [{ param: 'category', column: 't.category' }, { param: 'is_published', column: 't.is_published', op: 'BOOL' }], createSchema: newsSchema, updateSchema: newsSchema.partial(),
  toRow: (input, req, isCreate) => { const b = { ...(input as Record<string, unknown>) }; if (isCreate) { b.author_id = req.auth!.id; b.slug = b.slug || `${slugify(String(b.title))}-${Date.now().toString(36)}`; } if (b.published_at !== undefined) b.published_at = b.published_at ? new Date(String(b.published_at)) : null; if (b.is_published && !b.published_at) b.published_at = new Date(); return b; }, present: withFile('cover_file_id') }));
r.use('/faqs', crudRouter({ table: 'faqs', searchable: ['t.question'], sortable: ['order_no'], defaultSort: 'order_no', defaultOrder: 'ASC', perms: P, createSchema: z.object({ question: z.string().min(3).max(300), answer: z.string().min(1).max(5000), category: z.string().max(60).nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() }), updateSchema: z.object({ question: z.string().min(3).max(300).optional(), answer: z.string().min(1).max(5000).optional(), category: z.string().max(60).nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() }) }));
r.use('/testimonials', crudRouter({ table: 'testimonials', searchable: ['t.name', 't.quote'], sortable: ['order_no'], defaultSort: 'order_no', defaultOrder: 'ASC', perms: P, createSchema: z.object({ name: z.string().min(2).max(150), role_label: z.string().max(100).nullable().optional(), quote: z.string().min(3).max(2000), photo_file_id: z.string().nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() }), updateSchema: z.object({ name: z.string().min(2).max(150).optional(), role_label: z.string().max(100).nullable().optional(), quote: z.string().min(3).max(2000).optional(), photo_file_id: z.string().nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() }), present: withFile('photo_file_id') }));
r.use('/facilities', crudRouter({ table: 'facilities', searchable: ['t.name'], sortable: ['order_no'], defaultSort: 'order_no', defaultOrder: 'ASC', perms: P, createSchema: z.object({ name: z.string().min(2).max(150), description: z.string().max(4000).nullable().optional(), photo_file_id: z.string().nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() }), updateSchema: z.object({ name: z.string().min(2).max(150).optional(), description: z.string().max(4000).nullable().optional(), photo_file_id: z.string().nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() }), present: withFile('photo_file_id') }));
r.use('/gallery', crudRouter({ table: 'gallery_items', searchable: ['t.title', 't.album'], sortable: ['order_no', 'created_at'], perms: P, filters: [{ param: 'album', column: 't.album' }], createSchema: z.object({ title: z.string().max(150).nullable().optional(), file_id: z.string(), album: z.string().max(100).nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() }), updateSchema: z.object({ title: z.string().max(150).nullable().optional(), file_id: z.string().optional(), album: z.string().max(100).nullable().optional(), is_published: z.boolean().optional(), order_no: z.number().int().optional() }), present: withFile('file_id'), afterCreate: async (row, _req, exec) => { await execute(`UPDATE \`${T('files')}\` SET is_public = 1 WHERE id = ?`, [row.file_id], exec); } }));
r.use('/contact-messages', crudRouter({ table: 'contact_messages', searchable: ['t.name', 't.subject', 't.message'], sortable: ['created_at'], perms: { read: P.read, write: P.write }, filters: [{ param: 'status', column: 't.status' }], createSchema: z.object({}), updateSchema: z.object({ status: z.enum(['NEW', 'READ', 'REPLIED', 'ARCHIVED']) }) }));

export default r;
