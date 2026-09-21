import { Router } from 'express';
import { z } from 'zod';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { notFound, badRequest, conflict, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter, insertRow, mustGet } from '../../core/crud';
import { audit, notify, fileUrl } from '../../core/services';
import { newId } from '../../core/ids';
import { isTenantWide } from '../../core/scope';
import { hasRole } from '../../core/auth';

const r = Router();

// ---------- Aset ----------
const assetSchema = z.object({ code: z.string().min(1).max(30), name: z.string().min(2).max(150), category: z.enum(['ELEKTRONIK', 'MEBEL', 'KENDARAAN', 'BANGUNAN', 'ALAT_PRAKTIK', 'BUKU', 'LAINNYA']).optional(), location: z.string().max(120).nullable().optional(), room_id: z.string().nullable().optional(), purchase_date: z.string().max(10).nullable().optional(), purchase_price: z.number().min(0).optional(), useful_life_years: z.number().int().min(1).max(50).optional(), salvage_value: z.number().min(0).optional(), condition_status: z.enum(['BAIK', 'RUSAK_RINGAN', 'RUSAK_BERAT', 'HILANG']).optional(), status: z.enum(['AKTIF', 'DIPINJAM', 'PERBAIKAN', 'DIHAPUSKAN']).optional(), quantity: z.number().int().min(1).optional(), custodian_id: z.string().nullable().optional(), notes: z.string().max(2000).nullable().optional(), photo_file_id: z.string().nullable().optional() });
/** Straight-line depreciation per year, computed on read. */
const withDepreciation = (row: Record<string, unknown>): Record<string, unknown> => {
  const price = Number(row.purchase_price ?? 0); const salvage = Number(row.salvage_value ?? 0); const life = Number(row.useful_life_years ?? 5);
  const years = row.purchase_date ? Math.max(0, (Date.now() - new Date(row.purchase_date as string).getTime()) / (365.25 * 86400000)) : 0;
  const annual = life ? Math.max(0, (price - salvage) / life) : 0;
  const accumulated = Math.min(price - salvage, annual * years);
  return { ...row, photo_url: fileUrl(row.photo_file_id as string | null), depreciation_annual: Math.round(annual), depreciation_accumulated: Math.round(accumulated), book_value: Math.round(price - accumulated) };
};
r.use('/assets', crudRouter({
  table: 'assets', searchable: ['t.code', 't.name', 't.location'], sortable: ['code', 'name', 'purchase_date', 'purchase_price'], defaultSort: 'code', defaultOrder: 'ASC', perms: { read: ['asset:read'], write: ['asset:write'] },
  select: 'rm.name AS room_name, cu.full_name AS custodian_name', joins: `LEFT JOIN \`${T('rooms')}\` rm ON rm.id = t.room_id LEFT JOIN \`${T('users')}\` cu ON cu.id = t.custodian_id`,
  filters: [{ param: 'category', column: 't.category' }, { param: 'status', column: 't.status' }, { param: 'condition_status', column: 't.condition_status' }, { param: 'room_id', column: 't.room_id' }],
  createSchema: assetSchema, updateSchema: assetSchema.partial(), present: withDepreciation,
}));
r.get('/assets-summary', requirePermission('asset:read'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const rows = await query(`SELECT * FROM \`${T('assets')}\` WHERE tenant_id = ? AND status <> 'DIHAPUSKAN'`, [tid]);
  const dep = rows.map(withDepreciation);
  const byCat: Record<string, { count: number; value: number; book: number }> = {};
  for (const a of dep) { const c = String(a.category); byCat[c] ??= { count: 0, value: 0, book: 0 }; byCat[c].count += Number(a.quantity ?? 1); byCat[c].value += Number(a.purchase_price ?? 0); byCat[c].book += Number(a.book_value); }
  ok(res, { total: dep.length, purchase_value: dep.reduce((s, a) => s + Number(a.purchase_price ?? 0), 0), book_value: dep.reduce((s, a) => s + Number(a.book_value), 0), by_category: Object.entries(byCat).map(([category, v]) => ({ category, ...v })), by_condition: await query(`SELECT condition_status, COUNT(*) AS c FROM \`${T('assets')}\` WHERE tenant_id = ? GROUP BY condition_status`, [tid]), pending_bookings: Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('asset_bookings')}\` WHERE tenant_id = ? AND status = 'PENDING'`, [tid]))?.c ?? 0) });
}));

// Bookings (with time-overlap conflict check)
const bookingSchema = z.object({ asset_id: z.string(), start_at: z.string(), end_at: z.string(), purpose: z.string().max(255).nullable().optional() });
r.use('/bookings', crudRouter({
  table: 'asset_bookings', searchable: ['a.name', 'u.full_name', 't.purpose'], sortable: ['start_at', 'created_at'], defaultSort: 'start_at', perms: { read: ['asset:read'], write: ['asset:book'] },
  select: 'a.name AS asset_name, a.code AS asset_code, u.full_name AS booked_by_name, ap.full_name AS approved_by_name', joins: `JOIN \`${T('assets')}\` a ON a.id = t.asset_id JOIN \`${T('users')}\` u ON u.id = t.booked_by LEFT JOIN \`${T('users')}\` ap ON ap.id = t.approved_by`,
  filters: [{ param: 'status', column: 't.status' }, { param: 'asset_id', column: 't.asset_id' }],
  scope: (req) => (isTenantWide(req.auth!) || req.auth!.permissions.has('asset:approve') ? null : { sql: 't.booked_by = ?', params: [req.auth!.id] }),
  createSchema: bookingSchema, updateSchema: bookingSchema.partial(),
  toRow: (i, req, isCreate) => { const b = { ...(i as Record<string, unknown>) }; if (b.start_at) b.start_at = new Date(String(b.start_at)); if (b.end_at) b.end_at = new Date(String(b.end_at)); return isCreate ? { ...b, booked_by: req.auth!.id, status: 'PENDING' } : b; },
  beforeCreate: async (row, req, exec) => {
    if ((row.end_at as Date) <= (row.start_at as Date)) throw badRequest('Waktu selesai harus setelah mulai');
    const clash = await query(`SELECT b.id, b.start_at, b.end_at, u.full_name FROM \`${T('asset_bookings')}\` b JOIN \`${T('users')}\` u ON u.id = b.booked_by WHERE b.asset_id = ? AND b.status IN ('PENDING','APPROVED') AND b.start_at < ? AND b.end_at > ?`, [row.asset_id, row.end_at, row.start_at], exec);
    if (clash.length) throw conflict('Aset sudah dipesan pada waktu tersebut', clash);
    const approvers = (await query(`SELECT DISTINCT r.user_id FROM \`${T('user_roles')}\` r WHERE r.tenant_id = ? AND r.role IN ('ADMIN_SEKOLAH','STAF')`, [req.auth!.tenantId], exec)).map((x) => String(x.user_id));
    await notify({ tenantId: req.auth!.tenantId, userIds: approvers, type: 'ASSET', title: `Permintaan pinjam aset: ${req.auth!.name}`, link: '/admin/aset' }, exec);
  },
}));
r.post('/bookings/:id/:action', requirePermission('asset:approve', 'asset:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const b = await mustGet('asset_bookings', req.params.id, u.tenantId);
  const act = req.params.action;
  if (act === 'approve') { await execute(`UPDATE \`${T('asset_bookings')}\` SET status = 'APPROVED', approved_by = ? WHERE id = ?`, [u.id, b.id]); await execute(`UPDATE \`${T('assets')}\` SET status = 'DIPINJAM' WHERE id = ? AND quantity = 1`, [b.asset_id]); }
  else if (act === 'reject') await execute(`UPDATE \`${T('asset_bookings')}\` SET status = 'REJECTED', approved_by = ? WHERE id = ?`, [u.id, b.id]);
  else if (act === 'return') { const cond = z.enum(['BAIK', 'RUSAK_RINGAN', 'RUSAK_BERAT', 'HILANG']).catch('BAIK').parse(req.body?.condition); await execute(`UPDATE \`${T('asset_bookings')}\` SET status = 'RETURNED', returned_at = NOW(), return_condition = ? WHERE id = ?`, [cond, b.id]); await execute(`UPDATE \`${T('assets')}\` SET status = 'AKTIF', condition_status = ? WHERE id = ?`, [cond, b.asset_id]); }
  else throw notFound();
  await notify({ tenantId: u.tenantId, userIds: [String(b.booked_by)], type: 'ASSET', title: `Peminjaman aset ${act === 'approve' ? 'disetujui' : act === 'reject' ? 'ditolak' : 'selesai dikembalikan'}`, link: '/guru/aset' });
  await audit(req, `asset.booking_${act}`, 'asset_bookings', String(b.id));
  ok(res, { status: act });
}));

// Maintenance & audits
const maintSchema = z.object({ asset_id: z.string(), scheduled_date: z.string().max(10), done_date: z.string().max(10).nullable().optional(), type: z.enum(['RUTIN', 'PERBAIKAN', 'KALIBRASI']).optional(), description: z.string().max(2000).nullable().optional(), cost: z.number().min(0).optional(), vendor: z.string().max(150).nullable().optional(), status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional() });
r.use('/maintenance', crudRouter({ table: 'asset_maintenance', searchable: ['a.name', 't.description', 't.vendor'], sortable: ['scheduled_date'], defaultSort: 'scheduled_date', perms: { read: ['asset:read'], write: ['asset:write'] }, select: 'a.name AS asset_name, a.code AS asset_code', joins: `JOIN \`${T('assets')}\` a ON a.id = t.asset_id`, filters: [{ param: 'status', column: 't.status' }, { param: 'asset_id', column: 't.asset_id' }], createSchema: maintSchema, updateSchema: maintSchema.partial(), toRow: (i, req, isCreate) => (isCreate ? { ...(i as Record<string, unknown>), created_by: req.auth!.id } : (i as Record<string, unknown>)),
  afterUpdate: async (id, row, req, exec) => { if (row.status === 'DONE' && Number(row.cost) > 0) { const m = await queryOne(`SELECT cost, description FROM \`${T('asset_maintenance')}\` WHERE id = ?`, [id], exec); await insertRow('cash_flows', { id: newId(), tenant_id: req.auth!.tenantId, tx_date: new Date().toISOString().slice(0, 10), direction: 'OUT', category: 'PEMELIHARAAN ASET', amount: Number(m?.cost ?? 0), description: String(m?.description ?? '').slice(0, 255), reference_type: 'MAINTENANCE', reference_id: id, created_by: req.auth!.id }, exec); } } }));
r.post('/audits', requirePermission('asset:write'), validate(z.object({ title: z.string().min(2).max(150), audit_date: z.string().max(10) })), wrap(async (req, res) => {
  const u = req.auth!;
  const assets = await query(`SELECT id, code, name, quantity, condition_status, room_id FROM \`${T('assets')}\` WHERE tenant_id = ? AND status <> 'DIHAPUSKAN' ORDER BY code`, [u.tenantId]);
  const id = newId();
  await insertRow('asset_audits', { id, tenant_id: u.tenantId, title: req.body.title, audit_date: req.body.audit_date, status: 'OPEN', items: assets.map((a) => ({ asset_id: a.id, code: a.code, name: a.name, expected: Number(a.quantity), found: null, condition: a.condition_status, note: '' })), created_by: u.id });
  ok(res, { id, items: assets.length }, 201);
}));
r.get('/audits', requirePermission('asset:read'), wrap(async (req, res) => ok(res, await query(`SELECT id, title, audit_date, status, summary, created_at, closed_at FROM \`${T('asset_audits')}\` WHERE tenant_id = ? ORDER BY audit_date DESC`, [req.auth!.tenantId]))));
r.get('/audits/:id', requirePermission('asset:read'), wrap(async (req, res) => { const a = await mustGet('asset_audits', req.params.id, req.auth!.tenantId); ok(res, { ...a, items: typeof a.items === 'string' ? JSON.parse(a.items) : a.items, summary: typeof a.summary === 'string' ? JSON.parse(a.summary) : a.summary }); }));
r.put('/audits/:id', requirePermission('asset:write'), validate(z.object({ items: z.array(z.object({ asset_id: z.string(), found: z.number().int().min(0).nullable(), condition: z.string().max(20).optional(), note: z.string().max(255).optional() })), close: z.boolean().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const a = await mustGet('asset_audits', req.params.id, u.tenantId);
  if (a.status === 'CLOSED') throw badRequest('Opname sudah ditutup');
  const items = (typeof a.items === 'string' ? JSON.parse(a.items) : a.items) as Record<string, unknown>[];
  const map = new Map(req.body.items.map((x: { asset_id: string }) => [x.asset_id, x]));
  const merged: Record<string, unknown>[] = items.map((it) => ({ ...it, ...(map.get(it.asset_id as string) ?? {}) }));
  const summary = { checked: merged.filter((x) => x.found !== null && x.found !== undefined).length, missing: merged.filter((x) => x.found !== null && x.found !== undefined && Number(x.found) < Number(x.expected)).length, total: merged.length };
  await withTransaction(async (conn) => {
    await execute(`UPDATE \`${T('asset_audits')}\` SET items = ?, summary = ?, status = ?, closed_at = ? WHERE id = ?`, [JSON.stringify(merged), JSON.stringify(summary), req.body.close ? 'CLOSED' : 'OPEN', req.body.close ? new Date() : null, a.id], conn);
    if (req.body.close) for (const it of merged) { if (it.found !== null && it.found !== undefined) await execute(`UPDATE \`${T('assets')}\` SET condition_status = ?, status = IF(? = 0, 'DIHAPUSKAN', status) WHERE id = ?`, [it.condition ?? 'BAIK', Number(it.found), it.asset_id], conn); }
  });
  await audit(req, req.body.close ? 'asset.audit_close' : 'asset.audit_update', 'asset_audits', String(a.id), undefined, summary);
  ok(res, { summary });
}));

// ---------- Perpustakaan ----------
const bookSchema = z.object({ isbn: z.string().max(20).nullable().optional(), code: z.string().min(1).max(30), title: z.string().min(1).max(200), author: z.string().max(150).nullable().optional(), publisher: z.string().max(150).nullable().optional(), year: z.number().int().nullable().optional(), category: z.string().max(60).nullable().optional(), stock: z.number().int().min(0).optional(), shelf: z.string().max(30).nullable().optional(), cover_file_id: z.string().nullable().optional() });
r.use('/books', crudRouter({ table: 'library_books', searchable: ['t.title', 't.author', 't.code', 't.isbn'], sortable: ['title', 'author', 'year'], defaultSort: 'title', defaultOrder: 'ASC', perms: { read: ['library:read'], write: ['library:write'] }, filters: [{ param: 'category', column: 't.category' }, { param: 'available', column: 't.available', op: '>=' }], createSchema: bookSchema, updateSchema: bookSchema.partial(),
  toRow: (i, _req, isCreate) => { const b = { ...(i as Record<string, unknown>) }; if (isCreate) b.available = b.stock ?? 1; return b; },
  afterUpdate: async (id, row, _req, exec) => { if (row.stock !== undefined) await execute(`UPDATE \`${T('library_books')}\` SET available = GREATEST(0, stock - (SELECT COUNT(*) FROM \`${T('library_loans')}\` WHERE book_id = ? AND status = 'BORROWED')) WHERE id = ?`, [id, id], exec); },
  present: (row) => ({ ...row, cover_url: fileUrl(row.cover_file_id as string | null) }) }));
const LOAN_SELECT = 'b.title AS book_title, b.code AS book_code, u.full_name AS borrower_name, h.full_name AS handled_by_name';
const LOAN_JOIN = `JOIN \`${T('library_books')}\` b ON b.id = t.book_id JOIN \`${T('users')}\` u ON u.id = t.borrower_id LEFT JOIN \`${T('users')}\` h ON h.id = t.handled_by`;

r.post('/loans', requirePermission('library:write', 'library:loan'), validate(z.object({ book_id: z.string(), borrower_id: z.string().optional(), days: z.number().int().min(1).max(60).optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const self = !u.permissions.has('library:write') && !u.isSuperAdmin;
  const borrower = self ? u.id : (req.body.borrower_id ?? u.id);
  const book = await mustGet('library_books', req.body.book_id, u.tenantId);
  if (Number(book.available) <= 0) throw badRequest('Stok tidak tersedia');
  const active = Number((await queryOne(`SELECT COUNT(*) AS c FROM \`${T('library_loans')}\` WHERE borrower_id = ? AND status = 'BORROWED'`, [borrower]))?.c ?? 0);
  if (active >= 3) throw badRequest('Maksimal 3 buku dipinjam bersamaan');
  const id = newId();
  const days = req.body.days ?? 7;
  await withTransaction(async (conn) => {
    await insertRow('library_loans', { id, tenant_id: u.tenantId, book_id: book.id, borrower_id: borrower, borrowed_at: new Date().toISOString().slice(0, 10), due_at: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10), status: self ? 'REQUESTED' : 'BORROWED', handled_by: self ? null : u.id }, conn);
    if (!self) await execute(`UPDATE \`${T('library_books')}\` SET available = available - 1 WHERE id = ?`, [book.id], conn);
  });
  await audit(req, 'library.loan', 'library_loans', id, undefined, { book: book.title, borrower });
  ok(res, { id, status: self ? 'REQUESTED' : 'BORROWED' }, 201);
}));
r.post('/loans/:id/:action', requirePermission('library:write'), wrap(async (req, res) => {
  const u = req.auth!;
  const l = await mustGet('library_loans', req.params.id, u.tenantId);
  const act = req.params.action;
  if (act === 'approve' && l.status === 'REQUESTED') { await withTransaction(async (conn) => { await execute(`UPDATE \`${T('library_loans')}\` SET status = 'BORROWED', handled_by = ?, borrowed_at = CURDATE() WHERE id = ?`, [u.id, l.id], conn); await execute(`UPDATE \`${T('library_books')}\` SET available = available - 1 WHERE id = ? AND available > 0`, [l.book_id], conn); }); }
  else if (act === 'return' && l.status === 'BORROWED') {
    const late = Math.max(0, Math.floor((Date.now() - new Date(l.due_at).getTime()) / 86400000));
    const fine = late * 1000;
    await withTransaction(async (conn) => { await execute(`UPDATE \`${T('library_loans')}\` SET status = ?, returned_at = CURDATE(), fine = ?, handled_by = ? WHERE id = ?`, [late ? 'LATE' : 'RETURNED', fine, u.id, l.id], conn); await execute(`UPDATE \`${T('library_books')}\` SET available = available + 1 WHERE id = ?`, [l.book_id], conn); if (fine) await insertRow('cash_flows', { id: newId(), tenant_id: u.tenantId, tx_date: new Date().toISOString().slice(0, 10), direction: 'IN', category: 'DENDA PERPUSTAKAAN', amount: fine, description: `Terlambat ${late} hari`, reference_type: 'LOAN', reference_id: l.id, created_by: u.id }, conn); });
    return ok(res, { status: late ? 'LATE' : 'RETURNED', late_days: late, fine });
  }
  else if (act === 'reject' && l.status === 'REQUESTED') await execute(`UPDATE \`${T('library_loans')}\` SET status = 'CANCELLED', handled_by = ? WHERE id = ?`, [u.id, l.id]);
  else throw badRequest('Aksi tidak valid untuk status ini');
  ok(res, { status: act });
}));
// list/get/delete for loans (mounted after the custom POST handlers above)
r.use('/loans', crudRouter({ table: 'library_loans', searchable: ['b.title', 'u.full_name'], sortable: ['borrowed_at', 'due_at'], defaultSort: 'borrowed_at', perms: { read: ['library:read'], write: ['library:write'] }, select: LOAN_SELECT, joins: LOAN_JOIN, filters: [{ param: 'status', column: 't.status' }, { param: 'borrower_id', column: 't.borrower_id' }], scope: (req) => (req.auth!.permissions.has('library:write') || isTenantWide(req.auth!) ? null : { sql: 't.borrower_id = ?', params: [req.auth!.id] }), createSchema: z.object({}), updateSchema: z.object({}) }));
r.get('/library-summary', requirePermission('library:read'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  ok(res, await queryOne(`SELECT (SELECT COUNT(*) FROM \`${T('library_books')}\` WHERE tenant_id = ?) AS titles, (SELECT COALESCE(SUM(stock),0) FROM \`${T('library_books')}\` WHERE tenant_id = ?) AS copies, (SELECT COUNT(*) FROM \`${T('library_loans')}\` WHERE tenant_id = ? AND status = 'BORROWED') AS on_loan, (SELECT COUNT(*) FROM \`${T('library_loans')}\` WHERE tenant_id = ? AND status = 'BORROWED' AND due_at < CURDATE()) AS overdue, (SELECT COUNT(*) FROM \`${T('library_loans')}\` WHERE tenant_id = ? AND status = 'REQUESTED') AS requested`, [tid, tid, tid, tid, tid]));
}));

export default r;
export const _k = [forbidden, hasRole];
