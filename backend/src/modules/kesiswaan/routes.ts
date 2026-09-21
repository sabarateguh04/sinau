import { Router, Request } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { T } from '../../config';
import { query, queryOne, execute } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { notFound, forbidden, badRequest } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter, insertRow, mustGet } from '../../core/crud';
import { audit, notify, fileUrl } from '../../core/services';
import { newId } from '../../core/ids';
import { isTenantWide, classScope, childrenOf, assertStudentAccess } from '../../core/scope';
import { hasRole } from '../../core/auth';

const r = Router();
const STUDENT_JOIN = `JOIN \`${T('users')}\` st ON st.id = t.student_id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = st.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1`;
const STUDENT_SELECT = 'st.full_name AS student_name, c.name AS class_name';
/** Rows about students: students see their own, guardians their children, teachers their classes. */
function studentScope(req: Request) {
  const u = req.auth!;
  if (isTenantWide(u)) return null;
  if (hasRole(u, 'SISWA')) return { sql: 't.student_id = ?', params: [u.id] };
  if (hasRole(u, 'WALI_MURID')) return { sql: `t.student_id IN (SELECT student_id FROM \`${T('guardian_students')}\` WHERE guardian_user_id = ?)`, params: [u.id] };
  const sc = classScope(u);
  return { sql: `(c.id IS NOT NULL AND ${sc.sql})`, params: sc.params };
}

// ---------- BK: konseling (rahasia) ----------
const counselingSchema = z.object({ student_id: z.string(), session_date: z.string().max(10), category: z.enum(['PRIBADI', 'SOSIAL', 'BELAJAR', 'KARIER', 'KELUARGA', 'LAINNYA']).optional(), summary: z.string().min(3).max(8000), follow_up: z.string().max(4000).nullable().optional(), is_confidential: z.boolean().optional() });
r.use('/counseling', crudRouter({
  table: 'counseling_notes', searchable: ['st.full_name', 't.summary'], sortable: ['session_date', 'created_at'], defaultSort: 'session_date', perms: { read: ['counseling:read'], write: ['counseling:write'] },
  select: `${STUDENT_SELECT}, cn.full_name AS counselor_name`, joins: `${STUDENT_JOIN} LEFT JOIN \`${T('users')}\` cn ON cn.id = t.counselor_id`,
  filters: [{ param: 'student_id', column: 't.student_id' }, { param: 'category', column: 't.category' }, { param: 'class_id', column: 'c.id' }],
  scope: (req) => (hasRole(req.auth!, 'BK') || isTenantWide(req.auth!) ? null : { sql: 't.counselor_id = ?', params: [req.auth!.id] }),
  createSchema: counselingSchema, updateSchema: counselingSchema.partial(), toRow: (input, req, isCreate) => (isCreate ? { ...(input as Record<string, unknown>), counselor_id: req.auth!.id } : (input as Record<string, unknown>)),
}));

// ---------- Kedisiplinan ----------
const ruleSchema = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(150), kind: z.enum(['PELANGGARAN', 'PENGHARGAAN']).optional(), points: z.number().int().min(-100).max(100), description: z.string().max(2000).nullable().optional(), is_active: z.boolean().optional() });
r.use('/discipline/rules', crudRouter({ table: 'discipline_rules', searchable: ['t.code', 't.name'], sortable: ['code', 'points'], defaultSort: 'code', defaultOrder: 'ASC', perms: { read: ['discipline:read'], write: ['discipline:write'] }, filters: [{ param: 'kind', column: 't.kind' }], createSchema: ruleSchema, updateSchema: ruleSchema.partial() }));
const recordSchema = z.object({ student_id: z.string(), rule_id: z.string().nullable().optional(), incident_date: z.string().max(10), points: z.number().int().optional(), description: z.string().max(4000).nullable().optional(), action_taken: z.string().max(4000).nullable().optional(), parent_notified: z.boolean().optional() });
r.use('/discipline/records', crudRouter({
  table: 'discipline_records', searchable: ['st.full_name', 't.description'], sortable: ['incident_date', 'points'], defaultSort: 'incident_date', perms: { read: ['discipline:read'], write: ['discipline:write'] },
  select: `${STUDENT_SELECT}, dr.name AS rule_name, dr.kind, rb.full_name AS recorded_by_name`, joins: `${STUDENT_JOIN} LEFT JOIN \`${T('discipline_rules')}\` dr ON dr.id = t.rule_id LEFT JOIN \`${T('users')}\` rb ON rb.id = t.recorded_by`,
  filters: [{ param: 'student_id', column: 't.student_id' }, { param: 'class_id', column: 'c.id' }, { param: 'kind', column: 'dr.kind' }], scope: studentScope,
  createSchema: recordSchema, updateSchema: recordSchema.partial(),
  toRow: async (input, req, isCreate) => { const b = { ...(input as Record<string, unknown>) }; if (b.rule_id && b.points === undefined) { const rule = await queryOne(`SELECT points FROM \`${T('discipline_rules')}\` WHERE id = ?`, [b.rule_id]); b.points = rule ? Number(rule.points) : 0; } return isCreate ? { ...b, recorded_by: req.auth!.id } : b; },
  afterCreate: async (row, req) => { if (row.parent_notified) { const g = await childrenGuardians(String(row.student_id)); await notify({ tenantId: req.auth!.tenantId, userIds: g, type: 'DISCIPLINE', title: 'Catatan kedisiplinan anak', body: String(row.description ?? ''), link: '/ortu/bk/kedisiplinan' }); } },
}));
const childrenGuardians = async (studentId: string) => (await query(`SELECT guardian_user_id FROM \`${T('guardian_students')}\` WHERE student_id = ?`, [studentId])).map((x) => String(x.guardian_user_id));
r.get('/discipline/summary', requirePermission('discipline:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const sc = classScope(u);
  ok(res, await query(`SELECT st.id, st.full_name, c.name AS class_name, SUM(CASE WHEN dr.kind = 'PENGHARGAAN' THEN 0 ELSE d.points END) AS violation_points, SUM(CASE WHEN dr.kind = 'PENGHARGAAN' THEN ABS(d.points) ELSE 0 END) AS reward_points, COUNT(d.id) AS records
    FROM \`${T('discipline_records')}\` d JOIN \`${T('users')}\` st ON st.id = d.student_id LEFT JOIN \`${T('discipline_rules')}\` dr ON dr.id = d.rule_id JOIN \`${T('class_students')}\` e ON e.student_id = st.id AND e.status = 'AKTIF' JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1
    WHERE d.tenant_id = ? AND ${sc.sql} GROUP BY st.id, st.full_name, c.name ORDER BY violation_points DESC LIMIT 100`, [u.tenantId, ...sc.params]));
}));

// ---------- Ekstrakurikuler ----------
const ekskulSchema = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(120), description: z.string().max(4000).nullable().optional(), coach_id: z.string().nullable().optional(), schedule_text: z.string().max(200).nullable().optional(), quota: z.number().int().nullable().optional(), is_active: z.boolean().optional() });
r.use('/extracurriculars', crudRouter({ table: 'extracurriculars', searchable: ['t.code', 't.name'], sortable: ['name'], defaultSort: 'name', defaultOrder: 'ASC', perms: { read: ['extracurricular:read'], write: ['extracurricular:write'] }, select: `co.full_name AS coach_name, (SELECT COUNT(*) FROM \`${T('extracurricular_members')}\` m WHERE m.extracurricular_id = t.id AND m.status = 'AKTIF') AS member_count`, joins: `LEFT JOIN \`${T('users')}\` co ON co.id = t.coach_id`, createSchema: ekskulSchema, updateSchema: ekskulSchema.partial() }));
r.get('/extracurriculars/:id/members', requirePermission('extracurricular:read'), wrap(async (req, res) => {
  await mustGet('extracurriculars', req.params.id, req.auth!.tenantId);
  ok(res, await query(`SELECT m.id, m.student_id, m.status, m.score, m.note, st.full_name, sp.nis, c.name AS class_name FROM \`${T('extracurricular_members')}\` m JOIN \`${T('users')}\` st ON st.id = m.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = st.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 WHERE m.extracurricular_id = ? ORDER BY st.full_name`, [req.params.id]));
}));
r.post('/extracurriculars/:id/members', requirePermission('extracurricular:members', 'extracurricular:read'), validate(z.object({ student_ids: z.array(z.string()).optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const ek = await mustGet('extracurriculars', req.params.id, u.tenantId);
  const self = hasRole(u, 'SISWA') && !u.permissions.has('extracurricular:members');
  const ids: string[] = self ? [u.id] : (req.body.student_ids ?? []);
  if (!ids.length) throw badRequest('student_ids wajib');
  if (self && ek.quota) { const n = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('extracurricular_members')}\` WHERE extracurricular_id = ? AND status = 'AKTIF'`, [ek.id]))?.c ?? 0); if (n >= Number(ek.quota)) throw badRequest('Kuota penuh'); }
  const year = await queryOne(`SELECT id FROM \`${T('academic_years')}\` WHERE tenant_id = ? AND is_active = 1`, [u.tenantId]);
  for (const sid of ids) await execute(`INSERT INTO \`${T('extracurricular_members')}\` (id, tenant_id, extracurricular_id, student_id, academic_year_id, status) VALUES (?,?,?,?,?,'AKTIF') ON DUPLICATE KEY UPDATE status = 'AKTIF'`, [newId(), u.tenantId, ek.id, sid, year?.id ?? null]);
  await audit(req, 'extracurricular.join', 'extracurriculars', String(ek.id), undefined, { count: ids.length });
  ok(res, { added: ids.length }, 201);
}));
r.put('/extracurriculars/:id/members/:studentId', requirePermission('extracurricular:members'), validate(z.object({ status: z.enum(['AKTIF', 'KELUAR']).optional(), score: z.string().max(2).nullable().optional(), note: z.string().max(255).nullable().optional() })), wrap(async (req, res) => {
  await mustGet('extracurriculars', req.params.id, req.auth!.tenantId);
  const cols = Object.keys(req.body);
  if (cols.length) await execute(`UPDATE \`${T('extracurricular_members')}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE extracurricular_id = ? AND student_id = ?`, [...cols.map((c) => req.body[c]), req.params.id, req.params.studentId]);
  ok(res, { saved: true });
}));
r.get('/extracurriculars/mine/list', requirePermission('extracurricular:read'), wrap(async (req, res) => {
  ok(res, await query(`SELECT m.extracurricular_id, m.status, m.score, e.name FROM \`${T('extracurricular_members')}\` m JOIN \`${T('extracurriculars')}\` e ON e.id = m.extracurricular_id WHERE m.student_id = ?`, [req.auth!.id]));
}));

// ---------- Prestasi ----------
const achSchema = z.object({ student_id: z.string(), title: z.string().min(2).max(200), level: z.enum(['SEKOLAH', 'KECAMATAN', 'KOTA', 'PROVINSI', 'NASIONAL', 'INTERNASIONAL']).optional(), rank_label: z.string().max(40).nullable().optional(), organizer: z.string().max(200).nullable().optional(), achieved_at: z.string().max(10).nullable().optional(), certificate_file_id: z.string().nullable().optional(), is_public: z.boolean().optional() });
r.use('/achievements', crudRouter({ table: 'achievements', searchable: ['t.title', 'st.full_name', 't.organizer'], sortable: ['achieved_at', 'level'], defaultSort: 'achieved_at', perms: { read: ['achievement:read'], write: ['achievement:write'] }, select: STUDENT_SELECT, joins: STUDENT_JOIN, filters: [{ param: 'student_id', column: 't.student_id' }, { param: 'level', column: 't.level' }, { param: 'class_id', column: 'c.id' }], scope: studentScope, createSchema: achSchema, updateSchema: achSchema.partial(), present: (row) => ({ ...row, certificate_url: fileUrl(row.certificate_file_id as string | null) }) }));

// ---------- Surat resmi ----------
const tplSchema = z.object({ code: z.string().min(1).max(30), name: z.string().min(2).max(120), body_template: z.string().max(50000).nullable().optional(), number_format: z.string().max(80).nullable().optional(), is_active: z.boolean().optional() });
r.use('/letters/templates', crudRouter({ table: 'letter_templates', searchable: ['t.code', 't.name'], sortable: ['code'], defaultSort: 'code', defaultOrder: 'ASC', perms: { read: ['letter:read'], write: ['letter:write'] }, createSchema: tplSchema, updateSchema: tplSchema.partial() }));
const letterSchema = z.object({ template_id: z.string().nullable().optional(), number: z.string().max(80).optional(), subject: z.string().min(2).max(200), recipient: z.string().max(200).nullable().optional(), body: z.string().max(50000).nullable().optional(), letter_date: z.string().max(10), status: z.enum(['DRAFT', 'SUBMITTED', 'SIGNED', 'ARCHIVED']).optional(), student_id: z.string().optional() });
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
async function renderTemplate(tenantId: string, tplId: string | null, vars: Record<string, string>) {
  if (!tplId) return { body: '', number: '' };
  const tpl = await queryOne(`SELECT * FROM \`${T('letter_templates')}\` WHERE id = ? AND tenant_id = ?`, [tplId, tenantId]);
  if (!tpl) return { body: '', number: '' };
  const seq = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('official_letters')}\` WHERE tenant_id = ? AND YEAR(letter_date) = YEAR(CURDATE())`, [tenantId]))?.c ?? 0) + 1;
  const now = new Date();
  const all: Record<string, string> = { ...vars, seq: String(seq).padStart(3, '0'), month_roman: ROMAN[now.getMonth() + 1], year: String(now.getFullYear()) };
  const sub = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => all[k] ?? '');
  return { body: sub(String(tpl.body_template ?? '')), number: sub(String(tpl.number_format ?? '{{seq}}/{{year}}')) };
}
r.use('/letters', crudRouter({
  table: 'official_letters', searchable: ['t.number', 't.subject', 't.recipient'], sortable: ['letter_date', 'created_at'], defaultSort: 'letter_date', perms: { read: ['letter:read'], write: ['letter:write'] },
  select: 'tp.name AS template_name, cb.full_name AS created_by_name, sg.full_name AS signed_by_name', joins: `LEFT JOIN \`${T('letter_templates')}\` tp ON tp.id = t.template_id LEFT JOIN \`${T('users')}\` cb ON cb.id = t.created_by LEFT JOIN \`${T('users')}\` sg ON sg.id = t.signed_by`,
  filters: [{ param: 'status', column: 't.status' }, { param: 'template_id', column: 't.template_id' }],
  scope: (req) => (isTenantWide(req.auth!) ? null : { sql: 't.created_by = ?', params: [req.auth!.id] }),
  createSchema: letterSchema, updateSchema: letterSchema.partial(),
  toRow: async (input, req, isCreate) => {
    const { student_id, ...b } = input as Record<string, unknown> & { student_id?: string };
    if (isCreate) {
      const tenant = await queryOne(`SELECT name FROM \`${T('tenants')}\` WHERE id = ?`, [req.auth!.tenantId]);
      const vars: Record<string, string> = { school: String(tenant?.name ?? ''), academic_year: String((await queryOne(`SELECT name FROM \`${T('academic_years')}\` WHERE tenant_id = ? AND is_active = 1`, [req.auth!.tenantId]))?.name ?? ''), date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) };
      if (student_id) { const st = await queryOne(`SELECT u.full_name, sp.nis, sp.nisn, c.name AS class_name FROM \`${T('users')}\` u LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = u.id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = u.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 WHERE u.id = ? AND u.tenant_id = ?`, [student_id, req.auth!.tenantId]); if (st) Object.assign(vars, { student_name: String(st.full_name), nis: String(st.nis ?? ''), nisn: String(st.nisn ?? ''), class: String(st.class_name ?? ''), recipient: String(st.full_name) }); }
      const rendered = await renderTemplate(req.auth!.tenantId, (b.template_id as string) ?? null, vars);
      return { ...b, number: b.number || rendered.number || `${Date.now()}`, body: b.body || rendered.body, recipient: b.recipient || vars.recipient || null, created_by: req.auth!.id };
    }
    return b;
  },
}));
r.post('/letters/:id/sign', requirePermission('letter:sign'), wrap(async (req, res) => {
  const l = await mustGet('official_letters', req.params.id, req.auth!.tenantId);
  await execute(`UPDATE \`${T('official_letters')}\` SET status = 'SIGNED', signed_by = ? WHERE id = ?`, [req.auth!.id, l.id]);
  if (l.created_by) await notify({ tenantId: req.auth!.tenantId, userIds: [String(l.created_by)], type: 'LETTER', title: `Surat ${l.number} ditandatangani`, link: '/admin/surat' });
  await audit(req, 'letter.sign', 'official_letters', String(l.id));
  ok(res, { signed: true });
}));
r.get('/letters/:id/pdf', requirePermission('letter:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const l = await mustGet('official_letters', req.params.id, u.tenantId);
  if (!isTenantWide(u) && l.created_by !== u.id) throw forbidden();
  const t = await queryOne(`SELECT t.name, t.address, t.phone, t.email, t.principal_name, sg.full_name AS signer FROM \`${T('tenants')}\` t LEFT JOIN \`${T('users')}\` sg ON sg.id = ? WHERE t.id = ?`, [l.signed_by ?? '', u.tenantId]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="surat-${String(l.number).replace(/[^a-z0-9]/gi, '_')}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(14).text(String(t?.name ?? ''), { align: 'center' }).font('Helvetica').fontSize(9).text(`${t?.address ?? ''}${t?.phone ? ` · Telp. ${t.phone}` : ''}${t?.email ? ` · ${t.email}` : ''}`, { align: 'center' });
  doc.moveDown(0.4).moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).lineWidth(2).stroke().lineWidth(1);
  doc.moveDown(1).fontSize(10).text(`Nomor: ${l.number}`).text(`Perihal: ${l.subject}`);
  if (l.recipient) doc.moveDown(0.6).text(`Kepada Yth.\n${l.recipient}`);
  doc.moveDown(1).fontSize(11).text(String(l.body ?? ''), { align: 'justify', lineGap: 3 });
  doc.moveDown(2);
  const x = doc.page.width - 260;
  doc.fontSize(10).text(`${new Date(l.letter_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, x, doc.y, { width: 200, align: 'center' }).text('Kepala Sekolah', x, doc.y, { width: 200, align: 'center' });
  doc.moveDown(4).font('Helvetica-Bold').text(String(t?.signer ?? t?.principal_name ?? '(__________________)'), x, doc.y, { width: 200, align: 'center', underline: true });
  if (l.status !== 'SIGNED') doc.fontSize(40).fillColor('#ef4444').opacity(0.12).text('BELUM DITANDATANGANI', 80, 400, { rotate: -20 } as never).opacity(1).fillColor('#000');
  doc.end();
}));

/** Student-facing composite for guardians/students: discipline + achievements of one student. */
r.get('/student/:studentId/summary', requirePermission('discipline:read', 'achievement:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const sid = req.params.studentId === 'me' ? u.id : req.params.studentId;
  await assertStudentAccess(u, sid);
  const discipline = await query(`SELECT d.*, dr.name AS rule_name, dr.kind FROM \`${T('discipline_records')}\` d LEFT JOIN \`${T('discipline_rules')}\` dr ON dr.id = d.rule_id WHERE d.student_id = ? ORDER BY d.incident_date DESC LIMIT 100`, [sid]);
  const achievements = await query(`SELECT * FROM \`${T('achievements')}\` WHERE student_id = ? ORDER BY achieved_at DESC`, [sid]);
  const points = discipline.reduce((a, d) => a + (d.kind === 'PENGHARGAAN' ? 0 : Number(d.points)), 0);
  ok(res, { points, discipline, achievements: achievements.map((a) => ({ ...a, certificate_url: fileUrl(a.certificate_file_id) })) });
}));

export default r;
export const _k = [notFound, childrenOf];
