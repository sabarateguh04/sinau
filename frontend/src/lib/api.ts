import axios, { AxiosError, AxiosRequestConfig } from 'axios';

export const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api/v1';

const STORAGE = { access: 'sinau.access', refresh: 'sinau.refresh', tenant: 'sinau.tenant', role: 'sinau.role' };
export const tokens = {
  get access() { try { return localStorage.getItem(STORAGE.access); } catch { return null; } },
  get refresh() { try { return localStorage.getItem(STORAGE.refresh); } catch { return null; } },
  get tenant() { try { return localStorage.getItem(STORAGE.tenant); } catch { return null; } },
  get role() { try { return localStorage.getItem(STORAGE.role); } catch { return null; } },
  set(access: string | null, refresh: string | null) {
    try {
      if (access) localStorage.setItem(STORAGE.access, access); else localStorage.removeItem(STORAGE.access);
      if (refresh) localStorage.setItem(STORAGE.refresh, refresh); else localStorage.removeItem(STORAGE.refresh);
    } catch { /* private mode */ }
  },
  setTenant(id: string | null) { try { if (id) localStorage.setItem(STORAGE.tenant, id); else localStorage.removeItem(STORAGE.tenant); } catch { /* noop */ } },
  setRole(r: string | null) { try { if (r) localStorage.setItem(STORAGE.role, r); else localStorage.removeItem(STORAGE.role); } catch { /* noop */ } },
  clear() { this.set(null, null); this.setTenant(null); this.setRole(null); },
};

export const api = axios.create({ baseURL: API_BASE, timeout: 60_000 });

api.interceptors.request.use((cfg) => {
  const t = tokens.access;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  const tenant = tokens.tenant;
  if (tenant) cfg.headers['X-Tenant-Id'] = tenant;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
async function refreshAccess(): Promise<string | null> {
  const rt = tokens.refresh;
  if (!rt) return null;
  try {
    const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken: rt });
    const d = res.data.data as { accessToken: string; refreshToken: string };
    tokens.set(d.accessToken, d.refreshToken);
    return d.accessToken;
  } catch {
    tokens.clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const cfg = err.config as AxiosRequestConfig & { _retry?: boolean };
    const url = cfg?.url ?? '';
    if (err.response?.status === 401 && !cfg._retry && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
      cfg._retry = true;
      refreshing ??= refreshAccess().finally(() => { refreshing = null; });
      const t = await refreshing;
      if (t) { cfg.headers = { ...(cfg.headers ?? {}), Authorization: `Bearer ${t}` }; return api(cfg); }
      window.dispatchEvent(new CustomEvent('sinau:logout'));
    }
    return Promise.reject(err);
  },
);

export interface ApiError { status: number; code: string; message: string; details?: { path: string; message: string }[] | unknown }
export function toApiError(e: unknown): ApiError {
  const ax = e as AxiosError<{ error?: string; message?: string; details?: unknown }>;
  if (ax?.response) return { status: ax.response.status, code: ax.response.data?.error ?? 'ERROR', message: ax.response.data?.message ?? ax.message, details: ax.response.data?.details };
  if (ax?.request) return { status: 0, code: 'NETWORK', message: 'Tidak dapat terhubung ke server' };
  return { status: 0, code: 'UNKNOWN', message: (e as Error)?.message ?? 'Terjadi kesalahan' };
}

export interface Paged<T> { data: T[]; meta: { page: number; limit: number; total: number } }
export const get = async <T = unknown>(url: string, params?: Record<string, unknown>) => (await api.get<{ data: T }>(url, { params })).data.data;
export const getPaged = async <T = unknown>(url: string, params?: Record<string, unknown>) => (await api.get<Paged<T>>(url, { params })).data;
export const post = async <T = unknown>(url: string, body?: unknown) => (await api.post<{ data: T }>(url, body)).data.data;
export const put = async <T = unknown>(url: string, body?: unknown) => (await api.put<{ data: T }>(url, body)).data.data;
export const del = async <T = unknown>(url: string) => (await api.delete<{ data: T }>(url)).data.data;
export async function uploadFile(module: string, file: File, isPublic = false) {
  const fd = new FormData();
  fd.append('file', file);
  if (isPublic) fd.append('public', '1');
  return (await api.post<{ data: { id: string; url: string; original_name: string; mime: string; size: number } }>(`/files/${module}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
}
/** Fetches a protected file/export as a blob and triggers a download. */
export async function downloadFile(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}
export const fileSrc = (url: string | null | undefined) => (url ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(tokens.access ?? '')}` : '');
