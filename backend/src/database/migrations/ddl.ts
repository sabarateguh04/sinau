import { T } from '../../config';

export interface Migration { name: string; statements: string[] }

export const TAIL = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
export const ID = 'id char(36) NOT NULL';
export const TENANT = 'tenant_id char(36) NOT NULL';
export const TS = 'created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP';
export const SOFT = 'deleted_at timestamp NULL DEFAULT NULL';

/** CREATE TABLE IF NOT EXISTS with the standard engine/charset tail. Column lines are passed as an array. */
export const table = (name: string, lines: string[]) => `CREATE TABLE IF NOT EXISTS \`${T(name)}\` (\n  ${lines.join(',\n  ')}\n) ${TAIL}`;

/** Standard tenant-owned table: id + tenant_id + custom columns + timestamps, PK and tenant index. */
export const tenantTable = (name: string, lines: string[], keys: string[] = []) =>
  table(name, [ID, TENANT, ...lines, TS, 'PRIMARY KEY (id)', `KEY idx_${name}_tenant (tenant_id)`, ...keys]);

export const fk = (name: string, col: string, refTable: string, refCol = 'id', onDelete = 'CASCADE') =>
  `CONSTRAINT fk_${name} FOREIGN KEY (${col}) REFERENCES \`${T(refTable)}\` (${refCol}) ON DELETE ${onDelete}`;

export const addColumn = (tbl: string, col: string, def: string) => `ALTER TABLE \`${T(tbl)}\` ADD COLUMN IF NOT EXISTS \`${col}\` ${def}`;
export const addIndex = (tbl: string, name: string, cols: string, unique = false) =>
  `ALTER TABLE \`${T(tbl)}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS \`${name}\` (${cols})`;

/** varchar column with a string default: vs('status', 20, 'AKTIF') → status varchar(20) NOT NULL DEFAULT 'AKTIF' */
export const vs = (col: string, len: number, def: string, nullable = false) =>
  `${col} varchar(${len}) ${nullable ? 'NULL' : 'NOT NULL'} DEFAULT '${def}'`;
export const money = (col: string, def = '0') => `${col} decimal(15,2) NOT NULL DEFAULT ${def}`;
