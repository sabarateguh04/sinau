import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit, notify } from '../../core/services';
import { newId } from '../../core/ids';
import { insertRow, updateRow } from '../../core/crud';
import { assertClass, assertStudentAccess, isTenantWide } from '../../core/scope';
import { hasRole } from '../../core/auth';
import { recapClassSubject, scaleFor, predicateOf } from '../lms/grades';

const r = Router();

// ---------- Settings ----------
r.get('/settings', requirePermission('rapor:read'), wrap(async (req, res) => {
  const s = await queryOne(`SELECT * FROM \`${T('report_card_settings')}\` WHERE tenant_id = ? AND academic_year_id IS NULL`, [req.auth!.tenantId]);
  ok(res, s ? { ...s, predicate_scale: parse(s.predicate_scale), template: parse(s.template) } : { kkm: 75, predicate_scale: await scaleFor(req.auth!.tenantId), signature_principal: null, signature_city: null });
}));
r.put('/settings', requirePermission('rapor:write'), validate(z.object({ kkm: z.number().min(0).max(100).optional(), predicate_scale: z.array(z.object({ min: z.number(), predicate: z.string().max(2), description: z.string().max(100) })).optional(), signature_principal: z.string().max(150).nullable().optional(), signature_city: z.string().max(100).nullable().optional() })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const existing = await queryOne(`SELECT id FROM \`${T('report_card_settings')}\` WHERE tenant_id = ? AND academic_year_id IS NULL`, [tid]);
  const row = { ...req.body, predicate_scale: req.body.predicate_scale ? JSON.stringify(req.body.predicate_scale) : undefined };
  if (existing) await updateRow('report_card_settings', String(existing.id), row); else await insertRow('report_card_settings', { id: newId(), tenant_id: tid, academic_year_id: null, ...row });
  if (req.body.predicate_scale) await execute(`UPDATE \`${T('tenant_settings')}\` SET grade_scale = ? WHERE tenant_id = ?`, [JSON.stringify(req.body.predicate_scale), tid]);
  ok(res, { saved: true });
}));
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

// ---------- Generate ----------
r.post('/generate', requirePermission('rapor:write'), validate(z.object({ class_id: z.string(), semester: z.number().int().min(1).max(2) })), wrap(async (req, res) => {
  const u = req.auth!;
  const cls = await assertClass(u, req.body.class_id, { manage: true });
  const year = await queryOne(`SELECT * FROM \`${T('academic_years')}\` WHERE id = ?`, [cls.academic_year_id]);
  if (!year) throw badRequest('Tahun ajaran tidak ditemukan');
  const semester = req.body.semester;
  const [from, to] = semesterRange(year, semester);
  const css = await query(`SELECT cs.id, cs.subject_id, s.name, s.category FROM \`${T('class_subjects')}\` cs JOIN \`${T('subjects')}\` s ON s.id = cs.subject_id WHERE cs.class_id = ? AND (cs.semester = 0 OR cs.semester = ?) ORDER BY s.category, s.name`, [cls.id, semester]);
  const recaps = new Map<string, Awaited<ReturnType<typeof recapClassSubject>>>();
  for (const cs of css) recaps.set(String(cs.id), await recapClassSubject(u.tenantId, String(cs.id)));
  const students = await query(`SELECT student_id FROM \`${T('class_students')}\` WHERE class_id = ? AND status = 'AKTIF'`, [cls.id]);
  const scale = await scaleFor(u.tenantId);
  let n = 0;
  await withTransaction(async (conn) => {
    for (const st of students) {
      const sid = String(st.student_id);
      const existing = await queryOne(`SELECT id, status FROM \`${T('report_cards')}\` WHERE academic_year_id = ? AND semester = ? AND student_id = ?`, [year.id, semester, sid], conn);
      if (existing && existing.status === 'APPROVED') continue;
      const att = await queryOne(`SELECT SUM(status='S') AS S, SUM(status='I') AS I, SUM(status='A') AS A FROM \`${T('attendance_daily')}\` WHERE student_id = ? AND date BETWEEN ? AND ?`, [sid, from, to], conn);
      const ekskul = await query(`SELECT e.name, m.score, m.note FROM \`${T('extracurricular_members')}\` m JOIN \`${T('extracurriculars')}\` e ON e.id = m.extracurricular_id WHERE m.student_id = ? AND m.status = 'AKTIF'`, [sid], conn);
      const ach = await query(`SELECT title, level, rank_label FROM \`${T('achievements')}\` WHERE student_id = ? AND achieved_at BETWEEN ? AND ?`, [sid, from, to], conn);
      const subjectRows: { subject_id: string; name: string; category: string; score: number; predicate: string; description: string; components: unknown }[] = [];
      for (const cs of css) {
        const rc = recaps.get(String(cs.id))!;
        const me = rc.students.find((x) => x.student_id === sid);
        const score = me?.final_score ?? 0;
        const pred = predicateOf(score, scale);
        subjectRows.push({ subject_id: String(cs.subject_id), name: String(cs.name), category: String(cs.category), score, predicate: pred.predicate, description: `${pred.description} dalam ${cs.name}`, components: me?.components ?? {} });
      }
      const valid = subjectRows.filter((s) => s.score > 0);
      const avg = valid.length ? Math.round((valid.reduce((a, s) => a + s.score, 0) / valid.length) * 100) / 100 : null;
      const cardId = existing ? String(existing.id) : newId();
      if (existing) await updateRow('report_cards', cardId, { attendance_sick: Number(att?.S ?? 0), attendance_permit: Number(att?.I ?? 0), attendance_absent: Number(att?.A ?? 0), extracurricular: ekskul, achievements: ach, average: avg, generated_at: new Date() }, conn);
      else await insertRow('report_cards', { id: cardId, tenant_id: u.tenantId, academic_year_id: year.id, semester, class_id: cls.id, student_id: sid, status: 'DRAFT', attendance_sick: Number(att?.S ?? 0), attendance_permit: Number(att?.I ?? 0), attendance_absent: Number(att?.A ?? 0), extracurricular: ekskul, achievements: ach, average: avg, generated_at: new Date() }, conn);
      await execute(`DELETE FROM \`${T('report_card_subjects')}\` WHERE report_card_id = ?`, [cardId], conn);
      let order = 0;
      for (const s of subjectRows) await insertRow('report_card_subjects', { id: newId(), report_card_id: cardId, subject_id: s.subject_id, subject_name: s.name, category: s.category, final_score: s.score, predicate: s.predicate, description: s.description, components: s.components, order_no: order++ }, conn);
      n++;
    }
    // Rank within class
    const cards = await query(`SELECT id, average FROM \`${T('report_cards')}\` WHERE class_id = ? AND academic_year_id = ? AND semester = ? ORDER BY average DESC`, [cls.id, year.id, semester], conn);
    let rank = 0;
    for (const c of cards) { rank++; await execute(`UPDATE \`${T('report_cards')}\` SET rank_in_class = ? WHERE id = ?`, [c.average === null ? null : rank, c.id], conn); }
  });
  await audit(req, 'rapor.generate', 'report_cards', String(cls.id), undefined, { semester, count: n });
  ok(res, { generated: n });
}));
function semesterRange(year: Record<string, unknown>, semester: number): [string, string] {
  const start = year.start_date ? new Date(year.start_date as string) : new Date(`${String(year.name).slice(0, 4)}-07-01`);
  const end = year.end_date ? new Date(year.end_date as string) : new Date(`${String(year.name).slice(5, 9)}-06-30`);
  const mid = new Date(start.getFullYear(), 11, 31);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return semester === 1 ? [f(start), f(mid)] : [f(new Date(start.getFullYear() + 1, 0, 1)), f(end)];
}

// ---------- Lists & detail ----------
const CARD_SELECT = `rc.*, st.full_name, sp.nis, sp.nisn, c.name AS class_name, ay.name AS academic_year, h.full_name AS homeroom_name, ap.full_name AS approved_by_name`;
const CARD_FROM = `FROM \`${T('report_cards')}\` rc JOIN \`${T('users')}\` st ON st.id = rc.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id JOIN \`${T('classes')}\` c ON c.id = rc.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = rc.academic_year_id LEFT JOIN \`${T('users')}\` h ON h.id = c.homeroom_teacher_id LEFT JOIN \`${T('users')}\` ap ON ap.id = rc.approved_by`;

r.get('/class/:classId', requirePermission('rapor:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const cls = await assertClass(u, req.params.classId);
  const semester = Number(req.query.semester) || 1;
  const rows = await query(`SELECT ${CARD_SELECT} ${CARD_FROM} WHERE rc.class_id = ? AND rc.semester = ? ORDER BY st.full_name`, [cls.id, semester]);
  ok(res, { class: cls, semester, cards: rows.map(present) });
}));
r.get('/student/:studentId', requirePermission('rapor:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const sid = req.params.studentId === 'me' ? u.id : req.params.studentId;
  await assertStudentAccess(u, sid);
  const rows = await query(`SELECT ${CARD_SELECT} ${CARD_FROM} WHERE rc.student_id = ? AND rc.tenant_id = ? ORDER BY ay.name DESC, rc.semester DESC`, [sid, u.tenantId]);
  ok(res, rows.filter((x) => x.status === 'APPROVED' || isTenantWide(u) || hasRole(u, 'GURU')).map(present));
}));
r.get('/pending', requirePermission('rapor:approve'), wrap(async (req, res) => {
  ok(res, await query(`SELECT c.id AS class_id, c.name AS class_name, rc.semester, ay.name AS academic_year, COUNT(*) AS count, h.full_name AS homeroom_name FROM \`${T('report_cards')}\` rc JOIN \`${T('classes')}\` c ON c.id = rc.class_id JOIN \`${T('academic_years')}\` ay ON ay.id = rc.academic_year_id LEFT JOIN \`${T('users')}\` h ON h.id = c.homeroom_teacher_id WHERE rc.tenant_id = ? AND rc.status = 'SUBMITTED' GROUP BY c.id, c.name, rc.semester, ay.name, h.full_name`, [req.auth!.tenantId]));
}));
async function loadCard(id: string, tenantId: string): Promise<Record<string, any>> {
  const card = await queryOne(`SELECT ${CARD_SELECT} ${CARD_FROM} WHERE rc.id = ? AND rc.tenant_id = ?`, [id, tenantId]);
  if (!card) throw notFound();
  const subjects = await query(`SELECT * FROM \`${T('report_card_subjects')}\` WHERE report_card_id = ? ORDER BY order_no`, [id]);
  const p5 = await query(`SELECT * FROM \`${T('report_card_p5')}\` WHERE report_card_id = ?`, [id]);
  return { ...present(card), subjects: subjects.map((s) => ({ ...s, components: parse(s.components) })), p5: p5.map((x) => ({ ...x, dimensions: parse(x.dimensions) })) };
}
const present = (row: Record<string, unknown>): Record<string, any> => ({ ...row, extracurricular: parse(row.extracurricular), achievements: parse(row.achievements) });

r.get('/:id', requirePermission('rapor:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const card = await loadCard(req.params.id, u.tenantId);
  await assertStudentAccess(u, String(card.student_id));
  if (card.status !== 'APPROVED' && hasRole(u, 'SISWA', 'WALI_MURID') && !isTenantWide(u)) throw forbidden('Rapor belum disahkan');
  ok(res, card);
}));
r.put('/:id', requirePermission('rapor:write'), validate(z.object({ homeroom_note: z.string().max(4000).nullable().optional(), promoted: z.boolean().nullable().optional(), subjects: z.array(z.object({ id: z.string(), description: z.string().max(500).nullable().optional(), final_score: z.number().min(0).max(100).optional() })).optional(), p5: z.array(z.object({ project_title: z.string().min(1).max(200), theme: z.string().max(150).nullable().optional(), dimensions: z.array(z.object({ name: z.string(), level: z.string(), note: z.string().nullable().optional() })).optional(), note: z.string().max(2000).nullable().optional() })).optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const card = await loadCard(req.params.id, u.tenantId);
  await assertClass(u, String(card.class_id), { manage: true });
  if (card.status === 'APPROVED') throw badRequest('Rapor sudah disahkan');
  await withTransaction(async (conn) => {
    const { subjects, p5, ...rest } = req.body;
    await updateRow('report_cards', String(card.id), rest, conn, u.tenantId);
    for (const s of subjects ?? []) { const scale = await scaleFor(u.tenantId); const patch: Record<string, unknown> = { description: s.description }; if (s.final_score !== undefined) { patch.final_score = s.final_score; patch.predicate = predicateOf(s.final_score, scale).predicate; } await updateRow('report_card_subjects', s.id, patch, conn); }
    if (p5) { await execute(`DELETE FROM \`${T('report_card_p5')}\` WHERE report_card_id = ?`, [card.id], conn); for (const x of p5) await insertRow('report_card_p5', { id: newId(), report_card_id: card.id, project_title: x.project_title, theme: x.theme ?? null, dimensions: x.dimensions ?? [], note: x.note ?? null }, conn); }
  });
  await audit(req, 'rapor.update', 'report_cards', String(card.id));
  ok(res, await loadCard(String(card.id), u.tenantId));
}));
r.post('/class/:classId/submit', requirePermission('rapor:write'), validate(z.object({ semester: z.number().int().min(1).max(2) })), wrap(async (req, res) => {
  const u = req.auth!;
  const cls = await assertClass(u, req.params.classId, { manage: true });
  const r2 = await execute(`UPDATE \`${T('report_cards')}\` SET status = 'SUBMITTED' WHERE class_id = ? AND semester = ? AND status = 'DRAFT'`, [cls.id, req.body.semester]);
  const kepsek = (await query(`SELECT user_id FROM \`${T('user_roles')}\` WHERE tenant_id = ? AND role = 'KEPSEK'`, [u.tenantId])).map((x) => String(x.user_id));
  await notify({ tenantId: u.tenantId, userIds: kepsek, type: 'RAPOR', title: `Rapor ${cls.name} semester ${req.body.semester} menunggu pengesahan`, link: '/kepsek/rapor' });
  await audit(req, 'rapor.submit', 'classes', String(cls.id), undefined, { semester: req.body.semester, count: r2.affectedRows });
  ok(res, { submitted: r2.affectedRows });
}));
r.post('/class/:classId/approve', requirePermission('rapor:approve'), validate(z.object({ semester: z.number().int().min(1).max(2), approve: z.boolean() })), wrap(async (req, res) => {
  const u = req.auth!;
  const cls = await assertClass(u, req.params.classId);
  const status = req.body.approve ? 'APPROVED' : 'DRAFT';
  const r2 = await execute(`UPDATE \`${T('report_cards')}\` SET status = ?, approved_by = ?, approved_at = ? WHERE class_id = ? AND semester = ? AND status = 'SUBMITTED'`, [status, req.body.approve ? u.id : null, req.body.approve ? new Date() : null, cls.id, req.body.semester]);
  if (req.body.approve) {
    const sids = (await query(`SELECT student_id FROM \`${T('report_cards')}\` WHERE class_id = ? AND semester = ?`, [cls.id, req.body.semester])).map((x) => String(x.student_id));
    const guardians = sids.length ? (await query(`SELECT guardian_user_id FROM \`${T('guardian_students')}\` WHERE student_id IN (${sids.map(() => '?').join(',')})`, sids)).map((x) => String(x.guardian_user_id)) : [];
    await notify({ tenantId: u.tenantId, userIds: [...sids, ...guardians], type: 'RAPOR', title: `Rapor semester ${req.body.semester} sudah terbit`, link: '/siswa/rapor' });
  } else if (cls.homeroom_teacher_id) await notify({ tenantId: u.tenantId, userIds: [String(cls.homeroom_teacher_id)], type: 'RAPOR', title: `Rapor ${cls.name} dikembalikan untuk revisi`, link: '/guru/rapor' });
  await audit(req, req.body.approve ? 'rapor.approve' : 'rapor.reject', 'classes', String(cls.id), undefined, { semester: req.body.semester, count: r2.affectedRows });
  ok(res, { updated: r2.affectedRows });
}));

// ---------- PDF ----------
r.get('/:id/pdf', requirePermission('rapor:read', 'rapor:export'), wrap(async (req, res) => {
  const u = req.auth!;
  const card = await loadCard(req.params.id, u.tenantId);
  await assertStudentAccess(u, String(card.student_id));
  if (card.status !== 'APPROVED' && hasRole(u, 'SISWA', 'WALI_MURID') && !isTenantWide(u)) throw forbidden('Rapor belum disahkan');
  const tenant = await queryOne(`SELECT t.name, t.address, t.npsn, t.principal_name, b.display_name, s.signature_principal, s.signature_city, s.kkm FROM \`${T('tenants')}\` t LEFT JOIN \`${T('tenant_branding')}\` b ON b.tenant_id = t.id LEFT JOIN \`${T('report_card_settings')}\` s ON s.tenant_id = t.id AND s.academic_year_id IS NULL WHERE t.id = ?`, [u.tenantId]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="rapor-${String(card.full_name).replace(/\s+/g, '_')}-S${card.semester}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Rapor ${card.full_name}` } });
  doc.pipe(res);
  const W = doc.page.width - 96;
  doc.font('Helvetica-Bold').fontSize(14).text(String(tenant?.name ?? ''), { align: 'center' });
  doc.font('Helvetica').fontSize(9).text(`${tenant?.address ?? ''}${tenant?.npsn ? ` · NPSN ${tenant.npsn}` : ''}`, { align: 'center' });
  doc.moveDown(0.5).moveTo(48, doc.y).lineTo(48 + W, doc.y).stroke();
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(13).text('LAPORAN HASIL BELAJAR', { align: 'center' });
  doc.font('Helvetica').fontSize(10).text(`Tahun Ajaran ${card.academic_year} · Semester ${card.semester === 1 ? 'Ganjil' : 'Genap'}`, { align: 'center' });
  doc.moveDown(1);
  const info: [string, string][] = [['Nama', String(card.full_name)], ['NIS / NISN', `${card.nis ?? '-'} / ${card.nisn ?? '-'}`], ['Kelas', String(card.class_name)], ['Wali kelas', String(card.homeroom_name ?? '-')]];
  for (const [k, v] of info) { doc.font('Helvetica').fontSize(10).text(`${k}`, 48, doc.y, { continued: true, width: 110 }).text(`: ${v}`); }
  doc.moveDown(0.8);
  // Subject table
  const cols = [28, 210, 60, 60, W - 358];
  const th = (y: number) => { let x = 48; doc.rect(48, y, W, 18).fill('#e2e8f0').fillColor('#000'); doc.font('Helvetica-Bold').fontSize(9); ['No', 'Mata Pelajaran', 'Nilai', 'Predikat', 'Deskripsi'].forEach((h, i) => { doc.text(h, x + 4, y + 5, { width: cols[i] - 8 }); x += cols[i]; }); return y + 18; };
  let y = th(doc.y);
  let i = 0; let lastCat = '';
  for (const s of card.subjects as Record<string, unknown>[]) {
    if (s.category !== lastCat) { lastCat = String(s.category); doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text(String(lastCat), 52, y + 4); y += 14; doc.fillColor('#000'); }
    i++;
    const descH = doc.font('Helvetica').fontSize(8).heightOfString(String(s.description ?? ''), { width: cols[4] - 8 });
    const rowH = Math.max(16, descH + 6);
    if (y + rowH > doc.page.height - 120) { doc.addPage(); y = th(48); }
    let x = 48;
    const cells = [String(i), String(s.subject_name), Number(s.final_score).toFixed(0), String(s.predicate ?? ''), String(s.description ?? '')];
    cells.forEach((c, ci) => { doc.font(ci === 1 ? 'Helvetica' : 'Helvetica').fontSize(ci === 4 ? 8 : 9).text(c, x + 4, y + 4, { width: cols[ci] - 8, align: ci === 2 || ci === 3 ? 'center' : 'left' }); x += cols[ci]; });
    doc.moveTo(48, y + rowH).lineTo(48 + W, y + rowH).strokeColor('#e2e8f0').stroke().strokeColor('#000');
    y += rowH;
  }
  doc.y = y + 6;
  doc.font('Helvetica-Bold').fontSize(10).text(`Rata-rata: ${card.average ?? '-'}    Peringkat: ${card.rank_in_class ?? '-'}    KKM: ${tenant?.kkm ?? 75}`, 48);
  doc.moveDown(0.8);
  if ((card.p5 as unknown[]).length) {
    doc.font('Helvetica-Bold').fontSize(10).text('Projek Penguatan Profil Pelajar Pancasila (P5)');
    for (const p of card.p5 as Record<string, unknown>[]) { doc.font('Helvetica-Bold').fontSize(9).text(`• ${p.project_title}${p.theme ? ` (${p.theme})` : ''}`); for (const d of (p.dimensions as { name: string; level: string; note?: string }[]) ?? []) doc.font('Helvetica').fontSize(8).text(`   ${d.name}: ${d.level}${d.note ? ` — ${d.note}` : ''}`); if (p.note) doc.font('Helvetica-Oblique').fontSize(8).text(`   ${p.note}`); }
    doc.moveDown(0.6);
  }
  doc.font('Helvetica-Bold').fontSize(10).text('Ekstrakurikuler');
  const ek = (card.extracurricular as { name: string; score?: string; note?: string }[]) ?? [];
  doc.font('Helvetica').fontSize(9).text(ek.length ? ek.map((e) => `${e.name}${e.score ? ` (${e.score})` : ''}${e.note ? ` — ${e.note}` : ''}`).join('; ') : '-');
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Ketidakhadiran');
  doc.font('Helvetica').fontSize(9).text(`Sakit: ${card.attendance_sick} hari · Izin: ${card.attendance_permit} hari · Tanpa keterangan: ${card.attendance_absent} hari`);
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Catatan Wali Kelas');
  doc.font('Helvetica').fontSize(9).text(String(card.homeroom_note ?? '-'), { width: W });
  if (card.promoted !== null && card.promoted !== undefined && card.semester === 2) doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text(card.promoted ? 'Keputusan: NAIK KELAS' : 'Keputusan: TIDAK NAIK KELAS');
  doc.moveDown(1.5);
  const sy = doc.y;
  doc.font('Helvetica').fontSize(9).text('Orang Tua/Wali', 48, sy, { width: 150, align: 'center' }).text('Wali Kelas', 48 + W / 2 - 75, sy, { width: 150, align: 'center' }).text(`${tenant?.signature_city ? tenant.signature_city + ', ' : ''}${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}\nKepala Sekolah`, 48 + W - 150, sy, { width: 150, align: 'center' });
  doc.text('\n\n\n(______________)', 48, sy + 12, { width: 150, align: 'center' }).text(`\n\n\n${card.homeroom_name ?? '(______________)'}`, 48 + W / 2 - 75, sy + 12, { width: 150, align: 'center' }).text(`\n\n\n${tenant?.signature_principal ?? tenant?.principal_name ?? '(______________)'}`, 48 + W - 150, sy + 12, { width: 150, align: 'center' });
  if (card.status !== 'APPROVED') { doc.fontSize(40).fillColor('#ef4444').opacity(0.15).rotate(-30, { origin: [300, 400] }).text('DRAFT', 150, 380).rotate(30, { origin: [300, 400] }).opacity(1).fillColor('#000'); }
  doc.end();
}));

export default r;
