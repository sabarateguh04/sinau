import { PLATFORM_TENANT_ID, T } from '../config';
import { query, Row } from '../database/db';
import { DEFAULT_ROLE_PERMISSIONS, Role } from './rbac';

interface CacheEntry { at: number; roles: Map<string, Set<string>> }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

/**
 * Effective permissions of a role inside a tenant: the tenant override set if the tenant defined
 * any rows for that role, otherwise the platform template (PLATFORM tenant rows), otherwise the
 * code defaults. Cached per tenant for 30s; call invalidateTenant() after RBAC edits.
 */
export async function rolePermissionMap(tenantId: string): Promise<Map<string, Set<string>>> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.roles;
  const rows = await query<{ tenant_id: string; role: string; permission_code: string } & Row>(
    `SELECT tenant_id, role, permission_code FROM \`${T('role_permissions')}\` WHERE tenant_id IN (?, ?)`, [tenantId, PLATFORM_TENANT_ID],
  );
  const tenantRows = new Map<string, Set<string>>();
  const platformRows = new Map<string, Set<string>>();
  for (const r of rows) {
    const target = r.tenant_id === tenantId ? tenantRows : platformRows;
    if (!target.has(r.role)) target.set(r.role, new Set());
    target.get(r.role)!.add(r.permission_code);
  }
  const roles = new Map<string, Set<string>>();
  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]) {
    roles.set(role, tenantRows.get(role) ?? platformRows.get(role) ?? new Set(DEFAULT_ROLE_PERMISSIONS[role]));
  }
  cache.set(tenantId, { at: Date.now(), roles });
  return roles;
}

export const invalidateTenant = (tenantId: string) => cache.delete(tenantId);

export async function effectivePermissions(tenantId: string, userId: string, roles: Role[]): Promise<Set<string>> {
  const map = await rolePermissionMap(tenantId);
  const out = new Set<string>();
  for (const r of roles) for (const p of map.get(r) ?? []) out.add(p);
  const overrides = await query<{ permission_code: string; effect: string } & Row>(
    `SELECT permission_code, effect FROM \`${T('user_permission_overrides')}\` WHERE user_id = ?`, [userId],
  );
  for (const o of overrides) {
    if (o.effect === 'DENY') out.delete(o.permission_code);
    else out.add(o.permission_code);
  }
  return out;
}
