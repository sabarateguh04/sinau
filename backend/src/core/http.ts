import { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ParsedQs } from 'qs';

export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wraps an async handler so rejections reach the error middleware. */
export const wrap = (fn: AsyncHandler): RequestHandler => (req, res, next) => {
  fn(req, res, next).catch(next);
};

export const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data });
export const created = (res: Response, data: unknown) => ok(res, data, 201);
export const paged = (res: Response, data: unknown[], meta: { page: number; limit: number; total: number }) =>
  res.json({ data, meta });

export interface Paging { page: number; limit: number; offset: number }
export function paging(q: ParsedQs, maxLimit = 200): Paging {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(q.limit) || 20));
  return { page, limit, offset: (page - 1) * limit };
}
export const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
