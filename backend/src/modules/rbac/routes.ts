import { Router } from 'express';
import { z } from 'zod';
import { T, PLATFORM_TENANT_ID } from '../../config';
import { query, execute, withTransaction } from '../../database/db';
import { wrap, ok } from '../../core/http';
import { forbidden, badRequest } from '../../core/errors';
import { requirePermission, validate } from '../../middlewares';
import { audit } from '../../core/services';
import { newId } from '../../core/ids';
import { PERMISSIONS, ROLES, ROLE_LABELS, ROLE_RANK, DEFAULT_ROLE_PERMISSIONS, TENANT_ROLES, isRole } from '../../core/rbac';
import { rolePermissionMap, invalidateTenant } from '../../core/permissions';

const r = Router();

r.get('/permissions', requirePermission('rbac:read'), wrap(async (_req, res) => {
  const custom = await query(`SELECT code, module, description FROM \`${T('permissions')}\``);
  ok(res, custom.length ? custom : PERMISSIONS);
}));

r.get('/roles', requirePermission('rbac:read', 'user:read'), wrap(async (_req, res) => {
  ok(res, ROLES.map((code) => ({ code, label: ROLE_LABELS[code], rank: ROLE_RANK[code], tenant_role: TENANT_ROLES.includes(code) })));
}));

/** Effective matrix for the current tenant (or platform template when ?scope=platform by SUPER_ADMIN). */
r.get('/matrix', requirePermission('rbac:read'), wrap(async (req, res) => {
  const platform = req.query.scope === 'platform';
  if (platform && !req.auth!.isSuperAdmin) throw forbidden();
  const tid = platform ? PLATFORM_TENANT_ID : req.auth!.tenantId;
  const map = await rolePermissionMap(tid);
  const overridden = new Set((await query(`SELECT DISTINCT role FROM \`${T('role_permissions')}\` WHERE tenant_id = ?`, [tid])).map((x) => String(x.role)));
  ok(res, {
    tenant_id: tid,
    roles: ROLES.filter((x) => (platform ? true : x !== 'SUPER_ADMIN')).map((code) => ({ code, label: ROLE_LABELS[code], permissions: [...(map.get(code) ?? [])], customized: overridden.has(code), defaults: DEFAULT_ROLE_PERMISSIONS[code] })),
  });
}));

r.put('/matrix/:role', requirePermission('rbac:write'), validate(z.object({ permissions: z.array(z.string()), scope: z.enum(['tenant', 'platform']).optional() })), wrap(async (req, res) => {
  const role = req.params.role;
  if (!isRole(role) || role === 'SUPER_ADMIN') throw badRequest('Peran tidak valid');
  const platform = req.body.scope === 'platform';
  if (platform && !req.auth!.isSuperAdmin) throw forbidden();
  const tid = platform ? PLATFORM_TENANT_ID : req.auth!.tenantId;
  const valid = new Set((await query(`SELECT code FROM \`${T('permissions')}\``)).map((x) => String(x.code)));
  const perms = [...new Set(req.body.permissions as string[])].filter((p) => valid.has(p));
  // A tenant admin cannot grant a role more than the admin role itself has (prevents privilege escalation).
  if (!req.auth!.isSuperAdmin) {
    const mine = req.auth!.permissions;
    const extra = perms.filter((p) => !mine.has(p));
    if (extra.length) throw forbidden(`Tidak boleh memberi izin yang tidak Anda miliki: ${extra.slice(0, 5).join(', ')}`);
  }
  await withTransaction(async (conn) => {
    await execute(`DELETE FROM \`${T('role_permissions')}\` WHERE tenant_id = ? AND role = ?`, [tid, role], conn);
    if (perms.length) {
      const values: unknown[] = [];
      const marks = perms.map((p) => { values.push(newId(), tid, role, p); return '(?,?,?,?)'; });
      await execute(`INSERT INTO \`${T('role_permissions')}\` (id, tenant_id, role, permission_code) VALUES ${marks.join(',')}`, values, conn);
    }
  });
  invalidateTenant(tid);
  await audit(req, 'rbac.matrix_update', 'role_permissions', role, undefined, { count: perms.length, scope: platform ? 'platform' : 'tenant' });
  ok(res, { role, permissions: perms });
}));

r.delete('/matrix/:role', requirePermission('rbac:write'), wrap(async (req, res) => {
  const tid = req.query.scope === 'platform' && req.auth!.isSuperAdmin ? PLATFORM_TENANT_ID : req.auth!.tenantId;
  await execute(`DELETE FROM \`${T('role_permissions')}\` WHERE tenant_id = ? AND role = ?`, [tid, req.params.role]);
  invalidateTenant(tid);
  await audit(req, 'rbac.matrix_reset', 'role_permissions', req.params.role);
  ok(res, { reset: true });
}));

export default r;
