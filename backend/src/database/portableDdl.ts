import { Exec, query } from './db';

/**
 * Runs schema statements written with `ALTER TABLE ... ADD COLUMN/INDEX/CONSTRAINT ... IF NOT EXISTS`
 * on MySQL 5.7/8.x AND MariaDB. MySQL rejects IF NOT EXISTS inside ALTER TABLE, so each clause is
 * checked against information_schema and applied only when missing. Everything else runs unchanged.
 */
export async function runPortableDdl(exec: Exec, sql: string): Promise<void> {
  const m = /^\s*ALTER\s+TABLE\s+`?(\w+)`?\s+([\s\S]+?)\s*;?\s*$/i.exec(sql);
  if (!m || !/IF\s+NOT\s+EXISTS/i.test(sql)) {
    await exec.query(sql);
    return;
  }
  const table = m[1];
  for (const clause of splitTopLevel(m[2])) {
    let c: RegExpExecArray | null;
    if ((c = /^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?\s+([\s\S]+)$/i.exec(clause))) {
      if (!(await columnExists(exec, table, c[1]))) await exec.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${c[1]}\` ${c[2]}`);
    } else if ((c = /^ADD\s+(UNIQUE\s+)?(?:INDEX|KEY)\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?\s*([\s\S]+)$/i.exec(clause))) {
      if (!(await indexExists(exec, table, c[2]))) await exec.query(`ALTER TABLE \`${table}\` ADD ${c[1] ? 'UNIQUE ' : ''}INDEX \`${c[2]}\` ${c[3]}`);
    } else if ((c = /^ADD\s+CONSTRAINT\s+`?(\w+)`?\s+FOREIGN\s+KEY\s+IF\s+NOT\s+EXISTS\s*([\s\S]+)$/i.exec(clause))) {
      if (!(await constraintExists(exec, table, c[1]))) await exec.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${c[1]}\` FOREIGN KEY ${c[2]}`);
    } else {
      await exec.query(`ALTER TABLE \`${table}\` ${clause}`);
    }
  }
}

const SQ = String.fromCharCode(39);
const DQ = String.fromCharCode(34);
const BT = String.fromCharCode(96);

/** Splits ALTER clauses on commas that are not inside parentheses or quotes. */
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === SQ || ch === DQ || ch === BT) { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const exists = async (exec: Exec, sql: string, params: unknown[]) => (await query(sql, params, exec)).length > 0;
export const columnExists = (exec: Exec, table: string, column: string) =>
  exists(exec, `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`, [table, column]);
export const indexExists = (exec: Exec, table: string, index: string) =>
  exists(exec, `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`, [table, index]);
export const constraintExists = (exec: Exec, table: string, name: string) =>
  exists(exec, `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, [table, name]);
export const tableExists = (exec: Exec, table: string) =>
  exists(exec, `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, [table]);
