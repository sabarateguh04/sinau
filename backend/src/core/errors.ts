export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Tidak terautentikasi') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Tidak punya izin') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Data tidak ditemukan') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'CONFLICT', message, details);
export const tooMany = (message = 'Terlalu banyak permintaan') => new HttpError(429, 'TOO_MANY_REQUESTS', message);
