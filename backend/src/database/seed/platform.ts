import { config, PLATFORM_TENANT_ID, T } from '../../config';
import { execute, query, queryOne } from '../db';
import { PERMISSIONS } from '../../core/rbac';
import { hashPassword } from '../../core/auth';
import { newId } from '../../core/ids';
import { logger } from '../../core/logger';

/** Platform tenant, permission catalogue, and the bootstrap SUPER_ADMIN. Idempotent. */
export async function seedPlatform(): Promise<void> {
  await execute(
    `INSERT IGNORE INTO \`${T('tenants')}\` (id, slug, name, type, is_active) VALUES (?, 'platform', 'Platform SINAU', 'UMUM', 1)`,
    [PLATFORM_TENANT_ID],
  );
  await execute(`INSERT IGNORE INTO \`${T('tenant_settings')}\` (tenant_id) VALUES (?)`, [PLATFORM_TENANT_ID]);
  await execute(`INSERT IGNORE INTO \`${T('tenant_branding')}\` (tenant_id, display_name) VALUES (?, 'SINAU')`, [PLATFORM_TENANT_ID]);

  // Permission catalogue: upsert descriptions, keep unknown (custom) codes untouched.
  const values: unknown[] = [];
  const marks = PERMISSIONS.map((p) => { values.push(p.code, p.module, p.description); return '(?,?,?)'; });
  await execute(`INSERT INTO \`${T('permissions')}\` (code, module, description) VALUES ${marks.join(',')} ON DUPLICATE KEY UPDATE module = VALUES(module), description = VALUES(description)`, values);

  const existing = await queryOne(`SELECT u.id FROM \`${T('users')}\` u JOIN \`${T('user_roles')}\` r ON r.user_id = u.id WHERE r.role = 'SUPER_ADMIN' LIMIT 1`);
  if (!existing) {
    const id = newId();
    const hash = await hashPassword(config.bootstrap.password);
    await execute(
      `INSERT INTO \`${T('users')}\` (id, tenant_id, username, password_hash, full_name, is_active, must_change_password) VALUES (?,?,?,?,?,1,1)`,
      [id, PLATFORM_TENANT_ID, config.bootstrap.username, hash, 'Super Admin'],
    );
    await execute(`INSERT INTO \`${T('user_roles')}\` (id, tenant_id, user_id, role) VALUES (?,?,?,'SUPER_ADMIN')`, [newId(), PLATFORM_TENANT_ID, id]);
    logger.warn({ username: config.bootstrap.username }, 'bootstrap SUPER_ADMIN created — change the password after first login');
  }
  const n = (await query(`SELECT COUNT(*) AS c FROM \`${T('permissions')}\``))[0]?.c;
  logger.debug({ permissions: Number(n) }, 'platform seed ok');
}
