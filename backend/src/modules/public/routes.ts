/**
 * Public, unauthenticated endpoints: tenant landing content, news, shared materials portal, PPDB
 * registration/tracking and the platform tenant directory. Everything is keyed by tenant slug.
 */
import { Router, Request } from 'express';
import { z } from 'zod';
import { T, PLATFORM_TENANT_ID } from '../../config';
import { query, queryOne, execute } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, badRequest } from '../../core/errors';
import { validate, loginLimiter } from '../../middlewares';
import { fileUrl, upload, registerFile, sendMail } from '../../core/services';
import { newId, randomToken, sha256 } from '../../core/ids';
import { insertRow } from '../../core/crud';

const r = Router();

async function tenantBySlug(slug: string) {
  const t = await queryOne(`SELECT t.id, t.slug, t.name, t.type, t.category, t.npsn, t.address, t.phone, t.email, t.website, t.principal_name, p.nama AS provinsi_nama, k.nama AS kota_nama,
      b.display_name, b.tagline, b.logo_url, b.favicon_url, b.primary_color, b.accent_color, s.self_registration, s.portal_share
    FROM \`${T('tenants')}\` t LEFT JOIN \`${T('provinsi')}\` p ON p.id = t.provinsi_id LEFT JOIN \`${T('kota')}\` k ON k.id = t.kota_id LEFT JOIN \`${T('tenant_branding')}\` b ON b.tenant_id = t.id LEFT JOIN \`${T('tenant_settings')}\` s ON s.tenant_id = t.id
    WHERE t.slug = ? AND t.is_active = 1 AND t.deleted_at IS NULL AND t.id <> ?`, [slug, PLATFORM_TENANT_ID]);
  if (!t) throw notFound('Lembaga tidak ditemukan');
  return t;
}

r.get('/platform', wrap(async (_req, res) => {
  const b = await queryOne(`SELECT display_name, tagline, logo_url, primary_color, accent_color FROM \`${T('tenant_branding')}\` WHERE tenant_id = ?`, [PLATFORM_TENANT_ID]);
  const stats = await queryOne(`SELECT (SELECT COUNT(*) FROM \`${T('tenants')}\` WHERE is_active = 1 AND deleted_at IS NULL AND id <> ?) AS tenants, (SELECT COUNT(*) FROM \`${T('user_roles')}\` WHERE role = 'SISWA') AS students, (SELECT COUNT(*) FROM \`${T('materials')}\` WHERE is_published = 1) AS materials`, [PLATFORM_TENANT_ID]);
  ok(res, { branding: b, stats });
}));

r.get('/tenants/:slug', wrap(async (req, res) => {
  const t = await tenantBySlug(req.params.slug);
  const pages = await query(`SELECT slug, title, hero_title, hero_subtitle, hero_image_file_id, sections, seo_description, order_no FROM \`${T('landing_pages')}\` WHERE tenant_id = ? AND is_published = 1 ORDER BY order_no`, [t.id]);
  const majors = await query(`SELECT code, name, description FROM \`${T('majors')}\` WHERE tenant_id = ? AND is_active = 1 ORDER BY name`, [t.id]);
  const stats = await queryOne(`SELECT (SELECT COUNT(*) FROM \`${T('user_roles')}\` WHERE tenant_id = ? AND role = 'SISWA') AS students, (SELECT COUNT(*) FROM \`${T('user_roles')}\` WHERE tenant_id = ? AND role = 'GURU') AS teachers, (SELECT COUNT(*) FROM \`${T('majors')}\` WHERE tenant_id = ? AND is_active = 1) AS majors, (SELECT COUNT(*) FROM \`${T('extracurriculars')}\` WHERE tenant_id = ? AND is_active = 1) AS extracurriculars`, [t.id, t.id, t.id, t.id]);
  const ppdb = await queryOne(`SELECT id, name, open_at, close_at, quota, announcement FROM \`${T('ppdb_periods')}\` WHERE tenant_id = ? AND is_active = 1 AND close_at >= NOW() ORDER BY open_at DESC LIMIT 1`, [t.id]);
  ok(res, { ...t, pages: pages.map((p) => ({ ...p, hero_image_url: fileUrl(p.hero_image_file_id), sections: typeof p.sections === 'string' ? JSON.parse(p.sections) : p.sections })), majors, stats, ppdb });
}));

r.get('/tenants/:slug/news', wrap(async (req, res) => {
  const t = await tenantBySlug(req.params.slug);
  const { page, limit, offset } = paging(req.query, 50);
  const params: unknown[] = [t.id];
  let where = 'WHERE n.tenant_id = ? AND n.is_published = 1';
  if (str(req.query.category)) { where += ' AND n.category = ?'; params.push(String(req.query.category)); }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('news_articles')}\` n ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT n.id, n.slug, n.title, n.excerpt, n.cover_file_id, n.category, n.published_at, n.view_count, u.full_name AS author FROM \`${T('news_articles')}\` n LEFT JOIN \`${T('users')}\` u ON u.id = n.author_id ${where} ORDER BY n.published_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paged(res, rows.map((x) => ({ ...x, cover_url: fileUrl(x.cover_file_id) })), { page, limit, total });
}));
r.get('/tenants/:slug/news/:newsSlug', wrap(async (req, res) => {
  const t = await tenantBySlug(req.params.slug);
  const n = await queryOne(`SELECT n.*, u.full_name AS author FROM \`${T('news_articles')}\` n LEFT JOIN \`${T('users')}\` u ON u.id = n.author_id WHERE n.tenant_id = ? AND n.slug = ? AND n.is_published = 1`, [t.id, req.params.newsSlug]);
  if (!n) throw notFound();
  await execute(`UPDATE \`${T('news_articles')}\` SET view_count = view_count + 1 WHERE id = ?`, [n.id]);
  ok(res, { ...n, cover_url: fileUrl(n.cover_file_id) });
}));

/** Landing sub-collections: facilities, gallery, testimonials, faqs, achievements, extracurriculars. */
r.get('/tenants/:slug/:collection', wrap(async (req, res) => {
  const c = req.params.collection;
  if (!['facilities', 'gallery', 'testimonials', 'faqs', 'achievements', 'extracurriculars'].includes(c)) throw notFound();
  const t = await tenantBySlug(req.params.slug);
  let rows: Record<string, unknown>[] = [];
  if (c === 'facilities') rows = await query(`SELECT name, description, photo_file_id FROM \`${T('facilities')}\` WHERE tenant_id = ? AND is_published = 1 ORDER BY order_no`, [t.id]);
  if (c === 'gallery') rows = await query(`SELECT title, file_id, album FROM \`${T('gallery_items')}\` WHERE tenant_id = ? AND is_published = 1 ORDER BY order_no, created_at DESC LIMIT 100`, [t.id]);
  if (c === 'testimonials') rows = await query(`SELECT name, role_label, quote, photo_file_id FROM \`${T('testimonials')}\` WHERE tenant_id = ? AND is_published = 1 ORDER BY order_no`, [t.id]);
  if (c === 'faqs') rows = await query(`SELECT question, answer, category FROM \`${T('faqs')}\` WHERE tenant_id = ? AND is_published = 1 ORDER BY order_no`, [t.id]);
  if (c === 'achievements') rows = await query(`SELECT a.title, a.level, a.rank_label AS rank, a.organizer, a.achieved_at, u.full_name AS student_name FROM \`${T('achievements')}\` a JOIN \`${T('users')}\` u ON u.id = a.student_id WHERE a.tenant_id = ? AND a.is_public = 1 ORDER BY a.achieved_at DESC LIMIT 50`, [t.id]);
  if (c === 'extracurriculars') rows = await query(`SELECT name, description, schedule_text FROM \`${T('extracurriculars')}\` WHERE tenant_id = ? AND is_active = 1 ORDER BY name`, [t.id]);
  ok(res, rows.map((x) => ({ ...x, photo_url: fileUrl((x.photo_file_id ?? x.file_id) as string | null) })));
}));

r.post('/tenants/:slug/contact', loginLimiter, validate(z.object({ name: z.string().min(2).max(150), email: z.string().email().optional(), phone: z.string().max(30).optional(), subject: z.string().max(200).optional(), message: z.string().min(5).max(4000) })), wrap(async (req, res) => {
  const t = await tenantBySlug(req.params.slug);
  await insertRow('contact_messages', { id: newId(), tenant_id: t.id, ...req.body, ip: req.ip ?? null });
  ok(res, { sent: true }, 201);
}));

/** Public material portal: materials explicitly shared (module_portal_shares) or marked public (AUTO tenants). */
r.get('/portal', wrap(async (req, res) => {
  const { page, limit, offset } = paging(req.query, 50);
  const params: unknown[] = [];
  let where = `WHERE m.is_published = 1 AND t.is_active = 1 AND (m.is_public = 1 OR sh.id IS NOT NULL)`;
  if (str(req.query.tenant)) { where += ' AND t.slug = ?'; params.push(String(req.query.tenant)); }
  const q = str(req.query.q);
  if (q) { where += ' AND (m.title LIKE ? OR m.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  const from = `FROM \`${T('materials')}\` m JOIN \`${T('tenants')}\` t ON t.id = m.tenant_id LEFT JOIN \`${T('tenant_settings')}\` s ON s.tenant_id = t.id LEFT JOIN \`${T('module_portal_shares')}\` sh ON sh.material_id = m.id LEFT JOIN \`${T('subjects')}\` sb ON sb.id = COALESCE(m.subject_id, (SELECT subject_id FROM \`${T('class_subjects')}\` cs WHERE cs.id = m.class_subject_id))`;
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${from} ${where}`, params))?.c ?? 0);
  const rows = await query(`SELECT m.id, m.title, m.description, m.type, m.grade_level, m.view_count, m.published_at, t.name AS tenant_name, t.slug AS tenant_slug, sb.name AS subject_name, sh.is_featured ${from} ${where} ORDER BY sh.is_featured DESC, m.published_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  paged(res, rows, { page, limit, total });
}));
r.get('/portal/:id', wrap(async (req, res) => {
  const m = await queryOne(`SELECT m.*, t.name AS tenant_name, t.slug AS tenant_slug, f.original_name AS file_name, f.mime AS file_mime, f.is_public AS file_public FROM \`${T('materials')}\` m JOIN \`${T('tenants')}\` t ON t.id = m.tenant_id LEFT JOIN \`${T('tenant_settings')}\` s ON s.tenant_id = t.id LEFT JOIN \`${T('module_portal_shares')}\` sh ON sh.material_id = m.id LEFT JOIN \`${T('files')}\` f ON f.id = m.file_id WHERE m.id = ? AND m.is_published = 1 AND (m.is_public = 1 OR sh.id IS NOT NULL)`, [req.params.id]);
  if (!m) throw notFound();
  await execute(`UPDATE \`${T('materials')}\` SET view_count = view_count + 1 WHERE id = ?`, [m.id]);
  if (m.file_id && !m.file_public) await execute(`UPDATE \`${T('files')}\` SET is_public = 1 WHERE id = ?`, [m.file_id]); // shared material files become public
  ok(res, { ...m, file_url: fileUrl(m.file_id) });
}));

// ---------- PPDB (public) ----------
r.get('/tenants/:slug/ppdb', wrap(async (req, res) => {
  const t = await tenantBySlug(req.params.slug);
  const periods = await query(`SELECT id, name, open_at, close_at, quota, requirements, paths, announcement, (SELECT COUNT(*) FROM \`${T('ppdb_applicants')}\` a WHERE a.period_id = p.id) AS applicant_count FROM \`${T('ppdb_periods')}\` p WHERE p.tenant_id = ? AND p.is_active = 1 ORDER BY open_at DESC`, [t.id]);
  const majors = await query(`SELECT id, code, name, description FROM \`${T('majors')}\` WHERE tenant_id = ? AND is_active = 1 ORDER BY name`, [t.id]);
  ok(res, { tenant: { slug: t.slug, name: t.name, display_name: t.display_name, logo_url: t.logo_url, primary_color: t.primary_color }, periods: periods.map((p) => ({ ...p, requirements: parse(p.requirements), paths: parse(p.paths), is_open: new Date(p.open_at) <= new Date() && new Date(p.close_at) >= new Date() })), majors });
}));
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

const applySchema = z.object({
  period_id: z.string(), full_name: z.string().min(3).max(150), nisn: z.string().max(20).nullable().optional(), nik: z.string().max(20).nullable().optional(), gender: z.enum(['L', 'P']).nullable().optional(),
  birth_place: z.string().max(100).nullable().optional(), birth_date: z.string().max(10).nullable().optional(), origin_school: z.string().max(200).nullable().optional(), address: z.string().max(2000).nullable().optional(),
  phone: z.string().min(6).max(30), email: z.string().email().nullable().optional(), parent_name: z.string().max(150).nullable().optional(), parent_phone: z.string().max(30).nullable().optional(),
  major_choice_1: z.string().nullable().optional(), major_choice_2: z.string().nullable().optional(), path: z.string().max(30).nullable().optional(),
});
r.post('/tenants/:slug/ppdb/apply', loginLimiter, validate(applySchema), wrap(async (req, res) => {
  const t = await tenantBySlug(req.params.slug);
  const p = await queryOne(`SELECT * FROM \`${T('ppdb_periods')}\` WHERE id = ? AND tenant_id = ? AND is_active = 1`, [req.body.period_id, t.id]);
  if (!p) throw notFound('Periode PPDB tidak ditemukan');
  if (new Date(p.open_at) > new Date() || new Date(p.close_at) < new Date()) throw badRequest('Pendaftaran belum dibuka atau sudah ditutup');
  if (req.body.nisn) {
    const dup = await queryOne(`SELECT id FROM \`${T('ppdb_applicants')}\` WHERE period_id = ? AND nisn = ?`, [p.id, req.body.nisn]);
    if (dup) throw badRequest('NISN sudah terdaftar di periode ini');
  }
  const count = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('ppdb_applicants')}\` WHERE period_id = ?`, [p.id]))?.c ?? 0);
  const regNo = `${new Date().getFullYear()}${String(t.slug).slice(0, 4).toUpperCase()}${String(count + 1).padStart(4, '0')}`;
  const token = randomToken(16);
  const id = newId();
  await insertRow('ppdb_applicants', { id, tenant_id: t.id, ...req.body, registration_no: regNo, access_token: sha256(token), status: 'SUBMITTED' });
  if (req.body.email) await sendMail(req.body.email, `Pendaftaran PPDB ${t.name}`, `Nomor pendaftaran: ${regNo}\nKode akses: ${token}\nSimpan kode ini untuk melihat status dan mengunggah dokumen.`);
  ok(res, { id, registration_no: regNo, access_token: token }, 201);
}));
async function applicantByToken(req: Request) {
  const t = await tenantBySlug(req.params.slug);
  const token = str(req.query.token) ?? str(req.body?.token);
  if (!token) throw badRequest('Kode akses wajib');
  const a = await queryOne(`SELECT a.*, p.name AS period_name, p.requirements, m1.name AS major1_name, m2.name AS major2_name FROM \`${T('ppdb_applicants')}\` a JOIN \`${T('ppdb_periods')}\` p ON p.id = a.period_id LEFT JOIN \`${T('majors')}\` m1 ON m1.id = a.major_choice_1 LEFT JOIN \`${T('majors')}\` m2 ON m2.id = a.major_choice_2 WHERE a.tenant_id = ? AND a.access_token = ?`, [t.id, sha256(token)]);
  if (!a) throw notFound('Pendaftaran tidak ditemukan');
  return a;
}
r.get('/tenants/:slug/ppdb/status', wrap(async (req, res) => {
  const a = await applicantByToken(req);
  const docs = await query(`SELECT d.id, d.doc_type, d.status, d.note, d.created_at, f.original_name FROM \`${T('ppdb_documents')}\` d JOIN \`${T('files')}\` f ON f.id = d.file_id WHERE d.applicant_id = ?`, [a.id]);
  const { access_token, ...rest } = a;
  ok(res, { ...rest, requirements: parse(a.requirements), documents: docs });
}));
r.post('/tenants/:slug/ppdb/documents', (req, _res, next) => { req.params.module = 'ppdb'; next(); }, upload.single('file'), wrap(async (req, res) => {
  const a = await applicantByToken(req);
  if (!req.file) throw badRequest('Berkas tidak ada');
  const docType = str(req.body.doc_type) ?? 'LAINNYA';
  const f = await registerFile(req, req.file, 'ppdb', false);
  await execute(`UPDATE \`${T('files')}\` SET tenant_id = ? WHERE id = ?`, [a.tenant_id, f.id]);
  await execute(`DELETE FROM \`${T('ppdb_documents')}\` WHERE applicant_id = ? AND doc_type = ?`, [a.id, docType]);
  await insertRow('ppdb_documents', { id: newId(), applicant_id: a.id, doc_type: docType, file_id: f.id });
  ok(res, { uploaded: true, doc_type: docType }, 201);
}));

export default r;
