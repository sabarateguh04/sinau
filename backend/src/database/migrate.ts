/**
 * Idempotent migration runner. Each migration is a list of DDL statements (CREATE TABLE IF NOT EXISTS,
 * ALTER TABLE ... IF NOT EXISTS via portableDdl). Applied migrations are recorded in tbl_sinau_migrations,
 * but every statement is itself idempotent so re-running is always safe. Runs on boot and via npm run db:migrate.
 */
import { config, T } from '../config';
import { createServerConnection, getPool, query } from './db';
import { runPortableDdl } from './portableDdl';
import { migrations } from './migrations';
import { seedPlatform } from './seed/platform';
import { seedRegions } from './seed/regions';
import { logger } from '../core/logger';

export async function ensureDatabase(): Promise<void> {
  const conn = await createServerConnection();
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

export async function runMigrations(): Promise<void> {
  await ensureDatabase();
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS \`${T('migrations')}\` (
    name varchar(120) NOT NULL PRIMARY KEY,
    applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const applied = new Set((await query(`SELECT name FROM \`${T('migrations')}\``)).map((r) => String(r.name)));

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    logger.info({ migration: m.name }, 'applying migration');
    for (const stmt of m.statements) {
      await runPortableDdl(pool, stmt);
    }
    await pool.query(`INSERT IGNORE INTO \`${T('migrations')}\` (name) VALUES (?)`, [m.name]);
  }
  await seedPlatform();
  await seedRegions();
}

if (require.main === module) {
  runMigrations()
    .then(() => { logger.info('migrations done'); process.exit(0); })
    .catch((e) => { logger.error(e, 'migration failed'); process.exit(1); });
}
