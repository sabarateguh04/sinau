import mysql, { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { config } from '../config';

let pool: Pool | null = null;

/** Shared connection pool bound to the SINAU database. */
export const getPool = (): Pool => {
  pool ??= mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: config.db.pool,
    decimalNumbers: true,
    dateStrings: false,
    timezone: 'Z',
    charset: 'utf8mb4',
  });
  return pool;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Exec = Pool | PoolConnection;

export async function query<T extends Row = Row>(sql: string, params: unknown[] = [], exec: Exec = getPool()): Promise<T[]> {
  const [rows] = await exec.query(sql, params);
  return rows as unknown as T[];
}

export async function queryOne<T extends Row = Row>(sql: string, params: unknown[] = [], exec: Exec = getPool()): Promise<T | null> {
  const rows = await query<T>(sql, params, exec);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = [], exec: Exec = getPool()): Promise<ResultSetHeader> {
  const [res] = await exec.query<ResultSetHeader>(sql, params);
  return res;
}

/** Runs `fn` inside a transaction; rolls back on throw. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Connects without selecting a database (used to CREATE DATABASE on first boot). */
export const createServerConnection = () =>
  mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, multipleStatements: false });
