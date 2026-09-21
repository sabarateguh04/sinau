import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { T } from '../../config';
import { query, queryOne, execute, withTransaction } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { notFound, badRequest, forbidden } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { crudRouter, insertRow, mustGet } from '../../core/crud';
import { audit, notify } from '../../core/services';
import { newId } from '../../core/ids';
import { STAFF_ROLES } from '../../core/rbac';

const r = Router();
const P = { read: ['payroll:read'], write: ['payroll:write'] };

// ---------- Master ----------
const posSchema = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(120), base_salary: z.number().min(0).optional(), is_active: z.boolean().optional() });
r.use('/positions', crudRouter({ table: 'job_positions', searchable: ['t.code', 't.name'], sortable: ['code'], defaultSort: 'code', defaultOrder: 'ASC', perms: P, createSchema: posSchema, updateSchema: posSchema.partial() }));
const compSchema = z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(120), kind: z.enum(['EARNING', 'ALLOWANCE', 'DEDUCTION']).optional(), calc: z.enum(['FIXED', 'PER_DAY', 'PERCENT']).optional(), default_amount: z.number().min(0).optional(), taxable: z.boolean().optional(), order_no: z.number().int().optional(), is_active: z.boolean().optional() });
r.use('/components', crudRouter({ table: 'payroll_components', searchable: ['t.code', 't.name'], sortable: ['order_no'], defaultSort: 'order_no', defaultOrder: 'ASC', perms: P, createSchema: compSchema, updateSchema: compSchema.partial() }));

r.get('/config', requirePermission('payroll:read'), wrap(async (req, res) => {
  ok(res, (await queryOne(`SELECT * FROM \`${T('payroll_period_configs')}\` WHERE tenant_id = ?`, [req.auth!.tenantId])) ?? { pay_day: 25, bpjs_kes_employee: 1, bpjs_kes_employer: 4, bpjs_tk_jht_employee: 2, bpjs_tk_jht_employer: 3.7, bpjs_tk_jp_employee: 1, bpjs_tk_jp_employer: 2, bpjs_tk_jkk: 0.24, bpjs_tk_jkm: 0.3, bpjs_kes_cap: 12000000, apply_pph21: 1 });
}));
r.put('/config', requirePermission('payroll:write'), validate(z.object({ pay_day: z.number().int().min(1).max(31).optional(), bpjs_kes_employee: z.number().optional(), bpjs_kes_employer: z.number().optional(), bpjs_tk_jht_employee: z.number().optional(), bpjs_tk_jht_employer: z.number().optional(), bpjs_tk_jp_employee: z.number().optional(), bpjs_tk_jp_employer: z.number().optional(), bpjs_tk_jkk: z.number().optional(), bpjs_tk_jkm: z.number().optional(), bpjs_kes_cap: z.number().optional(), apply_pph21: z.boolean().optional() })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const ex = await queryOne(`SELECT id FROM \`${T('payroll_period_configs')}\` WHERE tenant_id = ?`, [tid]);
  const cols = Object.keys(req.body);
  if (!ex) await insertRow('payroll_period_configs', { id: newId(), tenant_id: tid, ...req.body });
  else if (cols.length) await execute(`UPDATE \`${T('payroll_period_configs')}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE tenant_id = ?`, [...cols.map((c) => (typeof req.body[c] === 'boolean' ? (req.body[c] ? 1 : 0) : req.body[c])), tid]);
  ok(res, { saved: true });
}));

// ---------- Salary structures ----------
r.get('/staff', requirePermission('payroll:read'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  ok(res, await query(`SELECT DISTINCT u.id, u.full_name, sp.nip, sp.employment_status, sp.ptkp_status, sp.bank_name, sp.bank_account, jp.name AS position_name, jp.base_salary,
      (SELECT COALESCE(SUM(ss.amount),0) FROM \`${T('salary_structures')}\` ss JOIN \`${T('payroll_components')}\` pc ON pc.id = ss.component_id WHERE ss.user_id = u.id AND pc.kind <> 'DEDUCTION') AS gross_estimate
    FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id LEFT JOIN \`${T('staff_profiles')}\` sp ON sp.user_id = u.id LEFT JOIN \`${T('job_positions')}\` jp ON jp.id = sp.position_id
    WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 AND r.role IN (${STAFF_ROLES.map(() => '?').join(',')}) ORDER BY u.full_name`, [tid, ...STAFF_ROLES]));
}));
r.get('/staff/:userId/structure', requirePermission('payroll:read'), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  ok(res, await query(`SELECT pc.id AS component_id, pc.code, pc.name, pc.kind, pc.calc, pc.taxable, pc.default_amount, ss.amount, ss.effective_from FROM \`${T('payroll_components')}\` pc LEFT JOIN \`${T('salary_structures')}\` ss ON ss.component_id = pc.id AND ss.user_id = ? WHERE pc.tenant_id = ? AND pc.is_active = 1 ORDER BY pc.order_no`, [req.params.userId, tid]));
}));
r.put('/staff/:userId/structure', requirePermission('payroll:write'), validate(z.object({ position_id: z.string().nullable().optional(), ptkp_status: z.string().max(10).nullable().optional(), items: z.array(z.object({ component_id: z.string(), amount: z.number().min(0).nullable() })) })), wrap(async (req, res) => {
  const tid = req.auth!.tenantId;
  const u = await queryOne(`SELECT id FROM \`${T('users')}\` WHERE id = ? AND tenant_id = ?`, [req.params.userId, tid]);
  if (!u) throw notFound();
  await withTransaction(async (conn) => {
    await execute(`INSERT IGNORE INTO \`${T('staff_profiles')}\` (user_id, tenant_id) VALUES (?,?)`, [u.id, tid], conn);
    if (req.body.position_id !== undefined || req.body.ptkp_status !== undefined) await execute(`UPDATE \`${T('staff_profiles')}\` SET position_id = COALESCE(?, position_id), ptkp_status = COALESCE(?, ptkp_status) WHERE user_id = ?`, [req.body.position_id ?? null, req.body.ptkp_status ?? null, u.id], conn);
    for (const it of req.body.items) {
      if (it.amount === null) { await execute(`DELETE FROM \`${T('salary_structures')}\` WHERE user_id = ? AND component_id = ?`, [u.id, it.component_id], conn); continue; }
      await execute(`INSERT INTO \`${T('salary_structures')}\` (id, tenant_id, user_id, component_id, amount, effective_from) VALUES (?,?,?,?,?,CURDATE()) ON DUPLICATE KEY UPDATE amount = VALUES(amount)`, [newId(), tid, u.id, it.component_id, it.amount], conn);
    }
  });
  await audit(req, 'payroll.structure_update', 'salary_structures', String(u.id), undefined, req.body);
  ok(res, { saved: true });
}));

// ---------- PPh 21 TER (PP 58/2023, PMK 168/2023) ----------
// Monthly effective rates by PTKP category. Verify against the current regulation before production use.
const TER_A: [number, number][] = [[5.4e6, 0], [5.65e6, 0.25], [5.95e6, 0.5], [6.3e6, 0.75], [6.75e6, 1], [7.5e6, 1.25], [8.55e6, 1.5], [9.65e6, 1.75], [10.05e6, 2], [10.35e6, 2.25], [10.7e6, 2.5], [11.05e6, 3], [11.6e6, 3.5], [12.5e6, 4], [13.75e6, 5], [15.1e6, 6], [16.95e6, 7], [19.75e6, 8], [24.15e6, 9], [26.45e6, 10], [28e6, 11], [30.05e6, 12], [32.4e6, 13], [35.4e6, 14], [39.1e6, 15], [43.85e6, 16], [47.8e6, 17], [51.4e6, 18], [63.95e6, 19], [69.45e6, 20], [77.5e6, 21], [91e6, 22], [103e6, 23], [125e6, 24], [157e6, 25], [206e6, 26], [337e6, 27], [454e6, 28], [550e6, 29], [695e6, 30], [910e6, 31], [1400e6, 32], [Infinity, 34]];
const TER_B: [number, number][] = [[6.2e6, 0], [6.5e6, 0.25], [6.85e6, 0.5], [7.3e6, 0.75], [9.2e6, 1], [10.75e6, 1.5], [11.25e6, 2], [11.6e6, 2.5], [12.6e6, 3], [13.6e6, 4], [14.95e6, 5], [16.4e6, 6], [18.45e6, 7], [21.85e6, 8], [26e6, 9], [27.7e6, 10], [29.35e6, 11], [31.45e6, 12], [33.95e6, 13], [37.1e6, 14], [41.1e6, 15], [45.8e6, 16], [49.5e6, 17], [53.8e6, 18], [58.5e6, 19], [64e6, 20], [71e6, 21], [80e6, 22], [93e6, 23], [109e6, 24], [129e6, 25], [163e6, 26], [211e6, 27], [374e6, 28], [459e6, 29], [555e6, 30], [704e6, 31], [957e6, 32], [1405e6, 33], [Infinity, 34]];
const TER_C: [number, number][] = [[6.6e6, 0], [6.95e6, 0.25], [7.35e6, 0.5], [7.8e6, 0.75], [8.85e6, 1], [9.8e6, 1.25], [10.95e6, 1.5], [11.2e6, 1.75], [12.05e6, 2], [12.95e6, 3], [14.15e6, 4], [15.55e6, 5], [17.05e6, 6], [19.5e6, 7], [22.7e6, 8], [26.6e6, 9], [28.1e6, 10], [30.1e6, 11], [32.6e6, 12], [35.4e6, 13], [38.9e6, 14], [43e6, 15], [47.4e6, 16], [51.2e6, 17], [55.8e6, 18], [60.4e6, 19], [66.7e6, 20], [74.5e6, 21], [83.2e6, 22], [95.6e6, 23], [110e6, 24], [134e6, 25], [169e6, 26], [221e6, 27], [390e6, 28], [463e6, 29], [561e6, 30], [709e6, 31], [965e6, 32], [1419e6, 33], [Infinity, 34]];
export function terCategory(ptkp: string | null | undefined): 'A' | 'B' | 'C' { const p = (ptkp ?? 'TK/0').toUpperCase().replace(/\s/g, ''); if (['TK/0', 'TK/1', 'K/0'].includes(p)) return 'A'; if (p === 'K/3') return 'C'; return 'B'; }
export function pph21Monthly(gross: number, ptkp: string | null | undefined): { rate: number; tax: number; category: string } {
  const cat = terCategory(ptkp);
  const table = cat === 'A' ? TER_A : cat === 'B' ? TER_B : TER_C;
  const rate = table.find(([max]) => gross <= max)?.[1] ?? 34;
  return { rate, tax: Math.round((gross * rate) / 100), category: cat };
}

// ---------- Runs ----------
const RUN_SELECT = `pr.*, cb.full_name AS created_by_name, fa.full_name AS finance_approved_name, pa.full_name AS principal_approved_name`;
const RUN_FROM = `FROM \`${T('payroll_runs')}\` pr LEFT JOIN \`${T('users')}\` cb ON cb.id = pr.created_by LEFT JOIN \`${T('users')}\` fa ON fa.id = pr.finance_approved_by LEFT JOIN \`${T('users')}\` pa ON pa.id = pr.principal_approved_by`;
r.get('/runs', requirePermission('payroll:read'), wrap(async (req, res) => ok(res, await query(`SELECT ${RUN_SELECT} ${RUN_FROM} WHERE pr.tenant_id = ? ORDER BY pr.period DESC`, [req.auth!.tenantId]))));
r.post('/runs', requirePermission('payroll:write'), validate(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), note: z.string().max(255).nullable().optional() })), wrap(async (req, res) => {
  const u = req.auth!;
  const dup = await queryOne(`SELECT id FROM \`${T('payroll_runs')}\` WHERE tenant_id = ? AND period = ?`, [u.tenantId, req.body.period]);
  if (dup) throw badRequest('Periode ini sudah ada');
  const id = newId();
  await insertRow('payroll_runs', { id, tenant_id: u.tenantId, period: req.body.period, note: req.body.note ?? null, status: 'DRAFT', created_by: u.id });
  await computeRun(id, u.tenantId);
  await audit(req, 'payroll.run_create', 'payroll_runs', id, undefined, req.body);
  ok(res, await queryOne(`SELECT ${RUN_SELECT} ${RUN_FROM} WHERE pr.id = ?`, [id]), 201);
}));
async function computeRun(runId: string, tenantId: string) {
  const run = await queryOne(`SELECT * FROM \`${T('payroll_runs')}\` WHERE id = ?`, [runId]);
  if (!run || !['DRAFT', 'VALIDATED'].includes(String(run.status))) throw badRequest('Run tidak bisa dihitung ulang pada status ini');
  const cfg = (await queryOne(`SELECT * FROM \`${T('payroll_period_configs')}\` WHERE tenant_id = ?`, [tenantId])) ?? { bpjs_kes_employee: 1, bpjs_kes_employer: 4, bpjs_tk_jht_employee: 2, bpjs_tk_jht_employer: 3.7, bpjs_tk_jp_employee: 1, bpjs_tk_jp_employer: 2, bpjs_tk_jkk: 0.24, bpjs_tk_jkm: 0.3, bpjs_kes_cap: 12000000, apply_pph21: 1 };
  const staff = await query(`SELECT DISTINCT u.id, u.full_name, sp.ptkp_status FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id LEFT JOIN \`${T('staff_profiles')}\` sp ON sp.user_id = u.id WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.is_active = 1 AND r.role IN (${STAFF_ROLES.map(() => '?').join(',')})`, [tenantId, ...STAFF_ROLES]);
  const [y, m] = String(run.period).split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let totalGross = 0; let totalNet = 0; let count = 0;
  await withTransaction(async (conn) => {
    await execute(`DELETE FROM \`${T('payroll_run_items')}\` WHERE run_id = ?`, [runId], conn);
    for (const s of staff) {
      const items = await query(`SELECT pc.code, pc.name, pc.kind, pc.calc, pc.taxable, ss.amount FROM \`${T('salary_structures')}\` ss JOIN \`${T('payroll_components')}\` pc ON pc.id = ss.component_id WHERE ss.user_id = ? AND pc.is_active = 1 ORDER BY pc.order_no`, [s.id], conn);
      if (!items.length) continue;
      const att = await queryOne(`SELECT SUM(status IN ('HADIR','DINAS')) AS present, SUM(status = 'ALPA') AS alpa FROM \`${T('staff_attendance')}\` WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`, [s.id, run.period], conn);
      const presentDays = att?.present === null || att?.present === undefined ? null : Number(att.present);
      const lines: { code: string; name: string; kind: string; amount: number; taxable: boolean }[] = [];
      let gross = 0; let deductions = 0; let taxable = 0;
      for (const it of items) {
        let amount = Number(it.amount);
        if (it.calc === 'PER_DAY') amount = amount * (presentDays ?? daysInMonth);
        if (it.calc === 'PERCENT') amount = Math.round((gross * amount) / 100);
        amount = Math.round(amount);
        lines.push({ code: String(it.code), name: String(it.name), kind: String(it.kind), amount, taxable: !!it.taxable });
        if (it.kind === 'DEDUCTION') deductions += amount; else { gross += amount; if (it.taxable) taxable += amount; }
      }
      const kesBase = Math.min(gross, Number(cfg.bpjs_kes_cap));
      const bpjsEmp = Math.round(kesBase * Number(cfg.bpjs_kes_employee) / 100 + gross * (Number(cfg.bpjs_tk_jht_employee) + Number(cfg.bpjs_tk_jp_employee)) / 100);
      const bpjsEr = Math.round(kesBase * Number(cfg.bpjs_kes_employer) / 100 + gross * (Number(cfg.bpjs_tk_jht_employer) + Number(cfg.bpjs_tk_jp_employer) + Number(cfg.bpjs_tk_jkk) + Number(cfg.bpjs_tk_jkm)) / 100);
      const pph = cfg.apply_pph21 ? pph21Monthly(taxable, s.ptkp_status as string | null) : { rate: 0, tax: 0, category: '-' };
      const net = gross - deductions - bpjsEmp - pph.tax;
      lines.push({ code: 'BPJS', name: `BPJS (Kes ${cfg.bpjs_kes_employee}% + JHT ${cfg.bpjs_tk_jht_employee}% + JP ${cfg.bpjs_tk_jp_employee}%)`, kind: 'DEDUCTION', amount: bpjsEmp, taxable: false });
      lines.push({ code: 'PPH21', name: `PPh 21 TER ${pph.category} ${pph.rate}%`, kind: 'DEDUCTION', amount: pph.tax, taxable: false });
      await insertRow('payroll_run_items', { id: newId(), run_id: runId, user_id: s.id, gross, deductions, bpjs_employee: bpjsEmp, bpjs_employer: bpjsEr, pph21: pph.tax, net, detail_lines: lines, attendance_days: presentDays }, conn);
      totalGross += gross; totalNet += net; count++;
    }
    await execute(`UPDATE \`${T('payroll_runs')}\` SET total_gross = ?, total_net = ?, employee_count = ?, status = 'DRAFT', validated_by = NULL, finance_approved_by = NULL, principal_approved_by = NULL WHERE id = ?`, [totalGross, totalNet, count, runId], conn);
  });
}
r.post('/runs/:id/recompute', requirePermission('payroll:write'), wrap(async (req, res) => { const run = await mustGet('payroll_runs', req.params.id, req.auth!.tenantId); await computeRun(String(run.id), req.auth!.tenantId); ok(res, await queryOne(`SELECT ${RUN_SELECT} ${RUN_FROM} WHERE pr.id = ?`, [run.id])); }));
r.get('/runs/:id', requirePermission('payroll:read'), wrap(async (req, res) => {
  const run = await queryOne(`SELECT ${RUN_SELECT} ${RUN_FROM} WHERE pr.id = ? AND pr.tenant_id = ?`, [req.params.id, req.auth!.tenantId]);
  if (!run) throw notFound();
  const items = await query(`SELECT i.*, u.full_name, sp.nip, sp.bank_name, sp.bank_account, jp.name AS position_name FROM \`${T('payroll_run_items')}\` i JOIN \`${T('users')}\` u ON u.id = i.user_id LEFT JOIN \`${T('staff_profiles')}\` sp ON sp.user_id = u.id LEFT JOIN \`${T('job_positions')}\` jp ON jp.id = sp.position_id WHERE i.run_id = ? ORDER BY u.full_name`, [run.id]);
  ok(res, { ...run, items: items.map((i) => ({ ...i, detail_lines: typeof i.detail_lines === 'string' ? JSON.parse(i.detail_lines) : i.detail_lines })) });
}));
const FLOW: Record<string, { next: string; perm: string; field?: string }> = {
  validate: { next: 'VALIDATED', perm: 'payroll:write', field: 'validated_by' },
  approve_finance: { next: 'FINANCE_APPROVED', perm: 'payroll:approve_finance', field: 'finance_approved_by' },
  approve_principal: { next: 'PRINCIPAL_APPROVED', perm: 'payroll:approve_principal', field: 'principal_approved_by' },
  pay: { next: 'PAID_OUT', perm: 'payroll:write' },
  reject: { next: 'DRAFT', perm: 'payroll:approve_finance' },
};
const ORDER = ['DRAFT', 'VALIDATED', 'FINANCE_APPROVED', 'PRINCIPAL_APPROVED', 'PAID_OUT'];
r.post('/runs/:id/:action', wrap(async (req, res) => {
  const u = req.auth!;
  const f = FLOW[req.params.action];
  if (!f) throw notFound();
  if (!u.isSuperAdmin && !u.permissions.has(f.perm)) throw forbidden(`Butuh izin ${f.perm}`);
  const run = await mustGet('payroll_runs', req.params.id, u.tenantId);
  if (req.params.action !== 'reject' && ORDER.indexOf(f.next) !== ORDER.indexOf(String(run.status)) + 1) throw badRequest(`Status sekarang ${run.status}; tidak bisa ${req.params.action}`);
  if (req.params.action === 'reject' && run.status === 'PAID_OUT') throw badRequest('Sudah dibayarkan');
  await execute(`UPDATE \`${T('payroll_runs')}\` SET status = ?${f.field ? `, ${f.field} = ?` : ''}${req.params.action === 'pay' ? ', paid_at = NOW()' : ''}${req.params.action === 'reject' ? ', validated_by = NULL, finance_approved_by = NULL, principal_approved_by = NULL' : ''} WHERE id = ?`, f.field ? [f.next, u.id, run.id] : [f.next, run.id]);
  if (req.params.action === 'pay') {
    await withTransaction(async (conn) => {
      const items = await query(`SELECT id, user_id, net FROM \`${T('payroll_run_items')}\` WHERE run_id = ?`, [run.id], conn);
      for (const it of items) await execute(`INSERT INTO \`${T('payslips')}\` (id, tenant_id, run_item_id, user_id, period, issued_at) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE issued_at = NOW()`, [newId(), u.tenantId, it.id, it.user_id, run.period], conn);
      await insertRow('cash_flows', { id: newId(), tenant_id: u.tenantId, tx_date: new Date().toISOString().slice(0, 10), direction: 'OUT', category: 'GAJI', amount: run.total_net, description: `Payroll ${run.period}`, reference_type: 'PAYROLL', reference_id: run.id, created_by: u.id }, conn);
      await notify({ tenantId: u.tenantId, userIds: items.map((i) => String(i.user_id)), type: 'PAYSLIP', title: `Slip gaji ${run.period} tersedia`, link: '/guru/payroll/slip' }, conn);
    });
  } else if (f.next === 'FINANCE_APPROVED') {
    const kepsek = (await query(`SELECT user_id FROM \`${T('user_roles')}\` WHERE tenant_id = ? AND role = 'KEPSEK'`, [u.tenantId])).map((x) => String(x.user_id));
    await notify({ tenantId: u.tenantId, userIds: kepsek, type: 'PAYROLL', title: `Payroll ${run.period} menunggu persetujuan Anda`, link: '/kepsek/payroll' });
  }
  await audit(req, `payroll.${req.params.action}`, 'payroll_runs', String(run.id));
  ok(res, await queryOne(`SELECT ${RUN_SELECT} ${RUN_FROM} WHERE pr.id = ?`, [run.id]));
}));

// ---------- Slips ----------
r.get('/slips/mine', requirePermission('payroll:slip_self'), wrap(async (req, res) => {
  ok(res, await query(`SELECT s.id, s.period, s.issued_at, s.viewed_at, i.gross, i.deductions, i.bpjs_employee, i.pph21, i.net FROM \`${T('payslips')}\` s JOIN \`${T('payroll_run_items')}\` i ON i.id = s.run_item_id WHERE s.user_id = ? ORDER BY s.period DESC`, [req.auth!.id]));
}));
r.get('/slips/:id/pdf', requirePermission('payroll:slip_self', 'payroll:read'), wrap(async (req, res) => {
  const u = req.auth!;
  const s = await queryOne(`SELECT s.*, i.*, us.full_name, sp.nip, sp.bank_name, sp.bank_account, jp.name AS position_name, pr.period AS run_period FROM \`${T('payslips')}\` s JOIN \`${T('payroll_run_items')}\` i ON i.id = s.run_item_id JOIN \`${T('payroll_runs')}\` pr ON pr.id = i.run_id JOIN \`${T('users')}\` us ON us.id = s.user_id LEFT JOIN \`${T('staff_profiles')}\` sp ON sp.user_id = us.id LEFT JOIN \`${T('job_positions')}\` jp ON jp.id = sp.position_id WHERE s.id = ? AND s.tenant_id = ?`, [req.params.id, u.tenantId]);
  if (!s) throw notFound();
  if (s.user_id !== u.id && !u.permissions.has('payroll:read') && !u.isSuperAdmin) throw forbidden();
  if (s.user_id === u.id) await execute(`UPDATE \`${T('payslips')}\` SET viewed_at = COALESCE(viewed_at, NOW()) WHERE id = ?`, [s.id]);
  const t = await queryOne(`SELECT name, address FROM \`${T('tenants')}\` WHERE id = ?`, [u.tenantId]);
  const lines = (typeof s.detail_lines === 'string' ? JSON.parse(s.detail_lines) : s.detail_lines) as { name: string; kind: string; amount: number }[];
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="slip-${s.run_period}.pdf"`);
  const doc = new PDFDocument({ size: 'A5', margin: 36 });
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(12).text(String(t?.name ?? ''), { align: 'center' }).font('Helvetica').fontSize(8).text(String(t?.address ?? ''), { align: 'center' });
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).text(`SLIP GAJI ${s.run_period}`, { align: 'center' });
  doc.moveDown(0.5).font('Helvetica').fontSize(9).text(`Nama: ${s.full_name}`).text(`NIP: ${s.nip ?? '-'} · Jabatan: ${s.position_name ?? '-'}`).text(`Rekening: ${s.bank_name ?? '-'} ${s.bank_account ?? ''}`).text(`Hari kerja tercatat: ${s.attendance_days ?? '-'}`);
  doc.moveDown(0.6);
  const rp = (n: number) => `Rp ${Number(n).toLocaleString('id-ID')}`;
  doc.font('Helvetica-Bold').text('Penerimaan');
  for (const l of lines.filter((x) => x.kind !== 'DEDUCTION')) doc.font('Helvetica').text(l.name, { continued: true }).text(rp(l.amount), { align: 'right' });
  doc.font('Helvetica-Bold').text('Potongan');
  for (const l of lines.filter((x) => x.kind === 'DEDUCTION')) doc.font('Helvetica').text(l.name, { continued: true }).text(`- ${rp(l.amount)}`, { align: 'right' });
  doc.moveDown(0.4).moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke();
  doc.moveDown(0.3).font('Helvetica-Bold').fontSize(11).text('GAJI BERSIH', { continued: true }).text(rp(Number(s.net)), { align: 'right' });
  doc.moveDown(0.5).font('Helvetica').fontSize(7).fillColor('#64748b').text(`Bruto ${rp(Number(s.gross))} · Iuran BPJS pemberi kerja ${rp(Number(s.bpjs_employer))} · Diterbitkan ${new Date(s.issued_at).toLocaleDateString('id-ID')}`);
  doc.end();
}));

export default r;
