/**
 * Declarative tenant-scoped CRUD. A resource definition yields an Express router with
 * GET / (paged list: ?q, ?page, ?limit, ?sort, ?order, plus declared filters), GET /:id, POST /, PUT /:id, DELETE /:id.
 * Every query is bound to req.auth.tenantId — nothing can be read or written across tenants.
 */
import { Router, Request } from 'express';
import { ZodSchema } from 'zod';
import { T } from '../config';
import { query, queryOne, execute, Exec, getPool, Row } from '../database/db';
import { newId } from './ids';
import { wrap, ok, created, paged, paging, str } from './http';
import { notFound, forbidden } from './errors';
import { requirePermission } from '../middlewares';
import { audit } from './services';

export interface Filter { param: string; column: string; op?: '=' | 'LIKE' | '>=' | '<=' | 'IN' | 'BOOL' }
export interface CrudOptions<C, U> {
  table: string; // without prefix
  tenantScoped?: boolean; // default true
  softDelete?: boolean; // uses deleted_at
  searchable?: string[];
  sortable?: string[];
  defaultSort?: string;
  defaultOrder?: 'ASC' | 'DESC';
  filters?: Filter[];
  /** Extra SELECT columns and JOINs for list/get. Main table alias is `t`. */
  select?: string;
  joins?: string;
  /** Extra WHERE (with alias `t`) built from the request — for role-based scoping. */
  scope?: (req: Request) => { sql: string; params: unknown[] } | null;
  createSchema: ZodSchema<C>;
  updateSchema: ZodSchema<U>;
  perms: { read: string[]; write: string[]; delete?: string[] };
  /** Transform validated input into column values (default: as-is). */
  toRow?: (input: C | U, req: Request, isCreate: boolean) => Record<string, unknown> | Promise<Record<string, unknown>>;
  beforeCreate?: (row: Record<string, unknown>, req: Request, exec: Exec) => Promise<void>;
  afterCreate?: (row: Record<string, unknown>, req: Request, exec: Exec) => Promise<void>;
  beforeUpdate?: (id: string, row: Record<string, unknown>, req: Request, exec: Exec) => Promise<void>;
  afterUpdate?: (id: string, row: Record<string, unknown>, req: Request, exec: Exec) => Promise<void>;
  beforeDelete?: (id: string, req: Request, exec: Exec) => Promise<void>;
  /** Map a DB row to API shape. */
  present?: (row: Record<string, unknown>, req: Request) => Record<string, unknown>;
  entityName?: string;
}

export function buildWhere(req: Request, o: { tenantScoped?: boolean; softDelete?: boolean; searchable?: string[]; filters?: Filter[]; scope?: CrudOptions<unknown, unknown>['scope'] }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (o.tenantScoped !== false) { where.push('t.tenant_id = ?'); params.push(req.auth!.tenantId); }
  if (o.softDelete) where.push('t.deleted_at IS NULL');
  const q = str(req.query.q);
  if (q && o.searchable?.length) {
    where.push(`(${o.searchable.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    o.searchable.forEach(() => params.push(`%${q}%`));
  }
  for (const f of o.filters ?? []) {
    const v = req.query[f.param];
    if (v === undefined || v === '' || v === null) continue;
    const op = f.op ?? '=';
    if (op === 'IN') {
      const arr = (Array.isArray(v) ? v : String(v).split(',')).map(String).filter(Boolean);
      if (!arr.length) continue;
      where.push(`${f.column} IN (${arr.map(() => '?').join(',')})`); params.push(...arr);
    } else if (op === 'LIKE') { where.push(`${f.column} LIKE ?`); params.push(`%${String(v)}%`); }
    else if (op === 'BOOL') { where.push(`${f.column} = ?`); params.push(/^(1|true)$/i.test(String(v)) ? 1 : 0); }
    else { where.push(`${f.column} ${op} ?`); params.push(String(v)); }
  }
  const sc = o.scope?.(req);
  if (sc) { where.push(`(${sc.sql})`); params.push(...sc.params); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export function crudRouter<C extends Record<string, unknown>, U extends Record<string, unknown>>(o: CrudOptions<C, U>): Router {
  const r = Router();
  const tbl = `\`${T(o.table)}\``;
  const select = o.select ? `t.*, ${o.select}` : 't.*';
  const joins = o.joins ?? '';
  const present = (row: Record<string, unknown>, req: Request) => (o.present ? o.present(row, req) : row);
  const entity = o.entityName ?? o.table;

  r.get('/', requirePermission(...o.perms.read), wrap(async (req, res) => {
    const { page, limit, offset } = paging(req.query);
    const w = buildWhere(req, o);
    const sortCol = (str(req.query.sort) && o.sortable?.includes(String(req.query.sort)) ? String(req.query.sort) : o.defaultSort) ?? 'created_at';
    const order = String(req.query.order ?? o.defaultOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const sortExpr = sortCol.includes('.') ? sortCol : `t.${sortCol}`;
    const total = (await queryOne(`SELECT COUNT(*) AS c FROM ${tbl} t ${joins} ${w.sql}`, w.params))?.c as number;
    const rows = await query(`SELECT ${select} FROM ${tbl} t ${joins} ${w.sql} ORDER BY ${sortExpr} ${order}, t.id ASC LIMIT ? OFFSET ?`, [...w.params, limit, offset]);
    paged(res, rows.map((x) => present(x, req)), { page, limit, total: Number(total) });
  }));

  r.get('/:id', requirePermission(...o.perms.read), wrap(async (req, res) => {
    const w = buildWhere(req, { ...o, searchable: [], filters: [] });
    const row = await queryOne(`SELECT ${select} FROM ${tbl} t ${joins} ${w.sql ? w.sql + ' AND' : 'WHERE'} t.id = ?`, [...w.params, req.params.id]);
    if (!row) throw notFound();
    ok(res, present(row, req));
  }));

  r.post('/', requirePermission(...o.perms.write), wrap(async (req, res) => {
    const parsed = o.createSchema.parse(req.body);
    const row = { ...(o.toRow ? await o.toRow(parsed, req, true) : (parsed as Record<string, unknown>)) };
    row.id = row.id ?? newId();
    if (o.tenantScoped !== false) row.tenant_id = req.auth!.tenantId;
    const exec = getPool();
    if (o.beforeCreate) await o.beforeCreate(row, req, exec);
    const cols = Object.keys(row);
    await execute(`INSERT INTO ${tbl} (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => normalize(row[c])), exec);
    if (o.afterCreate) await o.afterCreate(row, req, exec);
    await audit(req, `${entity}.create`, entity, String(row.id), undefined, row);
    const fresh = await queryOne(`SELECT ${select} FROM ${tbl} t ${joins} WHERE t.id = ?`, [row.id]);
    created(res, present(fresh!, req));
  }));

  r.put('/:id', requirePermission(...o.perms.write), wrap(async (req, res) => {
    const parsed = o.updateSchema.parse(req.body);
    const w = buildWhere(req, { ...o, searchable: [], filters: [] });
    const before = await queryOne(`SELECT t.* FROM ${tbl} t ${w.sql ? w.sql + ' AND' : 'WHERE'} t.id = ?`, [...w.params, req.params.id]);
    if (!before) throw notFound();
    const row = o.toRow ? await o.toRow(parsed, req, false) : (parsed as Record<string, unknown>);
    delete row.id; delete row.tenant_id;
    const exec = getPool();
    if (o.beforeUpdate) await o.beforeUpdate(req.params.id, row, req, exec);
    const cols = Object.keys(row).filter((c) => row[c] !== undefined);
    if (cols.length) {
      await execute(`UPDATE ${tbl} SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?${o.tenantScoped !== false ? ' AND tenant_id = ?' : ''}`,
        [...cols.map((c) => normalize(row[c])), req.params.id, ...(o.tenantScoped !== false ? [req.auth!.tenantId] : [])], exec);
    }
    if (o.afterUpdate) await o.afterUpdate(req.params.id, row, req, exec);
    await audit(req, `${entity}.update`, entity, req.params.id, before, row);
    const fresh = await queryOne(`SELECT ${select} FROM ${tbl} t ${joins} WHERE t.id = ?`, [req.params.id]);
    ok(res, present(fresh!, req));
  }));

  r.delete('/:id', requirePermission(...(o.perms.delete ?? o.perms.write)), wrap(async (req, res) => {
    const w = buildWhere(req, { ...o, searchable: [], filters: [] });
    const before = await queryOne(`SELECT t.* FROM ${tbl} t ${w.sql ? w.sql + ' AND' : 'WHERE'} t.id = ?`, [...w.params, req.params.id]);
    if (!before) throw notFound();
    const exec = getPool();
    if (o.beforeDelete) await o.beforeDelete(req.params.id, req, exec);
    if (o.softDelete) await execute(`UPDATE ${tbl} SET deleted_at = NOW() WHERE id = ?`, [req.params.id], exec);
    else await execute(`DELETE FROM ${tbl} WHERE id = ?`, [req.params.id], exec);
    await audit(req, `${entity}.delete`, entity, req.params.id, before);
    ok(res, { id: req.params.id, deleted: true });
  }));

  return r;
}

/** JSON-encodes objects/arrays, converts booleans, passes the rest through. */
export function normalize(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Generic insert helper used by custom services. */
export async function insertRow(table: string, row: Record<string, unknown>, exec: Exec = getPool()) {
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  await execute(`INSERT INTO \`${T(table)}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => normalize(row[c])), exec);
  return row;
}
export async function updateRow(table: string, id: string, row: Record<string, unknown>, exec: Exec = getPool(), tenantId?: string) {
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  if (!cols.length) return;
  await execute(`UPDATE \`${T(table)}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`, [...cols.map((c) => normalize(row[c])), id, ...(tenantId ? [tenantId] : [])], exec);
}
/** Loads a tenant-owned row or throws 404. */
export async function mustGet<R extends Row = Row>(table: string, id: string, tenantId: string, exec: Exec = getPool()): Promise<R> {
  const row = await queryOne<R>(`SELECT * FROM \`${T(table)}\` WHERE id = ? AND tenant_id = ?`, [id, tenantId], exec);
  if (!row) throw notFound();
  return row;
}
export const denyUnless = (cond: boolean, msg?: string) => { if (!cond) throw forbidden(msg); };
