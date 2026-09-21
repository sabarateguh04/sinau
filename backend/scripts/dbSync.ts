/**
 * Data dump / import antar lingkungan (mis. laptop → server).
 *   npm run db:dump              → deploy/db_sinau-data.sql  (DATA SAJA, semua tabel tbl_sinau_*)
 *   npm run db:import [file]     → truncate + insert ke DB di .env (default file deploy/db_sinau-data.sql)
 * Skema TIDAK ikut: buat lewat `npm run db:migrate` (portable MySQL 8 / MariaDB), lalu import.
 * Tabel migrations ikut di-dump supaya migrate berikutnya tidak mengulang seed.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getPool, query } from '../src/database/db';
import { config } from '../src/config';

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'deploy', 'db_sinau-data.sql');
const esc = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0')}'`;
};

async function dump(file: string) {
  const db = config.db.database;
  const tables = (await query<{ TABLE_NAME: string }>(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'tbl_sinau_%' ORDER BY TABLE_NAME`, [db])).map((r) => r.TABLE_NAME);
  const out: string[] = [`-- SINAU data dump ${new Date().toISOString()} from ${db} (${tables.length} tables). Data only; schema via npm run db:migrate.`, 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;', 'SET UNIQUE_CHECKS=0;', "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';"];
  let total = 0;
  for (const t of tables) {
    const rows = await query<Record<string, unknown>>(`SELECT * FROM \`${t}\``, [], getPool());
    out.push(`TRUNCATE TABLE \`${t}\`;`);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => `(${cols.map((c) => esc(r[c])).join(',')})`);
      out.push(`INSERT INTO \`${t}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES\n${chunk.join(',\n')};`);
    }
    total += rows.length;
  }
  out.push('SET FOREIGN_KEY_CHECKS=1;', 'SET UNIQUE_CHECKS=1;');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.join('\n') + '\n');
  console.log(`dumped ${total} rows from ${tables.length} tables → ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

async function importFile(file: string) {
  const sql = fs.readFileSync(file, 'utf8');
  // split on statement boundaries (";\n") — values never contain that sequence because newlines are escaped as \n
  const stmts = sql.split(/;\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('--'));
  const conn = await getPool().getConnection();
  let n = 0;
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    for (const s of stmts) { await conn.query(s); n++; }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally { conn.release(); }
  console.log(`imported ${n} statements from ${file} into ${config.db.database}`);
}

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  const file = arg ? path.resolve(arg) : DEFAULT_FILE;
  if (cmd === 'dump') await dump(file);
  else if (cmd === 'import') await importFile(file);
  else { console.log('usage: tsx scripts/dbSync.ts dump|import [file]'); process.exit(1); }
  await getPool().end();
})().catch((e) => { console.error(e); process.exit(1); });
