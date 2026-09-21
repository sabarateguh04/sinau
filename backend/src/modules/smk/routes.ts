import { Router, Request } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter, insertRow, mustGet } from '../../core/crud';
import { audit, notify, fileUrl } from '../../core/services';
import { newId, randomPassword, slugify } from '../../core/ids';
import { hashPassword, hasRole } from '../../core/auth';
import { isTenantWide, classScope } from '../../core/scope';
import { upsertGrade } from '../lms/grades';

const r = Router();
const P = { read: ['internship:read'], write: ['internship:write'] };

// ---------- Mitra industri & pembimbing ----------
const partnerSchema = z.object({ name: z.string().min(2).max(200), sector: z.string().max(100).nullable().optional(), address: z.string().max(2000).nullable().optional(), city: z.string().max(100).nullable().optional(), contact_name: z.string().max(150).nullable().optional(), contact_phone: z.string().max(30).nullable().optional(), contact_email: z.string().max(190).nullable().optional(), mou_number: z.string().max(80).nullable().optional(), mou_until: z.string().max(10).nullable().optional(), quota: z.number().int().min(0).optional(), is_active: z.boolean().optional() });
r.use('/partners', crudRouter({ table: 'industry_partners', searchable: ['t.name', 't.sector', 't.city'], sortable: ['name'], defaultSort: 'name', defaultOrder: 'ASC', perms: P, select: `(SELECT COUNT(*) FROM \`${T('internships')}\` i WHERE i.partner_id = t.id AND i.status IN ('PLANNED','ONGOING')) AS active_interns, (SELECT COUNT(*) FROM \`${T('industry_mentors')}\` m WHERE m.partner_id = t.id) AS mentor_count`, createSchema: partnerSchema, updateSchema: partnerSchema.partial() }));
const mentorSchema = z.object({ partner_id: z.string(), name: z.string().min(2).max(150), position: z.string().max(100).nullable().optional(), phone: z.string().max(30).nullable().optional(), email: z.string().email().nullable().optional(), create_account: z.boolean().optional() });
r.use('/mentors', crudRouter({ table: 'industry_mentors', searchable: ['t.name', 'p.name'], sortable: ['name'], defaultSort: 'name', defaultOrder: 'ASC', perms: P, select: 'p.name AS partner_name, u.username', joins: `JOIN \`${T('industry_partners')}\` p ON p.id = t.partner_id LEFT JOIN \`${T('users')}\` u ON u.id = t.user_id`, filters: [{ param: 'partner_id', column: 't.partner_id' }], createSchema: mentorSchema, updateSchema: mentorSchema.partial(),
  toRow: (i) => { const { create_account, ...b } = i as Record<string, unknown>; void create_account; return b; },
  afterCreate: async (row, req, exec) => {
    if (!(req.body as { create_account?: boolean }).create_account) return;
    const base = slugify(String(row.name)).replace(/-/g, '.').slice(0, 20) || 'mentor';
    let username = `mentor.${base}`; let n = 1;
    while (await queryOne(`SELECT id FROM \`${T('users')}\` WHERE username = ?`, [username], exec)) username = `mentor.${base}${++n}`;
    const pwd = randomPassword(); const uid = newId();
    await insertRow('users', { id: uid, tenant_id: req.auth!.tenantId, username, email: row.email ?? null, phone: row.phone ?? null, password_hash: await hashPassword(pwd), full_name: row.name, must_change_password: 1 }, exec);
    await insertRow('user_roles', { id: newId(), tenant_id: req.auth!.tenantId, user_id: uid, role: 'PEMBIMBING_INDUSTRI' }, exec);
    await execute(`UPDATE \`${T('industry_mentors')}\` SET user_id = ? WHERE id = ?`, [uid, row.id], exec);
    (row as Record<string, unknown>).account = { username, temporary_password: pwd };
  },
  present: (row) => row }));

// ---------- Prakerin ----------
const INT_SELECT = `t.*, st.full_name AS student_name, sp.nis, c.name AS class_name, p.name AS partner_name, p.city, m.name AS mentor_name, sv.full_name AS supervisor_name, (SELECT COUNT(*) FROM \`${T('internship_journals')}\` j WHERE j.internship_id = t.id) AS journal_count, (SELECT COUNT(*) FROM \`${T('internship_journals')}\` j2 WHERE j2.internship_id = t.id AND j2.status = 'SUBMITTED') AS pending_journals`;
const INT_JOIN = `JOIN \`${T('users')}\` st ON st.id = t.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = st.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 JOIN \`${T('industry_partners')}\` p ON p.id = t.partner_id LEFT JOIN \`${T('industry_mentors')}\` m ON m.id = t.mentor_id LEFT JOIN \`${T('users')}\` sv ON sv.id = t.school_supervisor_id`;
function internScope(req: Request) {
  const u = req.auth!;
  if (isTenantWide(u)) return null;
  if (hasRole(u, 'SISWA')) return { sql: 't.student_id = ?', params: [u.id] };
  if (hasRole(u, 'PEMBIMBING_INDUSTRI')) return { sql: `t.mentor_id IN (SELECT id FROM \`${T('industry_mentors')}\` WHERE user_id = ?)`, params: [u.id] };
  if (hasRole(u, 'WALI_MURID')) return { sql: `t.student_id IN (SELECT student_id FROM \`${T('guardian_students')}\` WHERE guardian_user_id = ?)`, params: [u.id] };
  const sc = classScope(u);
  return { sql: `(t.school_supervisor_id = ? OR (c.id IS NOT NULL AND ${sc.sql}))`, params: [u.id, ...sc.params] };
}
const internSchema = z.object({ student_id: z.string(), partner_id: z.string(), mentor_id: z.string().nullable().optional(), school_supervisor_id: z.string().nullable().optional(), academic_year_id: z.string().nullable().optional(), start_date: z.string().max(10), end_date: z.string().max(10), status: z.enum(['PLANNED', 'ONGOING', 'DONE', 'CANCELLED']).optional(), final_score: z.number().min(0).max(100).nullable().optional(), mentor_feedback: z.string().max(4000).nullable().optional() });
r.use('/internships', crudRouter({ table: 'internships', searchable: ['st.full_name', 'p.name'], sortable: ['start_date', 'status'], defaultSort: 'start_date', perms: { read: ['internship:read'], write: ['internship:write'] }, select: INT_SELECT.replace('t.*, ', ''), joins: INT_JOIN, filters: [{ param: 'status', column: 't.status' }, { param: 'partner_id', column: 't.partner_id' }, { param: 'student_id', column: 't.student_id' }], scope: internScope, createSchema: internSchema, updateSchema: internSchema.partial(),
  afterCreate: async (row, req) => { await notify({ tenantId: req.auth!.tenantId, userIds: [String(row.student_id)], type: 'INTERNSHIP', title: 'Penempatan prakerin', body: `${row.start_date} s.d. ${row.end_date}`, link: '/siswa/prakerin' }); },
  afterUpdate: async (id, row, req) => { if (row.final_score !== undefined && row.final_score !== null) { const i = await queryOne(`SELECT student_id FROM \`${T('internships')}\` WHERE id = ?`, [id]); const cs = await queryOne(`SELECT cs.id FROM \`${T('class_subjects')}\` cs JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id JOIN \`${T('class_students')}\` e ON e.class_id = cs.class_id AND e.student_id = ? AND e.status = 'AKTIF' WHERE s.is_competency = 1 ORDER BY s.name LIMIT 1`, [i?.student_id]); if (cs && i) await upsertGrade({ tenantId: req.auth!.tenantId, classSubjectId: String(cs.id), studentId: String(i.student_id), component: 'PRAKTIK', sourceType: 'MANUAL', sourceId: `internship:${id}`, title: 'Nilai Prakerin', score: Number(row.final_score), maxScore: 100, gradedBy: req.auth!.id }); } },
  present: (row) => ({ ...row, certificate_url: fileUrl(row.certificate_file_id as string | null) }) }));

r.get('/internships/:id/journals', requirePermission('internship:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const it = await queryOne(`SELECT ${INT_SELECT} FROM \`${T('internships')}\` t ${INT_JOIN} WHERE t.id = ? AND t.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!it) throw notFound();
  const sc = internScope(req);
  if (sc) { const okRow = await queryOne(`SELECT 1 AS x FROM \`${T('internships')}\` t ${INT_JOIN} WHERE t.id = ? AND ${sc.sql}`, [it.id, ...sc.params]); if (!okRow) throw forbidden(); }
  const journals = await query(`SELECT j.*, vb.full_name AS verified_by_name FROM \`${T('internship_journals')}\` j LEFT JOIN \`${T('users')}\` vb ON vb.id = j.verified_by WHERE j.internship_id = ? ORDER BY j.journal_date DESC`, [it.id]);
  ok(res, { internship: it, journals: journals.map((j) => ({ ...j, photo_url: fileUrl(j.photo_file_id) })) });
}));
r.post('/internships/:id/journals', requirePermission('internship:journal_write'), validate(z.object({ journal_date: z.string().max(10), activity: z.string().min(5).max(4000), hours: z.number().min(0.5).max(24).optional(), photo_file_id: z.string().nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const it = await mustGet('internships', req.params.id, u.tenantId);
  if (it.student_id !== u.id && !isTenantWide(u)) throw forbidden('Bukan prakerin Anda');
  await execute(`INSERT INTO \`${T('internship_journals')}\` (id, tenant_id, internship_id, journal_date, activity, hours, photo_file_id, status) VALUES (?,?,?,?,?,?,?,'SUBMITTED') ON DUPLICATE KEY UPDATE activity = VALUES(activity), hours = VALUES(hours), photo_file_id = VALUES(photo_file_id), status = 'SUBMITTED'`, [newId(), u.tenantId, it.id, req.body.journal_date, req.body.activity, req.body.hours ?? 8, req.body.photo_file_id ?? null]);
  const mentor = it.mentor_id ? await queryOne(`SELECT user_id FROM \`${T('industry_mentors')}\` WHERE id = ?`, [it.mentor_id]) : null;
  const targets = [mentor?.user_id, it.school_supervisor_id].filter(Boolean).map(String);
  await notify({ tenantId: u.tenantId, userIds: targets, type: 'INTERNSHIP', title: `Jurnal prakerin ${u.name} (${req.body.journal_date})`, link: '/pembimbing/prakerin' });
  ok(res, { saved: true }, 201);
}));
r.post('/journals/:id/verify', requirePermission('internship:journal_verify'), validate(z.object({ status: z.enum(['VERIFIED', 'REJECTED']), note: z.string().max(255).nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const j = await queryOne(`SELECT j.*, i.mentor_id, i.school_supervisor_id, i.student_id FROM \`${T('internship_journals')}\` j JOIN \`${T('internships')}\` i ON i.id = j.internship_id WHERE j.id = ? AND j.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!j) throw notFound();
  if (!isTenantWide(u) && j.school_supervisor_id !== u.id) { const m = await queryOne(`SELECT id FROM \`${T('industry_mentors')}\` WHERE id = ? AND user_id = ?`, [j.mentor_id, u.id]); if (!m) throw forbidden(); }
  await execute(`UPDATE \`${T('internship_journals')}\` SET status = ?, verified_by = ?, verified_at = NOW(), mentor_note = ? WHERE id = ?`, [req.body.status, u.id, req.body.note ?? null, j.id]);
  await notify({ tenantId: u.tenantId, userIds: [String(j.student_id)], type: 'INTERNSHIP', title: `Jurnal ${String(j.journal_date).slice(0, 10)} ${req.body.status === 'VERIFIED' ? 'diverifikasi' : 'ditolak'}`, body: req.body.note ?? undefined, link: '/siswa/prakerin' });
  ok(res, { status: req.body.status });
}));

// ---------- Uji kompetensi ----------
const schemeSchema = z.object({ code: z.string().min(1).max(30), name: z.string().min(2).max(200), major_id: z.string().nullable().optional(), description: z.string().max(4000).nullable().optional(), units: z.array(z.string()).optional(), is_active: z.boolean().optional() });
r.use('/schemes', crudRouter({ table: 'competency_schemes', searchable: ['t.code', 't.name'], sortable: ['code'], defaultSort: 'code', defaultOrder: 'ASC', perms: { read: ['competency:read'], write: ['competency:write'] }, select: `m.name AS major_name, (SELECT COUNT(*) FROM \`${T('competency_rubrics')}\` r WHERE r.scheme_id = t.id) AS rubric_count`, joins: `LEFT JOIN \`${T('majors')}\` m ON m.id = t.major_id`, createSchema: schemeSchema, updateSchema: schemeSchema.partial(), present: (row) => ({ ...row, units: typeof row.units === 'string' ? JSON.parse(row.units) : row.units }) }));
const rubricSchema = z.object({ scheme_id: z.string(), code: z.string().min(1).max(30), criteria: z.string().min(2).max(255), max_score: z.number().min(1).max(100).optional(), weight: z.number().min(0).max(100).optional(), order_no: z.number().int().optional() });
r.use('/rubrics', crudRouter({ table: 'competency_rubrics', searchable: ['t.code', 't.criteria'], sortable: ['order_no'], defaultSort: 'order_no', defaultOrder: 'ASC', perms: { read: ['competency:read'], write: ['competency:write'] }, filters: [{ param: 'scheme_id', column: 't.scheme_id' }], createSchema: rubricSchema, updateSchema: rubricSchema.partial() }));
const testSchema = z.object({ scheme_id: z.string(), title: z.string().min(2).max(200), test_date: z.string().max(10), location: z.string().max(150).nullable().optional(), external_examiner_id: z.string().nullable().optional(), internal_examiner_id: z.string().nullable().optional(), status: z.enum(['SCHEDULED', 'ONGOING', 'DONE', 'CANCELLED']).optional(), note: z.string().max(255).nullable().optional(), student_ids: z.array(z.string()).optional() });
const TEST_SELECT = `sc.name AS scheme_name, sc.code AS scheme_code, ex.full_name AS external_examiner_name, ie.full_name AS internal_examiner_name, (SELECT COUNT(*) FROM \`${T('competency_results')}\` cr WHERE cr.test_id = t.id) AS participant_count, (SELECT COUNT(*) FROM \`${T('competency_results')}\` cr2 WHERE cr2.test_id = t.id AND cr2.verdict = 'COMPETENT') AS competent_count`;
const TEST_JOIN = `JOIN \`${T('competency_schemes')}\` sc ON sc.id = t.scheme_id LEFT JOIN \`${T('users')}\` ex ON ex.id = t.external_examiner_id LEFT JOIN \`${T('users')}\` ie ON ie.id = t.internal_examiner_id`;
r.use('/tests', crudRouter({ table: 'competency_tests', searchable: ['t.title', 'sc.name'], sortable: ['test_date'], defaultSort: 'test_date', perms: { read: ['competency:read'], write: ['competency:write'] }, select: TEST_SELECT, joins: TEST_JOIN, filters: [{ param: 'status', column: 't.status' }, { param: 'scheme_id', column: 't.scheme_id' }],
  scope: (req) => { const u = req.auth!; if (isTenantWide(u) || hasRole(u, 'GURU', 'KAPRODI', 'WAKEPSEK')) return null; if (hasRole(u, 'PENGUJI_EKSTERNAL')) return { sql: 't.external_examiner_id = ?', params: [u.id] }; if (hasRole(u, 'SISWA')) return { sql: `EXISTS (SELECT 1 FROM \`${T('competency_results')}\` cr WHERE cr.test_id = t.id AND cr.student_id = ?)`, params: [u.id] }; return { sql: '1=0', params: [] }; },
  createSchema: testSchema, updateSchema: testSchema.partial(), toRow: (i) => { const { student_ids, ...b } = i as Record<string, unknown>; void student_ids; return b; },
  afterCreate: async (row, req, exec) => { const ids = (req.body as { student_ids?: string[] }).student_ids ?? []; for (const sid of ids) await insertRow('competency_results', { id: newId(), tenant_id: req.auth!.tenantId, test_id: row.id, student_id: sid, verdict: 'PENDING' }, exec); if (ids.length) await notify({ tenantId: req.auth!.tenantId, userIds: ids, type: 'COMPETENCY', title: `Jadwal uji kompetensi: ${row.title}`, body: String(row.test_date), link: '/siswa/uji-kompetensi' }, exec); if (row.external_examiner_id) await notify({ tenantId: req.auth!.tenantId, userIds: [String(row.external_examiner_id)], type: 'COMPETENCY', title: `Anda dijadwalkan menguji: ${row.title}`, link: '/penguji/uji-kompetensi' }, exec); },
  afterUpdate: async (id, _row, req, exec) => { const ids = (req.body as { student_ids?: string[] }).student_ids; if (!ids) return; for (const sid of ids) await execute(`INSERT IGNORE INTO \`${T('competency_results')}\` (id, tenant_id, test_id, student_id, verdict) VALUES (?,?,?,?,'PENDING')`, [newId(), req.auth!.tenantId, id, sid], exec); } }));
r.get('/tests/:id/results', requirePermission('competency:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const t = await queryOne(`SELECT t.*, ${TEST_SELECT} FROM \`${T('competency_tests')}\` t ${TEST_JOIN} WHERE t.id = ? AND t.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!t) throw notFound();
  if (hasRole(u, 'PENGUJI_EKSTERNAL') && !isTenantWide(u) && t.external_examiner_id !== u.id) throw forbidden();
  const rubrics = await query(`SELECT * FROM \`${T('competency_rubrics')}\` WHERE scheme_id = ? ORDER BY order_no`, [t.scheme_id]);
  const results = await query(`SELECT cr.*, st.full_name, sp.nis, c.name AS class_name FROM \`${T('competency_results')}\` cr JOIN \`${T('users')}\` st ON st.id = cr.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = st.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 WHERE cr.test_id = ? ${hasRole(u, 'SISWA') && !isTenantWide(u) ? 'AND cr.student_id = ?' : ''} ORDER BY st.full_name`, hasRole(u, 'SISWA') && !isTenantWide(u) ? [t.id, u.id] : [t.id]);
  ok(res, { test: t, rubrics, results: results.map((x) => ({ ...x, scores: typeof x.scores === 'string' ? JSON.parse(x.scores) : x.scores, certificate_url: fileUrl(x.certificate_file_id) })) });
}));
r.post('/tests/:id/assess', requirePermission('competency:assess'), validate(z.object({ student_id: z.string(), scores: z.record(z.number().min(0)), note: z.string().max(2000).nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const t = await mustGet('competency_tests', req.params.id, u.tenantId);
  if (!isTenantWide(u) && t.external_examiner_id !== u.id && t.internal_examiner_id !== u.id && !hasRole(u, 'KAPRODI')) throw forbidden('Anda bukan penguji sesi ini');
  const rubrics = await query(`SELECT * FROM \`${T('competency_rubrics')}\` WHERE scheme_id = ?`, [t.scheme_id]);
  if (!rubrics.length) throw badRequest('Skema belum punya rubrik');
  const totalW = rubrics.reduce((a, r) => a + Number(r.weight), 0) || 1;
  let total = 0;
  for (const rb of rubrics) { const s = Math.min(Number(rb.max_score), Number(req.body.scores[String(rb.id)] ?? 0)); total += (s / Number(rb.max_score)) * 100 * (Number(rb.weight) / totalW); }
  total = Math.round(total * 100) / 100;
  const verdict = total >= 70 ? 'COMPETENT' : 'NOT_COMPETENT';
  await execute(`UPDATE \`${T('competency_results')}\` SET scores = ?, total_score = ?, verdict = ?, examiner_note = ?, assessed_by = ?, assessed_at = NOW() WHERE test_id = ? AND student_id = ?`, [JSON.stringify(req.body.scores), total, verdict, req.body.note ?? null, u.id, t.id, req.body.student_id]);
  await notify({ tenantId: u.tenantId, userIds: [req.body.student_id], type: 'COMPETENCY', title: `Hasil uji kompetensi: ${verdict === 'COMPETENT' ? 'KOMPETEN' : 'BELUM KOMPETEN'}`, body: `Skor ${total}`, link: '/siswa/uji-kompetensi' });
  await audit(req, 'competency.assess', 'competency_results', String(t.id), undefined, { student_id: req.body.student_id, total, verdict });
  ok(res, { total, verdict });
}));
r.get('/tests/:id/certificate/:studentId', requirePermission('competency:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const row = await queryOne(`SELECT cr.*, st.full_name, sp.nis, t.title, t.test_date, sc.name AS scheme_name, sc.code AS scheme_code, ten.name AS school, ten.principal_name, ex.full_name AS examiner FROM \`${T('competency_results')}\` cr JOIN \`${T('competency_tests')}\` t ON t.id = cr.test_id JOIN \`${T('competency_schemes')}\` sc ON sc.id = t.scheme_id JOIN \`${T('users')}\` st ON st.id = cr.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id JOIN \`${T('tenants')}\` ten ON ten.id = cr.tenant_id LEFT JOIN \`${T('users')}\` ex ON ex.id = t.external_examiner_id WHERE cr.test_id = ? AND cr.student_id = ? AND cr.tenant_id = ?`, [req.params.id, req.params.studentId, u.tenantId]);
  if (!row) throw notFound();
  if (hasRole(u, 'SISWA') && !isTenantWide(u) && row.student_id !== u.id) throw forbidden();
  if (row.verdict !== 'COMPETENT') throw badRequest('Sertifikat hanya untuk yang dinyatakan kompeten');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="sertifikat-${slugify(String(row.full_name))}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 60 });
  doc.pipe(res);
  doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).lineWidth(3).strokeColor('#0f766e').stroke();
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f766e').text(String(row.school).toUpperCase(), { align: 'center' });
  doc.moveDown(1.5).fontSize(30).fillColor('#000').text('SERTIFIKAT KOMPETENSI', { align: 'center' });
  doc.moveDown(0.5).font('Helvetica').fontSize(12).text('diberikan kepada', { align: 'center' });
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(26).text(String(row.full_name), { align: 'center' });
  doc.font('Helvetica').fontSize(11).text(`NIS ${row.nis ?? '-'}`, { align: 'center' });
  doc.moveDown(1).fontSize(12).text(`telah dinyatakan KOMPETEN pada skema`, { align: 'center' }).font('Helvetica-Bold').fontSize(16).text(`${row.scheme_code} — ${row.scheme_name}`, { align: 'center' });
  doc.moveDown(0.5).font('Helvetica').fontSize(11).text(`Uji kompetensi "${row.title}" · ${new Date(row.test_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · Skor ${row.total_score}`, { align: 'center' });
  doc.moveDown(3);
  const y = doc.y;
  doc.text('Penguji Eksternal', 120, y, { width: 200, align: 'center' }).text('Kepala Sekolah', doc.page.width - 320, y, { width: 200, align: 'center' });
  doc.moveDown(3).font('Helvetica-Bold').text(String(row.examiner ?? '(__________)'), 120, doc.y, { width: 200, align: 'center', underline: true }).text(String(row.principal_name ?? '(__________)'), doc.page.width - 320, doc.y - 14, { width: 200, align: 'center', underline: true });
  doc.end();
}));

export default r;
export const _k = withTransaction;
