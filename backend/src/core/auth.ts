import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { Role } from './rbac';

export interface AccessPayload {
  sub: string; // user id
  tid: string; // tenant id
  roles: Role[];
  v: number; // token_version (bump to revoke all sessions)
  name: string;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const signAccessToken = (p: AccessPayload) =>
  jwt.sign(p, config.jwt.accessSecret, { expiresIn: `${config.jwt.accessTtlMin}m` });

export const verifyAccessToken = (token: string): AccessPayload => jwt.verify(token, config.jwt.accessSecret) as AccessPayload;

/** Auth context attached to every authenticated request. */
export interface AuthUser {
  id: string;
  tenantId: string; // effective tenant (SUPER_ADMIN may switch via X-Tenant-Id)
  homeTenantId: string;
  roles: Role[];
  name: string;
  permissions: Set<string>;
  isSuperAdmin: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthUser;
    fileRecord?: { id: string; url: string };
  }
}

export const has = (u: AuthUser, perm: string) => u.isSuperAdmin || u.permissions.has(perm);
export const hasRole = (u: AuthUser, ...roles: Role[]) => roles.some((r) => u.roles.includes(r));
