import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction, Exec } from '../../database/db';
import { wrap, ok, paged, paging, str } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter, insertRow, mustGet, updateRow } from '../../core/crud';
import { audit, notify, upload, fileUrl } from '../../core/services';
import { newId } from '../../core/ids';
import { isTenantWide, childrenOf, assertStudentAccess } from '../../core/scope';
import { hasRole } from '../../core/auth';
import { readSheet } from '../users/routes';

const r = Router();
const P = { read: ['finance:read'], write: ['finance:write'] };

// ---------- Master ----------
const feeSchema = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(120), default_amount: z.number().min(0), period: z.enum(['BULANAN', 'SEMESTER', 'TAHUNAN', 'SEKALI']).optional(), is_active: z.boolean().optional() });
r.use('/fee-types', crudRouter({ table: 'fee_types', searchable: ['t.code', 't.name'], sortable: ['code', 'name'], defaultSort: 'code', defaultOrder: 'ASC', perms: P, createSchema: feeSchema, updateSchema: feeSchema.partial() }));
const lateSchema = z.object({ fee_type_id: z.string().nullable().optional(), grace_days: z.number().int().min(0).max(365).optional(), mode: z.enum(['FLAT', 'PERCENT', 'PER_DAY']).optional(), amount: z.number().min(0), max_amount: z.number().min(0).nullable().optional(), is_active: z.boolean().optional() });
r.use('/late-fee-rules', crudRouter({ table: 'late_fee_rules', sortable: ['created_at'], perms: P, select: 'ft.name AS fee_type_name', joins: `LEFT JOIN \`${T('fee_types')}\` ft ON ft.id = t.fee_type_id`, createSchema: lateSchema, updateSchema: lateSchema.partial() }));

// ---------- Invoices ----------
const INV_SELECT = `i.*, (i.amount + i.late_fee - i.discount - i.paid) AS remaining, st.full_name AS student_name, sp.nis, c.name AS class_name, ft.name AS fee_type_name`;
const INV_FROM = `FROM \`${T('invoices')}\` i JOIN \`${T('users')}\` st ON st.id = i.student_id LEFT JOIN \`${T('student_profiles')}\` sp ON sp.user_id = st.id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = st.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 LEFT JOIN \`${T('fee_types')}\` ft ON ft.id = i.fee_type_id`;
async function nextNumber(tenantId: string, prefix: string, exec: Exec) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const n = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T(prefix === 'INV' ? 'invoices' : 'payments')}\` WHERE tenant_id = ? AND number LIKE ?`, [tenantId, `${prefix}/${ym}/%`], exec))?.c ?? 0) + 1;
  return `${prefix}/${ym}/${String(n).padStart(4, '0')}`;
}
async function studentFilter(req: import('express').Request): Promise<{ sql: string; params: unknown[] } | null> {
  const u = req.auth!;
  if (isTenantWide(u)) return null;
  if (hasRole(u, 'SISWA')) return { sql: 'i.student_id = ?', params: [u.id] };
  if (hasRole(u, 'WALI_MURID')) { const kids = await childrenOf(u.id); return kids.length ? { sql: `i.student_id IN (${kids.map(() => '?').join(',')})`, params: kids } : { sql: '1=0', params: [] }; }
  return { sql: '1=0', params: [] };
}
r.get('/invoices', requirePermission('finance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [u.tenantId];
  let where = 'WHERE i.tenant_id = ?';
  const sf = await studentFilter(req); if (sf) { where += ` AND ${sf.sql}`; params.push(...sf.params); }
  const q = str(req.query.q); if (q) { where += ' AND (i.number LIKE ? OR st.full_name LIKE ? OR i.title LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  for (const [k, col] of [['status', 'i.status'], ['student_id', 'i.student_id'], ['period', 'i.period'], ['fee_type_id', 'i.fee_type_id'], ['class_id', 'c.id']] as const) if (str(req.query[k])) { where += ` AND ${col} = ?`; params.push(String(req.query[k])); }
  if (req.query.open === '1') where += " AND i.status IN ('UNPAID','PARTIAL','OVERDUE')";
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${INV_FROM} ${where}`, params))?.c ?? 0);
  const sum = await queryOne(`SELECT COALESCE(SUM(i.amount + i.late_fee - i.discount - i.paid),0) AS remaining ${INV_FROM} ${where} AND i.status IN ('UNPAID','PARTIAL','OVERDUE')`, params);
  const rows = await query(`SELECT ${INV_SELECT} ${INV_FROM} ${where} ORDER BY i.due_date DESC, i.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, meta: { page, limit, total, remaining: Number(sum?.remaining ?? 0) } });
}));
r.post('/invoices/generate', requirePermission('finance:write'), validate(z.object({ fee_type_id: z.string(), period: z.string().max(7).nullable().optional(), title: z.string().max(200).optional(), amount: z.number().min(0).optional(), due_date: z.string().max(10).nullable().optional(), class_ids: z.array(z.string()).optional(), student_ids: z.array(z.string()).optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const ft = await mustGet('fee_types', req.body.fee_type_id, u.tenantId);
  const year = await queryOne(`SELECT id FROM \`${T('academic_years')}\` WHERE tenant_id = ? AND is_active = 1`, [u.tenantId]);
  let students: string[] = req.body.student_ids ?? [];
  if (!students.length) {
    const params: unknown[] = [u.tenantId];
    let sql = `SELECT DISTINCT e.student_id FROM \`${T('class_students')}\` e JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 JOIN \`${T('academic_years')}\` ay ON ay.id = c.academic_year_id AND ay.is_active = 1 WHERE e.tenant_id = ? AND e.status = 'AKTIF'`;
    if (req.body.class_ids?.length) { sql += ` AND e.class_id IN (${req.body.class_ids.map(() => '?').join(',')})`; params.push(...req.body.class_ids); }
    students = (await query(sql, params)).map((x) => String(x.student_id));
  }
  const title = req.body.title ?? `${ft.name}${req.body.period ? ` ${req.body.period}` : ''}`;
  let created = 0;
  await withTransaction(async (conn) => {
    for (const sid of students) {
      if (req.body.period) { const dup = await queryOne(`SELECT id FROM \`${T('invoices')}\` WHERE tenant_id = ? AND student_id = ? AND fee_type_id = ? AND period = ?`, [u.tenantId, sid, ft.id, req.body.period], conn); if (dup) continue; }
      await insertRow('invoices', { id: newId(), tenant_id: u.tenantId, number: await nextNumber(u.tenantId, 'INV', conn), student_id: sid, academic_year_id: year?.id ?? null, fee_type_id: ft.id, title, period: req.body.period ?? null, amount: req.body.amount ?? Number(ft.default_amount), due_date: req.body.due_date ?? null, status: 'UNPAID', created_by: u.id }, conn);
      created++;
    }
  });
  const guardians = students.length ? (await query(`SELECT guardian_user_id FROM \`${T('guardian_students')}\` WHERE student_id IN (${students.map(() => '?').join(',')})`, students)).map((x) => String(x.guardian_user_id)) : [];
  await notify({ tenantId: u.tenantId, userIds: [...students, ...guardians], type: 'INVOICE', title: `Tagihan baru: ${title}`, body: req.body.due_date ? `Jatuh tempo ${req.body.due_date}` : undefined, link: '/siswa/tagihan' });
  await audit(req, 'finance.generate_invoices', 'invoices', undefined, undefined, { title, created });
  ok(res, { created, students: students.length }, 201);
}));
r.post('/invoices', requirePermission('finance:write'), validate(z.object({ student_id: z.string(), fee_type_id: z.string().nullable().optional(), title: z.string().min(2).max(200), amount: z.number().min(0), discount: z.number().min(0).optional(), period: z.string().max(7).nullable().optional(), due_date: z.string().max(10).nullable().optional(), note: z.string().max(255).nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const id = newId();
  await insertRow('invoices', { id, tenant_id: u.tenantId, number: await nextNumber(u.tenantId, 'INV', (await import('../../database/db')).getPool()), ...req.body, status: 'UNPAID', created_by: u.id });
  await audit(req, 'finance.invoice_create', 'invoices', id, undefined, req.body);
  ok(res, await queryOne(`SELECT ${INV_SELECT} ${INV_FROM} WHERE i.id = ?`, [id]), 201);
}));
r.put('/invoices/:id', requirePermission('finance:write'), validate(z.object({ discount: z.number().min(0).optional(), late_fee: z.number().min(0).optional(), due_date: z.string().max(10).nullable().optional(), note: z.string().max(255).nullable().optional(), status: z.enum(['CANCELLED']).optional(), title: z.string().max(200).optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const inv = await mustGet('invoices', req.params.id, u.tenantId);
  await updateRow('invoices', String(inv.id), req.body, undefined, u.tenantId);
  await recomputeStatus(String(inv.id));
  await audit(req, 'finance.invoice_update', 'invoices', String(inv.id), inv, req.body);
  ok(res, await queryOne(`SELECT ${INV_SELECT} ${INV_FROM} WHERE i.id = ?`, [inv.id]));
}));
r.delete('/invoices/:id', requirePermission('finance:write'), wrap(async (req, res) => {
  const inv = await mustGet('invoices', req.params.id, req.auth!.tenantId);
  if (Number(inv.paid) > 0) throw badRequest('Tagihan sudah ada pembayaran; batalkan saja');
  await execute(`DELETE FROM \`${T('invoices')}\` WHERE id = ?`, [inv.id]);
  ok(res, { deleted: true });
}));
async function recomputeStatus(invoiceId: string, exec?: Exec) {
  const inv = await queryOne(`SELECT amount, discount, late_fee, paid, due_date, status FROM \`${T('invoices')}\` WHERE id = ?`, [invoiceId], exec);
  if (!inv || inv.status === 'CANCELLED') return;
  const remaining = Number(inv.amount) + Number(inv.late_fee) - Number(inv.discount) - Number(inv.paid);
  const status = remaining <= 0 ? 'PAID' : Number(inv.paid) > 0 ? 'PARTIAL' : inv.due_date && new Date(inv.due_date) < new Date() ? 'OVERDUE' : 'UNPAID';
  await execute(`UPDATE \`${T('invoices')}\` SET status = ? WHERE id = ?`, [status, invoiceId], exec);
}
r.get('/invoices/student/:studentId', requirePermission('finance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const sid = req.params.studentId === 'me' ? u.id : req.params.studentId;
  await assertStudentAccess(u, sid);
  const invoices = await query(`SELECT ${INV_SELECT} ${INV_FROM} WHERE i.student_id = ? AND i.tenant_id = ? ORDER BY i.due_date DESC`, [sid, u.tenantId]);
  const payments = await query(`SELECT p.*, rb.full_name AS received_by_name FROM \`${T('payments')}\` p LEFT JOIN \`${T('users')}\` rb ON rb.id = p.received_by WHERE p.student_id = ? ORDER BY p.paid_at DESC`, [sid]);
  const outstanding = invoices.filter((i) => ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(String(i.status))).reduce((a, i) => a + Number(i.remaining), 0);
  ok(res, { outstanding, invoices, payments: payments.map((p) => ({ ...p, proof_url: fileUrl(p.proof_file_id) })) });
}));

// ---------- Payments ----------
const PAY_SELECT = `p.*, st.full_name AS student_name, c.name AS class_name, rb.full_name AS received_by_name, (SELECT GROUP_CONCAT(CONCAT(i.number, ':', pa.amount) SEPARATOR '; ') FROM \`${T('payment_allocations')}\` pa JOIN \`${T('invoices')}\` i ON i.id = pa.invoice_id WHERE pa.payment_id = p.id) AS allocations`;
const PAY_FROM = `FROM \`${T('payments')}\` p JOIN \`${T('users')}\` st ON st.id = p.student_id LEFT JOIN \`${T('class_students')}\` e ON e.student_id = st.id AND e.status = 'AKTIF' LEFT JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 LEFT JOIN \`${T('users')}\` rb ON rb.id = p.received_by`;
r.get('/payments', requirePermission('finance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const { page, limit, offset } = paging(req.query);
  const params: unknown[] = [u.tenantId];
  let where = 'WHERE p.tenant_id = ?';
  const sf = await studentFilter(req); if (sf) { where += ` AND ${sf.sql.replace('i.student_id', 'p.student_id')}`; params.push(...sf.params); }
  const q = str(req.query.q); if (q) { where += ' AND (p.number LIKE ? OR st.full_name LIKE ? OR p.reference LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (str(req.query.method)) { where += ' AND p.method = ?'; params.push(String(req.query.method)); }
  if (str(req.query.status)) { where += ' AND p.status = ?'; params.push(String(req.query.status)); }
  if (str(req.query.from)) { where += ' AND p.paid_at >= ?'; params.push(String(req.query.from)); }
  if (str(req.query.to)) { where += ' AND p.paid_at < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(String(req.query.to)); }
  const total = Number((await queryOne(`SELECT COUNT(*) AS c ${PAY_FROM} ${where}`, params))?.c ?? 0);
  const sum = await queryOne(`SELECT COALESCE(SUM(p.amount),0) AS s ${PAY_FROM} ${where} AND p.status = 'CONFIRMED'`, params);
  const rows = await query(`SELECT ${PAY_SELECT} ${PAY_FROM} ${where} ORDER BY p.paid_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows.map((x) => ({ ...x, proof_url: fileUrl(x.proof_file_id) })), meta: { page, limit, total, sum: Number(sum?.s ?? 0) } });
}));
r.post('/payments', requirePermission('finance:write'), validate(z.object({ student_id: z.string(), amount: z.number().positive(), method: z.enum(['TUNAI', 'TRANSFER', 'QRIS', 'VA', 'LAINNYA']).optional(), reference: z.string().max(100).nullable().optional(), paid_at: z.string().optional(), note: z.string().max(255).nullable().optional(), proof_file_id: z.string().nullable().optional(), allocations: z.array(z.object({ invoice_id: z.string(), amount: z.number().positive() })).optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const b = req.body;
  const id = newId();
  await withTransaction(async (conn) => {
    await insertRow('payments', { id, tenant_id: u.tenantId, number: await nextNumber(u.tenantId, 'PAY', conn), student_id: b.student_id, amount: b.amount, method: b.method ?? 'TUNAI', reference: b.reference ?? null, paid_at: b.paid_at ? new Date(b.paid_at) : new Date(), received_by: u.id, note: b.note ?? null, status: 'CONFIRMED', proof_file_id: b.proof_file_id ?? null }, conn);
    let allocations = b.allocations as { invoice_id: string; amount: number }[] | undefined;
    if (!allocations?.length) {
      // Auto-allocate to the oldest open invoices.
      const open = await query(`SELECT id, (amount + late_fee - discount - paid) AS remaining FROM \`${T('invoices')}\` WHERE tenant_id = ? AND student_id = ? AND status IN ('UNPAID','PARTIAL','OVERDUE') ORDER BY due_date ASC, created_at ASC`, [u.tenantId, b.student_id], conn);
      let left = b.amount; allocations = [];
      for (const inv of open) { if (left <= 0) break; const a = Math.min(left, Number(inv.remaining)); if (a > 0) { allocations.push({ invoice_id: String(inv.id), amount: a }); left -= a; } }
    }
    let allocated = 0;
    for (const a of allocations) {
      const inv = await queryOne(`SELECT id, student_id, (amount + late_fee - discount - paid) AS remaining FROM \`${T('invoices')}\` WHERE id = ? AND tenant_id = ?`, [a.invoice_id, u.tenantId], conn);
      if (!inv || inv.student_id !== b.student_id) throw badRequest('Tagihan tidak valid');
      const amt = Math.min(a.amount, Number(inv.remaining));
      if (amt <= 0) continue;
      await insertRow('payment_allocations', { id: newId(), payment_id: id, invoice_id: inv.id, amount: amt }, conn);
      await execute(`UPDATE \`${T('invoices')}\` SET paid = paid + ? WHERE id = ?`, [amt, inv.id], conn);
      await recomputeStatus(String(inv.id), conn);
      allocated += amt;
    }
    if (allocated > b.amount + 0.01) throw badRequest('Alokasi melebihi jumlah pembayaran');
    await insertRow('cash_flows', { id: newId(), tenant_id: u.tenantId, tx_date: (b.paid_at ? new Date(b.paid_at) : new Date()).toISOString().slice(0, 10), direction: 'IN', category: 'PEMBAYARAN SISWA', amount: b.amount, description: `Pembayaran ${b.method ?? 'TUNAI'}`, reference_type: 'PAYMENT', reference_id: id, created_by: u.id }, conn);
  });
  const guardians = (await query(`SELECT guardian_user_id FROM \`${T('guardian_students')}\` WHERE student_id = ?`, [b.student_id])).map((x) => String(x.guardian_user_id));
  await notify({ tenantId: u.tenantId, userIds: [b.student_id, ...guardians], type: 'PAYMENT', title: `Pembayaran diterima: Rp ${Number(b.amount).toLocaleString('id-ID')}`, link: '/siswa/tagihan' });
  await audit(req, 'finance.payment_create', 'payments', id, undefined, { amount: b.amount, student_id: b.student_id });
  ok(res, await queryOne(`SELECT ${PAY_SELECT} ${PAY_FROM} WHERE p.id = ?`, [id]), 201);
}));
r.post('/payments/:id/cancel', requirePermission('finance:approve'), wrap(async (req, res) => {
  const u = req.auth!;
  const p = await mustGet('payments', req.params.id, u.tenantId);
  if (p.status === 'CANCELLED') throw badRequest('Sudah dibatalkan');
  await withTransaction(async (conn) => {
    const allocs = await query(`SELECT invoice_id, amount FROM \`${T('payment_allocations')}\` WHERE payment_id = ?`, [p.id], conn);
    for (const a of allocs) { await execute(`UPDATE \`${T('invoices')}\` SET paid = paid - ? WHERE id = ?`, [a.amount, a.invoice_id], conn); await recomputeStatus(String(a.invoice_id), conn); }
    await execute(`DELETE FROM \`${T('payment_allocations')}\` WHERE payment_id = ?`, [p.id], conn);
    await execute(`UPDATE \`${T('payments')}\` SET status = 'CANCELLED' WHERE id = ?`, [p.id], conn);
    await execute(`DELETE FROM \`${T('cash_flows')}\` WHERE reference_type = 'PAYMENT' AND reference_id = ?`, [p.id], conn);
  });
  await audit(req, 'finance.payment_cancel', 'payments', String(p.id));
  ok(res, { cancelled: true });
}));
r.get('/payments/:id/receipt', requirePermission('finance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const p = await queryOne(`SELECT ${PAY_SELECT} ${PAY_FROM} WHERE p.id = ? AND p.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!p) throw notFound();
  await assertStudentAccess(u, String(p.student_id));
  const t = await queryOne(`SELECT name, address FROM \`${T('tenants')}\` WHERE id = ?`, [u.tenantId]);
  const allocs = await query(`SELECT i.number, i.title, pa.amount FROM \`${T('payment_allocations')}\` pa JOIN \`${T('invoices')}\` i ON i.id = pa.invoice_id WHERE pa.payment_id = ?`, [p.id]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="kwitansi-${String(p.number).replace(/\//g, '-')}.pdf"`);
  const doc = new PDFDocument({ size: 'A5', margin: 36, layout: 'landscape' });
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(13).text(String(t?.name ?? ''), { align: 'center' }).font('Helvetica').fontSize(8).text(String(t?.address ?? ''), { align: 'center' });
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(14).text('KWITANSI PEMBAYARAN', { align: 'center' });
  doc.moveDown(0.6).font('Helvetica').fontSize(10);
  doc.text(`No. ${p.number}`).text(`Diterima dari: ${p.student_name} (${p.class_name ?? '-'})`).text(`Tanggal: ${new Date(p.paid_at).toLocaleString('id-ID')}`).text(`Metode: ${p.method}${p.reference ? ` · Ref ${p.reference}` : ''}`);
  doc.moveDown(0.5);
  for (const a of allocs) doc.text(`• ${a.number} — ${a.title}: Rp ${Number(a.amount).toLocaleString('id-ID')}`);
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(12).text(`TOTAL: Rp ${Number(p.amount).toLocaleString('id-ID')}`);
  if (p.status === 'CANCELLED') doc.fillColor('#ef4444').text('DIBATALKAN');
  doc.moveDown(1).font('Helvetica').fontSize(9).fillColor('#000').text(`Penerima: ${p.received_by_name ?? '-'}`, { align: 'right' });
  doc.end();
}));

// ---------- Refunds ----------
const refundSchema = z.object({ student_id: z.string(), payment_id: z.string().nullable().optional(), amount: z.number().positive(), reason: z.string().max(2000).nullable().optional() });
r.use('/refunds', crudRouter({ table: 'refunds', searchable: ['st.full_name', 't.reason'], sortable: ['created_at'], perms: P, select: 'st.full_name AS student_name, ab.full_name AS approved_by_name', joins: `JOIN \`${T('users')}\` st ON st.id = t.student_id LEFT JOIN \`${T('users')}\` ab ON ab.id = t.approved_by`, filters: [{ param: 'status', column: 't.status' }], createSchema: refundSchema, updateSchema: refundSchema.partial(), toRow: (i, req, isCreate) => (isCreate ? { ...(i as Record<string, unknown>), created_by: req.auth!.id } : (i as Record<string, unknown>)) }));
r.post('/refunds/:id/approve', requirePermission('finance:approve'), validate(z.object({ approve: z.boolean(), paid: z.boolean().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const rf = await mustGet('refunds', req.params.id, u.tenantId);
  const status = !req.body.approve ? 'REJECTED' : req.body.paid ? 'PAID' : 'APPROVED';
  await execute(`UPDATE \`${T('refunds')}\` SET status = ?, approved_by = ?, approved_at = NOW(), paid_at = ? WHERE id = ?`, [status, u.id, req.body.paid ? new Date() : null, rf.id]);
  if (status === 'PAID') await insertRow('cash_flows', { id: newId(), tenant_id: u.tenantId, tx_date: new Date().toISOString().slice(0, 10), direction: 'OUT', category: 'REFUND', amount: rf.amount, description: `Refund ${rf.reason ?? ''}`.slice(0, 255), reference_type: 'REFUND', reference_id: rf.id, created_by: u.id });
  await audit(req, 'finance.refund_review', 'refunds', String(rf.id), undefined, req.body);
  ok(res, { status });
}));

// ---------- Rekonsiliasi bank (CSV) ----------
r.post('/reconciliation', requirePermission('finance:reconcile'), upload.single('file'), wrap(async (req, res) => {
  const u = req.auth!;
  if (!req.file) throw badRequest('Berkas CSV/XLSX wajib');
  const rows = await readSheet(req.file.path, req.file.mimetype);
  const batchId = newId();
  let matched = 0;
  await withTransaction(async (conn) => {
    await insertRow('reconciliation_batches', { id: batchId, tenant_id: u.tenantId, file_name: req.file!.originalname, bank_name: str(req.body.bank_name) ?? null, total_rows: rows.length, created_by: u.id }, conn);
    for (const row of rows) {
      const amount = Number(String(row.amount ?? row.kredit ?? row.credit ?? '0').replace(/[^0-9.-]/g, ''));
      const reference = String(row.reference ?? row.ref ?? row.keterangan ?? row.description ?? '').trim();
      const txDate = row.date ?? row.tanggal ?? row.tx_date;
      let paymentId: string | null = null;
      if (reference) { const p = await queryOne(`SELECT p.id FROM \`${T('payments')}\` p LEFT JOIN \`${T('reconciliation_items')}\` ri ON ri.payment_id = p.id WHERE p.tenant_id = ? AND p.method IN ('TRANSFER','VA','QRIS') AND p.reference IS NOT NULL AND ? LIKE CONCAT('%', p.reference, '%') AND ri.id IS NULL LIMIT 1`, [u.tenantId, reference], conn); if (p) paymentId = String(p.id); }
      if (!paymentId && amount > 0) { const p = await queryOne(`SELECT p.id FROM \`${T('payments')}\` p LEFT JOIN \`${T('reconciliation_items')}\` ri ON ri.payment_id = p.id WHERE p.tenant_id = ? AND p.method IN ('TRANSFER','VA','QRIS') AND p.amount = ? AND ri.id IS NULL ${txDate ? 'AND DATE(p.paid_at) BETWEEN DATE_SUB(?, INTERVAL 3 DAY) AND DATE_ADD(?, INTERVAL 3 DAY)' : ''} LIMIT 1`, txDate ? [u.tenantId, amount, txDate, txDate] : [u.tenantId, amount], conn); if (p) paymentId = String(p.id); }
      if (paymentId) matched++;
      await insertRow('reconciliation_items', { id: newId(), batch_id: batchId, tx_date: txDate ? String(txDate).slice(0, 10) : null, description: String(row.description ?? row.keterangan ?? '').slice(0, 255), amount, reference: reference.slice(0, 100) || null, payment_id: paymentId, status: paymentId ? 'MATCHED' : 'UNMATCHED' }, conn);
    }
    await execute(`UPDATE \`${T('reconciliation_batches')}\` SET matched = ?, unmatched = ? WHERE id = ?`, [matched, rows.length - matched, batchId], conn);
  });
  await audit(req, 'finance.reconcile', 'reconciliation_batches', batchId, undefined, { rows: rows.length, matched });
  ok(res, { batch_id: batchId, total: rows.length, matched, unmatched: rows.length - matched }, 201);
}));
r.get('/reconciliation', requirePermission('finance:reconcile', 'finance:read'), wrap(async (req, res) => ok(res, await query(`SELECT b.*, u.full_name AS created_by_name FROM \`${T('reconciliation_batches')}\` b LEFT JOIN \`${T('users')}\` u ON u.id = b.created_by WHERE b.tenant_id = ? ORDER BY b.created_at DESC LIMIT 50`, [req.auth!.tenantId]))));
r.get('/reconciliation/:id', requirePermission('finance:reconcile', 'finance:read'), wrap(async (req, res) => {
  const b = await mustGet('reconciliation_batches', req.params.id, req.auth!.tenantId);
  ok(res, { batch: b, items: await query(`SELECT ri.*, p.number AS payment_number, st.full_name AS student_name FROM \`${T('reconciliation_items')}\` ri LEFT JOIN \`${T('payments')}\` p ON p.id = ri.payment_id LEFT JOIN \`${T('users')}\` st ON st.id = p.student_id WHERE ri.batch_id = ? ORDER BY ri.tx_date`, [b.id]) });
}));
r.put('/reconciliation/items/:itemId', requirePermission('finance:reconcile'), validate(z.object({ payment_id: z.string().nullable() })), wrap(async (req, res) => {
  const u = req.auth!;
  const it = await queryOne(`SELECT ri.* FROM \`${T('reconciliation_items')}\` ri JOIN \`${T('reconciliation_batches')}\` b ON b.id = ri.batch_id WHERE ri.id = ? AND b.tenant_id = ?`, [req.params.itemId, u.tenantId]);
  if (!it) throw notFound();
  if (req.body.payment_id) await mustGet('payments', req.body.payment_id, u.tenantId);
  await execute(`UPDATE \`${T('reconciliation_items')}\` SET payment_id = ?, status = ? WHERE id = ?`, [req.body.payment_id, req.body.payment_id ? 'MATCHED' : 'UNMATCHED', it.id]);
  await execute(`UPDATE \`${T('reconciliation_batches')}\` b SET matched = (SELECT COUNT(*) FROM \`${T('reconciliation_items')}\` WHERE batch_id = b.id AND status = 'MATCHED'), unmatched = (SELECT COUNT(*) FROM \`${T('reconciliation_items')}\` WHERE batch_id = b.id AND status <> 'MATCHED') WHERE b.id = ?`, [it.batch_id]);
  ok(res, { saved: true });
}));

// ---------- Arus kas ----------
const cfSchema = z.object({ tx_date: z.string().max(10), direction: z.enum(['IN', 'OUT']), category: z.string().min(1).max(60), amount: z.number().positive(), description: z.string().max(255).nullable().optional() });
r.use('/cash-flows', crudRouter({ table: 'cash_flows', searchable: ['t.category', 't.description'], sortable: ['tx_date', 'amount'], defaultSort: 'tx_date', perms: P, select: 'u.full_name AS created_by_name', joins: `LEFT JOIN \`${T('users')}\` u ON u.id = t.created_by`, filters: [{ param: 'direction', column: 't.direction' }, { param: 'category', column: 't.category' }, { param: 'from', column: 't.tx_date', op: '>=' }, { param: 'to', column: 't.tx_date', op: '<=' }], createSchema: cfSchema, updateSchema: cfSchema.partial(), toRow: (i, req, isCreate) => (isCreate ? { ...(i as Record<string, unknown>), created_by: req.auth!.id } : (i as Record<string, unknown>)) }));
r.get('/summary', requirePermission('finance:read'), wrap(async (req, res) => {
  const u = req.auth!;
  if (!isTenantWide(u)) throw forbidden();
  const tid = u.tenantId;
  const monthly = await query(`SELECT DATE_FORMAT(tx_date, '%Y-%m') AS month, SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END) AS income, SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END) AS expense FROM \`${T('cash_flows')}\` WHERE tenant_id = ? AND tx_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY month ORDER BY month`, [tid]);
  const byCategory = await query(`SELECT direction, category, SUM(amount) AS total FROM \`${T('cash_flows')}\` WHERE tenant_id = ? AND YEAR(tx_date) = YEAR(CURDATE()) GROUP BY direction, category ORDER BY total DESC`, [tid]);
  const outstandingByClass = await query(`SELECT c.name, COUNT(DISTINCT i.student_id) AS students, SUM(i.amount + i.late_fee - i.discount - i.paid) AS remaining FROM \`${T('invoices')}\` i JOIN \`${T('class_students')}\` e ON e.student_id = i.student_id AND e.status = 'AKTIF' JOIN \`${T('classes')}\` c ON c.id = e.class_id AND c.is_active = 1 WHERE i.tenant_id = ? AND i.status IN ('UNPAID','PARTIAL','OVERDUE') GROUP BY c.name ORDER BY remaining DESC`, [tid]);
  const totals = await queryOne(`SELECT (SELECT COALESCE(SUM(amount),0) FROM \`${T('cash_flows')}\` WHERE tenant_id = ? AND direction = 'IN' AND YEAR(tx_date) = YEAR(CURDATE())) AS income_ytd, (SELECT COALESCE(SUM(amount),0) FROM \`${T('cash_flows')}\` WHERE tenant_id = ? AND direction = 'OUT' AND YEAR(tx_date) = YEAR(CURDATE())) AS expense_ytd, (SELECT COALESCE(SUM(amount + late_fee - discount - paid),0) FROM \`${T('invoices')}\` WHERE tenant_id = ? AND status IN ('UNPAID','PARTIAL','OVERDUE')) AS outstanding, (SELECT COUNT(*) FROM \`${T('invoices')}\` WHERE tenant_id = ? AND status = 'OVERDUE') AS overdue_count`, [tid, tid, tid, tid]);
  ok(res, { monthly, by_category: byCategory, outstanding_by_class: outstandingByClass, totals });
}));

export default r;
export const _keep = paged;
