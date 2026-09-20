import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);
const bool = (v: string | undefined, d: boolean) => (v === undefined ? d : /^(1|true|yes)$/i.test(v));

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 4008),
  appUrl: process.env.APP_URL || 'http://localhost:4008',
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_sinau',
    pool: num(process.env.DB_POOL, 20),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessTtlMin: num(process.env.JWT_ACCESS_TTL_MIN, 30),
    refreshTtlDays: num(process.env.JWT_REFRESH_TTL_DAYS, 30),
  },
  uploadRoot: path.resolve(process.cwd(), process.env.UPLOAD_ROOT || './uploads'),
  uploadMaxMb: num(process.env.UPLOAD_MAX_MB, 20),
  serveFrontend: bool(process.env.SERVE_FRONTEND, true),
  frontendDist: path.resolve(process.cwd(), process.env.FRONTEND_DIST || '../frontend/dist'),
  mailMode: process.env.MAIL_MODE || 'outbox',
  rateLimit: {
    global: num(process.env.RATE_LIMIT_GLOBAL, 300),
    login: num(process.env.RATE_LIMIT_LOGIN, 10),
  },
  bootstrap: {
    username: process.env.BOOTSTRAP_SUPERADMIN_USERNAME || 'superadmin',
    password: process.env.BOOTSTRAP_SUPERADMIN_PASSWORD || 'superadmin123',
  },
  jobs: {
    enabled: bool(process.env.ENABLE_JOBS, true),
    pollMs: num(process.env.JOB_POLL_MS, 5000),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

/** Platform tenant: technical home of SUPER_ADMIN accounts. Hidden from tenant lists. */
export const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
export const TABLE_PREFIX = 'tbl_sinau_';
export const T = (name: string) => `${TABLE_PREFIX}${name}`;
